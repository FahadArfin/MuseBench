import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { createExecRuntime } from '../src/runtime/exec.mjs';
import { createExecConversationFold } from '../src/runtime/exec-conversation-events.mjs';
import { createJobSpawner } from '../src/runtime/windows-job.mjs';
import { redact, diagnosticText } from './harness-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/activity-agent-probe.mjs --live --muse-bin ABSOLUTE_EXE [--capture-continuation]\nRuns one sandboxed native Muse request asking one read-only child to inspect a disposable README. Limits: 8 model steps, 90 seconds. No retry or permission bypass. The optional diagnostic captures exact runtime argv after preflight, then uses the unchanged Job supervisor without the production fold.');
  process.exit(0);
}
assert.deepEqual(args.slice(0, 2), ['--live', '--muse-bin'], 'An explicit --live --muse-bin invocation is required.');
assert(args.length === 3 || (args.length === 4 && args[3] === '--capture-continuation'));
const diagnostic = args[3] === '--capture-continuation';
const binary = await realpath(args[2]);
const output = path.join(root, 'artifacts', 'activity-agent-probe');
await mkdir(output, { recursive: true });
const runDir = await mkdtemp(path.join(output, 'run-'));
const workspaceBase = 'C:\\MuseBenchWorkspaces';
await mkdir(workspaceBase, { recursive: true });
const workspace = await realpath(await mkdtemp(path.join(workspaceBase, 'activity-agent-probe-')));
const marker = `MUSEBENCH_CHILD_READ_${randomUUID()}`;
const content = `# Disposable activity probe\n\nThis README is the entire task fixture.\nMarker: ${marker}\nRead only. Do not create or modify files.\n`;
await writeFile(path.join(workspace, 'README.md'), content, { flag: 'wx' });
const hash = text => createHash('sha256').update(text).digest('hex');
const report = { startedAt: new Date().toISOString(), status: 'preparing', runDir, workspace, binary, diagnosticContinuation: diagnostic,
  modelProcessCount: 0, maxModelSteps: 8, runTimeoutMs: 90000, modelCallAttempted: false,
  modelStdoutBytes: 0, eventShapes: [], toolResults: [], taskKinds: [], streamKinds: [],
  foldRejectedAt: null, checks: [] };
