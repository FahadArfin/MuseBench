import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

// Real Electron views and real navigation adapters, with every HTTP(S) response
// intercepted. A minimal test app avoids the user's profile and app services.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/navigation-cache');
await mkdir(output, { recursive: true });
const runDir = await mkdtemp(path.join(output, 'source-'));
const fixture = await readFile(path.join(root, 'scripts/fixtures/navigation-cache.html'), 'utf8');
const entryPath = path.join(runDir, 'main.mjs');
await writeFile(entryPath, `
import { app, BrowserWindow, WebContentsView, session, webContents } from 'electron';
import { createPersonalBrowser } from ${JSON.stringify(pathToFileURL(path.join(root, 'electron/personal.mjs')).href)};
import { runPersonalAction, readPersonalToolState } from ${JSON.stringify(pathToFileURL(path.join(root, 'electron/personal-presentation.mjs')).href)};
app.setPath('userData', ${JSON.stringify(path.join(runDir, 'data'))});
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.on('window-all-closed', () => {});
void app.whenReady().then(async () => {
const fixture = ${JSON.stringify(fixture)};
const state = { requests: 0, requestsByView: {}, blockedRequests: 0, externalOpens: 0, publications: 0, maxVisible: 0, visibilityViolations: [], commandDepthViolations: 0, auth: 'ready' };
const allowedHosts = new Set(['muse.ai', 'www.meta.ai', 'meta.ai', 'auth.muse.ai', 'auth.meta.ai', 'auth.meta.com', 'www.facebook.com', 'www.instagram.com']);
const install = async owner => {
  for (const scheme of ['http', 'https']) await owner.protocol.handle(scheme, request => {
    const url = new URL(request.url);
    if (scheme !== 'https' || request.method !== 'GET' || !allowedHosts.has(url.hostname)) {
      state.blockedRequests++;
      return new Response('Offline fixture rejected this request', { status: 451 });
    }
    state.requests++;
    return new Response(fixture, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });
};
await install(session.defaultSession);
const isolatedSession = session.fromPartition('navigation-cache-offline');
await install(isolatedSession);
isolatedSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
  state.requestsByView[details.webContentsId] = (state.requestsByView[details.webContentsId] || 0) + 1;
  callback({});
});
const window = new BrowserWindow({ width: 1000, height: 800, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
await window.loadURL('data:text/html,<title>Offline navigation cache smoke</title>');
const transitions = []; let nativeDepth = 0;
function transition(stage, change = null) {
  transitions.push({ stage, change, nativeDepth });
  if (transitions.length > 60) transitions.shift();
}
function observeVisibility(stage, change = null) {
  const visible = window.contentView.children.filter(view => view.webContents && !view.webContents.isDestroyed() && view.getVisible());
  state.maxVisible = Math.max(state.maxVisible, visible.length);
  if (visible.length > 1 && state.visibilityViolations.length < 10) state.visibilityViolations.push({ stage, change, command: state.command, nativeDepth, transitions: [...transitions], stack: new Error().stack, views: visible.map(view => ({ id: view.webContents.id, url: view.webContents.getURL() })) });
}
class ObservedView {
  constructor(options) {
    const view = new WebContentsView(options);
    for (const method of ['setVisible', 'setBounds']) {
      const original = view[method].bind(view);
      view[method] = value => {
        const change = { id: view.webContents.id, value };
        nativeDepth++; transition(method + ':enter', change);
        try {
          original(value);
          if (method === 'setBounds' && state.stress) {
            const deadline = Date.now() + 3;
            while (Date.now() < deadline) { /* Expose Inspector reentry during layout in this offline fixture only. */ }
          }
          observeVisibility(method, change);
        }
        finally { transition(method + ':exit', change); nativeDepth--; }
      };
    }
    return view;
  }
}
// Exercise production defaults before the opt-in cache/prewarm stress checks.
const startupReads = [];
const startupController = createPersonalBrowser({
  window, BrowserWindow, WebContentsView: ObservedView,
  session: { fromPartition: () => isolatedSession }, accountReader: null,
  shell: { openExternal: async () => { throw Error('External navigation is disabled in this fixture.'); } },
  authReader: async () => 'ready', warmupDelay: 40,
  libraryAdapter: { prepare: async () => true, read: async (_contents, section) => {
    startupReads.push(section); return { status: 'ready', items: [] };
  }, activate: async () => false },
});
startupController.preloadInitial();
await startupController.dispatch({ type: 'layout', visible: true, bounds: { x: 0, y: 0, width: 950, height: 700 } });
for (const target of ['bot', 'ideas', 'meta-media']) await startupController.dispatch({ type: 'prewarm', target });
await new Promise(resolve => setTimeout(resolve, 1200));
const startupViews = window.contentView.children.filter(view => view.webContents && !view.webContents.isDestroyed());
state.startup = {
  remotePages: startupViews.length,
  remoteRendererProcesses: new Set(startupViews.map(view => view.webContents.getOSProcessId())).size,
  totalRenderers: app.getAppMetrics().filter(metric => metric.type === 'Tab').length,
  collectionReads: startupReads.length,
};
startupController.close();
const controller = createPersonalBrowser({
  window, BrowserWindow, WebContentsView: ObservedView,
  session: { fromPartition: () => isolatedSession },
  shell: { openExternal: async () => { state.externalOpens++; throw Error('External navigation is disabled in this fixture.'); } },
  authReader: async () => state.auth,
  warmupDelay: 40,
  warmLimit: 3,
  libraryAdapter: { prepare: async () => true, read: async () => ({ status: 'unavailable', items: [] }), activate: async () => false },
  onState: () => {
    state.publications++;
    observeVisibility('publication');
  },
});
globalThis.__navigationCacheSmoke = { controller, window, state, transition, nativeDepth: () => nativeDepth, webContents, runPersonalAction, readPersonalToolState };
}).catch(error => { globalThis.__navigationCacheBootError = error?.message ?? String(error); });
`);

