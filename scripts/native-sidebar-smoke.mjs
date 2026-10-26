import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fictional offline official-host fixtures, isolated profile, no model requests.
// Never reads the normal user profile, cloud conversations, or credentials.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'scripts/fixtures/personal-library.html'), 'utf8');
const variant = process.env.MUSEBENCH_EXECUTABLE ? 'packaged' : 'source';
const output = path.join(root, 'artifacts/native-sidebar');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, `${variant}-`));
const dataDir = path.join(fixture, 'data'), projectsDir = path.join(fixture, 'projects'), screenshots = path.join(fixture, 'screenshots');
await Promise.all([dataDir, projectsDir, screenshots].map(folder => mkdir(folder, { recursive: true })));
const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir, MUSEBENCH_PROJECTS_DIR: projectsDir };
delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
const report = { startedAt: new Date().toISOString(), variant, fixture, dataDir, screenshots, content: 'fictional offline fixture', modelRequests: 0, checks: [], errors: [], mainErrors: [] };
let app, page, shotIndex = 0;
const record = name => { report.checks.push({ name }); console.log(`PASS ${name}`); };
async function until(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 75)); }
  throw Error(`${label}: did not settle`);
}
async function state() { return page.evaluate(() => window.musebench.personalState()); }
async function views() {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => !win.getParentWindow()).contentView.children.filter(view => view.webContents).map(view => ({ id: view.webContents.id, url: view.webContents.getURL(), visible: view.getVisible(), bounds: view.getBounds() })).filter(view => /^https:/.test(view.url)));
}
async function visible() { let value; await until(async () => value = (await views()).find(view => view.visible), 'Official surface visible'); return value; }
async function evaluate(id, script) { return app.evaluate(({ webContents }, { id, script }) => webContents.fromId(id).executeJavaScript(script), { id, script }); }
async function remoteShortcut(id, key) {
  await evaluate(id, `document.querySelector('textarea').focus()`);
  await app.evaluate(({ webContents }, { id, key }) => {
    const remote = webContents.fromId(id); remote.focus();
    remote.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: ['control'] });
    remote.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: ['control'] });
  }, { id, key });
}
async function command(value) { await page.evaluate(value => window.musebench.personal(value), value); }
async function resize(width, height) {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(win => !win.getParentWindow()).setContentSize(...size), [width, height]);
  await page.waitForFunction(({ width, height }) => Math.abs(innerWidth - width) < 3 && Math.abs(innerHeight - height) < 3, { width, height });
}
async function shot(name) { const target = path.join(screenshots, `${String(++shotIndex).padStart(2, '0')}-fixture-${name}.png`); await page.screenshot({ path: target, fullPage: true }); return target; }
async function boundsMatch() {
  const view = await visible(), rect = await page.getByTestId('personal-browser-slot').boundingBox();
  return rect && ['x', 'y', 'width', 'height'].every(key => Math.abs(view.bounds[key] - Math.round(rect[key])) <= 2);
}
const group = label => page.getByRole('group', { name: label, exact: true });
const item = (label, title) => group(label).getByRole('button', { name: title, exact: true });

