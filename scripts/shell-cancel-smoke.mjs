import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact, diagnosticText, confirmNativeShutdown } from './harness-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('Usage: node scripts/shell-cancel-smoke.mjs [--muse-bin ABSOLUTE_NATIVE_EXECUTABLE]\n'
    + 'Or set MUSEBENCH_MUSE_BIN. Windows only; sends ONE real Muse request, with no retry or auto-approval.\n'
    + 'Runs an inert cancellation fixture through native sandboxed PowerShell, then disconnects through MuseBench.\n'
    + 'Checks both fixture processes disappear and a 12-second delayed marker stays absent for 13 seconds.\n'
    + 'Optional: MUSEBENCH_EXECUTABLE selects the packaged app. Source mode requires an existing build.\n'
    + 'Uses isolated app data and a retained C:\\MuseBenchSandboxProbes\\cancel-UUID workspace.\n'
    + 'Bounds: 60-second connection, 45-second fixture start, 180-second main workflow plus at most 45 seconds cleanup.');
  process.exit(0);
}

function parseOptions() {
  let binary;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--muse-bin' && binary === undefined && argv[index + 1] && !argv[index + 1].startsWith('--')) binary = argv[++index];
    else throw Error('Use only --muse-bin ABSOLUTE_NATIVE_EXECUTABLE, at most once.');
  }
  if (process.platform !== 'win32') throw Error('This cancellation probe requires native Windows Muse.');
  binary ??= process.env.MUSEBENCH_MUSE_BIN;
  if (!binary || !path.isAbsolute(binary) || !binary.toLowerCase().endsWith('.exe')) throw Error('Supply an absolute official native Muse .exe via --muse-bin or MUSEBENCH_MUSE_BIN.');
  const executablePath = process.env.MUSEBENCH_EXECUTABLE;
  if (executablePath && !path.isAbsolute(executablePath)) throw Error('MUSEBENCH_EXECUTABLE must be an absolute path.');
  return { binary, executablePath };
}

