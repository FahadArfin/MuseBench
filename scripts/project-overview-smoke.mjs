import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variant = process.env.MUSEBENCH_EXECUTABLE ? 'packaged' : 'source';
const output = path.join(root, 'artifacts/project-overview');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, `${variant}-`));
const projectsDir = path.join(fixture, 'projects');
const dataDir = path.join(fixture, 'data');
await mkdir(projectsDir); await mkdir(dataDir);
const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir, MUSEBENCH_PROJECTS_DIR: projectsDir };
// Keep these offline UI checks from discovering the installed Muse runtime.
for (const key of Object.keys(env)) {
  if (key.toUpperCase() === 'PATH') env[key] = env[key].split(';').filter(folder => !/muse/i.test(folder)).join(';');
  if (key.toUpperCase() === 'LOCALAPPDATA') env[key] = env.MUSEBENCH_DATA_DIR;
}
delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
const report = { variant, fixture, modelRequests: 0, checks: [], errors: [] };
let app, page;
const record = name => { report.checks.push(name); console.log(`PASS ${name}`); };
async function launch() {
  app = await electron.launch({ cwd: root, args: process.env.MUSEBENCH_EXECUTABLE ? [] : ['.'], ...(process.env.MUSEBENCH_EXECUTABLE ? { executablePath: process.env.MUSEBENCH_EXECUTABLE } : {}), env });
  page = await app.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => report.errors.push(e.message));
  await page.getByRole('button', { name: 'New chat', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
}
const state = () => page.evaluate(() => window.musebench.getState());
async function untilState(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await state();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw Error('Controller state did not settle');
}
async function dispatch(action) {
  const value = await page.evaluate(action => window.musebench.dispatch(action), action);
  assert.equal(value.error, null); return value;
}
async function settled(id) {
  await untilState(s => !s.busy && s.task?.id === id);
  // Controller state can publish before React commits the navigation response.
  await page.waitForFunction(() => document.querySelector('[aria-label="Toggle review panel"]')?.getAttribute('aria-pressed') === 'false');
}
const overview = () => page.getByRole('main', { name: 'Project overview', exact: true });
const composer = () => page.getByRole('textbox', { name: 'Message Muse', exact: true });
const review = () => page.getByRole('button', { name: 'Toggle review panel', exact: true });
const projectButton = name => page.locator('.project-row').getByRole('button', { name, exact: true });
async function createChat(text, mode = 'manual') {
  await page.getByRole('button', { name: 'Add to chat', exact: true }).click();
  await page.getByRole('combobox', { name: 'Task mode', exact: true }).selectOption(mode);
  await page.keyboard.press('Escape');
  await composer().fill(text); await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await untilState(s => !s.busy && s.task?.request === text);
  await review().waitFor();
  assert.equal(await review().getAttribute('aria-pressed'), 'false');
  return (await state()).task;
}
async function shot(name) { await page.screenshot({ path: path.join(fixture, `${name}.png`) }); }
async function noOverflow() { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth)); }
try {
  await launch();
  assert.equal((await state()).runtime.binary,null,'Offline test must not discover a real Muse binary');
  const alphaRoot = path.join(projectsDir, 'Atlas'); const betaRoot = path.join(projectsDir, 'Orbit');
  for (const folder of [alphaRoot, betaRoot]) { await mkdir(folder); await writeFile(path.join(folder, 'package.json'), JSON.stringify({ name: path.basename(folder), private: true, scripts: { test: 'node --test' } })); await writeFile(path.join(folder, 'index.js'), 'export const value = 42;\n'); }
  const alpha = await dispatch({ type: 'openProject', path: alphaRoot });
  const first = (await dispatch({ type: 'newTask', mode: 'manual', request: 'Understand the Atlas architecture' })).task;
  await dispatch({ type: 'sendMessage', text: 'Only the architecture chat has this note.' });
  await projectButton('Atlas').click();
  await overview().waitFor();
  await overview().getByRole('heading', { name: 'Atlas', exact: true }).waitFor();
  assert(await overview().getByRole('button', { name: /Understand the Atlas architecture/ }).isVisible());
  assert(!(await page.getByRole('complementary', { name: 'Project review' }).isVisible()));
  assert.equal((await state()).tasks.length, 1);
  await overview().locator('.project-details summary').click();
  await overview().getByText('node --test', { exact: true }).waitFor();
  await overview().locator('.project-details summary').click();
  record('Project click opens its full-width overview and real saved chats without creating a task');

  await overview().getByRole('button', { name: 'New chat', exact: true }).click();
  assert.equal(await composer().inputValue(), '');
  assert.equal((await state()).tasks.length, 1, 'Opening a new composer must not create an empty task');
  const second = await createChat('Add coverage for the Atlas parser');
  assert.notEqual(second.id, first.id); assert.equal(second.projectId, alpha.activeProject.id);
  assert.equal(second.planApproved, false);
  assert(!second.messages.some(m => /Only the architecture/.test(m.text)));
  assert.equal((await state()).tasks.length, 2);
  assert.equal(await page.locator('.project-group').filter({ has: projectButton('Atlas') }).locator('.project-chats .chat-row').count(), 2);
  record('Overview New chat creates a distinct persisted child conversation with a separate plan and history');

  await review().click();
  const planDraft = 'Unsaved plan stays here while visiting the project overview.';
  const messageDraft = 'Unsent chat note stays here too.';
  await page.getByRole('textbox', { name: 'Task plan', exact: true }).fill(planDraft);
  await composer().fill(messageDraft);
  await page.getByRole('button', { name: 'Project overview', exact: true }).click();
  await overview().waitFor(); await shot('01-overview-dark');
  await overview().getByRole('button', { name: /Add coverage for the Atlas parser/ }).click();
  assert.equal(await review().getAttribute('aria-pressed'), 'false');
  assert.equal(await composer().inputValue(), messageDraft);
  await review().click();
  assert.equal(await page.getByRole('textbox', { name: 'Task plan', exact: true }).inputValue(), planDraft);
  assert.notEqual((await state()).task.plan, planDraft);
  record('Overview round trip retains unsaved composer and plan drafts; Review opens only explicitly');

  await page.locator('.project-chats').getByRole('button', { name: first.title, exact: false }).click(); await settled(first.id);
  assert.equal(await review().getAttribute('aria-pressed'), 'false');
  assert((await state()).task.messages.some(m => /Only the architecture/.test(m.text)));
  assert.equal((await state()).task.baselineRevision, first.baselineRevision);
  await projectButton('Atlas').click(); await overview().waitFor();
  assert.equal((await state()).task.id, first.id, 'Overview of the current project must not switch to its newest chat');
  record('Nested chat restores its actual history and baseline; overview preserves the current chat selection');

  // Stub the OS picker only; exercise actual Add project navigation and controller.
  await app.evaluate(({ dialog }, folder) => { const original = dialog.showOpenDialog; dialog.showOpenDialog = async () => { dialog.showOpenDialog = original; return { canceled: false, filePaths: [folder] }; }; }, betaRoot);
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await overview().getByRole('heading', { name: 'Orbit', exact: true }).waitFor();
  assert.equal(await overview().getByRole('button', { name: /Atlas/ }).count(), 0);
  await overview().getByText('No chats yet', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'New chat in Atlas', exact: true }).click();
  const third = await createChat('Explain Atlas without changing files', 'muse');
  assert.equal(third.projectId, alpha.activeProject.id);
  assert.equal(third.planApproved, false); assert.equal(third.runtimeComplete, false);
  await untilState(s => !s.busy && Boolean(s.error));
  assert(!(await page.getByRole('button', { name: 'Send message', exact: true }).isDisabled()));
  assert.equal(await composer().inputValue(),third.request);
  await review().click();
  assert(await page.getByRole('button', { name: 'Approve plan', exact: true }).isVisible());
  assert(!(await state()).runtime.sessionId);
  record('Add project opens an empty overview; another project’s New chat targets that project and keeps unavailable-Muse drafts retryable without plan approval');

  await projectButton('Orbit').click(); await overview().getByRole('heading', { name: 'Orbit', exact: true }).waitFor();
  await page.keyboard.press('Control+n');
  const fourth = await createChat('Map the Orbit entry points');
  assert.notEqual(fourth.projectId, alpha.activeProject.id);
  await page.getByRole('button', { name: 'Project overview', exact: true }).click();
  assert.equal(await overview().locator('.project-conversation').count(), 1);
  await projectButton('Atlas').click(); await overview().getByRole('heading', { name: 'Atlas', exact: true }).waitFor();
  assert.equal(await overview().locator('.project-conversation').count(), 3);
  record('Ctrl+N uses the selected project and each overview lists only its own chats');

  await app.evaluate(({ dialog, Menu }, folder) => {
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => { dialog.showOpenDialog = original; return { canceled: false, filePaths: [folder] }; };
    Menu.getApplicationMenu().items.find(item => item.label === 'MuseBench').submenu.items.find(item => item.label === 'Open project…').click();
  }, betaRoot);
  await overview().getByRole('heading', { name: 'Orbit', exact: true }).waitFor();
  assert.equal(await overview().locator('.project-conversation').count(), 1);
  await projectButton('Atlas').click(); await overview().getByRole('heading', { name: 'Atlas', exact: true }).waitFor();
  record('Native Open project menu also opens the selected project overview');

  await page.keyboard.press('Control+,');
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  await page.keyboard.press('Escape'); await shot('02-overview-light'); await noOverflow();
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(); await shot('03-overview-narrow');
  await overview().getByRole('button', { name: 'New chat', exact: true }).click();
  await composer().waitFor(); await noOverflow(); await shot('04-new-chat-narrow');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.project-chats').getByRole('button', { name: first.title, exact: false }).click(); await settled(first.id);
  await shot('05-conversation');
  record('Project overview and full-width composer fit desktop and narrow layouts with matching light and dark themes');

  await app.close(); app = null; await launch(); await settled(first.id);
  assert.equal(await review().getAttribute('aria-pressed'), 'false');
  assert.equal((await state()).tasks.length, 4);
  assert((await state()).task.messages.some(m => /Only the architecture/.test(m.text)));
  await projectButton('Atlas').click(); await overview().waitFor();
  assert.equal(await overview().locator('.project-conversation').count(), 3);
  const isolation = await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration }; });
  assert.deepEqual(isolation, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.equal(report.errors.length, 0);
  record('Restart preserves all project/chat IDs and history, Review stays closed, and Electron isolation remains enabled');
  report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.stack; console.error(e); process.exitCode = 1; if (page && !page.isClosed()) await shot('failure').catch(() => {}); }
finally { if (app) await app.close().catch(e => report.errors.push(e.message)); report.completedAt = new Date().toISOString(); await writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2)); console.log(`Report: ${path.join(fixture, 'report.json')}`); }
