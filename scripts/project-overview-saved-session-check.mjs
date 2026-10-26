import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

// Read-only account/history check. Close the normal app first. Never log names,
// message text, credentials, URLs, or screenshots from the real profile.
if (process.env.MUSEBENCH_VERIFY_SAVED_SESSION !== '1') throw Error('Explicit saved-session verification required.');
const env = { ...process.env };
for (const key of ['ELECTRON_RUN_AS_NODE', 'MUSEBENCH_DEV', 'MUSEBENCH_DATA_DIR', 'MUSEBENCH_PROJECTS_DIR']) delete env[key];
const report = { checkedAt: new Date().toISOString(), modelRequests: 0, accountChanges: 0, checks: [] };
const app = await electron.launch({ executablePath: path.resolve('release/win-unpacked/MuseBench.exe'), args: [], cwd: process.cwd(), env });
const page = await app.firstWindow();
const record = name => { report.checks.push(name); console.log(`PASS ${name}`); };
let stage = 'Existing local project history';
try {
  await page.waitForFunction(() => Boolean(window.musebench));
  const before = await page.evaluate(() => window.musebench.getState());
  if (before.activeProject) {
    await page.getByRole('button', { name: 'Project overview', exact: true }).click();
    const overview = page.getByRole('main', { name: 'Project overview', exact: true });
    await overview.waitFor();
    assert.equal(await overview.locator('.project-conversation').count(), before.tasks.filter(t => t.projectId === before.activeProject.id).length);
    assert(!(await page.getByRole('complementary', { name: 'Project review' }).isVisible()));
  }
  record('Existing project history opens in its overview without creating or changing chats');
  stage = 'Saved Muse login';
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  let signedIn = false;
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => window.musebench.personalState());
    signedIn = !s.loading && s.library?.chats?.items.length > 0 && ['chats', 'ideas', 'goals'].every(key => s.library?.[key]?.status === 'ready');
    if (signedIn) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert(signedIn, 'Signed-in collection metadata did not load');
  report.authenticated = true;
  record('Saved Muse login still loads the signed-in chats, ideas and goals');
  stage = 'Sandbox and navigation';
  const protections = await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(w => !w.getParentWindow());
    return [main.webContents, ...main.contentView.children.filter(v => v.webContents).map(v => v.webContents)].map(wc => {
      const p = wc.getLastWebPreferences();
      return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity };
    });
  });
  assert(protections.length >= 2);
  for (const p of protections) assert.deepEqual(p, { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
  await page.getByRole('button', { name: 'Return to Muse Code', exact: true }).click();
  if (before.activeProject) await page.getByRole('main', { name: 'Project overview', exact: true }).waitFor();
  const after = await page.evaluate(() => window.musebench.getState());
  assert(after.task?.id === before.task?.id && after.activeProject?.id === before.activeProject?.id);
  assert.deepEqual(after.tasks.map(t => t.id), before.tasks.map(t => t.id));
  record('Returning from Meta AI retains the project overview and all browser sandboxes remain enabled');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failedStage = stage; process.exitCode = 1;
  report.errorType = error.name;
  report.diagnostics = await page.evaluate(async () => {
    const s = await window.musebench.personalState();
    return { loading: s.loading, authenticating: s.authenticating, error: Boolean(s.error), notice: Boolean(s.notice), groups: Object.fromEntries(['chats', 'ideas', 'goals'].map(key => [key, { status: s.library[key].status, count: s.library[key].items.length }])) };
  }).catch(() => null);
  console.log(`FAIL ${stage}`);
} finally {
  await app.close();
  await writeFile('artifacts/project-overview-saved-session.json', JSON.stringify(report, null, 2));
}