// Validate before creating artifacts or starting Electron/native processes.
let options;
try { options = parseOptions(); } catch (error) { console.error(diagnosticText(error.message)); process.exit(2); }
const output = path.join(root, 'artifacts', 'shell-cancel');
const runDir = path.join(output, new Date().toISOString().replace(/[:.]/g, '-'));
const dataDir = path.join(runDir, 'data');
const workspace = path.join('C:\\MuseBenchSandboxProbes', `cancel-${randomUUID()}`);
const readyPath = path.join(workspace, 'ready.json');
const delayedPath = path.join(workspace, 'delayed-marker.txt');
const MAIN_TIMEOUT = 180000, READY_TIMEOUT = 45000, OBSERVATION_MS = 13000;
const deadline = Date.now() + MAIN_TIMEOUT;
const report = {
  startedAt: new Date().toISOString(), status: 'preparing', phase: 'preflight',
  runDir, dataDir, workspace, appMode: options.executablePath ? 'packaged' : 'source',
  actualElectron: false, modelCallAttempted: false, modelRequestCount: 0,
  sandboxDisabled: false, automaticApprovals: false, automaticRetries: false,
  readyTimeoutMs: READY_TIMEOUT, markerDelayMs: 12000, observationMs: OBSERVATION_MS,
  mainTimeoutMs: MAIN_TIMEOUT, cleanupAllowanceMs: 45000,
  cancellationVerified: false, nativeShutdownEvents: [], checks: [], rendererErrors: [],
};
let app, page, lastState, ready, disconnectAttempted = false, disconnectConfirmed = false;
const hashes = new Map();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(work, timeoutMs, label, cleanup = false) {
  const remaining = cleanup ? timeoutMs : Math.min(timeoutMs, deadline - Date.now());
  if (remaining <= 0) throw Error('Cancellation workflow exceeded its overall time bound.');
  let timer;
  try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(`${label} exceeded its ${remaining} ms bound.`)), remaining);
  })]); } finally { clearTimeout(timer); }
}
async function save() {
  await mkdir(runDir, { recursive: true });
  const contents = JSON.stringify(redact(report), null, 2) + '\n';
  await writeFile(path.join(runDir, 'report.json'), contents);
  await writeFile(path.join(output, 'latest.json'), contents);
}
async function record(name) {
  report.checks.push({ name, at: new Date().toISOString() });
  console.log('PASS ' + name); await save();
}
function summary(state) {
  const runtime = state?.runtime ?? {};
  return redact({ status: runtime.status, reason: runtime.reason, failureCode: runtime.failureCode,
    transport: runtime.transport, hostVersion: runtime.hostVersion, shellEnabled: runtime.shellEnabled,
    permissionVerified: runtime.permissionVerified, permissionProfile: runtime.permissionProfile,
    permissionArguments: runtime.permissionArguments, sandboxReadiness: runtime.sandboxReadiness,
    cleanup: runtime.cleanup, hasSession: Boolean(runtime.sessionId),
    runtimeComplete: state?.task?.runtimeComplete, checkStatus: state?.task?.check?.status ?? null });
}
async function getState() {
  lastState = await bounded(() => page.evaluate(() => window.musebench.getState()), 10000, 'Controller state');
  report.runtime = summary(lastState); return lastState;
}
async function dispatch(action, timeoutMs = 15000) {
  lastState = await bounded(() => page.evaluate(value => window.musebench.dispatch(value), action), timeoutMs, action.type);
  report.runtime = summary(lastState);
  if (lastState.error) throw Error(diagnosticText(lastState.error));
  return lastState;
}
function alive(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0, 'Fixture PID must be a positive integer');
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}
async function exists(file) {
  try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function fixtureIntegrity() {
  for (const [name, expected] of hashes) assert.equal(hash(await readFile(path.join(workspace, name))), expected, `Fixture ${name} must remain unchanged`);
}
async function writeFixtures() {
  await mkdir(workspace, { recursive: true });
  const fixtures = {
    'package.json': JSON.stringify({ name: 'musebench-shell-cancel-fixture', private: true, type: 'module', scripts: { test: 'node check.mjs' } }, null, 2) + '\n',
    'check.mjs': "import assert from 'node:assert/strict';\nimport { existsSync } from 'node:fs';\nassert(!existsSync(new URL('delayed-marker.txt', import.meta.url)), 'Delayed child survived cancellation');\nconsole.log('Cancellation marker absent');\n",
    'cancel.mjs': `import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const child=spawn(process.execPath,[fileURLToPath(new URL('delayed.mjs',import.meta.url))],{
  cwd:fileURLToPath(new URL('.',import.meta.url)),detached:true,stdio:['ignore','pipe','ignore'],windowsHide:true,
});
child.once('error',()=>process.exit(1));
child.stdout.once('data',async bytes=>{
  if(bytes.toString()!=='delayed-worker-ready')process.exit(1);
  await writeFile(new URL('ready.json',import.meta.url),JSON.stringify({
    pid:process.pid,ppid:process.ppid,childPid:child.pid,workerReady:true,startedAt:new Date().toISOString(),
  }));
  console.log('Cancellation fixture ready');
});
setInterval(()=>{},1000);
setTimeout(()=>process.exit(0),45000);
`,
    'delayed.mjs': `import { writeFileSync } from 'node:fs';
setTimeout(()=>{
  writeFileSync(new URL('delayed-marker.txt',import.meta.url),'Detached child survived cancellation\\n');
  process.exit(0);
},12000);
process.stdout.write('delayed-worker-ready');
`,
  };
  for (const [name, source] of Object.entries(fixtures)) {
    await writeFile(path.join(workspace, name), source, { flag: 'wx' });
    hashes.set(name, hash(source));
  }
  report.fixtureHashes = Object.fromEntries(hashes);
}
async function waitForReady() {
  const readyDeadline = Math.min(deadline, Date.now() + READY_TIMEOUT);
  let previousProgress = 0;
  while (Date.now() < readyDeadline) {
    const state = await getState();
    if (state.error) throw Error(diagnosticText(state.error));
    if (state.runtime.pending) throw Error('Muse requested interactive approval/input. No decision or retry was sent.');
    if (['failed', 'cancelled', 'uncertain', 'unavailable', 'closed', 'blocked', 'completed'].includes(state.runtime.status))
      throw Error(`Muse stopped before active cancellation evidence: ${diagnosticText(state.runtime.reason || state.runtime.status)}`);
    if (await exists(readyPath)) {
      const file = await stat(readyPath);
      assert(file.isFile() && file.size > 0 && file.size <= 4096, 'Ready evidence must be a small regular file');
      let candidate;
      try { candidate = JSON.parse(await readFile(readyPath, 'utf8')); } catch { await sleep(100); continue; }
      for (const key of ['pid', 'ppid', 'childPid']) assert(Number.isSafeInteger(candidate[key]) && candidate[key] > 0, 'Ready evidence must contain valid PIDs');
      assert.equal(candidate.workerReady, true, 'The detached worker must report that its marker timer started');
      assert.notEqual(candidate.pid, candidate.childPid);
      assert.notEqual(candidate.pid, process.pid); assert.notEqual(candidate.childPid, process.pid);
      const startedAt = Date.parse(candidate.startedAt);
      assert(Number.isFinite(startedAt) && startedAt >= Date.parse(report.submittedAt) - 1000 && startedAt <= Date.now() + 1000, 'Ready evidence must belong to this submission');
      assert(alive(candidate.pid), 'Fixture parent must be running before cancellation');
      assert(alive(candidate.childPid), 'Detached fixture child must be running before cancellation');
      assert.equal(await exists(delayedPath), false, 'Cancellation must begin before the delayed marker is written');
      ready = candidate; report.fixtureProcesses = { ...candidate, parentObservedAlive: true, childObservedAlive: true };
      await fixtureIntegrity(); return;
    }
    if (Date.now() - previousProgress >= 10000) {
      console.log(`Waiting for native shell fixture: ${state.runtime.status}; ${Math.ceil((readyDeadline - Date.now()) / 1000)}s remain.`);
      previousProgress = Date.now();
    }
    await sleep(100);
  }
  throw Error('The native cancellation fixture did not become ready within 45 seconds. No retry was sent.');
}
async function disconnect() {
  if (disconnectConfirmed) return;
  if (disconnectAttempted) throw Error('The previous native disconnect did not confirm cleanup.');
  disconnectAttempted = true;
  try {
    const cleanup = await confirmNativeShutdown(action => page.evaluate(value => window.musebench.dispatch(value), action), { timeoutMs: 25000 });
    disconnectConfirmed = true;
    report.nativeShutdownEvents.push({ cleanup, at: new Date().toISOString() });
  } catch {
    report.nativeShutdownEvents.push({ cleanup: 'unconfirmed', at: new Date().toISOString() });
    throw Error('Native Muse shutdown could not be confirmed; no extra model request or PID-based kill was attempted.');
  }
}

try {
  await mkdir(dataDir, { recursive: true });
  const binary = await realpath(options.binary);
  assert((await stat(binary)).isFile(), 'Muse executable must be a regular file');
  report.binary = binary;
  await writeFixtures(); await save();
  console.log('Starting one real Muse cancellation request in an isolated Electron workspace.');
  console.log('Report: ' + path.join(runDir, 'report.json'));
  console.log('Workspace: ' + workspace);
  const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
  report.phase = 'electron';
  app = await bounded(() => electron.launch({ cwd: root, args: options.executablePath ? [] : ['.'],
    ...(options.executablePath ? { executablePath: options.executablePath } : {}), env, timeout: 30000 }), 30000, 'Electron launch');
  page = await bounded(() => app.firstWindow(), 15000, 'Electron window');
  page.on('pageerror', error => report.rendererErrors.push(diagnosticText(error.message, 2000)));
  await bounded(() => page.waitForFunction(() => Boolean(window.musebench)), 15000, 'Desktop bridge');
  report.actualElectron = true;
  await dispatch({ type: 'openProject', path: workspace });
  await dispatch({ type: 'newTask', mode: 'muse', request: 'Verify sandboxed shell cancellation using this disposable inert fixture.' });
  await dispatch({ type: 'updatePlan', plan: 'Run only the supplied cancellation fixture through native sandboxed PowerShell. MuseBench will disconnect while it is running and verify that the parent and detached delayed child stop. Do not modify source files or run project checks.',
    criteria: ['The native shell fixture starts under the current sandbox settings.', 'Disconnect stops both fixture processes before the delayed marker is written.', 'Cancellation does not mark the Muse turn or any project check complete.'] });
  await dispatch({ type: 'approvePlan' });
  report.phase = 'connect';
  const connected = await dispatch({ type: 'connectMuse', binary }, 60000);
  assert.equal(connected.runtime.transport, 'exec');
  assert.equal(connected.runtime.status, 'idle'); assert.equal(connected.runtime.shellEnabled, true);
  assert.equal(connected.runtime.permissionVerified, true); assert.equal(connected.runtime.permissionProfile, ':ask-me');
  assert(connected.runtime.sessionId);
  const flags = connected.runtime.permissionArguments;
  assert(Array.isArray(flags)); assert.equal(flags[flags.indexOf('--permission-profile') + 1], ':ask-me');
  for (const flag of ['--disable-shell', '--disable-sandbox', '--disable-approval', '--yolo', '--trust-workspace']) assert(!flags.includes(flag), `Forbidden native flag: ${flag}`);
  report.connectedRuntime = summary(connected);
  await record('Native sandboxed shell enabled with Ask me and no weakening flags');
  const command = `Set-Location -LiteralPath '${workspace.replaceAll("'", "''")}'; node cancel.mjs`;
  const prompt = 'This disposable project contains an inert cancellation fixture. Invoke the managed powershell tool exactly once with this exact command text:\n\n'
    + command + '\n\nThe fixture deliberately starts one inert detached child that would write only delayed-marker.txt in this workspace after 12 seconds, and the parent writes ready.json. MuseBench will disconnect to test cancellation. Keep the normal sandbox and Ask me permissions. Do not change source files, install packages, use the network, run other commands or tools, retry, or weaken sandbox settings. Do not run project checks or claim completion. If approval or a shell failure occurs, stop.';
  report.expectedCommand = command; report.phase = 'model-turn'; report.status = 'running';
  report.modelCallAttempted = true; report.modelRequestCount = 1; report.submittedAt = new Date().toISOString(); await save();
  await dispatch({ type: 'sendMessage', text: prompt, mode: 'chat' });
  await waitForReady();
  await record('Actual fixture parent and detached child both alive before disconnect');
  report.phase = 'disconnect'; report.disconnectStartedAt = new Date().toISOString();
  await disconnect();
  const stopped = await getState();
  assert.equal(stopped.runtime.cleanup, 'confirmed'); assert.equal(stopped.runtime.sessionId, null);
  assert.equal(stopped.task.runtimeComplete, false); assert.equal(stopped.task.check, null);
  report.disconnectedRuntime = summary(stopped);
  await record('Controller confirms native cleanup without turn completion or check evidence');
  report.phase = 'observe-descendants';
  const observeUntil = Date.now() + OBSERVATION_MS;
  assert(observeUntil < deadline, 'The remaining workflow budget must cover delayed-child observation');
  while (Date.now() < observeUntil) {
    assert.equal(await exists(delayedPath), false, 'Detached child wrote its marker after cancellation');
    await sleep(Math.min(250, observeUntil - Date.now()));
  }
  assert.equal(await exists(delayedPath), false);
  const parentAlive = alive(ready.pid), childAlive = alive(ready.childPid);
  report.fixtureProcesses.afterCancellation = { parentAlive, childAlive, delayedMarkerExists: false, checkedAt: new Date().toISOString() };
  assert.equal(parentAlive, false, 'Fixture parent PID must no longer exist');
  assert.equal(childAlive, false, 'Detached fixture child PID must no longer exist');
  await fixtureIntegrity();
  assert.equal(report.rendererErrors.length, 0);
  await record('Both fixture PIDs gone and delayed marker absent throughout the 13-second observation');
  report.cancellationVerified = true; report.status = 'passed'; report.phase = 'complete';
} catch (error) {
  report.status = 'failed'; report.error = diagnosticText(error.message, 4000);
  console.error(report.error); process.exitCode = 1;
} finally {
  if (app && page && !page.isClosed() && !disconnectAttempted) {
    try { await disconnect(); } catch (error) { report.cleanupError = diagnosticText(error.message, 2000); report.status = 'failed'; process.exitCode = 1; }
  }
  if (app && (!page || page.isClosed()) && report.modelCallAttempted && !disconnectConfirmed) {
    report.cleanupError = 'The desktop bridge closed before native disconnect could be confirmed.';
    report.nativeShutdownEvents.push({ cleanup: 'unconfirmed', at: new Date().toISOString() });
    report.status = 'failed'; process.exitCode = 1;
  }
  if (app) {
    try { await bounded(() => app.close(), 15000, 'Electron close', true); report.appClosed = true; }
    catch (error) { report.closeError = diagnosticText(error.message, 2000); report.status = 'failed'; process.exitCode = 1; }
  }
  report.completedAt = new Date().toISOString(); await save();
  console.log('Result: ' + report.status + '\nReport: ' + path.join(runDir, 'report.json'));
}
