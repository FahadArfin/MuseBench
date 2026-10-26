import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {redact,diagnosticText,permissionReport,confirmNativeShutdown} from './harness-safety.mjs';
import {validateRunOptions,approvalArguments} from '../src/shared/run-options.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/live-smoke.mjs [--connect-only | --shell] [--muse-bin ABSOLUTE_NATIVE_EXECUTABLE] [--reasoning high] [--approval ask]\n'
    + 'Or set MUSEBENCH_MUSE_BIN. Default mode runs one real Muse request using your signed-in account.\n'
    + '--connect-only checks the app connection/readiness and closes it without sending a model request. It is not an end-to-end pass.\n'
    + '--shell additionally requires one native sandboxed PowerShell test result, its rendered command card, and persistence after restart. Cannot combine with --connect-only.\n'
    + 'Optional: MUSEBENCH_EXECUTABLE for the packaged app; MUSEBENCH_LIVE_TIMEOUT_MS (30000..600000, default 180000).\n'
    + 'MSP permission requests wait for your decision in Electron. Exec mode stops on unsupported interactive requests. No permissions are auto-approved.');
  process.exit(0);
}

const output = path.join(root, 'artifacts', 'live-workflow');
const runDir = path.join(output, new Date().toISOString().replace(/[:.]/g, '-'));
const dataDir = path.join(runDir, 'data');
const screenshots = path.join(runDir, 'screenshots');
await mkdir(screenshots, { recursive: true });
await mkdir(dataDir, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), status: 'preparing', phase: 'preflight',
  mode: args.includes('--connect-only') ? 'connection_only' : 'end_to_end',
  shellRequested: args.includes('--shell'), nativeShellVerified: false,
  runDir, dataDir, actualElectron: false, modelCallAttempted: false,
  readinessVerified: false, endToEndVerified: false, authoritativeRunCompleted: false,
  authoritativeTurnCompleted: false, permissionRequests: [], checks: [], rendererErrors: [], nativeShutdownEvents: [],
};
let app, page, lastState, closeError;
let nativeStopAttempted=false,nativeConnectAttempted=false,nativeStopResult=null;
function runtimeSummary(state) {
  const runtime = state?.runtime ?? {};
  const transport = runtime.transport ?? 'msp';
  return redact({ status: runtime.status, reason: runtime.reason, failureCode: runtime.failureCode,
    transport, hostVersion: runtime.hostVersion,
    sdkVersion: runtime.sdkVersion, permissionVerified: runtime.permissionVerified,
    permissionProfile: runtime.permissionProfile, cleanup: runtime.cleanup,
    shellEnabled: runtime.shellEnabled, shellUnavailableReason: runtime.shellUnavailableReason,
    permissionEvidence: transport === 'exec' ? 'fixed-cli-arguments-native-readiness-and-echo' : 'msp-dynamic-session-permission-state',
    sandboxReadiness: transport === 'exec' ? runtime.sandboxReadiness : undefined,
    permissionArguments: transport === 'exec' ? runtime.permissionArguments : undefined,
    hasConnectionHandle: Boolean(runtime.sessionId),
    hasNativeSession: transport === 'exec' ? Boolean(runtime.nativeSessionId) : Boolean(runtime.sessionId),
    uiLiveVerified: runtime.liveVerified });
}
async function save() {
  const contents = JSON.stringify(redact(report), null, 2) + '\n';
  await writeFile(path.join(runDir, 'report.json'), contents);
  await writeFile(path.join(output, 'latest.json'), contents);
}
async function record(name) {
  report.checks.push({ name, at: new Date().toISOString() });
  console.log('PASS ' + name);
  await save();
}
function failure(message, code = 'LIVE_WORKFLOW_FAILED', unavailable = false) {
  const error = new Error(message); error.code = code; error.unavailable = unavailable; return error;
}
function parseOptions(input) {
  const options = { connectOnly: false, shell: false, binary: undefined, runOptions:{reasoning:'high',approval:'ask'} };
  const settings=new Set();
  for (let index = 0; index < input.length; index++) {
    const argument = input[index];
    if (argument === '--connect-only' && !options.connectOnly) options.connectOnly = true;
    else if (argument === '--shell' && !options.shell) options.shell = true;
    else if (argument === '--muse-bin' && options.binary === undefined && input[index + 1] && !input[index + 1].startsWith('--')) options.binary = input[++index];
    else if (['--reasoning','--approval'].includes(argument) && !settings.has(argument) && input[index + 1]) {settings.add(argument);options.runOptions[argument.slice(2)]=input[++index];}
    else throw failure('Use --connect-only or --shell, with optional --muse-bin ABSOLUTE_NATIVE_EXECUTABLE. Each option may appear once.', 'INVALID_ARGUMENTS', true);
  }
  if (options.connectOnly && options.shell) throw failure('--shell requires the full workflow and cannot be combined with --connect-only.', 'INVALID_ARGUMENTS', true);
  options.runOptions=validateRunOptions(options.runOptions);
  return options;
}
function shellCommand(projectRoot) {
  return `Set-Location -LiteralPath '${projectRoot.replaceAll("'", "''")}'; npm.cmd run --ignore-scripts test`;
}
function verifyShellResult(result, expectedCommand, runId) {
  assert.equal(result?.toolName, 'powershell', 'Shell evidence must be a native PowerShell result');
  assert.equal(result.runId, runId, 'Shell evidence must belong to the completed native run');
  assert.equal(typeof result.callId, 'string'); assert(result.callId.length > 0);
  assert.equal(result.command.trim(), expectedCommand, 'Muse must run only the exact approved command');
  assert.equal(result.terminalStatus, 'completed'); assert.equal(result.exitCode, 0);
  assert.equal(result.outcome, 'success'); assert.equal(result.truncated, false);
  const output = result.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const name of ['caffeine-free preference excludes every caffeinated tea',
    'all teas restores the complete independent collection', 'tutorial change exposes the filter in the storefront'])
    assert(output.includes(name), `Native output must include the actual template test: ${name}`);
  for (const [label, count] of [['tests', 3], ['pass', 3], ['fail', 0]])
    assert(new RegExp(`^\\s*(?:#|ℹ)?\\s*${label}\\s+${count}\\s*$`, 'm').test(output), `Native output must report ${label} ${count}`);
}
async function inspectShellCard(result, screenshot) {
  const section = page.locator('section[aria-label="Muse command results"]');
  await section.waitFor({ state: 'visible' });
  const cards = section.locator('details');
  assert.equal(await cards.count(), 1, 'Exactly one native command card must be rendered');
  const card = cards.first();
  if (!(await card.evaluate(element => element.open))) await card.locator('summary').click();
  assert.equal(await card.locator('pre[aria-label="Native command"]').textContent(), result.command);
  assert.equal(await card.locator('pre[aria-label="Native command output"]').textContent(), result.output);
  assert((await card.locator('summary').textContent()).includes('completed'));
  assert((await card.locator('summary').textContent()).includes('exit 0'));
  await card.scrollIntoViewIfNeeded(); await capture(screenshot);
}
async function boundedConnection(work, timeoutMs = 60000) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(failure('Muse connection readiness did not finish within the 60-second bound. No model request was sent.', 'MUSE_CONNECTION_TIMED_OUT', true)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
async function stopNative() {
  if(nativeStopAttempted){
    if(nativeStopResult)return nativeStopResult;
    throw failure('Native Muse shutdown could not be confirmed. Inspect the owned native process before another run.','NATIVE_SHUTDOWN_UNCONFIRMED');
  }
  nativeStopAttempted=true;
  try{
    let cleanup;
    if(!page||page.isClosed()){
      if(nativeConnectAttempted)throw Error('The controller is unavailable for shutdown confirmation.');
      cleanup='not-started';
    }else cleanup=await confirmNativeShutdown(action=>page.evaluate(value=>window.musebench.dispatch(value),action));
    nativeStopResult=cleanup;
    report.nativeShutdownEvents.push({phase:report.phase,cleanup,at:new Date().toISOString()});
    return cleanup;
  }catch{
    report.nativeShutdownEvents.push({phase:report.phase,cleanup:'unconfirmed',at:new Date().toISOString()});
    throw failure('Native Muse shutdown could not be confirmed. Inspect the owned native process before another run.','NATIVE_SHUTDOWN_UNCONFIRMED');
  }
}
function authenticationRequired(state) {
  const text = [state?.error, state?.runtime?.reason,
    ...(state?.runtime?.messages ?? []).map(item => item.text ?? '')].join('\n');
  return state?.runtime?.failureCode === 'auth' || /not\s+authenticated|unauthenticated|unauthorized|not\s+(?:signed|logged)\s+in|authentication\s+(?:required|failed)|(?:sign|log)[ -]?in\s+(?:required|first)|(?:please|must|need to)\s+(?:sign|log)[ -]?in|(?:missing|no).{0,25}(?:credentials|authentication)|\b401\b/i.test(text);
}
function billingActionRequired(state) {
  const text = [state?.error, state?.runtime?.reason,
    ...(state?.runtime?.messages ?? []).map(item => item.text ?? '')].join('\n');
  return state?.runtime?.failureCode === 'billing' || /\b402\b|billing\s+verification\s+failed|payment\s+required/i.test(text);
}
function failForState(state, beforeTurn = false) {
  if (billingActionRequired(state)) throw failure('Muse billing verification failed (HTTP 402). Resolve the account billing requirement in the official Meta account interface before authorizing another live run. No retry or billing change was attempted.', 'MUSE_BILLING_ACTION_REQUIRED', true);
  if (authenticationRequired(state)) throw failure('Sign in through the official Muse CLI, then rerun this test. Do not paste credentials into chat.', 'MUSE_SIGN_IN_REQUIRED', true);
  const reason = state?.error || state?.runtime?.reason || `Muse runtime is ${state?.runtime?.status ?? 'unknown'}.`;
  const prerequisiteUnavailable = beforeTurn || (state?.runtime?.status === 'blocked' && state.runtime.permissionVerified !== true);
  throw failure(diagnosticText(reason), prerequisiteUnavailable ? 'MUSE_CONNECTION_UNAVAILABLE' : 'MUSE_TURN_FAILED', prerequisiteUnavailable);
}
async function projectInventory(projectRoot) {
  const entries = [];
  async function visit(folder, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const type = entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other';
      entries.push({ path: relative, type });
      if (type === 'directory') await visit(path.join(folder, entry.name), relative);
    }
  }
  await visit(projectRoot);
  return entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
async function hashKnownFiles(projectRoot, inventory) {
  const hashes = {};
  for (const entry of inventory) {
    assert(['file', 'directory'].includes(entry.type), 'The copied sample must not contain symlinks or special files');
    if (entry.type === 'file') hashes[entry.path] = createHash('sha256').update(await readFile(path.join(projectRoot, entry.path))).digest('hex');
  }
  return hashes;
}
async function getState() {
  lastState = await page.evaluate(() => window.musebench.getState());
  report.runtime = runtimeSummary(lastState);
  return lastState;
}
async function dispatch(action, { connection = false } = {}) {
  lastState = await page.evaluate(value => window.musebench.dispatch(value), action);
  report.runtime = runtimeSummary(lastState);
  if (lastState.error) failForState(lastState, connection);
  return lastState;
}
async function until(predicate, timeoutMs, phase) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState();
    if (state.error) failForState(state);
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw failure(`${phase} did not finish within ${timeoutMs} ms.`, 'LIVE_WAIT_TIMED_OUT');
}
async function showRuntime() {
  if (await page.getByRole('dialog', { name: 'Your Muse connection' }).count()) return;
  await page.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await page.getByRole('menuitem', { name: /Settings/ }).click();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Muse connection', exact: true }).click();
  await page.getByRole('button', { name: 'Open Muse connection', exact: true }).click();
}
async function waitForTurn(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let previousPending = '', lastProgress = 0;
  while (Date.now() < deadline) {
    const state = await getState(), runtime = state.runtime;
    if (state.error) failForState(state);
    if (runtime.pending) {
      const pending = runtime.pending;
      const signature = JSON.stringify(pending);
      if (signature !== previousPending) {
        previousPending = signature;
        const detail = { at: new Date().toISOString(), ...permissionReport(pending) };
        report.permissionRequests.push(detail);
        report.status = 'waiting_user_approval';
        await save();
        console.log('USER ACTION REQUIRED: Review this request in the MuseBench runtime dialog. The harness will not decide it.');
        console.log(JSON.stringify(detail, null, 2));
        await showRuntime();
      }
      if (pending.kind !== 'approval') throw failure('Muse requested an input type this app cannot answer. The run will close; no retry or additional turn is sent.', 'MUSE_INPUT_UNSUPPORTED');
    } else if (runtime.status === 'completed' && state.task?.runtimeComplete === true) {
      if (runtime.transport === 'exec' && runtime.liveVerified !== true)
        throw failure('Exec reported completion without confirmed real-provider terminal and process-exit evidence.', 'MUSE_EXEC_COMPLETION_UNVERIFIED');
      report.status = 'running';
      report.authoritativeTurnCompleted = true;
      report.authoritativeRunCompleted = runtime.transport === 'exec';
      report.completionEvidence = runtime.transport === 'exec' ? 'exec-completed-event-and-successful-process-exit' : 'msp-turn-completed-notification';
      report.completedRuntime = runtimeSummary(state);
      return state;
    } else if (['failed', 'cancelled', 'uncertain', 'unavailable', 'closed', 'blocked'].includes(runtime.status)) {
      failForState(state);
    }
    if (Date.now() - lastProgress >= 15000) {
      console.log(`Muse status: ${runtime.status}; ${Math.ceil((deadline - Date.now()) / 1000)}s remain in the bounded wait.`);
      lastProgress = Date.now();
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw failure('The Muse turn or permission decision exceeded the bounded wait. No retry was sent. Inspect any partial edit in the saved disposable project.', 'MUSE_TURN_TIMED_OUT');
}
async function capture(name) {
  await page.screenshot({ path: path.join(screenshots, name) });
}

async function run() {
try {
  const { connectOnly, shell, binary: argumentBinary, runOptions } = parseOptions(args);
  report.runOptions=runOptions;
  let shellResultsForRestart;
  const requestedBinary = argumentBinary ?? process.env.MUSEBENCH_MUSE_BIN;
  if (!requestedBinary) throw failure('Set MUSEBENCH_MUSE_BIN to the official native Muse executable after installation and sign-in.', 'MUSE_BINARY_REQUIRED', true);
  if (!path.isAbsolute(requestedBinary) || (process.platform === 'win32' && !requestedBinary.toLowerCase().endsWith('.exe')))
    throw failure('Select an absolute native muse.exe path, not a .cmd or PowerShell launcher.', 'MUSE_NATIVE_BINARY_REQUIRED', true);
  let binary;
  try { binary = await realpath(requestedBinary); if (!(await stat(binary)).isFile()) throw Error('Not a file'); }
  catch { throw failure('The supplied native Muse executable does not exist or is unavailable.', 'MUSE_BINARY_UNAVAILABLE', true); }
  const timeoutMs = Number(process.env.MUSEBENCH_LIVE_TIMEOUT_MS ?? 180000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 600000) throw failure('MUSEBENCH_LIVE_TIMEOUT_MS must be an integer from 30000 to 600000.', 'INVALID_TIMEOUT', true);
  const executablePath = process.env.MUSEBENCH_EXECUTABLE;
  if (executablePath && !path.isAbsolute(executablePath)) throw failure('MUSEBENCH_EXECUTABLE must be an absolute path.', 'INVALID_APP_EXECUTABLE', true);
  report.binary = binary; report.timeoutMs = timeoutMs; report.appMode = executablePath ? 'packaged' : 'source';
  const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
  const launch = () => electron.launch({ cwd: root, args: executablePath ? [] : ['.'],
    ...(executablePath ? { executablePath } : {}), env, timeout: 30000 });
  console.log(connectOnly
    ? 'Starting an Electron + native Muse connection/readiness check. No model request, edit, preview, project check, or checkpoint will be attempted.'
    : 'Starting a real Electron + Muse workflow in a disposable project. This invocation requests one model operation.');
  console.log('Report: ' + path.join(runDir, 'report.json'));
  report.phase = 'electron'; await save();
  app = await launch(); page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.rendererErrors.push(diagnosticText(error.message)));
  await page.getByRole('button', { name: 'Try sample project', exact: true }).waitFor();
  report.actualElectron = true;
  await capture('01-welcome.png');
  assert.deepEqual(await page.evaluate(() => ({ process: typeof window.process, require: typeof window.require })), { process: 'undefined', require: 'undefined' });
  await page.getByRole('button', { name: 'Try sample project', exact: true }).click();
  await until(state => Boolean(state.activeProject?.demo), 15000, 'Sample project creation');
  if (!connectOnly) {
    await dispatch({ type: 'newTask', mode: 'muse', runOptions, request: 'Enable the existing caffeine filter in this disposable tea storefront.' });
    await dispatch({ type: 'updatePlan', plan: 'Ask Muse to change only the filter marker and FILTER_ENABLED constant in app.js from false to true. '
      + (shell ? 'Muse must then run exactly one existing npm test command through its native sandboxed PowerShell tool, preserving the captured result separately from the app Check. ' : '')
      + 'Inspect the real diff, exercise both preview filters, run the existing project test, and save the reviewed revision.',
      criteria: ['Only the two requested lines in app.js change.', 'Caffeine free shows two herbal teas; All teas restores four products.', 'The existing project test passes for the current revision.',
        ...(shell ? ['One successful native PowerShell command is displayed and persisted; the app Check remains separate.'] : [])] });
    await page.getByRole('button', { name: 'Open plan', exact: true }).click();
    await page.getByRole('button', { name: 'Approve plan', exact: true }).click();
    await until(state => state.task?.mode === 'muse' && state.task.planApproved, 15000, 'Muse plan approval');
  }
  const prepared = await getState();
  report.projectRoot = prepared.activeProject.root; report.taskId = prepared.task.id; report.baselineRevision = prepared.task.revision;
  const baselineInventory = await projectInventory(report.projectRoot);
  const baselineHashes = await hashKnownFiles(report.projectRoot, baselineInventory);
  const before = await readFile(path.join(report.projectRoot, 'app.js'), 'utf8');
  assert(before.includes('/* MUSEBENCH_FILTER: false */') && before.includes('const FILTER_ENABLED = false;'));
  await record(connectOnly ? 'Disposable sample copied with no edit or Muse task submission' : 'Disposable copied project has a Muse task, approved plan, and untouched filter baseline');

  report.phase = 'connect'; await save();
  nativeConnectAttempted=true;
  const connected = await boundedConnection(dispatch({ type: 'connectMuse', binary }, { connection: true }));
  if (connected.runtime.status !== 'idle' || connected.runtime.permissionVerified !== true || !connected.runtime.sessionId) failForState(connected, true);
  if (shell) {
    if (connected.runtime.transport !== 'exec' || connected.runtime.shellEnabled !== true)
      throw failure('This project connection does not support native sandboxed PowerShell. Use a command-compatible workspace before running --shell.', 'MUSE_SHELL_UNAVAILABLE', true);
    assert.equal(connected.runtime.permissionProfile, ':ask-me');
    const permissionArguments = connected.runtime.permissionArguments;
    assert(Array.isArray(permissionArguments), 'Native permission arguments must be available for review');
    assert(permissionArguments.includes('--permission-profile'));
    assert.equal(permissionArguments[permissionArguments.indexOf('--permission-profile') + 1], ':ask-me');
    for (const flag of ['--disable-shell', '--disable-sandbox', '--disable-approval', '--yolo', '--trust-workspace'])
      assert(!permissionArguments.includes(flag), `Shell workflow must not use ${flag}`);
  }
  report.connectedRuntime = runtimeSummary(connected);
  report.readinessVerified = true;
  await showRuntime(); await capture('02-connected.png'); await page.keyboard.press('Escape');
  await record(connected.runtime.transport === 'exec'
    ? 'Native exec readiness validated pinned version, Windows sandbox readiness, fixed Ask me arguments, and the inert echo contract; no model proof'
    : 'Official MSP host connected and dynamically verified its Ask me session permission state');
  if (connectOnly) {
    assert.deepEqual(await projectInventory(report.projectRoot), baselineInventory, 'Connection-only readiness must preserve the copied project inventory');
    assert.deepEqual(await hashKnownFiles(report.projectRoot, baselineInventory), baselineHashes, 'Connection-only readiness must preserve every copied project file');
    assert.equal(report.modelCallAttempted, false);
    assert.equal(report.authoritativeTurnCompleted, false);
    assert.equal(report.rendererErrors.length, 0);
    await stopNative();
    report.status = 'connection_ready'; report.phase = 'connection-only-complete';
    report.result = 'Connection/readiness only. No model request or end-to-end workflow was run; account billing and model access remain unverified.';
    return;
  }

  const expectedShellCommand = shell ? shellCommand(report.projectRoot) : null;
  const prompt = 'In this disposable tea storefront, edit only app.js. Replace the exact line /* MUSEBENCH_FILTER: false */ with /* MUSEBENCH_FILTER: true */ and replace const FILTER_ENABLED = false; with const FILTER_ENABLED = true;. Preserve every other byte and file. '
    + (shell
      ? `After making those two replacements, invoke the managed powershell tool exactly once with the following exact command text:\n\n${expectedShellCommand}\n\nDo not add wrappers, flags, commands, or retries. Do not install packages, change configuration, access the network, commit, create files, or run a server. The existing npm test is the only shell action authorized. Report the result briefly; native tool output, not your prose, will be checked. MuseBench will run preview and its own Check separately.`
      : 'Do not install packages, change configuration, access the network, commit, create files, or run tests or a server. Make the edit now, then briefly report completion. MuseBench will run the preview and existing test separately.');
  report.phase = 'model-turn'; report.status = 'running'; await save();
  console.log(shell ? 'Sending the single authorized Muse edit and native test-command request.' : 'Sending the single authorized Muse edit request.');
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).fill(prompt);
  report.modelCallAttempted = true; await save();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await waitForTurn(timeoutMs);
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
  const edited = await dispatch({ type: 'refresh' });
  if(edited.runtime.transport==='exec') {
    assert.deepEqual(edited.runtime.runOptions,runOptions);
    const approval=approvalArguments(runOptions.approval);
    for(let i=0;i<approval.length;i+=2)assert.equal(edited.runtime.permissionArguments[edited.runtime.permissionArguments.indexOf(approval[i])+1],approval[i+1]);
    for(const flag of ['--disable-sandbox','--disable-approval','--yolo','--trust-workspace'])assert(!edited.runtime.permissionArguments.includes(flag));
    report.selectedRunOptionsVerified=true;
  }
  const editedInventory = await projectInventory(report.projectRoot);
  assert.deepEqual(editedInventory, baselineInventory, 'Muse must not add, remove, or replace project entries, including paths excluded from controller snapshots');
  const editedHashes = await hashKnownFiles(report.projectRoot, editedInventory);
  assert.deepEqual(Object.keys(baselineHashes).filter(file => baselineHashes[file] !== editedHashes[file]), ['app.js'], 'Only app.js may change in the complete copied project');
  const after = await readFile(path.join(report.projectRoot, 'app.js'), 'utf8');
  const expected = before.replace('/* MUSEBENCH_FILTER: false */', '/* MUSEBENCH_FILTER: true */').replace('const FILTER_ENABLED = false;', 'const FILTER_ENABLED = true;');
  assert.equal(after, expected, 'Muse must make only the exact two requested line replacements');
  assert.deepEqual(edited.task.changes.map(file => file.path), ['app.js']);
  assert.notEqual(edited.task.revision, report.baselineRevision);
  assert.equal(edited.task.runtimeComplete, true);
  report.editedRevision = edited.task.revision;
  if (shell) {
    report.shellProof = redact({ source: 'native-powershell-tool-result', expectedCommand: expectedShellCommand,
      results: edited.task.shellResults ?? [], appCheckBeforeExplicitCheck: edited.task.check });
    assert.equal(edited.task.check, null, 'Native command evidence must not create the app Check');
    assert.equal(edited.task.shellResults?.length, 1, 'The request must produce exactly one native shell result');
    const result = edited.task.shellResults[0];
    verifyShellResult(result, expectedShellCommand, edited.runtime.runId);
    shellResultsForRestart = structuredClone(edited.task.shellResults);
    await inspectShellCard(result, '03-native-shell.png');
    report.nativeShellVerified = true; report.shellProof.commandCardRendered = true;
    await record('One native sandboxed PowerShell command passed all three template tests and its actual command/output rendered; app Check remains empty');
  }
  await capture('03-live-edit.png');
  await record(connected.runtime.transport === 'exec'
    ? 'Native exec completed with successful process exit and produced exactly the requested app.js edit'
    : 'A server-authored completed turn produced exactly the requested app.js edit');

  report.phase = 'preview'; await save();
  await page.getByRole('button', { name: 'Open preview', exact: true }).click();
  await page.getByRole('button', { name: 'Start preview', exact: true }).click();
  await until(state => state.preview.status === 'running' || state.preview.status === 'failed', 25000, 'Preview startup');
  assert.equal(lastState.preview.status, 'running', diagnosticText(lastState.preview.log));
  const preview = page.frameLocator('iframe[title="Project preview"]');
  await preview.getByRole('button', { name: /Caffeine free/ }).click();
  assert.equal(await preview.locator('.product').count(), 2);
  assert.equal(await preview.getByRole('heading', { name: 'Morning light', exact: true }).count(), 0);
  await preview.getByRole('button', { name: 'All teas', exact: true }).click();
  assert.equal(await preview.locator('.product').count(), 4);
  const frame = page.frames().find(item => item.url().startsWith('http://127.0.0.1:'));
  assert(frame); assert.equal(await frame.evaluate(() => typeof window.musebench), 'undefined');
  await capture('04-preview.png');
  await page.getByRole('button', { name: 'Mark preview inspected', exact: true }).click();
  await record('Real isolated preview filters to two herbal teas and restores all four products');

  report.phase = 'check'; await save();
  if (shell) assert.equal((await getState()).task.check, null, 'Only the explicit Run check action may create revision-check evidence');
  await page.getByRole('button', { name: 'Run check', exact: true }).click();
  const checked = await until(state => Boolean(state.task.check) && state.task.check.status !== 'running', 130000, 'Project check');
  report.projectCheck = redact(checked.task.check);
  assert.equal(checked.task.check.status, 'passed', diagnosticText(checked.task.check.log));
  assert.equal(checked.task.check.exitCode, 0);
  assert.equal(checked.task.check.revision, checked.task.revision);
  assert.equal(checked.task.previewRevision, checked.task.revision);
  assert.equal(checked.task.revision, report.editedRevision);
  await record('Existing project test passed with captured output for the inspected revision');

  report.phase = 'checkpoint'; await save();
  await page.getByRole('button', { name: 'Continue to review', exact: true }).click();
  await page.getByRole('button', { name: 'Accept this revision', exact: true }).click();
  await page.getByRole('heading', { name: 'Checkpoint saved.', exact: true }).waitFor();
  const accepted = await getState();
  assert.equal(accepted.task.acceptedRevision, report.editedRevision);
  assert.equal(accepted.checkpoints.length, 1);
  report.checkpoint = accepted.checkpoints[0];
  await capture('05-checkpoint.png');
  await record('Exact live revision accepted as one local checkpoint');
  assert.equal(report.rendererErrors.length, 0);
  await stopNative();
  await app.close(); app = null;

  report.phase = 'restart'; await save();
  nativeStopAttempted=false;nativeConnectAttempted=false;nativeStopResult=null;page=null;
  app = await launch(); page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.waitForFunction(() => Boolean(window.musebench));
  const restored = await getState();
  assert.equal(restored.task.id, report.taskId);
  assert.equal(restored.checkpoints.length, 1);
  assert.equal(restored.checkpoints[0].revision, report.editedRevision);
  assert.equal(restored.task.acceptedRevision, report.editedRevision);
  assert.equal(restored.preview.status, 'stopped');
  assert.equal(restored.runtime.sessionId, null);
  if (shell) {
    assert.deepEqual(restored.task.shellResults, shellResultsForRestart, 'Restart must preserve shell-result count, identities, command, and exact output');
    verifyShellResult(restored.task.shellResults[0], expectedShellCommand, shellResultsForRestart[0].runId);
    await inspectShellCard(restored.task.shellResults[0], '06-restored-native-shell.png');
    report.shellProof.restartPersisted = true;
    report.shellProof.persistedOutputSha256 = createHash('sha256').update(restored.task.shellResults[0].output).digest('hex');
    await record('Restart preserved the native shell result identity, exact command/output, and rendered command card');
  }
  await record('Restart restored the task and checkpoint without restarting preview or Muse');
  await stopNative();
  report.status = 'passed'; report.phase = 'complete'; report.endToEndVerified = true;
} catch (error) {
  report.status = error.unavailable ? 'unavailable' : 'failed';
  report.error = { code: error.code ?? 'LIVE_WORKFLOW_FAILED', message: diagnosticText(error.message) };
  report.userActionRequired = ['MUSE_BILLING_ACTION_REQUIRED', 'MUSE_SIGN_IN_REQUIRED'].includes(report.error.code);
  if (page && !page.isClosed() && report.phase === 'connect') {
    try { await showRuntime(); await capture('connection-unavailable.png'); }
    catch { /* Preserve the original connection failure when capture is unavailable. */ }
  }
  process.exitCode = error.unavailable ? 2 : 1;
  console.error(`${report.status.toUpperCase()} ${report.error.code}: ${report.error.message}`);
} finally {
  if (app) {
    try { await stopNative(); }
    catch (error) { closeError = diagnosticText(error.message); report.nativeShutdownUnconfirmed=true; }
    try { await app.close(); }
    catch (error) { closeError = closeError ?? diagnosticText(error.message); }
  }
  if (closeError) {
    report.cleanupError = closeError;
    if (['passed', 'connection_ready', 'unavailable'].includes(report.status)) {
      if (report.status === 'unavailable') report.unavailableCause = report.error;
      report.status = 'failed'; report.endToEndVerified = false;
      report.error = { code: report.nativeShutdownUnconfirmed?'NATIVE_SHUTDOWN_UNCONFIRMED':'ELECTRON_SHUTDOWN_UNCONFIRMED', message: closeError };
    }
    process.exitCode = 1;
  }
  report.completedAt = new Date().toISOString();
  await save();
  console.log(`${report.mode === 'connection_only' ? 'Connection-only check' : 'Live workflow'} ${report.status}. Report: ${path.join(runDir, 'report.json')}`);
}
}
await run();