const env = { ...process.env };
for (const name of ['ELECTRON_RUN_AS_NODE', 'MUSEBENCH_DEV', 'MUSEBENCH_DATA_DIR', 'MUSEBENCH_PROJECTS_DIR']) delete env[name];
const report = { variant: 'source-isolated', startedAt: new Date().toISOString(), status: 'running', checks: [], timingsMs: {}, counts: {}, errors: [] };
const start = performance.now();
let app;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const pass = (name, details = {}) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`); };
async function until(predicate, name, timeout = 10000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await delay(40);
  }
  throw Error(`${name} did not settle within ${timeout}ms`);
}
async function dispatch(command) {
  return app.evaluate(async (_, command) => {
    // Inspector evaluation can interrupt synchronous native layout. Schedule
    // mutations like real IPC instead of changing selection inside that layout.
    await new Promise(resolve => setImmediate(resolve));
    const harness = globalThis.__navigationCacheSmoke;
    if (harness.nativeDepth()) harness.state.commandDepthViolations++;
    harness.state.command = command;
    harness.transition('command:enter', command);
    try { return await harness.controller.dispatch(command); }
    finally { harness.transition('command:exit', command); }
  }, command);
}
async function closeController() {
  return app.evaluate(async () => {
    await new Promise(resolve => setImmediate(resolve));
    const harness = globalThis.__navigationCacheSmoke;
    if (!harness) return;
    clearInterval(harness.pulse);
    harness.controller.close();
  });
}
async function counters() {
  return app.evaluate(() => ({ ...globalThis.__navigationCacheSmoke.state }));
}
async function requestCounts(ids) {
  const { requestsByView } = await counters();
  return ids.map(id => requestsByView[id] ?? 0);
}
async function views() {
  return app.evaluate(async () => {
    const harness = globalThis.__navigationCacheSmoke;
    return Promise.all(harness.window.contentView.children.filter(view => view.webContents && !view.webContents.isDestroyed()).map(async view => {
      let fixture = null;
      try { fixture = await view.webContents.executeJavaScript('globalThis.__navigationFixture ?? null'); } catch {}
      const url = new URL(view.webContents.getURL() || 'about:blank');
      return { id: view.webContents.id, visible: view.getVisible(), origin: url.origin, path: url.pathname, fixture };
    }));
  });
}
async function evaluate(id, expression) {
  return app.evaluate(async (_, { id, expression }) => {
    const contents = globalThis.__navigationCacheSmoke.webContents.fromId(id);
    if (!contents || contents.isDestroyed()) throw Error('Fixture view was destroyed');
    return contents.executeJavaScript(expression);
  }, { id, expression });
}
async function visibleView(action = null, origin = null) {
  return until(async () => {
    const visible = (await views()).filter(view => view.visible);
    assert(visible.length <= 1, 'Only one personal view may be visible');
    const view = visible[0];
    return view?.fixture?.ready && (!action || view.fixture.action === action) && (!origin || view.origin === origin) ? view : false;
  }, `Visible ${action ?? 'main'} fixture`);
}
async function navigate(destination) {
  await dispatch({ type: 'navigate', destination });
  return visibleView(null, destination === 'chat' ? 'https://www.meta.ai' : 'https://muse.ai');
}
async function openTool(target) {
  const [service, action] = target.split('-');
  const start = performance.now();
  await dispatch({ type: service === 'muse' ? 'serviceAction' : 'metaAction', action });
  const view = await visibleView(action, service === 'muse' ? 'https://muse.ai' : 'https://www.meta.ai');
  assert.equal((await app.evaluate(() => globalThis.__navigationCacheSmoke.controller.snapshot())).notice, null, `${target} must use its official navigation control successfully`);
  return { ...view, elapsedMs: Math.round((performance.now() - start) * 100) / 100 };
}
async function preserve(view, label) {
  await evaluate(view.id, `(() => {
    document.querySelector('#draft').value = ${JSON.stringify(`Unsent ${label} draft`)};
    document.querySelector('#filter').value = ${JSON.stringify(`${label} filter`)};
    document.querySelector('#scroll').scrollTop = 327;
    const search = document.querySelector('#search-query');
    if (search) search.value = ${JSON.stringify(`${label} search`)};
  })()`);
  const saved = await readPreserved(view.id);
  assert.equal(saved.scroll, 327, `${label} fixture must have real scroll state to preserve`);
  if (label === 'meta-search') assert.equal(saved.search, `${label} search`, 'Meta Search must expose the query field');
  return saved;
}
async function readPreserved(id) {
  return evaluate(id, `({
    documentId: globalThis.__navigationFixture.documentId,
    actionCounts: globalThis.__navigationFixture.actionCounts,
    draft: document.querySelector('#draft').value,
    filter: document.querySelector('#filter').value,
    scroll: document.querySelector('#scroll').scrollTop,
    search: document.querySelector('#search-query')?.value ?? null,
  })`);
}
async function assertPreserved(view, expected, label) {
  const active = await visibleView();
  assert.equal(active.id, view.id, `${label} must reuse its webContents`);
  assert.deepEqual(await readPreserved(active.id), expected, `${label} must retain the same document, draft, filter, scroll and search without replaying its action`);
}

try {
  app = await electron.launch({ cwd: root, args: [entryPath], env, timeout: 30000 });
  await until(async () => {
    const boot = await app.evaluate(() => ({ ready: Boolean(globalThis.__navigationCacheSmoke), error: globalThis.__navigationCacheBootError }));
    if (boot.error) throw Error(`Isolated controller boot: ${boot.error}`);
    return boot.ready;
  }, 'Isolated controller boot');
  const startup = (await counters()).startup;
  assert.equal(startup.remotePages, 1, 'Production defaults must create only the selected remote page');
  assert.equal(startup.remoteRendererProcesses, 1, 'Unused tools must not allocate native renderers');
  assert.equal(startup.collectionReads, 0, 'Meta startup must not read hidden Muse collections');
  report.startup = startup;
  pass('Default desktop startup and hover hints keep one remote page without hidden Muse collection readers', startup);
  await dispatch({ type: 'layout', visible: true, bounds: { x: 0, y: 0, width: 950, height: 700 } });
  const chat = await navigate('chat');
  const chatState = await preserve(chat, 'main chat');
  const bot = await navigate('bot');
  const botState = await preserve(bot, 'main Muse');
  assert.notEqual(bot.id, chat.id);
  pass('Main Muse and Meta chats use independent documents and drafts');

  const feed = await openTool('muse-feed');
  const feedState = await preserve(feed, 'Muse feed');
  const library = await openTool('muse-library');
  assert.notEqual(library.id, feed.id, 'Muse feed and library require independent cached webContents');
  const libraryState = await preserve(library, 'Muse library');
  const revisitIds = [feed.id, library.id, bot.id, chat.id];
  const beforeRevisit = await requestCounts(revisitIds);
  assert(beforeRevisit.every(count => count > 0), 'Request instrumentation must observe each real document load');
  const feedAgain = await openTool('muse-feed');
  await assertPreserved(feed, feedState, 'Muse Feed A-B-A');
  await openTool('muse-library');
  await assertPreserved(library, libraryState, 'Muse Library return');
  await navigate('bot');
  await assertPreserved(bot, botState, 'Main Muse after tools');
  await navigate('chat');
  await assertPreserved(chat, chatState, 'Main Meta after tools');
  assert.deepEqual(await requestCounts(revisitIds), beforeRevisit, 'Visited routes must not reload or request documents');
  report.timingsMs.visitedFeedRevisit = feedAgain.elapsedMs;
  pass('Visited Muse Feed and Library retain A-B-A documents, drafts, filters and scroll without requests');

  const warmStart = performance.now();
  const warmTargets = ['muse-search', 'meta-search', 'meta-media'];
  for (const target of warmTargets) await dispatch({ type: 'prewarm', target });
  const warmed = await until(async () => {
    const all = await views();
    return warmTargets.every(target => {
      const [service, action] = target.split('-');
      return all.some(view => view.fixture?.action === action && view.origin === (service === 'muse' ? 'https://muse.ai' : 'https://www.meta.ai') && !view.visible);
    }) ? all : false;
  }, 'Three speculative tools warm in hidden views');
  const visitedIds = new Set([chat.id, bot.id, feed.id, library.id]);
  assert.equal(warmed.filter(view => view.fixture?.action && !visitedIds.has(view.id)).length, 3, 'Speculative tool documents must stay within the three-view budget');
  report.timingsMs.threeHiddenWarmups = Math.round(performance.now() - warmStart);
  await assertPreserved(chat, chatState, 'Visible chat during hidden warmup');
  pass('Three speculative tool pages warm invisibly without replacing the active chat');

  for (const target of warmTargets) {
    const [service, action] = target.split('-');
    const prepared = warmed.find(view => view.fixture?.action === action && view.origin === (service === 'muse' ? 'https://muse.ai' : 'https://www.meta.ai'));
    const before = await requestCounts([prepared.id]);
    const firstVisit = await openTool(target);
    assert.equal(firstVisit.id, prepared.id, `${target} must show its prewarmed webContents`);
    assert.equal(firstVisit.fixture.documentId, prepared.fixture.documentId, `${target} must show its prewarmed document`);
    assert.deepEqual(firstVisit.fixture.actionCounts, prepared.fixture.actionCounts, `${target} activation must not replay its warmed navigation action`);
    const saved = await preserve(firstVisit, target);
    await navigate(service === 'muse' ? 'chat' : 'bot');
    const revisit = await openTool(target);
    await assertPreserved(firstVisit, saved, `${target} warmed A-B-A`);
    assert.deepEqual(await requestCounts([prepared.id]), before, `${target} warm activation and revisit make no requests`);
    report.timingsMs[`${target}FirstVisit`] = firstVisit.elapsedMs;
    report.timingsMs[`${target}Revisit`] = revisit.elapsedMs;
  }
  pass('Warmed Muse Search, Meta Search and Media reuse documents with drafts, search terms and scroll intact');

  // Widen a real synchronous layout and repeatedly dispatch across Inspector.
  // Direct controller calls reenter it and reproduce the retained-page overlap;
  // event-loop admission must leave every native transition exclusive.
  {
    await app.evaluate(async () => {
      await new Promise(resolve => setImmediate(resolve));
      const h = globalThis.__navigationCacheSmoke;
      h.state.stress = true; h.pulse = setInterval(() => h.window.emit('resize'), 1);
    });
    for (let index = 0; index < 80; index++) {
      await navigate('bot');
      await delay(index % 7);
      await openTool('meta-media');
      await delay(index % 11);
    }
    await app.evaluate(async () => {
      await new Promise(resolve => setImmediate(resolve));
      const h = globalThis.__navigationCacheSmoke;
      clearInterval(h.pulse); h.state.stress = false;
    });
    assert.equal((await counters()).commandDepthViolations, 0, 'Commands must not interrupt a synchronous native layout');
    pass('Rapid page switches and resize publications admit commands only through the normal main event loop');
  }

  const search = await openTool('meta-search');
  const openSearchState = await readPreserved(search.id);
  await openTool('meta-search');
  await assertPreserved(search, openSearchState, 'Repeated open Meta Search selection');
  await evaluate(search.id, `document.querySelector('[role="dialog"] button[aria-label="Close"]').click()`);
  assert.equal(await evaluate(search.id, `Boolean(document.querySelector('#search-query'))`), false, 'The fixture must manually close Search before testing reopening');
  const searchRequests = await requestCounts([search.id]);
  await openTool('meta-search');
  await until(() => evaluate(search.id, `Boolean(document.querySelector('#search-query'))`), 'Cached Meta Search reopens after manual close');
  const reopened = await readPreserved(search.id);
  assert.equal(reopened.documentId, openSearchState.documentId);
  assert.equal(reopened.actionCounts.search, openSearchState.actionCounts.search + 1, 'Reopening the closed Search must click its control exactly once');
  const reopenedSearchState = await preserve(search, 'meta-search');
  await openTool('meta-search');
  await assertPreserved(search, reopenedSearchState, 'Repeated reopened Meta Search selection');
  assert.deepEqual(await requestCounts([search.id]), searchRequests, 'Reopening cached Search must not request a new document');
  pass('Manually closed Meta Search reopens in its cached document and repeated selection preserves the typed query');

  const museSearch = await openTool('muse-search');
  const museSearchState = await readPreserved(museSearch.id);
  await openTool('muse-search');
  await assertPreserved(museSearch, museSearchState, 'Repeated open Muse Search selection');
  await evaluate(museSearch.id, `document.querySelector('[role="dialog"] button[aria-label="Close Muse search"]').click()`);
  const museSearchRequests = await requestCounts([museSearch.id]);
  await openTool('muse-search');
  await until(() => evaluate(museSearch.id, `Boolean(document.querySelector('#search-query'))`), 'Cached Muse Search reopens after manual close');
  const museReopened = await readPreserved(museSearch.id);
  assert.equal(museReopened.documentId, museSearchState.documentId);
  assert.equal(museReopened.actionCounts.search, museSearchState.actionCounts.search + 1);
  const reopenedMuseState = await preserve(museSearch, 'muse-search');
  await openTool('muse-search');
  await assertPreserved(museSearch, reopenedMuseState, 'Repeated reopened Muse Search selection');
  assert.deepEqual(await requestCounts([museSearch.id]), museSearchRequests);
  pass('Muse Search detects a manually closed overlay, reopens once, and preserves query and document on repeated selection');

  const retained = new Map();
  for (const target of ['meta-artifacts', 'meta-scheduled', 'meta-vibes']) {
    const view = await openTool(target);
    retained.set(target, { view, saved: await preserve(view, target) });
  }
  const returnedIds = [...retained.values()].map(({ view }) => view.id);
  const requestsBeforeToolReturns = await requestCounts(returnedIds);
  for (const [target, { view, saved }] of retained) {
    await openTool(target);
    await assertPreserved(view, saved, `${target} return`);
  }
  assert.deepEqual(await requestCounts(returnedIds), requestsBeforeToolReturns);
  await navigate('chat');
  await assertPreserved(chat, chatState, 'Main Meta after every tool');
  pass('Artifacts, Scheduled and Vibes retain separate documents while the main chat draft survives');

  for (const [target, original] of [['muse-feed', feed], ['muse-library', library]]) {
    await openTool(target);
    const previous = await readPreserved(original.id);
    const requests = await requestCounts([original.id]);
    await dispatch({ type: 'reload' });
    const reloaded = await until(async () => {
      const state = await readPreserved(original.id).catch(() => null);
      return state && state.documentId !== previous.documentId ? state : false;
    }, `${target} reload commits a fresh document`);
    const ready = await openTool(target);
    assert.equal(ready.id, original.id);
    assert.equal(ready.fixture.documentId, reloaded.documentId);
    assert.deepEqual(ready.fixture.actionCounts, {}, `${target} verified route is already ready after reload and needs no navigation replay`);
    assert.deepEqual(await requestCounts([original.id]), requests.map(count => count + 1), `${target} reload performs only the explicitly requested document load`);
    await navigate('chat');
    await openTool(target);
    assert.deepEqual((await readPreserved(original.id)).actionCounts, {}, `${target} stays initialized after the reloaded page is revisited`);
  }
  await navigate('chat');
  pass('Reloaded Feed and Library reuse previously verified routes without extra navigation clicks or document requests');

  const probeMuseSearch = method => app.evaluate(async (_, { id, method }) => {
    const harness = globalThis.__navigationCacheSmoke;
    return harness[method](harness.webContents.fromId(id), 'search');
  }, { id: bot.id, method });
  const initialToolState = await probeMuseSearch('readPersonalToolState');
  await evaluate(bot.id, `(() => {
    const hydrated = document.querySelector('[data-testid="hatch-nav-search"]');
    const inert = hydrated.cloneNode(true);
    globalThis.__navigationFixture.inertClicks = 0;
    inert.addEventListener('click', () => { globalThis.__navigationFixture.inertClicks++; });
    hydrated.replaceWith(inert);
    setTimeout(() => inert.replaceWith(hydrated), 160);
  })()`);
  assert.equal(await probeMuseSearch('runPersonalAction'), false, 'An inert server-rendered dock click must not be reported as completed navigation');
  assert.equal(await evaluate(bot.id, 'globalThis.__navigationFixture.inertClicks'), 1, 'Hydration must not trigger automatic repeated clicks');
  assert.equal(await probeMuseSearch('readPersonalToolState'), initialToolState);
  assert.equal(await probeMuseSearch('runPersonalAction'), true, 'A later explicit click uses the hydrated control');
  assert.notEqual(await probeMuseSearch('readPersonalToolState'), initialToolState);
  await evaluate(bot.id, `(() => {
    document.querySelector('[role="dialog"] button[aria-label="Close Muse search"]').click();
    globalThis.__navigationFixture.action = null;
    globalThis.__navigationFixture.actionCounts = {};
  })()`);
  assert.equal(await probeMuseSearch('readPersonalToolState'), initialToolState);
  pass('A real inert dock replaced after hydration cannot falsely initialize a cached tool; a later explicit click succeeds');

  const staleIds = (await views()).filter(view => view.fixture?.action).map(view => view.id);
  await evaluate(chat.id, "location.href = 'https://auth.meta.ai/offline-sign-in'");
  await until(() => app.evaluate(() => globalThis.__navigationCacheSmoke.controller.snapshot().authenticating), 'Authentication boundary');
  await until(async () => {
    const ids = new Set((await views()).map(view => view.id));
    return staleIds.every(id => !ids.has(id));
  }, 'Cached tools invalidated on authentication change');
  await evaluate(chat.id, "location.href = 'https://www.meta.ai/'");
  await until(async () => !(await app.evaluate(() => globalThis.__navigationCacheSmoke.controller.snapshot().authenticating)), 'Authentication return');
  const freshFeed = await openTool('muse-feed');
  assert(!staleIds.includes(freshFeed.id), 'The new account must not reuse any old tool webContents');
  assert.equal((await readPreserved(freshFeed.id)).draft, '');
  pass('Authentication changes discard cached tools and reopening starts with a fresh document');

  await dispatch({ type: 'layout', visible: false });
  await app.evaluate(async () => { await new Promise(resolve => setImmediate(resolve)); globalThis.__navigationCacheSmoke.state.auth = 'required'; });
  const beforeSignedOutWarm = (await views()).map(view => view.id).sort((a, b) => a - b);
  const signedOutToolRequests = await requestCounts([freshFeed.id]);
  await dispatch({ type: 'layout', visible: true, bounds: { x: 0, y: 0, width: 950, height: 700 } });
  await dispatch({ type: 'prewarm', target: 'meta-artifacts' });
  await delay(220);
  assert.deepEqual((await views()).map(view => view.id).sort((a, b) => a - b), beforeSignedOutWarm, 'Signed-out sessions must not create speculative tool views');
  assert.deepEqual(await requestCounts([freshFeed.id]), signedOutToolRequests, 'Signed-out warmup must not navigate the active tool');
  pass('Speculative warmup is suppressed when authentication is required');

  await app.evaluate(async () => { await new Promise(resolve => setImmediate(resolve)); globalThis.__navigationCacheSmoke.state.auth = 'ready'; });
  await dispatch({ type: 'prewarm', target: 'meta-vibes' });
  await closeController();
  const atClose = await counters();
  await delay(220);
  const afterClose = await counters();
  assert.equal(afterClose.requests, atClose.requests, 'Shutdown must cancel queued warmups');
  assert.equal(afterClose.publications, atClose.publications, 'Shutdown must stop state publications');
  assert.equal((await views()).length, 0, 'Shutdown must dispose retained and speculative views');
  assert.equal(afterClose.maxVisible, 1, `At most one view may be visible; ${afterClose.visibilityViolations.length} recorded violations are in report.json`);
  assert.equal(afterClose.externalOpens, 0);
  assert.equal(afterClose.blockedRequests, 0, 'Fixture must not attempt external or model requests');
  pass('Close cancels queued warming and destroys every remote view; at most one view was ever visible');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.errors.push(error?.stack ?? String(error));
  console.error(`FAIL ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  if (app) {
    try {
      const counts = await counters();
      report.counts = { fixtureRequests: counts.requests, blockedRequests: counts.blockedRequests, externalOpens: counts.externalOpens, maxVisibleViews: counts.maxVisible, commandDepthViolations: counts.commandDepthViolations, visibilityViolations: counts.visibilityViolations };
      await closeController();
    } catch {}
    await app.close().catch(() => {});
  }
  report.timingsMs.total = Math.round(performance.now() - start);
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${path.join(output, 'report.json')}`);
}
