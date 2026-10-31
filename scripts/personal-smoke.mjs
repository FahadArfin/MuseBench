import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline integration coverage: dedicated temporary app data and official-host
// protocol fixtures. Never signs in, contacts a model, or reads user cookies.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const websiteFixture = await readFile(path.join(root, 'scripts/fixtures/personal-website.html'), 'utf8');
const artifacts = path.join(root, 'artifacts');
const variant = process.env.MUSEBENCH_EXECUTABLE ? 'packaged' : 'source';
const output = path.join(artifacts, 'personal-ui');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, `${variant}-`));
const dataDir = path.join(fixture, 'data');
const projectsDir = path.join(fixture, 'projects');
const screenshots = path.join(fixture, 'screenshots');
await Promise.all([dataDir, projectsDir, screenshots].map(folder => mkdir(folder, { recursive: true })));
const env = { ...process.env, MUSEBENCH_DATA_DIR: dataDir, MUSEBENCH_PROJECTS_DIR: projectsDir };
delete env.ELECTRON_RUN_AS_NODE;
delete env.MUSEBENCH_DEV;
const report = { startedAt: new Date().toISOString(), variant, fixture, dataDir, projectsDir, screenshots, modelRequests: 0, checks: [], errors: [], mainErrors: [] };
let app;
let page;
let screenshotIndex = 0;
const record = (name, details) => { report.checks.push({ name, ...(details ? { details } : {}) }); console.log(`PASS ${name}`); };
async function openApp() {
  app = await electron.launch({ cwd: root, args: process.env.MUSEBENCH_EXECUTABLE ? [] : ['.'], ...(process.env.MUSEBENCH_EXECUTABLE ? { executablePath: process.env.MUSEBENCH_EXECUTABLE } : {}), env, timeout: 30000 });
  let stderr = '';
  app.process().stderr.on('data', data => {
    stderr += data.toString();
    const lines = stderr.split(/\r?\n/);
    stderr = lines.pop() ?? '';
    for (const line of lines) {
      const prefix = 'PERSONAL_SMOKE_MAIN_ERROR ';
      const start = line.indexOf(prefix);
      if (start !== -1) {
        const detail = line.slice(start + prefix.length);
        try { report.mainErrors.push(JSON.parse(detail)); } catch { report.mainErrors.push({ detail }); }
      }
    }
  });
  // Test-only instrumentation catches errors even after the main window's
  // renderer is gone and prevents a regression from opening a blocking dialog.
  await app.evaluate(({ dialog }) => {
    const capture = (kind, error) => process.stderr.write(`PERSONAL_SMOKE_MAIN_ERROR ${JSON.stringify({ kind, detail: error?.stack || String(error) })}\n`);
    process.on('uncaughtExceptionMonitor', error => capture('uncaughtException', error));
    dialog.showErrorBox = (title, content) => { capture('showErrorBox', `${title}: ${content}`); };
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.musebench));
  await resize(1440, 900);
  // The real, dedicated personal sessions are exercised; only their network
  // responses are replaced. Unknown hosts fail closed inside the fixture.
  await app.evaluate(async ({ session, webContents }, websiteFixture) => {
    globalThis.__personalFixtureRequests = [];
    for (const partition of ['persist:musebench-personal-muse', 'persist:musebench-personal-chat']) {
      const personalSession = session.fromPartition(partition);
      await personalSession.protocol.handle('https', request => {
        const url = new URL(request.url);
        globalThis.__personalFixtureRequests.push({ partition, origin: url.origin, path: url.pathname });
        if (!['muse.ai', 'auth.muse.ai', 'www.meta.ai', 'meta.ai', 'www.facebook.com', 'www.instagram.com', 'auth.meta.com', 'accountscenter.meta.com'].includes(url.hostname)) return new Response('Offline fixture refuses this host', { status: 451 });
        return new Response(websiteFixture, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      });
    }
    // Startup prewarming may have issued a request before the protocol fixture
    // was installed. Restart those disposable pages under the fixture handler.
    for(const contents of webContents.getAllWebContents())if(['https://www.meta.ai/','https://muse.ai/'].includes(contents.getURL())){contents.stop();contents.reload();}
  }, websiteFixture);
}
async function resize(width, height) {
  await app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows().find(window => !window.getParentWindow()).setContentSize(width, height), { width, height });
  await page.waitForFunction(({ width, height }) => Math.abs(window.innerWidth - width) < 3 && Math.abs(window.innerHeight - height) < 3, { width, height });
}
async function personalState() { return page.evaluate(() => window.musebench.personalState()); }
async function until(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw Error(`${label}: did not settle (${JSON.stringify(last)})`);
}
async function nativeViews() {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.getParentWindow()).contentView.children.filter(view => view.webContents).map(view => ({ id: view.webContents.id, url: view.webContents.getURL(), visible: view.getVisible(), bounds: view.getBounds(), preferences: view.webContents.getLastWebPreferences() })).filter(view => /^https:/.test(view.url)));
}
async function visibleView() {
  return until(async () => (await nativeViews()).find(view => view.visible), 'Personal native view visible');
}
async function remoteEval(id, script) {
  return app.evaluate(({ webContents }, { id, script }) => webContents.fromId(id).executeJavaScript(script), { id, script });
}
async function remoteClick(id, selector) {
  const point = await remoteEval(id, `(()=>{const rect=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}})()`);
  await app.evaluate(({ webContents }, { id, point }) => {
    const contents = webContents.fromId(id);
    contents.focus();
    contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  }, { id, point });
}
async function moreAction(name) {
  await page.getByRole('button', { name: 'More Meta AI options', exact: true }).click();
  await until(async () => !(await nativeViews()).some(view => view.visible), 'More menu hides the native browser');
  await page.getByRole('menu', { name: 'Meta AI options', exact: true }).getByRole('menuitem', { name, exact: true }).click();
}
async function popupWindow() {
  return until(async () => app.evaluate(({ BrowserWindow }) => {
    const child = BrowserWindow.getAllWindows().find(window => window.getParentWindow());
    if (!child) return null;
    return { id: child.webContents.id, url: child.webContents.getURL(), preferences: child.webContents.getLastWebPreferences() };
  }), 'Official authentication child window opens');
}
async function switchProduct(product) {
  await page.getByRole('button', {name:product==='code'?'Muse Code':'Muse AI',exact:true}).click();
}
async function selectPersonalSection(destination) {
  const sidebar = page.locator('aside.personal-sidebar');
  if (destination === 'bot') { await sidebar.locator('.muse-agent-shortcut').click(); return; }
  if (destination === 'chat') {
    const heading = sidebar.locator('.personal-meta-chat');
    if (await heading.getAttribute('aria-expanded') === 'true') await heading.click();
    await heading.click(); return;
  }
  if (await sidebar.locator('.muse-service-collapse').getAttribute('aria-expanded') !== 'true') await sidebar.locator('.muse-service-collapse').click();
  const label = destination === 'ideas' ? 'Ideas' : 'Goals';
  const collection = sidebar.getByRole('group', {name:label,exact:true});
  const heading = collection.getByRole('button', {name:label,exact:true});
  // Collection headers preserve their accordion UX: collapse an already open
  // collection before opening it to request its destination again.
  if (await heading.getAttribute('aria-expanded') === 'true') await collection.getByRole('button', {name:`Collapse ${label}`,exact:true}).click();
  await heading.click();
}
async function shot(name) {
  const file = path.join(screenshots, `${String(++screenshotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
async function nativeShot(name) {
  // BrowserWindow.capturePage excludes sibling WebContentsViews. Capture the
  // actual selected website surface separately; assertBounds verifies where
  // Electron places it. Do not present a synthetic composite as a screenshot.
  const view = await visibleView();
  const file = path.join(screenshots, `${String(++screenshotIndex).padStart(2, '0')}-${name}-website.png`);
  const png = await app.evaluate(async ({ webContents }, id) => (await webContents.fromId(id).capturePage()).toPNG().toString('base64'), view.id);
  await writeFile(file, Buffer.from(png, 'base64'));
  (report.websiteCaptures ??= []).push({ file, bounds: view.bounds, origin: new URL(view.url).origin });
  return file;
}
async function assertBounds(label) {
  await until(async () => {
    const view = await visibleView();
    const rect = await page.getByTestId('personal-browser-slot').boundingBox();
    const zoom = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.getParentWindow()).webContents.getZoomFactor());
    if (!rect) return false;
    return ['x', 'y', 'width', 'height'].every(key => Math.abs(view.bounds[key] - Math.round(rect[key] * zoom)) <= 2);
  }, `${label}: native view matches the rendered slot in device independent pixels`);
}

try {
  await openApp();
  await page.getByRole('group', { name: 'Choose workspace', exact: true }).waitFor();
  record('Existing coding workspace exposes a product switcher');

  await switchProduct('code');
  await page.getByRole('button', { name: 'Try sample project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).waitFor();
  const initialTask = await until(async () => {
    const state = await page.evaluate(() => window.musebench.getState());
    return state.task ? state : null;
  }, 'Sample coding task loaded');
  const draft = 'Unsent code draft survives browsing my personal assistant.';
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).fill(draft);
  await switchProduct('personal');
  const navigation = page.locator('aside.personal-sidebar');
  await navigation.locator('.personal-meta-chat').waitFor();
  await navigation.locator('.muse-agent-shortcut').waitFor();
  const initialChat = await visibleView();
  await until(async () => await remoteEval(initialChat.id, 'document.title') === 'Meta AI offline integration fixture', 'Default Meta AI fixture loaded');
  assert.equal(new URL(initialChat.url).origin, 'https://www.meta.ai');
  assert.equal((await personalState()).destination, 'chat');
  await selectPersonalSection('bot');
  for (const name of ['Ideas', 'Goals']) await navigation.getByRole('button', { name, exact: true }).waitFor();
  const bot = await visibleView();
  await until(async () => await remoteEval(bot.id, 'document.title') === 'Muse offline integration fixture', 'Muse fixture loaded');
  assert.equal(new URL(bot.url).origin, 'https://muse.ai');
  assert.equal((await personalState()).origin, 'https://muse.ai');
  assert.equal(bot.preferences.nodeIntegration, false);
  assert.equal(bot.preferences.contextIsolation, true);
  assert.equal(bot.preferences.sandbox, true);
  assert.equal(bot.preferences.webSecurity, true);
  assert(!bot.preferences.preload, 'Remote content must have no preload');
  assert.deepEqual(await remoteEval(bot.id, '({process:typeof window.process,require:typeof window.require,musebench:typeof window.musebench})'), { process: 'undefined', require: 'undefined', musebench: 'undefined' });
  await assertBounds('Desktop');
  await shot('muse-bot-renderer');
  await nativeShot('muse-bot');
  record('Muse exposes all four sidebar destinations and an isolated official-origin browser with no local bridge');

  const compactLayout = (id = bot.id) => remoteEval(id, `(()=>{const dock=document.querySelector('[data-hatch-dock]');const shell=document.querySelector('[data-hatch-full-page-shell]');const composer=document.querySelector('[data-hatch-shell-composer-layer]');return {dock:getComputedStyle(dock).display,shell:getComputedStyle(shell).marginInlineStart,composer:getComputedStyle(composer).left}})()`);
  await until(async () => (await compactLayout()).dock === 'none', 'Integrated layout removes duplicated official navigation');
  assert.deepEqual(await compactLayout(), { dock: 'none', shell: '0px', composer: '0px' });
  const layoutToggle = page.getByRole('button', { name: 'Use integrated Muse layout', exact: true });
  await layoutToggle.click();
  await until(async () => (await compactLayout()).dock !== 'none', 'Original website navigation restored');
  assert.deepEqual(await compactLayout(), { dock: 'block', shell: '180px', composer: '180px' });
  await layoutToggle.click();
  await until(async () => (await compactLayout()).dock === 'none', 'Integrated layout enabled again');
  record('Compact layout removes duplicate Muse navigation and restores the original website layout on demand');

  await remoteEval(bot.id, `document.querySelector('textarea').value = 'Unsent personal Muse fixture draft'; localStorage.setItem('musebench-test-marker','isolated-session-persisted');`);
  await switchProduct('code');
  await until(async () => !(await nativeViews()).some(view => view.visible), 'Native browser hidden in Code');
  await switchProduct('personal');
  assert.equal((await visibleView()).id, bot.id);
  record('Direct mode buttons hide the native browser in Code and restore the retained personal page');

  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.waitFor();
  await until(async () => !(await nativeViews()).some(view => view.visible), 'Native browser hidden below settings');
  await shot('settings-over-personal');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await visibleView()).id, bot.id);
  record('Settings opens above the remote page and restores the same browser after closing');
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();
  assert.equal(await page.getByRole('menu',{name:'Your profile',exact:true}).count(),1);
  await until(async()=>!(await nativeViews()).some(view=>view.visible),'Profile hides the native browser');
  await page.getByRole('menuitem',{name:'Settings',exact:false}).click();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  assert.equal((await visibleView()).id,bot.id);
  record('Personal profile menu opens once, covers the native browser and restores its page');
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();
  const profileMenu = page.getByRole('menu',{name:'Your profile',exact:true});
  assert.equal(await profileMenu.getByRole('menuitem').count(), 4);
  for (const name of [/View profile/, /^Usage/, /^Settings/, /^Help$/]) await profileMenu.getByRole('menuitem', {name}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal((await visibleView()).id,bot.id);
  record('Personal profile exposes profile, Usage, Settings and Help and restores the retained personal page');



  await page.keyboard.press('Control+k');
  await page.getByRole('menu', { name: 'Choose a product', exact: true }).waitFor({ state: 'hidden' });
  const personalFilter = page.getByRole('textbox', { name: 'Filter Muse sidebar', exact: true });
  await until(async () => personalFilter.evaluate(element => element === document.activeElement), 'Personal search shortcut focuses the native sidebar filter');
  assert.equal((await visibleView()).id, bot.id);
  await switchProduct('code');
  await page.keyboard.press('Control+k');
  const searchDialog = page.getByRole('dialog', { name: 'Search MuseBench', exact: true });
  await searchDialog.waitFor();
  await page.getByRole('menu', { name: 'Choose a product', exact: true }).waitFor({ state: 'hidden' });
  await searchDialog.locator('.library-open').filter({hasText:initialTask.task.title}).click();
  await searchDialog.waitFor({ state: 'hidden' });
  await page.getByRole('textbox', { name: 'Message Muse', exact: true }).waitFor();
  await switchProduct('personal');
  assert.equal((await visibleView()).id, bot.id);
  assert.equal(await page.getByRole('menu', { name: 'Choose a product', exact: true }).count(), 0);
  record('Direct workspace navigation preserves search focus and the personal filter or selects a coding chat in Code mode, and preserves the personal browser');

  await switchProduct('code');
  assert.equal(await page.getByRole('textbox', { name: 'Message Muse', exact: true }).inputValue(), draft);
  await until(async () => !(await nativeViews()).some(view => view.visible), 'Code mode hides all personal views');
  const unchangedTask = await page.evaluate(() => window.musebench.getState());
  assert.equal(unchangedTask.task.id, initialTask.task.id);
  assert.equal(unchangedTask.task.plan, initialTask.task.plan);
  assert.deepEqual(unchangedTask.task.criteria, initialTask.task.criteria);
  assert.equal(unchangedTask.task.planApproved, false);
  record('Switching products preserves the unsent coding message and existing plan and criteria without approval or execution');

  await switchProduct('personal');
  assert.equal((await visibleView()).id, bot.id);
  assert.equal(await remoteEval(bot.id, 'document.querySelector("textarea").value'), 'Unsent personal Muse fixture draft');
  await selectPersonalSection('chat');
  const chat = await until(async () => (await nativeViews()).find(view => view.visible && view.id !== bot.id), 'Separate normal Meta AI browser visible');
  await until(async () => await remoteEval(chat.id, 'document.title') === 'Meta AI offline integration fixture', 'Meta AI fixture loaded');
  assert.equal(new URL(chat.url).origin, 'https://www.meta.ai');
  assert.equal(chat.id, initialChat.id);
  assert.equal((await personalState()).origin, 'https://www.meta.ai');
  assert.equal(await remoteEval(chat.id, 'localStorage.getItem("musebench-test-marker")'), null);
  assert.equal(await remoteEval(chat.id, `getComputedStyle(document.querySelector('[data-hatch-dock]')).display`), 'block', 'Muse presentation must never alter another official service even if its DOM matches');
  await remoteEval(chat.id, `document.querySelector('textarea').value = 'Separate normal Meta AI fixture draft';`);
  await selectPersonalSection('bot');
  assert.equal((await visibleView()).id, bot.id);
  assert.equal(await remoteEval(bot.id, 'document.querySelector("textarea").value'), 'Unsent personal Muse fixture draft');
  await selectPersonalSection('chat');
  assert.equal((await visibleView()).id, chat.id);
  assert.equal(await remoteEval(chat.id, 'document.querySelector("textarea").value'), 'Separate normal Meta AI fixture draft');
  await nativeShot('normal-meta-chat');
  record('Muse bot and normal Meta AI chat retain independent browser pages and unsent website drafts');

  const availability = (await personalState()).available;
  assert.deepEqual(availability, { bot: true, chat: true, ideas: true, goals: true });
  const retained = { bot, chat };
  for (const destination of ['ideas', 'goals']) {
    await selectPersonalSection(destination);
    const entry = navigation.getByRole('button', { name: destination === 'ideas' ? 'Ideas' : 'Goals', exact: true });
    assert.equal(await entry.isEnabled(), true);
    const view = await until(async () => (await nativeViews()).find(view => view.visible && view.url === `https://muse.ai/${destination}`), `Verified ${destination} route loaded`);
    retained[destination] = view;
    assert.notEqual(view.id, bot.id);
    assert.equal((await personalState()).destination, destination);
    assert.equal(await entry.getAttribute('aria-current'), 'page');
    await until(async () => await remoteEval(view.id, 'document.querySelector("#fixture-path")?.textContent') === `/${destination}`, `${destination} content loaded`);
    assert.equal(await remoteEval(view.id, 'localStorage.getItem("musebench-test-marker")'), 'isolated-session-persisted');
    await remoteEval(view.id, `document.querySelector('textarea').value = ${JSON.stringify(`Unsent ${destination} fixture draft`)};`);
    await shot(`muse-${destination}-renderer`);
    await nativeShot(`muse-${destination}`);
  }
  await selectPersonalSection('chat');
  assert.equal((await visibleView()).id, chat.id);
  record('All four destinations are available; Ideas and Goals navigate to their verified official routes', availability);
  for (const [destination, label, value] of [['bot', 'Muse AI bot', 'Unsent personal Muse fixture draft'], ['ideas', 'Ideas', 'Unsent ideas fixture draft'], ['goals', 'Goals', 'Unsent goals fixture draft'], ['chat', 'Chat', 'Separate normal Meta AI fixture draft']]) {
    await selectPersonalSection(destination);
    assert.equal((await visibleView()).id, retained[destination].id);
    assert.equal(await remoteEval(retained[destination].id, 'document.querySelector("textarea").value'), value);
  }
  const allRetainedViews = await nativeViews();
  assert.equal(new Set(Object.values(retained).map(view => view.id)).size, 4);
  assert(Object.values(retained).every(view => allRetainedViews.some(candidate => candidate.id === view.id)));
  assert.equal(allRetainedViews.filter(view => view.visible).length, 1);
  record('All four sections retain independent drafts and origin storage within the shared Meta browser session');

  await selectPersonalSection('bot');
  await remoteEval(bot.id, `history.pushState({}, '', '/ideas/fixture-active');`);
  await until(async () => (await personalState()).destination === 'ideas', 'Active website navigation updates native sidebar selection');
  assert.equal((await visibleView()).id, bot.id, 'Route sync must not replace the currently visible website');
  assert.equal(await navigation.getByRole('button', { name: 'Ideas', exact: true }).getAttribute('aria-current'), 'page');
  await remoteEval(retained.goals.id, `history.pushState({}, '', '/goals/fixture-hidden');`);
  assert.equal((await personalState()).destination, 'ideas', 'Hidden views cannot change the selected native section');
  assert.equal((await visibleView()).id, bot.id);
  await remoteEval(bot.id, `history.replaceState({}, '', '/');`);
  await until(async () => (await personalState()).destination === 'bot', 'Active bot route restored');
  await selectPersonalSection('chat');
  record('Native sidebar follows active Muse routes while hidden sections cannot steal selection or replace the current page');

  const accounts = page.getByRole('dialog', { name: 'Accounts and connections', exact: true });
  await page.getByRole('button', { name: 'Accounts and connections', exact: true }).click();
  await accounts.waitFor();
  await until(async () => !(await nativeViews()).some(view => view.visible), 'Accounts modal hides native browser');
  await shot('accounts-and-connections');
  await page.keyboard.press('Escape');
  await accounts.waitFor({ state: 'hidden' });
  assert.equal((await visibleView()).id, chat.id);
  for (const [button, expected] of [['Muse account', 'General'], ['Connect WhatsApp', 'Messaging channels'], ['Muse connections', 'Connectors']]) {
    await page.getByRole('button', { name: 'Accounts and connections', exact: true }).click();
    await accounts.getByRole('button', { name: button, exact: true }).click();
    await accounts.waitFor({ state: 'hidden' });
    await until(async () => (await personalState()).destination === 'bot', `${button} selects Muse`);
    assert.equal((await visibleView()).id, bot.id);
    await until(async () => await remoteEval(bot.id, 'document.querySelector("#fixture-settings-page")?.textContent') === expected, `${button} opens the official settings tab`);
    const activeTab = await remoteEval(bot.id, `(()=>{const tab=Array.from(document.querySelectorAll('[role="dialog"] nav button')).find(button=>button.textContent===${JSON.stringify(expected)});return {active:tab?.getAttribute('data-active'),hydrated:tab?.getAttribute('data-fixture-hydrated')}})()`);
    assert.equal(activeTab.active, 'true');
    if (expected !== 'General') assert.equal(activeTab.hydrated, 'true', `${button} waits for the inert tab to be replaced and its handler to activate the destination`);
    await remoteClick(bot.id, '[aria-label="Close official settings"]');
  }
  record('Accounts panel safely overlays the website and waits for late Settings tab handlers before opening account, connectors, and WhatsApp destinations without pairing');

  assert.equal(await page.locator('.personal-tools > summary').count(), 0);
  await selectPersonalSection('bot');
  await page.getByRole('button', { name: 'Muse feed', exact: true }).waitFor();
  const toolViews = {};
  for (const [button, expected] of [['Search Muse', 'Search opened'], ['Muse feed', 'Feed opened'], ['Muse library', 'Library opened']]) {
    await page.locator('aside.personal-sidebar').getByRole('button', { name: button, exact: true }).click();
    const view = await visibleView();
    toolViews[button] = view;
    assert.notEqual(view.id, bot.id, `${button} uses a dedicated retained tool page`);
    await until(async () => await remoteEval(view.id, 'document.querySelector("#fixture-action")?.textContent') === expected, `${button} invokes the official website control`);
  }
  assert.equal(new Set(Object.values(toolViews).map(view => view.id)).size, 3);
  record('Native search, feed, and library shortcuts invoke the official Muse controls in independent retained pages');

  const searchView = toolViews['Search Muse'];
  // Invalidate the initialized Search document before revisiting it, so this
  // still exercises missing-control recovery rather than a successful cache hit.
  await remoteEval(searchView.id, `document.querySelector('[data-fixture-search]')?.remove();document.querySelector('[data-testid="hatch-nav-search"]').removeAttribute('data-testid');history.replaceState({}, '', '/fixture-search-reinitialize');`);
  await page.locator('aside.personal-sidebar').getByRole('button', { name: 'Search Muse', exact: true }).click();
  await until(async () => (await personalState()).notice && !(await personalState()).compact, 'Unrecognized website control restores original layout');
  assert.equal((await visibleView()).id, searchView.id);
  assert.equal((await personalState()).error, null);
  await until(async () => (await compactLayout(searchView.id)).dock !== 'none', 'Failed shortcut leaves official navigation available');
  await page.getByRole('button', { name: 'Dismiss Meta AI notice', exact: true }).click();
  assert.equal((await personalState()).notice, null);
  await remoteEval(searchView.id, `document.querySelector('[data-hatch-dock] button').setAttribute('data-testid','hatch-nav-search');`);
  await layoutToggle.click();
  await until(async () => (await compactLayout(searchView.id)).dock === 'none', 'Compact layout restored after fallback');
  await selectPersonalSection('bot');
  assert.equal((await visibleView()).id, bot.id);
  record('Changed website controls produce a dismissible notice and recoverable original layout without losing the page');

  // CSS must wait for the observed shell itself, not assume the framework had
  // already mounted it when Electron emitted dom-ready.
  await remoteEval(bot.id, `(()=>{const shell=document.querySelector('[data-hatch-full-page-shell]');shell.removeAttribute('data-hatch-full-page-shell');window.__fixtureShell=shell;})()`);
  await until(async () => await remoteEval(bot.id, `getComputedStyle(document.querySelector('[data-hatch-dock]')).display`) !== 'none', 'Missing shell leaves official navigation intact');
  await remoteEval(bot.id, `window.__fixtureShell.setAttribute('data-hatch-full-page-shell','');delete window.__fixtureShell;`);
  await until(async () => (await compactLayout()).dock === 'none', 'Late shell hydration receives compact layout');
  record('Compact presentation follows late website hydration and leaves unrecognized layouts untouched');

  // Real Chromium window.open lifecycle, with offline account/OAuth fixtures.
  // This verifies the reserved blank popup behavior, not provider acceptance.
  await remoteEval(bot.id, `(()=>{const button=document.createElement('button');button.id='fixture-reserved-account';button.textContent='Account fixture';button.onclick=()=>{const child=window.open('about:blank','account-fixture');if(child)setTimeout(()=>{child.location.href='https://accountscenter.meta.com/subscriptions?state=fixture-secret';},150);};document.querySelector('main').prepend(button);})()`);
  await remoteClick(bot.id, '#fixture-reserved-account');
  const accountPopup = await popupWindow();
  await until(async () => (await app.evaluate(({webContents},id)=>webContents.fromId(id).getURL(),accountPopup.id)).startsWith('https://accountscenter.meta.com/'), 'Reserved blank popup reaches official account host');
  assert.deepEqual(await remoteEval(accountPopup.id,'({opener:Boolean(window.opener),process:typeof window.process,require:typeof window.require,musebench:typeof window.musebench})'),{opener:true,process:'undefined',require:'undefined',musebench:'undefined'});
  assert.equal(await app.evaluate(({webContents},{child,parent})=>webContents.fromId(child).session===webContents.fromId(parent).session,{child:accountPopup.id,parent:bot.id}),true);
  await remoteEval(accountPopup.id,`(()=>{const link=document.createElement('a');link.id='fixture-google-signin';link.href='https://accounts.google.com/o/oauth2/auth?state=fixture-secret';link.textContent='Provider fixture';document.querySelector('main').prepend(link);})()`);
  await remoteClick(accountPopup.id,'#fixture-google-signin');
  await until(async()=> (await personalState()).noticeCanOpenBrowser,'Unsupported provider sign-in offers browser handoff');
  assert.match((await personalState()).notice,/Google.*browser/);
  assert.equal(JSON.stringify(await personalState()).includes('fixture-secret'),false);
  assert.equal(await app.evaluate(()=>globalThis.__personalFixtureRequests.some(request=>request.origin==='https://accounts.google.com')),false,'OAuth endpoint must not be loaded in embedded browser');
  await app.evaluate(({BrowserWindow,webContents},id)=>BrowserWindow.fromWebContents(webContents.fromId(id)).close(),accountPopup.id);
  await until(async()=>!(await personalState()).authWindowOpen,'Account fixture closes');
  await page.getByRole('button',{name:'Open Muse in browser',exact:true}).waitFor();
  await page.getByRole('button',{name:'Dismiss Meta AI notice',exact:true}).click();
  record('Reserved account popup retains opener and isolation; Google OAuth is blocked with a credential-free browser handoff');

  await remoteEval(bot.id, `document.querySelector('textarea').value = 'Authentication must preserve this draft';`);
  await remoteClick(bot.id, '#fixture-popup');
  const authPopup = await popupWindow();
  await until(async () => (await app.evaluate(({ webContents }, id) => webContents.fromId(id).getURL(), authPopup.id)).startsWith('https://www.facebook.com/'), 'Official Facebook auth fixture loaded');
  await until(async () => await remoteEval(authPopup.id, 'Boolean(document.querySelector("#fixture-popup-callback"))'), 'Official authentication fixture controls ready');
  await until(async () => (await personalState()).authWindowOpen, 'Sign-in state exposes active authentication window');
  assert.equal(authPopup.preferences.sandbox, true);
  assert.equal(authPopup.preferences.contextIsolation, true);
  assert.equal(authPopup.preferences.nodeIntegration, false);
  assert.equal(authPopup.preferences.webSecurity, true);
  assert(!authPopup.preferences.preload);
  assert.equal(await app.evaluate(({ webContents }, { popupId, parentId }) => webContents.fromId(popupId).session === webContents.fromId(parentId).session, { popupId: authPopup.id, parentId: bot.id }), true);
  assert.deepEqual(await remoteEval(authPopup.id, '({opener:Boolean(window.opener),process:typeof window.process,require:typeof window.require,musebench:typeof window.musebench})'), { opener: true, process: 'undefined', require: 'undefined', musebench: 'undefined' });
  assert.equal(await remoteEval(authPopup.id, `getComputedStyle(document.querySelector('[data-hatch-dock]')).display`), 'block', 'Official authentication pages retain original navigation');
  await remoteClick(authPopup.id, '#fixture-popup-callback');
  await until(async () => !(await personalState()).authWindowOpen, 'Completed popup closes');
  assert.equal(await remoteEval(bot.id, 'document.querySelector("#fixture-action").textContent'), 'Authentication callback received');
  assert.equal(await remoteEval(bot.id, 'document.querySelector("textarea").value'), 'Authentication must preserve this draft');
  assert.equal((await visibleView()).id, bot.id);
  record('Official authentication popup is sandboxed, shares only its originating session, and preserves opener callbacks and drafts');

  await remoteClick(bot.id, '#fixture-popup');
  const cancelledPopup = await popupWindow();
  await until(async () => await remoteEval(cancelledPopup.id, 'Boolean(document.querySelector("#fixture-popup-cancel"))'), 'Cancel auth fixture ready');
  await remoteClick(cancelledPopup.id, '#fixture-popup-cancel');
  await until(async () => !(await personalState()).authWindowOpen, 'Cancelling sign-in closes its child window');
  assert.equal(await remoteEval(bot.id, 'document.querySelector("textarea").value'), 'Authentication must preserve this draft');
  await remoteClick(bot.id, '#fixture-unknown-popup');
  await until(async () => Boolean((await personalState()).notice), 'Unsupported popup produces a nonfatal notice');
  assert.equal((await personalState()).error, null);
  assert.equal((await personalState()).authWindowOpen, false);
  assert.equal((await visibleView()).id, bot.id);
  await page.getByRole('button', { name: 'Dismiss Meta AI notice', exact: true }).click();
  record('Cancelling official sign-in or blocking an unsupported popup leaves the current page and draft available');

  await remoteClick(bot.id, '#fixture-popup');
  const redirectedPopup = await popupWindow();
  await until(async () => await remoteEval(redirectedPopup.id, 'Boolean(document.querySelector("#fixture-popup-escape"))'), 'Redirect auth fixture ready');
  await remoteClick(redirectedPopup.id, '#fixture-popup-escape');
  await until(async () => Boolean((await personalState()).notice), 'Unsupported authentication redirect is blocked');
  const escaped = await app.evaluate(({ webContents }, id) => { const contents = webContents.fromId(id); return contents && !contents.isDestroyed() ? contents.getURL() : null; }, redirectedPopup.id);
  assert(!escaped || new URL(escaped).origin !== 'https://unsupported.example');
  assert.equal((await personalState()).error, null);
  assert.equal((await visibleView()).id, bot.id);
  await app.evaluate(({ BrowserWindow, webContents }, id) => { const contents = webContents.fromId(id); if (contents && !contents.isDestroyed()) BrowserWindow.fromWebContents(contents)?.close(); }, redirectedPopup.id);
  await until(async () => !(await personalState()).authWindowOpen, 'Blocked popup closes safely');
  await page.getByRole('button', { name: 'Dismiss Meta AI notice', exact: true }).click();
  record('Authentication popup redirects cannot escape the supported official origins or hide the parent page');
  await selectPersonalSection('chat');

  await remoteClick(chat.id, '#fixture-next');
  await until(async () => (await nativeViews()).find(view => view.id === chat.id)?.url.endsWith('/fixture-second'), 'Official same-origin navigation completes');
  report.navigationBeforeBack = await app.evaluate(({ webContents }, id) => { const contents = webContents.fromId(id); return { canGoBack: contents.navigationHistory.canGoBack(), entries: contents.navigationHistory.getAllEntries().map(entry => ({url:entry.url,title:entry.title})), currentIndex: contents.navigationHistory.getActiveIndex() }; }, chat.id);
  report.personalBeforeBack = await personalState();
  await moreAction('Go back in Meta AI');
  await until(async () => new URL((await nativeViews()).find(view => view.id === chat.id).url).pathname === '/', 'Browser back returns to official root');
  await moreAction('Go forward in Meta AI');
  await until(async () => (await nativeViews()).find(view => view.id === chat.id)?.url.endsWith('/fixture-second'), 'Browser forward returns to next page');
  await moreAction('Reload Meta AI page');
  await until(async () => !(await personalState()).loading && await remoteEval(chat.id, 'document.querySelector("#fixture-path")?.textContent') === '/fixture-second', 'Reload keeps current destination');
  record('Personal browser back, forward and reload controls operate on the active official website');

  await app.evaluate(({ webContents }, id) => {
    const remote = webContents.fromId(id);
    remote.focus();
    remote.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['control'] });
    remote.sendInputEvent({ type: 'keyUp', keyCode: ',', modifiers: ['control'] });
  }, chat.id);
  await dialog.waitFor();
  await until(async () => !(await nativeViews()).some(view => view.visible), 'Remote-focus settings shortcut hides native page');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await visibleView()).id, chat.id);
  record('Application settings shortcut works when keyboard focus is in the remote website');

  await resize(1190, 820);
  await assertBounds('Resized desktop');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.getParentWindow()).webContents.setZoomFactor(1.25));
  await assertBounds('125 percent renderer zoom');
  await nativeShot('zoom-125-percent');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.getParentWindow()).webContents.setZoomFactor(1));
  await resize(390, 844);
  await assertBounds('Narrow window');
  const overflow = await page.evaluate(() => ({ width: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(overflow.document <= overflow.width + 1 && overflow.body <= overflow.width + 1, `Narrow horizontal overflow: ${JSON.stringify(overflow)}`);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await navigation.waitFor();
  await until(async () => !(await nativeViews()).some(view => view.visible), 'Narrow sidebar hides remote view');
  await shot('narrow-personal-navigation');
  await resize(1440, 900);
  await assertBounds('Growing to desktop dismisses narrow navigation');
  assert.equal(await page.getByRole('button', { name: 'Close navigation', exact: true }).count(), 0);
  record('Resizing an open narrow navigation drawer to desktop restores the native personal browser');
  await resize(390, 844);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 380, y: 400 } });
  await assertBounds('Narrow navigation closed');
  await resize(1440, 900);
  record('Native browser tracks resized and zoomed slot bounds, including narrow navigation overlays');

  await switchProduct('code');
  const offline = await page.evaluate(() => window.musebench.getState());
  assert.equal(offline.runtime.liveVerified, false);
  assert(!offline.runtime.sessionId);
  await app.close(); app = null;
  await openApp();
  await switchProduct('personal');
  assert.equal((await personalState()).destination, 'chat');
  await page.getByRole('button', { name: 'Accounts and connections', exact: true }).click();
  await page.getByRole('dialog', { name: 'Accounts and connections', exact: true }).getByRole('button', { name: 'Connect WhatsApp', exact: true }).click();
  const restoredBot = await visibleView();
  await until(async () => await remoteEval(restoredBot.id, 'document.title') === 'Muse offline integration fixture', 'Restored Muse fixture loaded');
  await until(async () => await remoteEval(restoredBot.id, 'document.querySelector("#fixture-settings-page")?.textContent') === 'Messaging channels', 'First-use WhatsApp shortcut waits for the Muse document to load');
  assert.equal(await remoteEval(restoredBot.id, 'document.querySelector("[data-testid=\\"hatch-dock-more\\"]").getAttribute("data-fixture-hydrated")'), 'true');
  assert.equal(await remoteEval(restoredBot.id, `Array.from(document.querySelectorAll('[role="dialog"] nav button')).find(button=>button.textContent==='Messaging channels')?.getAttribute('data-active')`), 'true');
  assert.equal(await remoteEval(restoredBot.id, `Array.from(document.querySelectorAll('[role="dialog"] nav button')).find(button=>button.textContent==='Messaging channels')?.getAttribute('data-fixture-hydrated')`), 'true');
  assert.equal((await personalState()).notice, null);
  await remoteClick(restoredBot.id, '[aria-label="Close official settings"]');
  record('First-use WhatsApp shortcut tolerates a delayed, replaced trigger after document completion and opens messaging settings without a false fallback');
  assert.equal(await remoteEval(restoredBot.id, 'localStorage.getItem("musebench-test-marker")'), 'isolated-session-persisted');
  const requests = await app.evaluate(() => globalThis.__personalFixtureRequests);
  assert(requests.length > 0);
  assert(requests.every(request => ['https://muse.ai', 'https://www.meta.ai', 'https://www.facebook.com'].includes(request.origin)));
  assert.equal(report.errors.length, 0, `Renderer errors: ${report.errors.join('; ')}`);
  record('Personal provider session persists through restart in isolated test data, with no renderer errors or model calls');
  await remoteClick(restoredBot.id, '#fixture-popup');
  await popupWindow();
  await until(async () => (await personalState()).authWindowOpen, 'Owned authentication popup open before native close');
  // Sign-in is intentionally a close blocker. Capture the fixture-only notice
  // instead of opening a modal, and prove the owned flow is preserved.
  await app.evaluate(({ BrowserWindow, dialog }) => {
    globalThis.__personalCloseNotices = [];
    dialog.showMessageBox = async (_window, options) => { globalThis.__personalCloseNotices.push(options.message); return { response: 0 }; };
    BrowserWindow.getAllWindows().find(window => !window.getParentWindow()).close();
  });
  await until(async () => app.evaluate(() => globalThis.__personalCloseNotices.some(message => message.includes('Finish sign-in'))), 'Native close preserves active sign-in');
  assert.equal(page.isClosed(), false);
  assert.equal((await personalState()).authWindowOpen, true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getParentWindow()).close());
  await until(async () => !(await personalState()).authWindowOpen, 'Fixture sign-in window closed before app shutdown');
  record('Native close preserves an open sign-in window until the user closes that flow');
  const child = app.process();
  let closeTimer;
  const nativeExit = new Promise((resolve, reject) => {
    closeTimer = setTimeout(() => reject(Error('Native window close did not exit within 10 seconds')), 10000);
    // ChildProcess close follows exit and drains stderr, so a late shutdown
    // exception cannot arrive after the assertions below have already passed.
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  // This is the BrowserWindow close/X/WM_CLOSE path. app.close() instead calls
  // app.quit(), which does not exercise the same view-destruction ordering.
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => !window.getParentWindow());
    setTimeout(() => window.close(), 25);
  });
  try { report.nativeWindowExit = await nativeExit; }
  finally { clearTimeout(closeTimer); }
  app = null;
  page = null;
  assert.equal(report.nativeWindowExit.code, 0, `Native close failed: ${JSON.stringify(report.nativeWindowExit)}`);
  assert.equal(report.mainErrors.length, 0, `Main-process errors: ${JSON.stringify(report.mainErrors)}`);
  record('Native window close exits cleanly with retained personal views after sign-in closes, without main-process errors');
  report.status = 'passed';
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  if (app) report.failureViews = await nativeViews().catch(() => []);
  if (page && !page.isClosed()) report.failurePersonalState = await personalState().catch(() => null);
  if (page && !page.isClosed()) await shot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) {
    // Only this isolated fixture process is owned by the test. A failed quit
    // must not hide its evidence or leave an indefinite test process behind.
    let timer;
    try { await Promise.race([app.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Fixture cleanup timed out')), 10000); })]); }
    catch (error) { report.errors.push(`Close: ${error.message}`); app.process()?.kill(); }
    finally { clearTimeout(timer); }
  }
  const serialized = JSON.stringify(report, null, 2);
  await writeFile(path.join(fixture, 'report.json'), serialized);
  await writeFile(path.join(artifacts, `personal-ui${variant === 'packaged' ? '-packaged' : ''}-results.json`), serialized);
  console.log(`Report: ${path.join(fixture, 'report.json')}`);
}
