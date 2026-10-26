// Disposable Windows lifecycle probe. Build x64 with System.Web.Extensions.dll.
// This owns only processes actually associated with its unnamed job; it never
// discovers or terminates processes by executable name or parent-PID scans.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

internal static class WindowsJobProbe
{
    private const uint KillOnJobClose = 0x2000;
    private const uint ExtendedStartupInfo = 0x80000;
    private const uint CreateSuspended = 0x4;
    private const uint CreateNoWindow = 0x08000000;
    private const uint WaitTimeout = 258;
    private const uint WaitFailed = 0xffffffff;
    private const int CleanupMilliseconds = 5000;
    private const int MaximumControlCharacters = 16384;

    public static int Main(string[] args)
    {
        using (Runner runner = new Runner())
            return runner.Run(args);
    }

    private sealed class Runner : IDisposable
    {
        private readonly object stateLock = new object();
        private readonly object jobLock = new object();
        private readonly ManualResetEvent wake = new ManualResetEvent(false);
        private readonly BlockingCollection<string> output = new BlockingCollection<string>(256);
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        private readonly object serializerLock = new object();
        private readonly Thread writer;
        private SafeKernelHandle job;
        private SafeKernelHandle process;
        private SafeKernelHandle initialThread;
        private SafeFileHandle stdoutRead;
        private SafeFileHandle stderrRead;
        private Thread stdoutPump;
        private Thread stderrPump;
        private volatile bool closing;
        private volatile bool draining;
        private int stopCode;
        private string stopReason;
        private uint rootExitCode;
        private bool rootExited;
        private bool launched;
        private volatile bool outputFailed;

        public Runner()
        {
            serializer.MaxJsonLength = 65536;
            writer = new Thread(WriteFrames);
            writer.IsBackground = true;
            writer.Start();
        }

        public int Run(string[] args)
        {
            bool confirmed = false;
            int activeProcesses = -1;
            string reason = "helperError";
            try
            {
                int offset = 0;
                int timeout = 180000;
                if (args.Length > 0 && args[0] == "--timeout-ms")
                {
                    if (args.Length < 2 || !Int32.TryParse(args[1], NumberStyles.None,
                        CultureInfo.InvariantCulture, out timeout) || timeout < 1 || timeout > 180000)
                        throw new ArgumentException("--timeout-ms must be between 1 and 180000.");
                    offset = 2;
                }
                if (args.Length < offset + 4 || args[offset] != "--run" || args[offset + 3] != "--")
                    throw new ArgumentException("Usage: [--timeout-ms N] --run ABS_EXE ABS_CWD -- args...");
                string executable = args[offset + 1];
                string directory = args[offset + 2];
                if (!AbsolutePath(executable) || !File.Exists(executable))
                    throw new ArgumentException("Executable must be an existing absolute file path.");
                if (!AbsolutePath(directory) || !Directory.Exists(directory))
                    throw new ArgumentException("Working directory must be an existing absolute directory.");

                job = Native.CreateJobObjectW(IntPtr.Zero, null);
                CheckHandle(job, "CreateJobObjectW");
                JobExtendedLimits limits = new JobExtendedLimits();
                limits.BasicLimitInformation.LimitFlags = KillOnJobClose;
                Check(Native.SetInformationJobObject(job, 9, ref limits,
                    (uint)Marshal.SizeOf(typeof(JobExtendedLimits))), "SetInformationJobObject");

                Thread control = new Thread(ReadControls);
                control.IsBackground = true;
                control.Start();
                Stopwatch lifetime = Stopwatch.StartNew();
                if (StopCode == 0)
                    Launch(executable, directory, args, offset + 4);

                while (launched && StopCode == 0)
                {
                    if (ObserveRootExit())
                        break;
                    if (lifetime.ElapsedMilliseconds >= timeout)
                    {
                        RequestStop("timeout", 130);
                        break;
                    }
                    wake.WaitOne(20);
                }
                reason = StopCode == 0 ? "rootExit" : StopReason;
            }
            catch (Exception error)
            {
                ReportError(error);
                reason = StopReason;
            }
            finally
            {
                if (job != null && !job.IsInvalid && !job.IsClosed)
                {
                    try
                    {
                        confirmed = Cleanup(out activeProcesses);
                    }
                    catch (Exception error)
                    {
                        ReportError(error);
                        confirmed = false;
                    }
                }
                else
                {
                    // No child can have been created before job construction.
                    confirmed = !launched;
                    activeProcesses = confirmed ? 0 : -1;
                }
                if (!confirmed)
                    RequestStop("cleanupUnconfirmed", 125);
                if (StopCode != 0)
                    reason = StopReason;
                Emit(new { kind = "cleanup", confirmed = confirmed,
                    activeProcesses = activeProcesses, reason = reason });
                closing = true;
            }
            output.CompleteAdding();
            if (!writer.Join(500))
            {
                outputFailed = true;
                RequestStop("outputDrainUnconfirmed", 125);
            }
            int result = StopCode != 0 ? StopCode : (rootExited ? unchecked((int)rootExitCode) : 125);
            // A broken or stalled output channel is a helper failure, even if
            // native execution and job cleanup succeeded.
            return confirmed && !outputFailed ? result : 125;
        }