const records = [], safeLines = [], shapes = new Set();
const spawnNative = createJobSpawner({ helperPath: path.join(root, 'native', 'bin', 'MuseBenchJob.exe') });
const fold = createExecConversationFold();
let runtime, state, childOwner, observerFailure, modelClosed = false, capturedLaunch, directLaunching = false, directTimer;
const stopObserver = message => {
  observerFailure ??= message;
  queueMicrotask(() => { if (diagnostic) void childOwner?.stop(); else void runtime?.disconnect(); });
};
function observe(record) {
  if (records.length >= 20000) return stopObserver('Record count exceeded 20000.');
  const safe = redact(record);
  records.push(safe); safeLines.push(JSON.stringify(safe) + '\n');
  const p = record.payload;
  const approvalName = `${record.payload_type} ${p?.kind}`;
  const policy = p?.event?.policy_decision;
  if (diagnostic && (/(?:approval|permission)[._/](?:requested|required|pending|prompt)/i.test(approvalName)
      || /(?:approval|permission)_(?:requested|required|pending|prompt)/i.test(approvalName)
      || (typeof policy === 'string' && /^(?:prompt|ask|approval_required)(?::|_|$)/i.test(policy)))) {
    stopObserver('Native runtime requested approval; diagnostic capture stopped without responding.');
  }
  if (!report.foldRejectedAt) {
    try { fold.accept(record); }
    catch (error) { report.foldRejectedAt = { line: records.length, type: record.payload_type, message: diagnosticText(error.message, 1200) }; }
  }
  const key = `${record.payload_type}/${p?.kind}/${p?.event?.kind ?? ''}`;
  if (!shapes.has(key) && report.eventShapes.length < 120) {
    shapes.add(key);
    report.eventShapes.push({ line: records.length, type: record.payload_type, kind: p?.kind,
      keys: Object.keys(p ?? {}).sort(), eventKind: p?.event?.kind, eventKeys: Object.keys(p?.event ?? {}).sort() });
  }
  if (!report.streamKinds.includes(record.stream?.kind)) report.streamKinds.push(record.stream?.kind);
  if (p?.event?.task_kind && !report.taskKinds.includes(p.event.task_kind)) report.taskKinds.push(p.event.task_kind);
  if (record.payload_type === 'tool.result') report.toolResults.push({ line: records.length, payload: safe.payload });
}
function observedSpawn(command, nativeArgs, options) {
  const meta = nativeArgs[0] === 'exec' && nativeArgs[nativeArgs.indexOf('--provider') + 1] === 'meta';
  if (meta) {
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
    assert.equal(nativeArgs[nativeArgs.indexOf('--workspace') + 1], workspace);
    assert.equal(nativeArgs[nativeArgs.indexOf('--permission-profile') + 1], ':ask-me');
    assert.equal(nativeArgs[nativeArgs.indexOf('--max-model-steps') + 1], '8');
    for (const flag of ['--json', '--no-session-log', '--disable-web-tools', '--disable-reminders', '--disable-request-user-input', '--no-foreign-personal-context']) assert(nativeArgs.includes(flag));
    assert(nativeArgs.includes('hooks={}')); assert(nativeArgs.includes('managed_hooks_path=null'));
    for (const flag of ['--disable-sandbox', '--disable-approval', '--yolo', '--trust-workspace']) assert(!nativeArgs.includes(flag));
    report.permissionArgumentsVerified = true;
    if (diagnostic && !directLaunching) {
      capturedLaunch = { command, nativeArgs, options };
      throw Error('Diagnostic capture only: no native model process launched.');
    }
    assert.equal(++report.modelProcessCount, 1, 'The probe refuses a second model process.');
  }
  const child = spawnNative(command, nativeArgs, options);
  if (!meta) return child;
  childOwner = child;
  const decoder = new StringDecoder('utf8'); let buffer = '';
  function consume(text, final = false) {
    if (observerFailure) return;
    buffer += text;
    if (Buffer.byteLength(buffer) > 512 * 1024 && !buffer.includes('\n')) return stopObserver('Raw record exceeded 512 KiB.');
    const lines = buffer.split('\n'); buffer = lines.pop();
    if (final && buffer) { lines.push(buffer); buffer = ''; }
    for (const line of lines) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > 512 * 1024) return stopObserver('Raw record exceeded 512 KiB.');
      try { observe(JSON.parse(line)); } catch { return stopObserver('Raw output was malformed.'); }
    }
  }
  child.stdout.on('data', chunk => {
    report.modelStdoutBytes += Buffer.byteLength(chunk);
    if (report.modelStdoutBytes > 4 * 1024 * 1024) return stopObserver('Raw output exceeded 4 MiB.');
    consume(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  });
  child.once('close', code => {
    consume(decoder.end(), true); modelClosed = true; clearTimeout(directTimer); report.processExitCode = code;
    report.nativeOwnership = { supervised: child.isSupervised, cleanupConfirmed: child.cleanupConfirmed, terminationReason: child.terminationReason };
    if (!report.foldRejectedAt) {
      try { const result = fold.finish(code); report.rawRun = { success: result.success, terminal: result.terminal, recordCount: result.recordCount, sessionId: result.sessionId, commandId: result.commandId, runId: result.runId }; }
      catch (error) { report.foldFinishError = diagnosticText(error.message, 1200); }
    }
  });
  child.on('error', () => { if (diagnostic) stopObserver('Native supervisor reported a process or ownership error.'); });
  return child;
}
async function save() {
  await writeFile(path.join(runDir, 'stdout.jsonl'), safeLines.join(''));
  await writeFile(path.join(runDir, 'report.json'), JSON.stringify(redact(report), null, 2) + '\n');
  await writeFile(path.join(output, 'latest.json'), JSON.stringify(redact(report), null, 2) + '\n');
}
try {
  runtime = createExecRuntime({ spawnProcess: observedSpawn, maxModelSteps: 8, runTimeoutMs: 90000 });
  state = await runtime.connect({ binary, workspaceRoot: workspace });
  assert.equal(state.status, 'idle'); assert.equal(state.permissionVerified, true);
  report.readiness = { permissionProfile: state.permissionProfile, sandboxReadiness: state.sandboxReadiness, shellEnabled: state.shellEnabled, permissionArguments: state.permissionArguments };
  const prompt = 'Run one small read-only native subagent probe. Use exactly one native subagent, with an objective to read only README.md in this workspace and return its exact Marker value. If you use a workflow, its script must call host.agent exactly once, await that one child, and return its result; never call workflow a second time or create another child. Do not read README.md yourself: the marker must come from the child. Ask the child to use read_file only, not shell, web, edits, additional agents, or configuration. Use the shared workspace; no worktree is needed. Wait for that child and report the returned marker in one short final sentence. If native subagents are unavailable or rejected, explain that and stop; do not substitute your own file reading or retry. Do not write any workspace file, run commands, inspect credentials, or change settings.';
  report.modelCallAttempted = true; report.status = 'running'; await save();
  try { await runtime.send({ text: prompt, runOptions: { reasoning: 'low', approval: 'ask' } }); }
  catch (error) { if (!diagnostic || !capturedLaunch) throw error; }
  if (diagnostic) {
    const disconnected = await runtime.disconnect(); assert(['confirmed', 'not-started'].includes(disconnected.cleanup));
    directLaunching = true;
    observedSpawn(capturedLaunch.command, capturedLaunch.nativeArgs, capturedLaunch.options);
    capturedLaunch = null;
    directTimer = setTimeout(() => { report.timedOut = true; void childOwner.stop(); }, 90000);
  }
  const deadline = Date.now() + 100000; let nextUpdate = Date.now();
  while (Date.now() < deadline) {
    state = runtime.snapshot();
    if (modelClosed || observerFailure || (!diagnostic && ['blocked', 'uncertain', 'unavailable'].includes(state.status))) break;
    if (Date.now() >= nextUpdate) { console.log(`Native probe: ${diagnostic ? 'diagnostic capture' : state.status}; records=${records.length}`); nextUpdate = Date.now() + 15000; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  state = runtime.snapshot();
  report.runtime = { status: state.status, reason: state.reason, failureCode: state.failureCode, liveVerified: state.liveVerified, cleanup: state.cleanup,
    nativeSessionId: state.nativeSessionId, commandId: state.commandId, runId: state.runId, modelId: state.modelId, providerId: state.providerId };
  report.finalText = diagnostic ? records.filter(record => record.payload_type === 'run.terminal.completed').map(record => record.payload.text).join('\n') : state.messages.filter(item => item.kind === 'agentMessage').map(item => item.text).join('\n');
  report.markerInFinalText = report.finalText.includes(marker);
  report.observerFailure = observerFailure ?? null;
  report.status = diagnostic ? modelClosed && report.processExitCode === 0 ? 'diagnostic_process_completed' : 'diagnostic_inconclusive' : report.foldRejectedAt ? 'fold_rejected' : state.status === 'completed' ? 'completed' : 'inconclusive';
} catch (error) {
  report.status = 'failed'; report.error = diagnosticText(error.message, 2000); process.exitCode = 1;
} finally {
  clearTimeout(directTimer);
  if (diagnostic && childOwner) {
    const confirmed = await childOwner.stop(); report.diagnosticCleanup = confirmed ? 'confirmed' : 'unconfirmed';
    if (!confirmed) { report.status = 'cleanup_unconfirmed'; process.exitCode = 1; }
  }
  if (runtime) {
    const closed = await runtime.disconnect(); report.cleanup = closed.cleanup;
    if (!['confirmed', 'not-started'].includes(closed.cleanup)) { report.status = 'cleanup_unconfirmed'; process.exitCode = 1; }
  }
  report.nativeOwnership ??= childOwner ? { supervised: childOwner.isSupervised, cleanupConfirmed: childOwner.cleanupConfirmed, terminationReason: childOwner.terminationReason } : null;
  report.readmeUnchanged = hash(await readFile(path.join(workspace, 'README.md'))) === hash(content);
  report.workspaceEntries = await readdir(workspace);
  report.childRelatedRecords = records.map((record, i) => ({ record, line: i + 1 })).filter(({ record }) => /subagent|agent[._]/i.test(record.payload_type ?? '') || /subagent|agent[._]/i.test(record.payload?.kind ?? '')).map(({ record, line }) => ({ line, record }));
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, modelProcessCount: report.modelProcessCount, runtime: report.runtime, cleanup: report.cleanup,
    foldRejectedAt: report.foldRejectedAt, markerInFinalText: report.markerInFinalText, taskKinds: report.taskKinds, childRelatedRecordCount: report.childRelatedRecords.length,
    readmeUnchanged: report.readmeUnchanged, report: path.join(runDir, 'report.json') }, null, 2));
}