try {
  app = await electron.launch({ cwd: root, args: process.env.MUSEBENCH_EXECUTABLE ? [] : ['.'], ...(process.env.MUSEBENCH_EXECUTABLE ? { executablePath: process.env.MUSEBENCH_EXECUTABLE } : {}), env, timeout: 30000 });
  let pendingError = '';
  app.process().stderr.on('data', data => {
    pendingError += data.toString(); const lines = pendingError.split(/\r?\n/); pendingError = lines.pop() ?? '';
    for (const line of lines) { const prefix = 'NATIVE_SIDEBAR_MAIN_ERROR '; const index = line.indexOf(prefix); if (index >= 0) report.mainErrors.push(line.slice(index + prefix.length)); }
  });
  await app.evaluate(({ dialog }) => {
    const capture = (kind, error) => process.stderr.write(`NATIVE_SIDEBAR_MAIN_ERROR ${JSON.stringify({ kind, detail: error?.stack || String(error) })}\n`);
    process.on('uncaughtExceptionMonitor', error => capture('uncaughtException', error));
    dialog.showErrorBox = (title, text) => capture('showErrorBox', `${title}: ${text}`);
  });
  page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.musebench)); await resize(1440, 900);
  await app.evaluate(async ({ session }, html) => {
    globalThis.__nativeSidebarRequests = [];
    for (const partition of ['persist:musebench-personal-muse', 'persist:musebench-personal-chat']) {
      await session.fromPartition(partition).protocol.handle('https', request => {
        const url = new URL(request.url); globalThis.__nativeSidebarRequests.push({ origin: url.origin, path: url.pathname });
        if (!['muse.ai', 'auth.muse.ai', 'www.meta.ai', 'meta.ai'].includes(url.hostname)) return new Response('Offline fixture refuses this host', { status: 451 });
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      });
    }
  }, html);
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  await page.getByRole('button', { name: 'New Muse chat', exact: true }).waitFor();
  for (const [label, title] of [['Muse chats', 'Design a native Muse sidebar'], ['Ideas', 'A quiet writing room'], ['Goals', 'Ship my desktop app']]) await item(label, title).waitFor();
  await until(async () => { const current = await state(); return ['chats', 'ideas', 'goals'].every(kind => current.library?.[kind]?.items?.length > 0); }, 'All native library groups populate');
  const initial = await state();
  for (const kind of ['chats', 'ideas', 'goals']) assert(initial.library[kind].items.every(value => typeof value.id === 'string' && typeof value.title === 'string'));
  assert(!JSON.stringify(initial.library).includes('External injected'));
  assert(!JSON.stringify(initial.library).includes('Unsafe query'));
  assert(!JSON.stringify(initial.library).includes('secret'));
  await shot('native-library-desktop');
  record('Native sidebar automatically loads fictional Muse chats, ideas and goals; unsafe links and query strings stay out');

  await page.getByRole('button', { name: 'Show more Muse chats', exact: true }).click();
  await item('Muse chats', 'Learn a new keyboard shortcut').waitFor();
  await page.getByRole('button', { name: 'Collapse Muse chats', exact: true }).click();
  assert.equal(await item('Muse chats', 'Design a native Muse sidebar').count(), 0);
  await page.getByRole('button', { name: 'Expand Muse chats', exact: true }).click();
  await item('Muse chats', 'Learn a new keyboard shortcut').waitFor();
  await page.getByRole('button', { name: 'Show fewer Muse chats', exact: true }).click();
  assert.equal(await item('Muse chats', 'Learn a new keyboard shortcut').count(), 0);
  record('Collection groups collapse and expand; long chat lists expose reversible show-more controls');

  const beforeFilter = await views();
  const filter = page.getByRole('textbox', { name: 'Filter Muse sidebar', exact: true });
  await filter.fill('autumn');
  await item('Muse chats', 'Plan the autumn garden').waitFor();
  assert.equal(await item('Muse chats', 'Design a native Muse sidebar').count(), 0);
  assert.equal(await item('Ideas', 'A quiet writing room').count(), 0);
  assert.deepEqual((await views()).map(({ id, url }) => ({ id, url })), beforeFilter.map(({ id, url }) => ({ id, url })));
  await filter.fill('');
  record('Sidebar title filtering is local and does not navigate or reload official content');

  await item('Muse chats', 'Design a native Muse sidebar').click();
  await until(async () => new URL((await visible()).url).pathname === '/thread/alpha', 'Selected chat opens official thread');
  let chat = await visible();
  await until(async () => await evaluate(chat.id, 'Boolean(document.querySelector("textarea"))'), 'Selected chat composer ready');
  await until(async () => Boolean((await state()).library?.selectedId), 'Selected chat stored');
  const selectedChatId = (await state()).library.selectedId;
  assert.equal(await item('Muse chats', 'Design a native Muse sidebar').getAttribute('aria-current'), 'page');
  await evaluate(chat.id, `document.querySelector('textarea').value='Unsent native sidebar draft';`);
  const documentId = await evaluate(chat.id, 'window.__fixtureDocumentId');
  await item('Muse chats', 'Design a native Muse sidebar').click();
  assert.equal((await visible()).id, chat.id);
  assert.equal(await evaluate(chat.id, 'window.__fixtureDocumentId'), documentId);
  assert.equal(await evaluate(chat.id, 'document.querySelector("textarea").value'), 'Unsent native sidebar draft');
  assert.equal(await evaluate(chat.id, `document.querySelector('nav[aria-label="Side chats"],[data-testid="hatch-chat-switcher-trigger"]') === null`), true);
  record('Chat selection opens the official thread and selecting it again preserves its document and unsent draft');

  await item('Muse chats', 'Plan the autumn garden').click();
  await until(async () => new URL((await visible()).url).pathname === '/thread/beta', 'Second chat opens without a switcher on the first thread');
  const secondChat = await visible();
  await until(async () => await evaluate(secondChat.id, 'Boolean(document.querySelector("textarea"))'), 'Second chat composer ready');
  assert.notEqual(secondChat.id, chat.id, 'Different chats must have retained independent views');
  assert.equal(await evaluate(secondChat.id, 'document.querySelector("textarea").value'), '');
  await evaluate(secondChat.id, `document.querySelector('textarea').value='Unsent second chat draft';`);
  await item('Muse chats', 'Design a native Muse sidebar').click();
  await until(async () => (await visible()).id === chat.id, 'First retained chat restored');
  assert.equal(await evaluate(chat.id, 'window.__fixtureDocumentId'), documentId);
  assert.equal(await evaluate(chat.id, 'document.querySelector("textarea").value'), 'Unsent native sidebar draft');
  assert.equal(await evaluate(secondChat.id, 'document.querySelector("textarea").value'), 'Unsent second chat draft');
  record('Chat A to B to A retains independent unsent drafts even when thread pages contain no chat-switcher controls');

  await item('Ideas', 'A quiet writing room').click();
  await until(async () => (await state()).destination === 'ideas', 'Idea section selected');
  let idea = await visible();
  await until(async () => await evaluate(idea.id, 'window.__fixtureLibrary.selected?.key') === 'idea-alpha', 'Idea row opens official preview');
  assert.equal((await state()).destination, 'ideas');
  assert.equal(await item('Ideas', 'A quiet writing room').getAttribute('aria-current'), 'page');
  await evaluate(idea.id, `document.querySelector('[aria-label="Close idea preview"]').click()`);
  assert.equal(await evaluate(idea.id, `document.querySelector('[role="dialog"][aria-label="Idea preview"]') === null`), true);
  await item('Ideas', 'A quiet writing room').click();
  await until(async () => await evaluate(idea.id, `Boolean(document.querySelector('[role="dialog"][aria-label="Idea preview"]'))`), 'The same native idea row reopens its closed preview');
  await evaluate(idea.id, `document.querySelector('[aria-label="Close idea preview"]').click()`);
  await item('Goals', 'Ship my desktop app').click();
  await until(async () => new URL((await visible()).url).pathname === '/goals/goal-alpha', 'Goal opens its official detail');
  assert.equal(await item('Goals', 'Ship my desktop app').getAttribute('aria-current'), 'page');
  await item('Muse chats', 'Design a native Muse sidebar').click();
  await until(async () => (await state()).library.selectedId === selectedChatId, 'Chat selection restored');
  assert.equal((await state()).library.selectedId, selectedChatId);
  assert.equal(await evaluate(chat.id, 'document.querySelector("textarea").value'), 'Unsent native sidebar draft');
  record('Ideas reopen their closed preview, goals open their official detail, and returning to the chat retains its draft');

  // Refresh mirrors the official rendered collection. Simulate its SPA updating
  // a renamed/deleted item; do not imply this feature fetches a private API.
  await evaluate(idea.id, `window.__fixtureLibrary.replace('ideas',[{key:'idea-alpha',title:'A quieter writing room'}])`);
  await page.getByRole('button', { name: 'Refresh Muse sidebar', exact: true }).click();
  await item('Ideas', 'A quieter writing room').waitFor();
  assert.equal(await item('Ideas', 'A quiet writing room').count(), 0);
  assert.equal(await item('Ideas', 'Weekend photo walks').count(), 0);
  assert.equal(await evaluate(chat.id, 'document.querySelector("textarea").value'), 'Unsent native sidebar draft');
  record('Refresh reconciles renamed and removed collection items without reloading an active chat');

  await page.getByRole('button', { name: 'New Muse chat', exact: true }).click();
  await until(async () => new URL((await visible()).url).pathname === '/thread/new', 'New Muse chat opens official new-thread destination');
  const newChat = await visible();
  await until(async () => await evaluate(newChat.id, 'Boolean(document.querySelector("textarea"))'), 'New chat composer ready');
  assert.equal(await evaluate(newChat.id, `document.querySelector('nav[aria-label="Side chats"],[data-testid="hatch-chat-switcher-trigger"]') === null`), true);
  await evaluate(newChat.id, `document.querySelector('textarea').value='Unsent new Muse chat draft';`);
  const newDocumentId = await evaluate(newChat.id, 'window.__fixtureDocumentId');
  await item('Muse chats', 'Main conversation').click();
  await until(async () => new URL((await visible()).url).pathname === '/', 'Main conversation opens from a draft with no chat switcher');
  await page.getByRole('button', { name: 'New Muse chat', exact: true }).click();
  await until(async () => (await visible()).id === newChat.id, 'Unsent new-chat view reused');
  assert.equal(await evaluate(newChat.id, 'window.__fixtureDocumentId'), newDocumentId);
  assert.equal(await evaluate(newChat.id, 'document.querySelector("textarea").value'), 'Unsent new Muse chat draft');
  record('New Muse chat opens without sending and reuses the unsent draft after visiting the main conversation');

  await remoteShortcut(newChat.id, 'K');
  await until(async () => filter.evaluate(element => element === document.activeElement), 'Remote composer Ctrl+K focuses native sidebar filter');
  await item('Muse chats', 'Design a native Muse sidebar').click();
  await until(async () => (await visible()).id === chat.id, 'Existing chat selected before remote new-chat shortcut');
  await remoteShortcut(chat.id, 'N');
  await until(async () => (await visible()).id === newChat.id, 'Remote composer Ctrl+N opens retained new-chat draft');
  assert.equal(await evaluate(newChat.id, 'document.querySelector("textarea").value'), 'Unsent new Muse chat draft');
  assert.equal(await evaluate(chat.id, 'document.querySelector("textarea").value'), 'Unsent native sidebar draft');
  record('Ctrl+K and Ctrl+N from the remote composer forward to native filtering and retained New Muse chat');

  await page.getByRole('button', { name: 'Accounts and connections', exact: true }).click();
  await page.getByRole('dialog', { name: 'Accounts and connections', exact: true }).waitFor();
  await until(async () => !(await views()).some(view => view.visible), 'Accounts overlay hides native browser');
  await shot('accounts-overlay'); await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Accounts and connections', exact: true }).waitFor({ state: 'hidden' });
  await until(async () => filter.evaluate(element => element === document.activeElement), 'Local filter receives shortcut focus');
  await until(boundsMatch, 'Native browser restored below local account overlay');
  await resize(390, 844);
  await page.keyboard.press('Control+k');
  await until(async () => !(await views()).some(view => view.visible), 'Narrow native sidebar covers website');
  await item('Muse chats', 'Plan the autumn garden').waitFor();
  const overflow = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  assert(overflow.body <= overflow.width + 1 && overflow.root <= overflow.width + 1);
  await shot('narrow-navigation');
  await resize(1440, 900); await until(boundsMatch, 'Desktop resize restores content');
  record('Native library and local overlays work in narrow and desktop windows without horizontal overflow');

  const museViews = (await views()).filter(view => new URL(view.url).hostname === 'muse.ai');
  await evaluate(museViews[0].id, 'window.__fixtureLibrary.signOut()');
  await until(async () => { const current = await state(); return ['chats', 'ideas', 'goals'].every(kind => current.library?.[kind]?.items?.length === 0); }, 'Authentication clears local titles');
  assert.equal(await item('Muse chats', 'Design a native Muse sidebar').count(), 0);
  assert.equal(await item('Ideas', 'A quieter writing room').count(), 0);
  assert.equal(await item('Goals', 'Ship my desktop app').count(), 0);
  record('Official authentication transition immediately clears the native account item lists');

  await command({ type: 'refreshLibrary' });
  const processHandle = app.process();
  const exit = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Native window close timed out')), 10000); processHandle.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); }); });
  await app.evaluate(({ BrowserWindow }) => setTimeout(() => BrowserWindow.getAllWindows().find(win => !win.getParentWindow())?.close(), 25));
  report.nativeWindowExit = await exit; app = null; page = null;
  assert.equal(report.nativeWindowExit.code, 0);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.mainErrors, []);
  record('Closing during library refresh exits cleanly with no main-process or renderer exception');
  report.status = 'passed'; report.completedAt = new Date().toISOString();
} catch (error) {
  report.status = 'failed'; report.error = error.stack; console.error(error); process.exitCode = 1;
  if (page && !page.isClosed()) { report.failureState = await state().catch(() => null); await shot('failure').catch(() => {}); }
} finally {
  if (app) await app.close().catch(error => report.errors.push(`Close: ${error.message}`));
  await writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Report: ${path.join(fixture, 'report.json')}`);
}
