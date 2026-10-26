import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import electronPath from 'electron';

// Isolated lifecycle regression. Intercept only this test's local file load;
// no user profile, website sessions, model calls, or visible error dialogs.
const root = process.cwd();
await mkdir(path.join(root, 'artifacts', 'startup'), { recursive: true });
const output = await mkdtemp(path.join(root, 'artifacts', 'startup', 'source-'));
const results = [];
for (const mode of ['quit-during-load', 'genuine-load-failure']) {
  const folder = path.join(output, mode);
  await mkdir(folder, { recursive: true });
  const entry = path.join(folder, 'entry.mjs');
  await writeFile(entry, `import { app, dialog, session } from 'electron';
const result = { mode: ${JSON.stringify(mode)}, loadStarted: false, dialogs: [] };
dialog.showErrorBox = (title, content) => { result.dialogs.push({ title, content }); };
app.on('quit', () => process.stdout.write('STARTUP_RESULT ' + JSON.stringify(result) + '\\n'));
app.whenReady().then(() => {
session.defaultSession.protocol.handle('file', () => {
  result.loadStarted = true;
  if (result.mode === 'quit-during-load') {
    setTimeout(() => app.quit(), 20);
    return new Promise(() => {});
  }
  return Response.error();
});
}).catch(error => { process.stderr.write(String(error)); app.exit(1); });
await import(${JSON.stringify(pathToFileURL(path.join(root, 'electron', 'main.mjs')).href)});
`);
  const env = { ...process.env, MUSEBENCH_DATA_DIR: path.join(folder, 'data'), MUSEBENCH_PROJECTS_DIR: path.join(folder, 'projects') };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MUSEBENCH_DEV;
  const child = spawn(electronPath, [entry], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const timer = setTimeout(() => child.kill(), 15000);
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }).finally(() => clearTimeout(timer));
  const line = stdout.split(/\r?\n/).find(value => value.startsWith('STARTUP_RESULT '));
  const result = line ? JSON.parse(line.slice('STARTUP_RESULT '.length)) : { mode, missingResult: true };
  results.push({ ...result, exitCode, stderr });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
}
for (const result of results) {
  assert.equal(result.exitCode, 0, `${result.mode} should exit cleanly`);
  assert.equal(result.loadStarted, true, `${result.mode} must reach the pending local document load`);
  assert.equal(result.dialogs.length, result.mode === 'quit-during-load' ? 0 : 1, `${result.mode}: canceled startup stays quiet; genuine failure is reported`);
  console.log(`PASS ${result.mode}`);
}
console.log(`Report: ${output}/report.json`);
