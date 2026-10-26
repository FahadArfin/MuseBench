import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import path from 'node:path';

const MAX_FRAME_BYTES = 64 * 1024;
const MAX_WIRE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const STOP_TIMEOUT_MS = 8000;
const validInteger = (value, maximum = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= maximum;
const absolutePath = value => typeof value === 'string' && !value.includes('\0') &&
  (path.isAbsolute(value) || path.win32.isAbsolute(value));
const exactKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key)) &&
  keys.every(key => Object.hasOwn(value, key));

/** Launch the prebuilt ownership helper. It creates the native process inside a
 * Windows Job before its first instruction. Native argv stays opaque; this
 * adapter never interprets or executes model-generated shell commands.
 * spawnHelper is a test seam, not a renderer-facing option. */
export function createJobSpawner({helperPath, spawnHelper = spawn} = {}) {
  if (!absolutePath(helperPath)) throw new TypeError('Windows Job helper requires an absolute executable path.');
  if (typeof spawnHelper !== 'function') throw new TypeError('Windows Job launcher must be a function.');
  return (executable, args = [], options = {}) => {
    if (!absolutePath(executable) || !absolutePath(options.cwd)) {
      throw new TypeError('Windows Job launch requires absolute executable and working-directory paths.');
    }
    if (!Array.isArray(args) || args.length > 1024 || args.some(arg => typeof arg !== 'string' || arg.includes('\0')) ||
        args.reduce((length, arg) => length + arg.length + 1, executable.length + options.cwd.length) > 32767) {
      throw new TypeError('Windows Job arguments exceed the native command-line bound or contain invalid data.');
    }

    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = undefined; // The helper PID owns the job lifetime.
    child.nativePid = undefined;
    child.exitCode = null;
    child.rootExitCode = null;
    child.terminationReason = null;
    child.isSupervised = true;
    child.cleanupConfirmed = false;
    child.ownershipFailure = null;

    let helper;
    let pending = '';
    let wireBytes = 0;
    let outputBytes = 0;
    let sawReady = false;
    let sawRootExit = false;
    let notStarted = false;
    let receipt = null;
    let closed = false;
    let stopPromise;
    let resolveStop;
    let stopTimer;
    const decoder = new TextDecoder('utf-8', {fatal: true});

    const fail = message => {
      if (child.ownershipFailure) return;
      child.ownershipFailure = message;
      child.cleanupConfirmed = false;
      // Do not expose helper diagnostics, which may include native command data.
      const error = new Error(message);
      error.code = 'WINDOWS_JOB_OWNERSHIP_UNCONFIRMED';
      queueMicrotask(() => child.emit('error', error));
      // Closing the sole job owner kills its contained descendants. A forced
      // helper exit is deliberately not accepted as a cleanup receipt.
      if (!closed) {
        try { helper?.kill(); } catch { /* close or stop deadline resolves ownership */ }
      }
    };

    const accept = record => {
      if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.kind !== 'string') {
        throw new Error('invalid frame');
      }
      if (receipt) throw new Error('frame after cleanup');
      switch (record.kind) {
        case 'ready':
          if (sawReady || notStarted || !exactKeys(record, ['kind', 'pid', 'jobAssigned']) ||
              !validInteger(record.pid) || record.pid === 0 || record.jobAssigned !== true) throw new Error('invalid ready');
          sawReady = true;
          child.nativePid = record.pid;
          break;
        case 'notStarted':
          // This is only a cancellation receipt. It cannot establish a model
          // result, replace an already created process, or imply exit code 0.
          if (!stopPromise || sawReady || notStarted || !exactKeys(record, ['kind'])) throw new Error('invalid no-launch receipt');
          notStarted = true;
          break;
        case 'stdout':
        case 'stderr': {
          if (!sawReady || !exactKeys(record, ['kind', 'data']) || typeof record.data !== 'string' ||
              record.data.length === 0 || record.data.length > 10924 ||
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data)) throw new Error('invalid output');
          const bytes = Buffer.from(record.data, 'base64');
          if (bytes.toString('base64') !== record.data || bytes.length > 8192) throw new Error('invalid output encoding');
          outputBytes += bytes.length;
          if (outputBytes > MAX_OUTPUT_BYTES) throw new Error('output bound');
          child[record.kind].write(bytes);
          break;
        }
        case 'rootExit':
          if (!sawReady || sawRootExit || !exactKeys(record, ['kind', 'exitCode']) || !validInteger(record.exitCode)) {
            throw new Error('invalid native exit');
          }
          sawRootExit = true;
          child.rootExitCode = record.exitCode;
          break;
        case 'cleanup':
          if ((!sawRootExit && !notStarted) || !exactKeys(record, ['kind', 'confirmed', 'activeProcesses', 'reason']) ||
              record.confirmed !== true || record.activeProcesses !== 0 ||
              !['rootExit', 'stop', 'ownerEof', 'timeout'].includes(record.reason) ||
              (notStarted && record.reason !== 'stop')) throw new Error('invalid cleanup');
          receipt = record;
          break;
        case 'error':
          throw new Error('helper reported an error');
        default:
          throw new Error('unexpected supervisor frame');
      }
    };

    const receive = chunk => {
      if (closed || child.ownershipFailure) return;
      try {
        wireBytes += chunk.length;
        if (wireBytes > MAX_WIRE_BYTES) throw new Error('wire bound');
        pending += decoder.decode(chunk, {stream: true});
        let newline;
        while ((newline = pending.indexOf('\n')) !== -1) {
          if (newline > MAX_FRAME_BYTES) throw new Error('frame bound');
          const line = pending.slice(0, newline).replace(/\r$/, '');
          if (Buffer.byteLength(line, 'utf8') > MAX_FRAME_BYTES) throw new Error('frame byte bound');
          pending = pending.slice(newline + 1);
          accept(JSON.parse(line));
        }
        if (pending.length > MAX_FRAME_BYTES) throw new Error('frame bound');
      } catch {
        pending = '';
        fail('Windows Job supervisor returned invalid or excessive output; process cleanup could not be confirmed.');
      }
    };

    const finish = (code, signal = null) => {
      if (closed) return;
      closed = true;
      clearTimeout(stopTimer);
      try {
        if (decoder.decode() || pending.length) throw new Error('truncated frame');
      } catch {
        fail('Windows Job supervisor output ended mid-frame; process cleanup could not be confirmed.');
      }
      const expectedHelperCode = receipt?.reason === 'rootExit' ? child.rootExitCode : 130;
      if ((!notStarted && (!sawReady || !sawRootExit)) || !receipt || !validInteger(code) || signal !== null ||
          (code >>> 0) !== expectedHelperCode) {
        fail('Windows Job supervisor exited without a valid completion receipt; process cleanup could not be confirmed.');
      }
      child.cleanupConfirmed = child.ownershipFailure === null;
      child.terminationReason = child.cleanupConfirmed ? receipt.reason : null;
      child.exitCode = child.cleanupConfirmed ? child.rootExitCode : null;
      child.stdout.end();
      child.stderr.end();
      // close is the sole completion event. Root exit alone cannot release task
      // ownership while a sandbox worker or shell is still in the job.
      queueMicrotask(() => {
        child.emit('close', child.exitCode, signal);
        resolveStop?.(child.cleanupConfirmed);
      });
    };

    child.stop = () => {
      if (stopPromise) return stopPromise;
      if (closed) return (stopPromise = Promise.resolve(child.cleanupConfirmed));
      stopPromise = new Promise(resolve => { resolveStop = resolve; });
      stopTimer = setTimeout(() => {
        fail('Windows Job supervisor did not confirm cleanup before the shutdown deadline.');
        resolveStop(false);
      }, STOP_TIMEOUT_MS);
      try {
        if (!helper?.stdin || helper.stdin.destroyed || helper.stdin.writableEnded) throw new Error('control closed');
        helper.stdin.write('{"action":"stop"}\n', error => {
          if (error && !closed) fail('Windows Job supervisor control channel failed; process cleanup could not be confirmed.');
        });
      } catch {
        fail('Windows Job supervisor control channel is unavailable; process cleanup could not be confirmed.');
      }
      return stopPromise;
    };

    try {
      helper = spawnHelper(helperPath, ['--run', executable, options.cwd, '--', ...args], {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.pid = helper.pid;
      helper.stdout.on('data', receive);
      helper.stdout.on('error', () => fail('Windows Job supervisor output failed; process cleanup could not be confirmed.'));
      // The protocol owns stdout. Unframed helper stderr is diagnostic-only and
      // never forwarded to the native output or interpreted as a completion.
      helper.stderr.on('data', chunk => {
        if (chunk.length) fail('Windows Job supervisor reported an unframed error; process cleanup could not be confirmed.');
      });
      helper.stderr.on('error', () => fail('Windows Job supervisor error channel failed; process cleanup could not be confirmed.'));
      helper.stdin.on('error', () => {
        if (!closed) fail('Windows Job supervisor control channel failed; process cleanup could not be confirmed.');
      });
      helper.on('error', () => fail('Windows Job supervisor could not start or continue; process cleanup could not be confirmed.'));
      helper.on('close', finish);
    } catch {
      fail('Windows Job supervisor could not start; process cleanup could not be confirmed.');
      queueMicrotask(() => finish(null));
    }
    return child;
  };
}