        private void Launch(string executable, string directory, string[] args, int firstArgument)
        {
            SecurityAttributes security = new SecurityAttributes();
            security.Length = Marshal.SizeOf(typeof(SecurityAttributes));
            security.InheritHandle = 1;
            SafeFileHandle stdoutWrite = null;
            SafeFileHandle stderrWrite = null;
            SafeFileHandle input = null;
            IntPtr attributes = IntPtr.Zero;
            IntPtr jobValue = IntPtr.Zero;
            IntPtr handleValues = IntPtr.Zero;
            bool attributesInitialized = false;
            try
            {
                Check(Native.CreatePipe(out stdoutRead, out stdoutWrite, ref security, 0), "CreatePipe(stdout)");
                Check(Native.SetHandleInformation(stdoutRead, 1, 0), "SetHandleInformation(stdout)");
                Check(Native.CreatePipe(out stderrRead, out stderrWrite, ref security, 0), "CreatePipe(stderr)");
                Check(Native.SetHandleInformation(stderrRead, 1, 0), "SetHandleInformation(stderr)");
                input = Native.CreateFileW("NUL", 0x80000000, 3, ref security, 3, 0, IntPtr.Zero);
                CheckHandle(input, "CreateFileW(NUL)");

                IntPtr bytes = IntPtr.Zero;
                bool sizing = Native.InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref bytes);
                int sizingError = Marshal.GetLastWin32Error();
                if (sizing || sizingError != 122 || bytes == IntPtr.Zero)
                    throw new Win32Exception(sizingError, "InitializeProcThreadAttributeList(size)");
                attributes = Marshal.AllocHGlobal(bytes);
                Check(Native.InitializeProcThreadAttributeList(attributes, 2, 0, ref bytes),
                    "InitializeProcThreadAttributeList");
                attributesInitialized = true;
                jobValue = Marshal.AllocHGlobal(IntPtr.Size);
                Marshal.WriteIntPtr(jobValue, job.DangerousGetHandle());
                Check(Native.UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x2000d),
                    jobValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero), "UpdateProcThreadAttribute(JOB_LIST)");
                handleValues = Marshal.AllocHGlobal(IntPtr.Size * 3);
                Marshal.WriteIntPtr(handleValues, 0, input.DangerousGetHandle());
                Marshal.WriteIntPtr(handleValues, IntPtr.Size, stdoutWrite.DangerousGetHandle());
                Marshal.WriteIntPtr(handleValues, IntPtr.Size * 2, stderrWrite.DangerousGetHandle());
                Check(Native.UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002),
                    handleValues, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero),
                    "UpdateProcThreadAttribute(HANDLE_LIST)");

                StartupInfoEx startup = new StartupInfoEx();
                startup.StartupInfo.Size = Marshal.SizeOf(typeof(StartupInfoEx));
                startup.StartupInfo.Flags = 0x100; // STARTF_USESTDHANDLES
                startup.StartupInfo.StandardInput = input.DangerousGetHandle();
                startup.StartupInfo.StandardOutput = stdoutWrite.DangerousGetHandle();
                startup.StartupInfo.StandardError = stderrWrite.DangerousGetHandle();
                startup.AttributeList = attributes;
                StringBuilder command = new StringBuilder(QuoteArgument(executable));
                for (int i = firstArgument; i < args.Length; i++)
                    command.Append(' ').Append(QuoteArgument(args[i]));
                ProcessInformation information;
                Check(Native.CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                    ExtendedStartupInfo | CreateSuspended | CreateNoWindow, IntPtr.Zero, directory,
                    ref startup, out information), "CreateProcessW(atomic JOB_LIST)");
                process = new SafeKernelHandle(information.Process);
                initialThread = new SafeKernelHandle(information.Thread);
                launched = true;
                bool member;
                Check(Native.IsProcessInJob(process, job, out member), "IsProcessInJob(root)");
                if (!member)
                    throw new InvalidOperationException("Atomic creation did not establish the exact owner job.");
                lock (stateLock)
                {
                    if (stopCode != 0)
                        return; // Cleanup owns the still-suspended child.
                    // Accepting cancellation and resuming have one ordering:
                    // a stop already accepted here never starts the child.
                    uint suspendCount = Native.ResumeThread(initialThread);
                    if (suspendCount == UInt32.MaxValue)
                        throw LastError("ResumeThread");
                    if (suspendCount != 1)
                        throw new InvalidOperationException("Unexpected initial thread suspend count.");
                }
                initialThread.Dispose();
                initialThread = null;
                Emit(new { kind = "ready", pid = information.ProcessId, jobAssigned = true });
                stdoutPump = StartPump(stdoutRead, "stdout");
                stderrPump = StartPump(stderrRead, "stderr");
            }
            finally
            {
                if (stdoutWrite != null) stdoutWrite.Dispose();
                if (stderrWrite != null) stderrWrite.Dispose();
                if (input != null) input.Dispose();
                if (attributesInitialized) Native.DeleteProcThreadAttributeList(attributes);
                if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
                if (handleValues != IntPtr.Zero) Marshal.FreeHGlobal(handleValues);
            }
        }

        private Thread StartPump(SafeFileHandle pipe, string kind)
        {
            Thread thread = new Thread(delegate()
            {
                try
                {
                    byte[] buffer = new byte[8192];
                    while (!closing)
                    {
                        uint read;
                        bool success = Native.ReadFile(pipe, buffer, (uint)buffer.Length, out read, IntPtr.Zero);
                        int error = success ? 0 : Marshal.GetLastWin32Error();
                        if (!success)
                        {
                            if (error == 109 || error == 232 || (draining && (error == 6 || error == 995)))
                                break;
                            throw new Win32Exception(error, "ReadFile(" + kind + ")");
                        }
                        if (read == 0) break;
                        if (!Emit(new { kind = kind, data = Convert.ToBase64String(buffer, 0, (int)read) }))
                            break;
                    }
                }
                catch (ObjectDisposedException) { if (!draining) RequestStop("pipeClosed", 125); }
                catch (Exception error) { if (!closing) ReportError(error); }
                finally { pipe.Dispose(); }
            });
            thread.IsBackground = true;
            thread.Start();
            return thread;
        }

        private bool ObserveRootExit()
        {
            if (rootExited) return true;
            if (!launched) return false;
            uint waited = Native.WaitForSingleObject(process, 0);
            if (waited == WaitTimeout) return false;
            if (waited == WaitFailed) throw LastError("WaitForSingleObject(root)");
            if (waited != 0) throw new InvalidOperationException("Unexpected root wait result.");
            Check(Native.GetExitCodeProcess(process, out rootExitCode), "GetExitCodeProcess");
            rootExited = true;
            Emit(new { kind = "rootExit", exitCode = (long)rootExitCode });
            process.Dispose();
            process = null;
            return true;
        }

        private bool Cleanup(out int activeProcesses)
        {
            draining = true;
            Stopwatch deadline = Stopwatch.StartNew();
            // Root exit is not a reason to skip job termination: descendants
            // may have closed their inherited stdio and outlived that root.
            Check(Native.TerminateJobObject(job, 130), "TerminateJobObject");
            activeProcesses = -1;
            bool empty = false;
            while (deadline.ElapsedMilliseconds < CleanupMilliseconds)
            {
                if (launched && !rootExited) ObserveRootExit();
                activeProcesses = ActiveProcessCount();
                if (activeProcesses == 0 && (!launched || rootExited))
                {
                    empty = true;
                    break;
                }
                Thread.Sleep(20);
            }
            // A leaked write handle outside the job must not hang the helper.
            JoinPump(stdoutPump, deadline);
            JoinPump(stderrPump, deadline);
            bool pipesDrained = (stdoutPump == null || !stdoutPump.IsAlive) &&
                (stderrPump == null || !stderrPump.IsAlive);
            if (!pipesDrained)
                RequestStop("pipeDrainUnconfirmed", 125);
            return empty && pipesDrained;
        }

        private static void JoinPump(Thread thread, Stopwatch deadline)
        {
            if (thread == null) return;
            int remaining = CleanupMilliseconds - (int)deadline.ElapsedMilliseconds;
            if (remaining > 0) thread.Join(remaining);
        }

        private int ActiveProcessCount()
        {
            lock (jobLock)
            {
                JobAccounting accounting;
                Check(Native.QueryInformationJobObject(job, 1, out accounting,
                    (uint)Marshal.SizeOf(typeof(JobAccounting)), IntPtr.Zero), "QueryInformationJobObject(accounting)");
                return checked((int)accounting.ActiveProcesses);
            }
        }

        private uint[] ProcessIds()
        {
            int capacity = 64;
            while (capacity <= 65536)
            {
                IntPtr buffer = Marshal.AllocHGlobal(8 + capacity * IntPtr.Size);
                try
                {
                    bool success = Native.QueryInformationJobObject(job, 3, buffer,
                        (uint)(8 + capacity * IntPtr.Size), IntPtr.Zero);
                    int error = success ? 0 : Marshal.GetLastWin32Error();
                    if (!success && error != 234) throw new Win32Exception(error, "QueryInformationJobObject(pids)");
                    int assigned = Marshal.ReadInt32(buffer, 0);
                    int count = Marshal.ReadInt32(buffer, 4);
                    if (success && assigned <= count && count >= 0 && count <= capacity)
                    {
                        uint[] ids = new uint[count];
                        for (int i = 0; i < count; i++)
                            ids[i] = unchecked((uint)Marshal.ReadIntPtr(buffer, 8 + i * IntPtr.Size).ToInt64());
                        return ids;
                    }
                }
                finally { Marshal.FreeHGlobal(buffer); }
                capacity *= 2;
            }
            throw new InvalidOperationException("Job process list exceeded the probe limit.");
        }

        private void ReadControls()
        {
            try
            {
                using (StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false, true)))
                {
                    StringBuilder line = new StringBuilder();
                    while (!closing)
                    {
                        int next = input.Read();
                        if (next < 0) { RequestStop("ownerEof", 130); return; }
                        if (next != '\n')
                        {
                            if (line.Length >= MaximumControlCharacters)
                                throw new InvalidOperationException("Control line exceeds the probe limit.");
                            line.Append((char)next);
                            continue;
                        }
                        string value = line.ToString().Trim();
                        line.Length = 0;
                        if (value.Length == 0) continue;
                        Dictionary<string, object> control;
                        lock (serializerLock)
                            control = serializer.Deserialize<Dictionary<string, object>>(value);
                        if (control == null || !control.ContainsKey("action"))
                            throw new InvalidOperationException("Control must contain an action.");
                        string action = control["action"] as string;
                        object requestId = control.ContainsKey("requestId") ? control["requestId"] : null;
                        if (action == "stop") { RequestStop("stop", 130); continue; }
                        if (action == "query")
                        {
                            uint pid;
                            if (!control.ContainsKey("pid") || !UInt32.TryParse(Convert.ToString(control["pid"],
                                CultureInfo.InvariantCulture), NumberStyles.None, CultureInfo.InvariantCulture, out pid) || pid == 0)
                                throw new InvalidOperationException("Query requires a positive process ID.");
                            QueryMembership(pid, requestId);
                        }
                        else if (action == "status")
                        {
                            lock (jobLock)
                            {
                                if (closing) return;
                                Emit(new { kind = "status", requestId = requestId,
                                    activeProcesses = ActiveProcessCount(), pids = ProcessIds() });
                            }
                        }
                        else throw new InvalidOperationException("Unknown control action.");
                    }
                }
            }
            catch (Exception error) { if (!closing) ReportError(error); }
        }

        private void QueryMembership(uint pid, object requestId)
        {
            using (SafeKernelHandle target = Native.OpenProcess(0x1000, false, pid))
            {
                if (target.IsInvalid)
                {
                    int error = Marshal.GetLastWin32Error();
                    Emit(new { kind = "query", requestId = requestId, pid = pid,
                        inJob = (bool?)null, win32Error = error });
                    return;
                }
                lock (jobLock)
                {
                    if (closing) return;
                    bool member;
                    bool success = Native.IsProcessInJob(target, job, out member);
                    int error = success ? 0 : Marshal.GetLastWin32Error();
                    if (success)
                        Emit(new { kind = "query", requestId = requestId, pid = pid, inJob = (bool?)member });
                    else
                        Emit(new { kind = "query", requestId = requestId, pid = pid,
                            inJob = (bool?)null, win32Error = error });
                }
            }
        }

        private bool Emit(object frame)
        {
            if (closing || output.IsAddingCompleted) return false;
            try
            {
                string json;
                lock (serializerLock) json = serializer.Serialize(frame);
                if (output.TryAdd(json, 100)) return true;
            }
            catch (InvalidOperationException) { }
            outputFailed = true;
            RequestStop("outputBackpressure", 125);
            return false;
        }

        private void WriteFrames()
        {
            try
            {
                using (StreamWriter stream = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false), 4096))
                {
                    stream.AutoFlush = true;
                    foreach (string frame in output.GetConsumingEnumerable()) stream.WriteLine(frame);
                }
            }
            catch (Exception) { outputFailed = true; RequestStop("outputClosed", 125); }
        }

        private void ReportError(Exception error)
        {
            Win32Exception native = error as Win32Exception;
            RequestStop("helperError", 125);
            Emit(new { kind = "error", message = error.Message,
                win32Error = native == null ? 0 : native.NativeErrorCode });
        }

        private void RequestStop(string reason, int code)
        {
            lock (stateLock)
            {
                if (stopCode == 0 || (stopCode != 125 && code == 125))
                {
                    stopCode = code;
                    stopReason = reason;
                }
            }
            wake.Set();
        }

        private int StopCode { get { lock (stateLock) return stopCode; } }
        private string StopReason { get { lock (stateLock) return stopReason; } }

        public void Dispose()
        {
            closing = true;
            lock (jobLock)
            {
                if (job != null) job.Dispose();
            }
            if (initialThread != null) initialThread.Dispose();
            if (process != null) process.Dispose();
            if (stdoutRead != null) stdoutRead.Dispose();
            if (stderrRead != null) stderrRead.Dispose();
            output.CompleteAdding();
            // A dead/non-reading owner cannot indefinitely block cleanup.
            writer.Join(500);
            // Background readers may still be blocked on owner stdin. Do not
            // dispose synchronization objects they can still observe.
        }
    }

    private static bool AbsolutePath(string path)
    {
        if (String.IsNullOrEmpty(path) || !Path.IsPathRooted(path)) return false;
        string root = Path.GetPathRoot(path);
        return root.Length > 2 && (root.EndsWith("\\", StringComparison.Ordinal) ||
            root.EndsWith("/", StringComparison.Ordinal));
    }

    private static string QuoteArgument(string argument)
    {
        StringBuilder quoted = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in argument)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') quoted.Append('\\', slashes * 2 + 1).Append('"');
            else quoted.Append('\\', slashes).Append(character);
            slashes = 0;
        }
        quoted.Append('\\', slashes * 2).Append('"');
        return quoted.ToString();
    }

    private static void Check(bool success, string operation)
    {
        if (!success) throw LastError(operation);
    }

    private static void CheckHandle(SafeHandle handle, string operation)
    {
        if (handle == null || handle.IsInvalid) throw LastError(operation);
    }

    private static Win32Exception LastError(string operation)
    {
        int error = Marshal.GetLastWin32Error();
        return new Win32Exception(error, operation + " failed (" + error.ToString(CultureInfo.InvariantCulture) + ").");
    }

    private sealed class SafeKernelHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        public SafeKernelHandle() : base(true) { }
        public SafeKernelHandle(IntPtr value) : base(true) { SetHandle(value); }
        protected override bool ReleaseHandle() { return Native.CloseHandle(handle); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { public int Length; public IntPtr SecurityDescriptor; public int InheritHandle; }
    [StructLayout(LayoutKind.Sequential)]
    private struct JobBasicLimits
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct JobExtendedLimits
    {
        public JobBasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct JobAccounting
    {
        public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public IntPtr Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public ushort ShowWindow, ReservedBytes;
        public IntPtr ReservedData, StandardInput, StandardOutput, StandardError;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx { public StartupInfo StartupInfo; public IntPtr AttributeList; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }

    private static class Native
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern SafeKernelHandle CreateJobObjectW(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetInformationJobObject(SafeKernelHandle job, int informationClass, ref JobExtendedLimits information, uint length);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool QueryInformationJobObject(SafeKernelHandle job, int informationClass, out JobAccounting information, uint length, IntPtr returnedLength);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool QueryInformationJobObject(SafeKernelHandle job, int informationClass, IntPtr information, uint length, IntPtr returnedLength);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool TerminateJobObject(SafeKernelHandle job, uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsProcessInJob(SafeKernelHandle process, SafeKernelHandle job, [MarshalAs(UnmanagedType.Bool)] out bool result);
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern SafeKernelHandle OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreatePipe(out SafeFileHandle read, out SafeFileHandle write, ref SecurityAttributes attributes, uint size);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetHandleInformation(SafeFileHandle handle, uint mask, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern SafeFileHandle CreateFileW(string name, uint access, uint share, ref SecurityAttributes attributes, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnedSize);
        [DllImport("kernel32.dll")]
        public static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
            [MarshalAs(UnmanagedType.Bool)] bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInformation information);
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint ResumeThread(SafeKernelHandle thread);
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint WaitForSingleObject(SafeKernelHandle handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetExitCodeProcess(SafeKernelHandle process, out uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ReadFile(SafeFileHandle file, [Out] byte[] buffer, uint count, out uint read, IntPtr overlapped);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CloseHandle(IntPtr handle);
    }
}
