import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {createOnboarding} from '../electron/onboarding.mjs';
import {createUpdateShutdown} from '../electron/app-updates.mjs';
const implementation = await import('../electron/personal.mjs').catch(() => ({}));

function harness(options = {}) {
  assert.equal(typeof implementation.createPersonalBrowser, 'function', 'personal browser controller is implemented');
  const views = [], sessions = new Map(), states = [], external = [], shortcuts = [], popups = [], presentations = [], actions = [], metaActions = [], dismissals = [];
  class Contents extends EventEmitter {
    constructor() { super(); this.url = ''; this.loads = []; this.destroyed = false; this.zoom = 1; this.focusCount = 0; this.navigationHistory = { canGoBack: () => false, canGoForward: () => false, goBack: () => {}, goForward: () => {} }; }
    setWindowOpenHandler(handler) { this.openHandler = handler; }
    getURL() { return this.url; }
    getZoomFactor() { if (this.destroyed) throw Error('Object has been destroyed'); return this.zoom; }
    isDestroyed() { return this.destroyed; }
    focus() { this.focusCount++; }
    async loadURL(url) { this.loads.push(url); this.url = url; this.emit('did-start-loading'); this.emit('did-navigate', {}, url); this.emit('did-stop-loading'); }
    reload() { return this.loadURL(this.url); }
    close() { this.destroyed = true; this.emit('destroyed'); }
  }
  class Popup extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new Contents(); this.destroyed = false; popups.push(this); }
    isDestroyed() { return this.destroyed; }
    show() { this.shown = true; }
    focus() { this.focused = true; }
    setTitle(value) { this.title = value; }
    loadURL(value) { return this.webContents.loadURL(value); }
    close() { this.destroy(); }
    destroy() { this.destroyed = true; this.webContents.close(); this.emit('closed'); }
  }
  class View {
    constructor(options) { this.options = options; this.webContents = new Contents(); this.visible = false; views.push(this); }
    setVisible(value) { this.visible = value; }
    getVisible() { return this.visible; }
    setBounds(value) { this.bounds = value; }
    setBackgroundColor() {}
  }
  const window = new EventEmitter(); window.webContents = new Contents(); window.isDestroyed = () => false; window.getContentSize = () => [1000, 700];
  window.contentView = { children: [], addChildView(view) { this.children.push(view); }, removeChildView(view) { this.children = this.children.filter(item => item !== view); } };
  const session = { fromPartition(name) { if (!sessions.has(name)) { const value = new EventEmitter(); value.setPermissionRequestHandler = handler => { value.request = handler; }; value.setPermissionCheckHandler = handler => { value.check = handler; }; value.setDevicePermissionHandler = handler => { value.device = handler; }; sessions.set(name, value); } return sessions.get(name); } };
  const presentation = { apply: async (contents, compact, appearance) => { presentations.push({ contents, compact, appearance }); return true; }, action: async (contents, action) => { actions.push({ contents, action }); return true; } };
  const metaAdapter = options.metaAdapter ?? {
    action: async (contents, action) => { metaActions.push({ contents, action }); return true; },
    dismiss: async contents => { dismissals.push(contents); return true; },
  };
  const libraryAdapter = options.libraryAdapter ?? { prepare: async () => false, read: async () => ({ status: 'unavailable', items: [] }), activate: async () => false };
  const browser = implementation.createPersonalBrowser({ window, BrowserWindow: Popup, WebContentsView: View, session, shell: { openExternal: async url => { external.push(url); } }, onState: value => states.push(value), onShortcut: value => shortcuts.push(value), presentation, libraryAdapter, metaAdapter, ...(options.metaAppsAdapter?{metaAppsAdapter:options.metaAppsAdapter}:{}), accountReader:options.accountReader ?? null, accountTiming:options.accountTiming ?? {}, ...(options.authReader === undefined ? {} : { authReader: options.authReader }), ...(options.warmupDelay === undefined ? {} : { warmupDelay: options.warmupDelay }), ...(options.warmLimit === undefined ? {} : { warmLimit: options.warmLimit }) });
  return { browser, views, sessions, states, external, shortcuts, window, popups, presentations, actions, presentation, libraryAdapter, metaAdapter, metaActions, dismissals };
}
const layout = { type: 'layout', visible: true, bounds: { x: 300, y: 80, width: 700, height: 620 } };

test('reserved account popup preserves opener and session, accepts Accounts Center, and blocks unsupported OAuth without exporting its URL',async t=>{
 const h=harness();t.after(()=>h.browser.close());await h.browser.dispatch({type:'navigate',destination:'chat'});await h.browser.dispatch(layout);
 const parent=h.views[0].webContents;const response=parent.openHandler({url:'about:blank'});
 assert.equal(response.action,'allow');const child=response.createWindow({});
 assert.equal(h.popups[0].options.webPreferences.session,h.views[0].options.webPreferences.session);
 assert.equal(h.popups[0].options.webPreferences.preload,undefined);
 let blocked=false;child.emit('will-navigate',{url:'https://accountscenter.meta.com/subscriptions?state=secret',isMainFrame:true,preventDefault(){blocked=true;}});assert.equal(blocked,false);
 child.emit('did-navigate',{},'https://accountscenter.meta.com/subscriptions?state=secret');
 assert.equal(h.popups[0].title,'Meta AI account — https://accountscenter.meta.com');
 child.emit('will-redirect',{url:'https://accounts.google.com/o/oauth2/auth?state=secret',isMainFrame:true,preventDefault(){blocked=true;}});assert.equal(blocked,true);
 assert.equal(h.browser.snapshot().noticeCanOpenBrowser,true);assert.match(h.browser.snapshot().notice,/Google.*browser/);
 assert.deepEqual(h.external,[]);assert.equal(JSON.stringify(h.states).includes('secret'),false);
 await h.browser.dispatch({type:'openNoticeExternal'});assert.deepEqual(h.external,['https://www.meta.ai/']);
 await h.browser.dispatch({type:'dismissNotice'});assert.equal(h.browser.snapshot().noticeCanOpenBrowser,false);
});

test('account browser handoff keeps its originating service after foreground navigation',async t=>{
 const h=harness();t.after(()=>h.browser.close());await h.browser.dispatch({type:'navigate',destination:'chat'});await h.browser.dispatch(layout);
 const child=h.views[0].webContents.openHandler({url:'https://accountscenter.meta.com/'}).createWindow({});
 await h.browser.dispatch({type:'navigate',destination:'bot'});
 child.emit('will-redirect',{url:'https://accounts.google.com/o/oauth2/auth?state=private',isMainFrame:true,preventDefault(){}});
 assert.equal(h.browser.snapshot().noticeBrowserDestination,'chat');await h.browser.dispatch({type:'openNoticeExternal'});assert.deepEqual(h.external,['https://www.meta.ai/']);
 await h.browser.dispatch({type:'dismissNotice'});await h.browser.dispatch({type:'openNoticeExternal'});assert.equal(h.external.length,1);
 await h.browser.dispatch({type:'openExternal'});assert.equal(h.external[1],'https://muse.ai/','regular menu still opens current service');
});

test('Meta settings uses the Meta document and preserves the Muse draft',async t=>{
 const calls=[];const h=harness({metaAdapter:{settings:async(contents,section)=>{calls.push({contents,section});return true;},dismiss:async()=>true}});t.after(()=>h.browser.close());
 await h.browser.dispatch({type:'navigate',destination:'bot'});await h.browser.dispatch(layout);const muse=h.views[0].webContents;muse.unsentDraft='keep this';
 await h.browser.dispatch({type:'metaSettings',section:'apps'});assert.equal(calls.length,1);assert.equal(calls[0].contents.getURL(),'https://www.meta.ai/');assert.equal(calls[0].section,'apps');assert.equal(muse.unsentDraft,'keep this');assert.equal(h.browser.snapshot().destination,'chat');
});

test('leaving Meta settings aborts pending official menu navigation',async t=>{
 let received,finish;const h=harness({metaAdapter:{settings:async(_contents,_section,{signal})=>{received=signal;return new Promise(resolve=>{finish=resolve;});},dismiss:async()=>true}});t.after(()=>h.browser.close());
 await h.browser.dispatch({type:'navigate',destination:'chat'});await h.browser.dispatch(layout);
 const pending=h.browser.dispatch({type:'metaSettings',section:'general'});
 while(!received)await new Promise(resolve=>setImmediate(resolve));
 await h.browser.dispatch({type:'navigate',destination:'bot'});assert.equal(received.aborted,true);
 finish(false);await pending;assert.equal(h.browser.snapshot().destination,'bot');assert.equal(h.browser.snapshot().notice,null);
});

test('personal sign-in stays busy after its opening command settles until the account window closes',async t=>{
 const h=harness({warmLimit:0});t.after(()=>h.browser.close());
 const onboarding=createOnboarding({getBinary:()=>null,personal:h.browser});
 assert.equal(onboarding.isBusy(),false);
 await onboarding.command({type:'loginPersonal'});
 assert.equal(h.popups.length,1);assert.equal(onboarding.isBusy(),true);
 assert.equal(h.browser.snapshot().authenticating,true);assert.equal(h.browser.snapshot().authWindowOpen,true);
 const shutdown=createUpdateShutdown({isBusy:()=>onboarding.isBusy(),voice:async()=>({status:'idle'}),lock(){},closeServices:async()=>assert.fail('Must preserve the sign-in window'),verifyClosed:()=>true});
 await assert.rejects(shutdown.prepare(),/Active work/);
 assert.equal(h.popups[0].destroyed,false);h.popups[0].close();
 assert.equal(onboarding.isBusy(),false);assert.equal(h.browser.snapshot().authWindowOpen,false);
});

test('a passive signed-out document does not lock closing or updates without an account window',async t=>{
 const h=harness({warmLimit:0});t.after(()=>h.browser.close());await h.browser.dispatch(layout);
 await h.views[0].webContents.loadURL('https://auth.meta.com/login');
 const onboarding=createOnboarding({getBinary:()=>null,personal:h.browser});
 assert.equal(h.browser.snapshot().authenticating,true);assert.equal(h.browser.snapshot().authWindowOpen,false);
 assert.equal(onboarding.isBusy(),false);
});

test('launch prepares the default chat behind the animation and reveals the same native document', async t => {
  const h = harness({warmLimit:0});
  t.after(()=>h.browser.close());
  h.browser.setLaunchHold(true);
  h.browser.preloadInitial();
  assert.equal(h.views.length,1);
  assert.deepEqual(h.views[0].webContents.loads,['https://www.meta.ai/']);
  await h.browser.dispatch(layout);
  assert.equal(h.views[0].visible,false,'native WebContentsView must stay beneath the renderer animation');
  assert.equal(h.browser.snapshot().visible,false);
  assert.deepEqual(h.views[0].webContents.openHandler({url:'https://www.facebook.com/login'}),{action:'deny'});
  h.views[0].webContents.unsentDraft = 'Retain this exact chat document';
  h.browser.setLaunchHold(false);
  assert.equal(h.views[0].visible,true);
  assert.equal(h.browser.snapshot().visible,true);
  await h.browser.dispatch({type:'navigate',destination:'chat'});
  h.browser.preloadInitial();
  assert.deepEqual(h.views[0].webContents.loads,['https://www.meta.ai/']);
  assert.equal(h.views[0].webContents.unsentDraft,'Retain this exact chat document');
});

test('finishing launch respects the most recent hidden layout instead of reopening native content', async t => {
  const h = harness({warmLimit:0});
  t.after(()=>h.browser.close());
  h.browser.setLaunchHold(true); h.browser.preloadInitial();
  await h.browser.dispatch(layout);
  await h.browser.dispatch({type:'layout',visible:false});
  h.browser.setLaunchHold(false);
  assert.equal(h.views[0].visible,false);
  await h.browser.dispatch(layout);
  assert.equal(h.views[0].visible,true);
});

test('switching back to an earlier retained view hides the outgoing page before revealing its replacement', async t => {
  const h = harness({warmLimit:0});
  t.after(() => h.browser.close());
  await h.browser.dispatch(layout);
  const chat = h.views[0];
  await h.browser.dispatch({type:'navigate',destination:'bot'});
  const bot = h.views.find(view => view.visible);
  assert.notEqual(bot,chat);
  const visibleCounts = [];
  for (const view of h.views) {
    const setVisible = view.setVisible.bind(view);
    view.setVisible = value => {
      setVisible(value);
      visibleCounts.push(h.views.filter(candidate => candidate.visible && !candidate.webContents.isDestroyed()).length);
    };
  }
  await h.browser.dispatch({type:'navigate',destination:'chat'});
  assert.equal(chat.visible,true);
  assert.equal(bot.visible,false);
  assert.ok(visibleCounts.every(count => count <= 1), `Native visibility transitions must not overlap: ${visibleCounts}`);
});

async function until(check, message, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

test('account name reaches the snapshot through a temporary sandboxed profile document without navigating the chat', async t => {
  const h = harness({warmLimit:0, accountTiming:{settleMs:5, retryMs:10}, accountReader:async contents => ({status:'ready',handle:'alice',...(contents.getURL().endsWith('/@alice')?{displayName:'Alice Rivera'}:{})})});
  t.after(() => h.browser.close());
  await h.browser.dispatch(layout);
  const main = h.views[0].webContents;
  main.unsentDraft = 'Keep my message';
  await until(() => h.browser.snapshot().profile?.displayName === 'Alice Rivera', 'official profile name published');
  assert.equal(h.browser.snapshot().profile.accountName, 'Alice Rivera');
  assert.match(h.browser.snapshot().profile.accountId, /^meta:[a-f0-9]{64}$/);
  assert.equal(h.browser.snapshot().profile.handle, 'alice');
  assert.equal(main.unsentDraft, 'Keep my message');
  assert.deepEqual(main.loads, ['https://www.meta.ai/']);
  const reader = h.popups.find(popup => popup.webContents.loads.includes('https://www.meta.ai/@alice'));
  assert(reader);
  await until(() => reader.destroyed, 'temporary account reader disposed');
  assert.equal(reader.options.show, false);
  assert.equal(reader.options.webPreferences.session, h.sessions.get('persist:musebench-personal-muse'));
  assert.equal(reader.options.webPreferences.nodeIntegration, false);
  assert.equal(reader.options.webPreferences.sandbox, true);
  assert.equal(reader.options.webPreferences.contextIsolation, true);
  assert.equal(reader.options.webPreferences.preload, undefined);
  assert.equal(reader.shown, undefined);
  assert.deepEqual(reader.webContents.openHandler({url:'https://www.meta.ai/'}), {action:'deny'});
  assert.equal(h.browser.snapshot().authWindowOpen, false);
});

test('account authentication boundaries clear the previous name and allow a different signed-in profile', async t => {
  let account = {handle:'alice', displayName:'Alice Rivera'};
  const h = harness({warmLimit:0, accountTiming:{settleMs:5,retryMs:10}, accountReader:async () => ({status:'ready',...account})});
  t.after(() => h.browser.close());
  await h.browser.dispatch(layout);
  await until(() => h.browser.snapshot().profile?.displayName === 'Alice Rivera', 'first account');
  const firstId = h.browser.snapshot().profile.accountId, main = h.views[0].webContents;
  await main.loadURL('https://www.facebook.com/login');
  assert.equal(h.browser.snapshot().profile, null);
  account = {handle:'bob',displayName:'Bob Rivera'};
  await main.loadURL('https://www.meta.ai/');
  await until(() => h.browser.snapshot().profile?.displayName === 'Bob Rivera', 'second account');
  assert.notEqual(h.browser.snapshot().profile.accountId, firstId);
});

test('closing the controller aborts a hidden account document and blocks provider popups and unrelated redirects', async () => {
  let reading;
  const h = harness({warmLimit:0,accountTiming:{settleMs:5,retryMs:10},accountReader:contents => contents.getURL().includes('/@')?new Promise(resolve => {reading=resolve;}):Promise.resolve({status:'ready',handle:'alice'})});
  await h.browser.dispatch(layout);
  await until(() => reading, 'profile lookup in flight');
  const reader = h.popups[0];
  let blocked = false;
  reader.webContents.emit('will-navigate',{url:'https://example.com/',isMainFrame:true,preventDefault(){blocked=true;}});
  assert.equal(blocked,true);
  h.browser.close();
  await until(() => reader.destroyed, 'pending lookup closed');
  reading({status:'ready',handle:'alice',displayName:'Late name'});
  await new Promise(resolve => setTimeout(resolve,20));
  assert.equal(h.browser.snapshot().profile,null);
});

function routedTools(h) {
  const navigate = (contents, pathname) => {
    if (!pathname) return;
    contents.url = new URL(pathname, contents.getURL()).href;
    contents.emit('did-navigate-in-page', {}, contents.url, true);
  };
  const muse = h.presentation.action, meta = h.metaAdapter.action;
  h.presentation.action = async (contents, action) => {
    const result = await muse(contents, action);
    if (result) navigate(contents, { feed: '/feed', library: '/library' }[action]);
    return result;
  };
  h.metaAdapter.action = async (contents, action) => {
    const result = await meta(contents, action);
    if (result) navigate(contents, { newChat: '/', media: '/create', artifacts: '/artifacts', scheduled: '/scheduled', vibes: '/vibes' }[action]);
    return result;
  };
  return h;
}

test('retained Muse tools keep independent pages and restore drafts and scroll without another action', async t => {
  const h = routedTools(harness()); t.after(() => h.browser.close());
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const main = h.views.find(view => view.visible); main.webContents.unsentDraft = 'Main draft';
  const retained = new Map();
  for (const action of ['search', 'feed', 'library']) {
    await h.browser.dispatch({ type: 'serviceAction', action });
    const view = h.views.find(candidate => candidate.visible);
    assert.notEqual(view, main, `${action} must not navigate the main conversation`);
    assert(![...retained.values()].includes(view), `${action} needs its own document`);
    view.webContents.unsentDraft = `${action} draft`; view.webContents.scrollPosition = 425;
    retained.set(action, view);
  }
  for (const [action, view] of retained) {
    await h.browser.dispatch({ type: 'serviceAction', action });
    assert.equal(view.visible, true); assert.equal(view.webContents.loads.length, 1);
    assert.equal(h.actions.filter(call => call.contents === view.webContents && call.action === action).length, 1);
    assert.equal(view.webContents.unsentDraft, `${action} draft`); assert.equal(view.webContents.scrollPosition, 425);
  }
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  assert.equal(main.visible, true); assert.equal(main.webContents.unsentDraft, 'Main draft'); assert.equal(main.webContents.loads.length, 1);
});

test('retained Meta sections preserve the main chat and reuse their initialized documents', async t => {
  const h = routedTools(harness()); t.after(() => h.browser.close());
  await h.browser.dispatch(layout);
  const main = h.views.find(view => view.visible); main.webContents.unsentDraft = 'Meta draft';
  const retained = new Map();
  for (const action of ['search', 'media', 'artifacts', 'scheduled', 'vibes']) {
    await h.browser.dispatch({ type: 'metaAction', action });
    const view = h.views.find(candidate => candidate.visible);
    assert.notEqual(view, main, `${action} must not replace the active Meta conversation`);
    assert(![...retained.values()].includes(view)); view.webContents.savedQuery = `${action} query`;
    retained.set(action, view);
  }
  for (const [action, view] of retained) {
    await h.browser.dispatch({ type: 'metaAction', action });
    assert.equal(view.visible, true); assert.equal(view.webContents.loads.length, 1);
    assert.equal(view.webContents.savedQuery, `${action} query`);
    if (action !== 'search') assert.equal(h.metaActions.filter(call => call.contents === view.webContents && call.action === action).length, 1);
  }
  await h.browser.dispatch({ type: 'navigate', destination: 'chat' });
  assert.equal(main.visible, true); assert.equal(main.webContents.unsentDraft, 'Meta draft'); assert.equal(main.webContents.loads.length, 1);
});

test('explicit New Meta chat still runs its action on the base conversation', async t => {
  const h = routedTools(harness()); t.after(() => h.browser.close());
  await h.browser.dispatch(layout); const main = h.views.find(view => view.visible);
  await h.browser.dispatch({ type: 'metaAction', action: 'media' });
  await h.browser.dispatch({ type: 'metaAction', action: 'newChat' });
  await h.browser.dispatch({ type: 'metaAction', action: 'newChat' });
  assert.equal(main.visible, true);
  assert.equal(h.metaActions.filter(call => call.action === 'newChat' && call.contents === main.webContents).length, 2);
});

test('retained tool initialization coalesces repeated selection while the first action is pending', async t => {
  const h = harness(); t.after(() => h.browser.close());
  await h.browser.dispatch(layout);
  let release, calls = 0;
  h.presentation.action = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  await until(() => calls > 0, 'the first Feed action should start');
  const feed = h.views.find(view => view.visible);
  const second = h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  await microtasks();
  assert.equal(calls, 1, 'rapid clicks must share the in-flight initialization');
  release(true); await Promise.all([first, second]);
  assert.equal(feed.visible, true); assert.equal(feed.webContents.loads.length, 1);
});

test('retained tools initialize again after their document navigates elsewhere', async t => {
  const h = routedTools(harness()); t.after(() => h.browser.close());
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  const feed = h.views.find(view => view.visible);
  feed.webContents.url = 'https://muse.ai/'; feed.webContents.emit('did-navigate', {}, feed.webContents.url);
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' });
  await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  assert.equal(feed.visible, true); assert.equal(feed.webContents.getURL(), 'https://muse.ai/feed');
  assert.equal(h.actions.filter(call => call.contents === feed.webContents && call.action === 'feed').length, 2);
});

test('a cached Muse revisit stays ready while its unchanged document signature is checked asynchronously', async t => {
  const h = routedTools(harness()); t.after(() => h.browser.close());
  h.presentation.state = async () => 'feed:open';
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  const feed = h.views.find(view => view.visible); feed.webContents.unsentDraft = 'Keep this ready document';
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' });
  let release;
  h.presentation.state = async () => new Promise(resolve => { release = resolve; });
  h.states.length = 0;
  const revisiting = h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  await until(() => Boolean(release), 'the cached document signature check should be pending');
  const pending = h.browser.snapshot(), publishedWhilePending = [...h.states];
  release('feed:open'); await revisiting;
  assert.equal(feed.visible, true); assert.equal(pending.loading, false, 'checking an existing document must not display a loading indicator');
  assert(!publishedWhilePending.some(state => state.loading), 'no transient loading state may flash during the cache check');
  assert.equal(feed.webContents.unsentDraft, 'Keep this ready document'); assert.equal(feed.webContents.loads.length, 1);
  assert.equal(h.actions.filter(call => call.contents === feed.webContents && call.action === 'feed').length, 1);
});

test('prewarm prepares a hidden tool without changing foreground state and selection reuses it', async t => {
  const h = routedTools(harness({ authReader: async () => 'ready', warmupDelay: 5, warmLimit: 3 })); t.after(() => h.browser.close());
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const main = h.views.find(view => view.visible); main.webContents.unsentDraft = 'Keep typing';
  await h.browser.dispatch({ type: 'prewarm', target: 'muse-feed' });
  await until(() => h.actions.some(call => call.action === 'feed'), 'Feed should initialize in the background');
  const feed = h.views.find(view => h.actions.some(call => call.action === 'feed' && call.contents === view.webContents));
  await microtasks();
  assert.equal(main.visible, true); assert.equal(feed.visible, false); assert.equal(h.browser.snapshot().destination, 'bot');
  assert.equal(main.webContents.unsentDraft, 'Keep typing'); assert.equal(h.popups.length, 0);
  await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  assert.equal(feed.visible, true); assert.equal(feed.webContents.loads.length, 1);
  assert.equal(h.actions.filter(call => call.action === 'feed' && call.contents === feed.webContents).length, 1);
});

for (const condition of ['navigated', 'failed']) test(`prewarm leaves a visited ${condition} tool and its draft untouched`, async t => {
  let authReads = 0;
  const h = routedTools(harness({ authReader: async () => { authReads++; return 'ready'; }, warmupDelay: 5, warmLimit: 1 })); t.after(() => h.browser.close());
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  const feed = h.views.find(view => view.visible);
  feed.webContents.unsentDraft = 'A draft that hover must not disturb';
  feed.webContents.url = 'https://muse.ai/library'; feed.webContents.emit('did-navigate-in-page', {}, feed.webContents.url, true);
  if (condition === 'failed') feed.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  const loads = feed.webContents.loads.length;
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  await h.browser.dispatch({ type: 'prewarm', target: 'muse-feed' });
  await until(() => authReads > 0, 'the background queue should have checked the visible account');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(feed.visible, false); assert.equal(feed.webContents.isDestroyed(), false);
  assert.equal(feed.webContents.getURL(), 'https://muse.ai/library', 'hover must not return an owned document to its tool route');
  assert.equal(feed.webContents.unsentDraft, 'A draft that hover must not disturb');
  assert.equal(feed.webContents.loads.length, loads, 'hover must not retry a failed user-owned page');
  assert.equal(h.actions.filter(call => call.contents === feed.webContents && call.action === 'feed').length, 1, 'only the explicit original selection may invoke the tool action');
});

test('a sidebar chat gets its own retained document when a Muse tool already shows the same thread', async t => {
  const h = routedTools(libraryHarness()); t.after(() => h.browser.close());
  const read = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => section === 'chats'
    ? { status: 'ready', items: [libraryItem('chats'), { key: 'saved', title: 'Saved chat', target: { type: 'link', value: '/thread/saved' } }], selectedKey: 'one' }
    : read(contents, section);
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const saved = h.browser.snapshot().library.chats.items.find(item => item.title === 'Saved chat'); assert(saved);
  await h.browser.dispatch({ type: 'serviceAction', action: 'search' });
  const search = h.views.find(view => view.visible);
  search.webContents.url = 'https://muse.ai/thread/saved'; search.webContents.emit('did-navigate-in-page', {}, search.webContents.url, true);
  await h.browser.dispatch({ type: 'selectItem', id: saved.id });
  const chat = h.views.find(view => view.visible);
  assert.notEqual(chat, search, 'a tool document cannot also own a retained sidebar conversation');
  assert.equal(chat.webContents.getURL(), 'https://muse.ai/thread/saved'); chat.webContents.unsentDraft = 'Keep this chat draft';
  await h.browser.dispatch({ type: 'serviceAction', action: 'search' });
  assert.equal(search.visible, true); assert.equal(chat.visible, false);
  assert.equal(chat.webContents.unsentDraft, 'Keep this chat draft'); assert.equal(chat.webContents.loads.length, 1);
  assert.equal(chat.webContents.getURL(), 'https://muse.ai/thread/saved');
});

for (const [target, command, rootURL] of [
  ['muse-feed', { type: 'serviceAction', action: 'feed' }, 'https://muse.ai/'],
  ['meta-media', { type: 'metaAction', action: 'media' }, 'https://www.meta.ai/'],
]) test(`selecting ${target} during its warm root load preserves the pending initialization`, async t => {
  const h = routedTools(harness({ authReader: async () => 'ready', warmupDelay: 5, warmLimit: 1 })); t.after(() => h.browser.close());
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  const prototype = Object.getPrototypeOf(h.views[0].webContents), original = prototype.loadURL;
  let finishLoad, delayedContents;
  prototype.loadURL = function(url) {
    if (finishLoad || url !== rootURL) return original.call(this, url);
    delayedContents = this; this.loads.push(url); this.emit('did-start-loading');
    return new Promise(resolve => {
      finishLoad = () => { this.url = url; this.emit('did-navigate', {}, url); this.emit('did-stop-loading'); resolve(); };
    });
  };
  t.after(() => { prototype.loadURL = original; });
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'prewarm', target });
  await until(() => Boolean(finishLoad), 'the hinted tool should start loading its root document');
  await microtasks();
  const selected = h.browser.dispatch(command);
  await microtasks();
  finishLoad(); await selected;
  const view = h.views.find(candidate => candidate.webContents === delayedContents);
  assert.equal(view.visible, true); assert.equal(delayedContents.loads.length, 1);
  assert.equal([...h.actions, ...h.metaActions].filter(call => call.contents === delayedContents && call.action === command.action).length, 1, 'foreground selection must finish the shared warm initialization once');
  assert.equal(h.browser.snapshot().notice, null); assert.equal(h.browser.snapshot().compact, true);
});

test('an initialization completing after in-place account switching cannot cache the new account document', async t => {
  const h = harness(); t.after(() => h.browser.close());
  await h.browser.dispatch(layout);
  let release, calls = 0;
  h.presentation.action = async (contents, action) => {
    h.actions.push({ contents, action }); calls++;
    if (calls === 1) return new Promise(resolve => { release = resolve; });
    return true;
  };
  const selecting = h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  await until(() => Boolean(release), 'the old-account action should be pending');
  const feed = h.views.find(view => view.visible);
  await feed.webContents.loadURL('https://auth.muse.ai/login');
  await feed.webContents.loadURL('https://muse.ai/');
  assert.equal(feed.webContents.isDestroyed(), false, 'in-place sign-in must retain its returning document');
  release(true); await selecting;
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  assert.equal(feed.visible, true); assert.equal(calls, 2, 'a late old-account result must not skip initialization for the new account');
  assert.equal(h.browser.snapshot().notice, null); assert.equal(h.browser.snapshot().authenticating, false);
});

test('automatic warmup waits for authenticated visible use and caps unvisited tool documents', async t => {
  const h = routedTools(harness({ authReader: async () => 'ready', warmupDelay: 5, warmLimit: 2 })); t.after(() => h.browser.close());
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(h.views.length, 1, 'hidden startup must not warm remote tools');
  await h.browser.dispatch(layout);
  await until(() => h.actions.length + h.metaActions.length >= 2, 'authenticated visible use should warm useful tools');
  await new Promise(resolve => setTimeout(resolve, 30));
  const warmed = new Set([...h.actions, ...h.metaActions].filter(call => !call.contents.isDestroyed()).map(call => call.contents));
  assert(warmed.size <= 2, 'speculative tool documents must stay within the supplied limit');
  assert.equal(h.views.filter(view => view.visible).length, 1); assert.equal(h.browser.snapshot().destination, 'bot');
  assert(!h.metaActions.some(call => call.action === 'newChat'));
  assert(!h.actions.some(call => ['settings', 'connections', 'whatsapp'].includes(call.action)));
});

for (const { label, authStatus, navigationReady, shouldWarm, shouldCheckNavigation } of [
  { label: 'an unknown account with ready navigation', authStatus: 'unknown', navigationReady: true, shouldWarm: true, shouldCheckNavigation: true },
  { label: 'an explicitly signed-out account', authStatus: 'required', navigationReady: true, shouldWarm: false, shouldCheckNavigation: false },
  { label: 'an unknown account with incomplete navigation', authStatus: 'unknown', navigationReady: false, shouldWarm: false, shouldCheckNavigation: true },
]) test(`Meta warmup handles ${label}`, async t => {
  let authReads = 0; const navigationReads = [];
  const h = harness({ authReader: async () => { authReads++; return authStatus; }, warmupDelay: 1, warmLimit: 1 }); t.after(() => h.browser.close());
  h.metaAdapter.ready = async contents => { navigationReads.push(contents); return navigationReady; };
  await h.browser.dispatch(layout); const main = h.views.find(view => view.visible);
  await until(() => authReads > 0, 'warmup should check the foreground Meta account');
  if (shouldWarm) await until(() => h.metaActions.length > 0, 'a ready Meta sidebar should permit bounded background preparation');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(navigationReads.length > 0, shouldCheckNavigation, 'required sign-in must never fall back to navigation readiness');
  assert(navigationReads.every(contents => contents === main.webContents));
  assert.equal(h.metaActions.length, shouldWarm ? 1 : 0); assert.equal(h.actions.length, 0);
  assert.equal(h.views.filter(view => !view.webContents.isDestroyed()).length, shouldWarm ? 2 : 1);
  assert.equal(main.visible, true); assert.equal(h.browser.snapshot().destination, 'chat'); assert.equal(h.popups.length, 0);
});

test('warmup does not run for signed-out pages or after the workspace hides', async t => {
  const signedOut = harness({ authReader: async () => 'required', warmupDelay: 5 }); t.after(() => signedOut.browser.close());
  await signedOut.browser.dispatch(layout);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signedOut.views.length, 1); assert.equal(signedOut.actions.length + signedOut.metaActions.length, 0);
  const hidden = harness({ authReader: async () => 'ready', warmupDelay: 20 }); t.after(() => hidden.browser.close());
  await hidden.browser.dispatch(layout); await hidden.browser.dispatch({ type: 'layout', visible: false });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(hidden.views.length, 1); assert.equal(hidden.actions.length + hidden.metaActions.length, 0);
});

test('account authentication disposes cached tools but preserves its opener until the popup closes', async t => {
  const h = routedTools(harness()); t.after(() => h.browser.close());
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  const feed = h.views.find(view => view.visible);
  await h.browser.dispatch({ type: 'metaAction', action: 'media' }); const media = h.views.find(view => view.visible);
  media.webContents.openHandler({ url: 'https://auth.meta.ai/login' }).createWindow({});
  assert.equal(feed.webContents.isDestroyed(), true); assert.equal(media.webContents.isDestroyed(), false);
  assert.equal(h.browser.snapshot().authenticating, true);
  h.popups[0].destroy(); assert.equal(media.webContents.isDestroyed(), true);
  await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  const fresh = h.views.find(view => view.visible);
  assert.notEqual(fresh, feed); assert.equal(fresh.webContents.isDestroyed(), false);
  assert.equal(h.actions.filter(call => call.action === 'feed' && call.contents === fresh.webContents).length, 1);
});

test('signed-out Muse polling preserves a Meta tool draft when no Muse account was established', async t => {
  const h = routedTools(harness({ libraryAdapter: { prepare: async () => true, read: async () => ({ status: 'signed-out', items: [] }), activate: async () => false } }));
  t.after(() => h.browser.close());
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'metaAction', action: 'media' });
  const media = h.views.find(view => view.visible); media.webContents.unsentDraft = 'Unfinished Meta creation';
  for (let attempt = 0; attempt < 3; attempt++) {
    await h.browser.dispatch({ type: 'refreshLibrary' });
    assert.equal(media.webContents.isDestroyed(), false, 'an unavailable initial Muse account must not dispose the active Meta document');
    assert.equal(media.visible, true); assert.equal(media.webContents.unsentDraft, 'Unfinished Meta creation');
    assert.equal(media.webContents.loads.length, 1); assert.equal(h.browser.snapshot().destination, 'chat');
    assert.equal(h.browser.snapshot().library.chats.items.length, 0);
    for (const section of ['chats','ideas','goals']) assert.equal(h.browser.snapshot().library[section].status, 'signed-out', 'missing sign-in must never render an endless loading state');
  }
  assert.equal(h.metaActions.filter(call => call.contents === media.webContents && call.action === 'media').length, 1);
});

test('ready Muse authentication loads ideas and goals when the side-chat menu is unavailable', async t => {
  const adapter = {prepare:async()=>false, read:async(_contents,section)=>section==='chats'?{status:'unavailable',items:[]}:{status:'ready',items:[libraryItem(section)]},profile:async()=>({name:'jarvis',avatar:null})};
  const h = harness({libraryAdapter:adapter,authReader:async()=> 'ready',warmLimit:0}); t.after(()=>h.browser.close());
  await h.browser.dispatch({type:'refreshLibrary'});
  assert.equal(h.browser.snapshot().library.chats.status,'unavailable');
  for (const section of ['ideas','goals']) assert.equal(h.browser.snapshot().library[section].items.length,1);
  assert.equal(h.browser.snapshot().agentProfile.name,'jarvis');
});

test('verified sign-in clears a retained sign-in message even when side-chat metadata is unavailable', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let signedIn=false;
  const adapter={prepare:async()=>false,read:async(_contents,section)=>!signedIn?{status:'signed-out',items:[]}:section==='chats'?{status:'unavailable',items:[]}:{status:'ready',items:[libraryItem(section)]}};
  const h=harness({libraryAdapter:adapter,authReader:async()=>signedIn?'ready':'required',warmLimit:0}); t.after(()=>h.browser.close());
  await h.browser.dispatch(layout); t.mock.timers.tick(250); await microtasks();
  assert.equal(h.browser.snapshot().library.chats.status,'signed-out');
  signedIn=true; t.mock.timers.tick(1800); await microtasks(); await microtasks();
  assert.equal(h.browser.snapshot().library.chats.status,'unavailable','confirmed authentication must replace the old sign-in requirement');
  assert.equal(h.browser.snapshot().library.ideas.status,'ready');
});

test('an unresponsive collection reader releases the refresh lock and can recover', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const h = libraryHarness(); t.after(()=>h.browser.close());
  const original = h.libraryAdapter.read;
  let release;
  h.libraryAdapter.read = () => new Promise(resolve=>{release=resolve;});
  const pending = h.browser.dispatch({type:'refreshLibrary'}); await microtasks();
  assert.equal(typeof release,'function');
  t.mock.timers.tick(8000); await microtasks(); await pending;
  assert.equal(h.browser.snapshot().library.chats.status,'unavailable');
  h.libraryAdapter.read = original;
  await h.browser.dispatch({type:'refreshLibrary'});
  assert.equal(h.browser.snapshot().library.ideas.items.length,1);
  release({status:'ready',items:[libraryItem('chats','late')]}); await microtasks();
  assert.equal(h.browser.snapshot().library.chats.items[0].title,'chats item');
});

test('automatic collection polling expires repeated loading and keeps the error stable during retry', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const h=libraryHarness(); t.after(()=>h.browser.close());
  const original=h.libraryAdapter.read;
  h.libraryAdapter.read=(contents,section)=>section==='chats'?original(contents,section):{status:'loading',items:[]};
  await h.browser.dispatch(layout);
  t.mock.timers.tick(250); await microtasks();
  assert.equal(h.browser.snapshot().library.ideas.status,'loading');
  for(let attempt=0;attempt<10;attempt++){t.mock.timers.tick(1800);await microtasks();}
  for(const section of ['ideas','goals'])assert.equal(h.browser.snapshot().library[section].status,'unavailable');
  h.libraryAdapter.prepare=async(_contents,section)=>section==='chats'?true:new Promise(()=>{});
  const previousStates=h.states.length;
  t.mock.timers.tick(1800);await microtasks();
  assert(h.states.slice(previousStates).length>0);
  assert(h.states.slice(previousStates).every(value=>value.library.ideas.status==='unavailable'&&value.library.goals.status==='unavailable'),'background retries retain useful errors while the remote scripts wait');
  t.mock.timers.tick(6500);await microtasks();
  h.libraryAdapter.prepare=async()=>true;h.libraryAdapter.read=original;
  await h.browser.dispatch({type:'refreshLibrary'});
  assert.equal(h.browser.snapshot().library.ideas.status,'ready');
});

test('an established Muse account signing out invalidates cached account documents only once', async t => {
  const h = routedTools(libraryHarness()); t.after(() => h.browser.close());
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  assert(h.browser.snapshot().library.chats.items.length > 0);
  await h.browser.dispatch({ type: 'metaAction', action: 'media' }); const oldMedia = h.views.find(view => view.visible);
  h.libraryAdapter.read = async () => ({ status: 'signed-out', items: [] });
  await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(oldMedia.webContents.isDestroyed(), true, 'the ready-to-signed-out transition must invalidate retained account data');
  assert.equal(h.browser.snapshot().library.chats.items.length, 0);
  await h.browser.dispatch({ type: 'metaAction', action: 'media' });
  const freshMedia = h.views.find(view => view.visible); assert.notEqual(freshMedia, oldMedia);
  freshMedia.webContents.unsentDraft = 'New document after sign-out';
  for (let attempt = 0; attempt < 3; attempt++) await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(freshMedia.webContents.isDestroyed(), false, 'repeated signed-out reads must not repeat the account transition');
  assert.equal(freshMedia.visible, true); assert.equal(freshMedia.webContents.unsentDraft, 'New document after sign-out');
  assert.equal(freshMedia.webContents.loads.length, 1);
});

test('cached Muse tools clear sidebar chat selection and cannot adopt it by navigating to a thread', async t => {
  const h = routedTools(libraryHarness()); t.after(() => h.browser.close());
  const read = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => section === 'chats'
    ? { status: 'ready', items: [libraryItem('chats'), { key: 'saved', title: 'Saved chat', target: { type: 'link', value: '/thread/saved' } }], selectedKey: 'one' }
    : read(contents, section);
  await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const saved = h.browser.snapshot().library.chats.items.find(item => item.title === 'Saved chat'); assert(saved);
  await h.browser.dispatch({ type: 'serviceAction', action: 'feed' }); const feed = h.views.find(view => view.visible);
  await h.browser.dispatch({ type: 'selectItem', id: saved.id }); assert.equal(h.browser.snapshot().library.selectedId, saved.id);
  await h.browser.dispatch({ type: 'serviceAction', action: 'feed' });
  assert.equal(feed.visible, true); assert.equal(h.browser.snapshot().library.selectedId, null, 'the title and highlight must describe the tool instead of the previous chat');
  feed.webContents.url = 'https://muse.ai/thread/saved'; feed.webContents.emit('did-navigate-in-page', {}, feed.webContents.url, true);
  assert.equal(h.browser.snapshot().library.selectedId, null, 'a tool-owned document must not become the selected sidebar chat');
});

test('agent profile refreshes custom names and clears when the shared account signs out',async()=>{
 let profile={name:'jarvis',avatar:'data:image/png;base64,aGVsbG8='};
 const h=harness({libraryAdapter:{prepare:async()=>true,read:async()=>({status:'ready',items:[]}),activate:async()=>true,profile:async()=>profile}});
 await h.browser.dispatch({type:'navigate',destination:'bot'});await h.browser.dispatch({type:'refreshLibrary'});assert.deepEqual(h.browser.snapshot().agentProfile,profile);
 profile={name:'Muse',avatar:null};await h.browser.dispatch({type:'refreshLibrary'});assert.deepEqual(h.browser.snapshot().agentProfile,profile);
 await h.views[0].webContents.loadURL('https://auth.muse.ai/sign-in');assert.equal(h.browser.snapshot().agentProfile,null);h.browser.close();
});

test('Muse and Meta AI share the existing browser sign-in session while keeping separate documents',async()=>{
 const h=harness();await h.browser.dispatch({type:'navigate',destination:'bot'});const bot=h.views[0];
 await h.browser.dispatch({type:'navigate',destination:'chat'});const chat=h.views[1];
 assert.notEqual(bot.webContents,chat.webContents);assert.equal(bot.options.webPreferences.session,chat.options.webPreferences.session);
 assert.equal(h.sessions.size,1);assert(h.sessions.has('persist:musebench-personal-muse'));h.browser.close();
});

test('Meta AI authentication invalidates shared account metadata and refreshes retained Muse documents',async()=>{
 const h=libraryHarness();await h.browser.dispatch(layout);await h.browser.dispatch({type:'refreshLibrary'});
 const chat=h.views[0].webContents,bot=h.views[1].webContents;assert(h.browser.snapshot().library.chats.items.length);
 await chat.loadURL('https://auth.meta.ai/');assert.equal(h.browser.snapshot().library.chats.items.length,0);assert(h.browser.snapshot().authenticating);
 await chat.loadURL('https://www.meta.ai/');assert.equal(h.browser.snapshot().authenticating,false);
 const oldLoads=bot.loads.length;await h.browser.dispatch({type:'navigate',destination:'bot'});assert(bot.loads.length>oldLoads);h.browser.close();
});

test('appearance defaults and updates are isolated snapshots without creating remote views', async () => {
  const h = harness();
  assert.deepEqual(h.browser.snapshot().appearance, { theme: 'dark', textSize: 'medium', font: 'system', reducedMotion: false });
  const appearance = { theme: 'light', textSize: 'large', font: 'mono', reducedMotion: true };
  await h.browser.dispatch({ type: 'appearance', appearance });
  assert.deepEqual(h.browser.snapshot().appearance, appearance); assert.equal(h.views.length, 0);
  appearance.theme = 'dark'; const snapshot = h.browser.snapshot(); snapshot.appearance.font = 'system';
  assert.equal(h.browser.snapshot().appearance.theme, 'light'); assert.equal(h.browser.snapshot().appearance.font, 'mono');
  h.browser.close();
});

test('appearance changes reach retained and new documents without replacing drafts or resetting full-layout preference', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch({ type: 'navigate', destination: 'ideas' });
  const bot = h.views[0].webContents; bot.unsentDraft = 'Keep this draft';
  await h.browser.dispatch({ type: 'presentation', compact: false }); h.presentations.length = 0;
  const appearance = { theme: 'light', textSize: 'small', font: 'mono', reducedMotion: true };
  await h.browser.dispatch({ type: 'appearance', appearance });
  assert.equal(h.presentations.length, 2); assert(h.presentations.every(call => call.compact === false));
  assert(h.presentations.every(call => JSON.stringify(call.appearance) === JSON.stringify(appearance)));
  assert.equal(bot.loads.length, 1); assert.equal(bot.unsentDraft, 'Keep this draft'); assert.equal(h.browser.snapshot().compact, false);
  await h.browser.dispatch({ type: 'navigate', destination: 'goals' }); const goals = h.views[2].webContents;
  goals.emit('dom-ready'); await microtasks();
  assert.equal(h.presentations.at(-1).contents, goals); assert.deepEqual(h.presentations.at(-1).appearance, appearance);
  await assert.rejects(h.browser.dispatch({ type: 'appearance', appearance: { ...appearance, font: 'url(evil)' } }));
  assert.deepEqual(h.browser.snapshot().appearance, appearance); h.browser.close();
});

const libraryItem = (section, key = 'one') => ({ key, title: `${section} item`, target: section === 'chats' ? { type: 'main', value: '/' } : { type: 'title', value: `${section} item` } });
function libraryHarness() {
  const adapter = { prepare: async () => true, read: async (_contents, section) => ({ status: 'ready', items: [libraryItem(section)], selectedKey: section === 'chats' ? 'one' : null }), activate: async () => true };
  return harness({ libraryAdapter: adapter });
}
async function microtasks() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('explicit library refresh prepares retained collections without changing the active service', async () => {
  const h = libraryHarness(); await h.browser.dispatch(layout);
  await h.browser.dispatch({ type: 'refreshLibrary' });
  const state = h.browser.snapshot(); assert.equal(state.destination, 'chat');
  for (const section of ['chats', 'ideas', 'goals']) { assert.equal(state.library[section].status, 'ready'); assert.equal(state.library[section].items.length, 1); }
  assert.equal(state.library.selectedId, null); assert.equal(h.views.length, 4);
  assert.equal(h.views.filter(view => view.visible).length, 1); assert.equal(h.views[0].visible, true);
  assert.equal(JSON.stringify(state).includes('"target"'), false); assert.equal(JSON.stringify(state).includes('"key"'), false);
  h.browser.close();
});

test('native selection resolves existing opaque IDs and can reopen an idea preview without navigation', async () => {
  const h = libraryHarness(); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  let activations = 0; h.libraryAdapter.activate = async () => { activations++; return true; };
  const item = h.browser.snapshot().library.ideas.items[0];
  await assert.rejects(h.browser.dispatch({ type: 'selectItem', id: 'missing-item' }));
  await h.browser.dispatch({ type: 'selectItem', id: item.id });
  assert.equal(h.browser.snapshot().destination, 'ideas'); assert.equal(h.browser.snapshot().library.selectedId, item.id);
  await h.browser.dispatch({ type: 'selectItem', id: item.id }); assert.equal(activations, 2);
  const contents = h.views.find(view => view.visible).webContents;
  contents.url = 'https://muse.ai/ideas/another'; contents.emit('did-navigate-in-page', {}, contents.url, true);
  await h.browser.dispatch({ type: 'selectItem', id: item.id }); assert.equal(activations, 3, 'a changed document must reselect the requested item');
  h.browser.close();
});

test('a late collection read cannot publish titles after authentication or shutdown', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  let release; h.libraryAdapter.read = () => new Promise(resolve => { release = resolve; });
  const refreshing = h.browser.dispatch({ type: 'refreshLibrary' }); await microtasks(); assert.equal(typeof release, 'function');
  const contents = h.views[0].webContents; contents.url = 'https://auth.muse.ai/sign-in'; contents.emit('did-navigate', {}, contents.url);
  release({ status: 'ready', items: [libraryItem('chats')], selectedKey: 'one' }); await refreshing;
  assert.equal(h.browser.snapshot().library.chats.items.length, 0); assert.equal(h.browser.snapshot().library.selectedId, null);
  contents.url = 'https://muse.ai/'; contents.emit('did-navigate', {}, contents.url);
  const closing = h.browser.dispatch({ type: 'refreshLibrary' }); await microtasks(); h.browser.close();
  const count = h.states.length; release({ status: 'ready', items: [libraryItem('chats')] }); await closing;
  assert.equal(h.states.length, count, 'completed reads cannot publish after native teardown');
});

test('sign-out invalidates opaque item IDs and reloads stale other collections after a new sign-in', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  const old = h.browser.snapshot().library.ideas.items[0].id, ideas = h.views[1].webContents;
  const contents = h.views[0].webContents; contents.url = 'https://auth.muse.ai/sign-in'; contents.emit('did-navigate', {}, contents.url);
  assert.equal(h.browser.snapshot().library.ideas.items.length, 0); await assert.rejects(h.browser.dispatch({ type: 'selectItem', id: old }));
  contents.url = 'https://muse.ai/'; contents.emit('did-navigate', {}, contents.url);
  await h.browser.dispatch({ type: 'refreshLibrary' }); assert.equal(ideas.loads.length, 2, 'old account DOM is refreshed before its titles may be read');
  assert.notEqual(h.browser.snapshot().library.ideas.items[0].id, old);
  h.browser.close();
});

test('new Muse chat opens only the observed empty draft route and clears selection', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  await h.browser.dispatch({ type: 'newMuseChat' });
  assert.equal(h.browser.snapshot().destination, 'bot'); assert.equal(h.views.at(-1).webContents.loads.at(-1), 'https://muse.ai/thread/new');
  assert.equal(h.views[0].webContents.getURL(), 'https://muse.ai/');
  assert.equal(h.browser.snapshot().library.selectedId, null); h.browser.close();
});

test('navigation defeats late native selection', async () => {
  const h = libraryHarness(); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  let release; h.libraryAdapter.activate = () => new Promise(resolve => { release = resolve; });
  const id = h.browser.snapshot().library.ideas.items[0].id;
  const selecting = h.browser.dispatch({ type: 'selectItem', id }); await microtasks();
  await h.browser.dispatch({ type: 'navigate', destination: 'chat' }); release(true); await selecting;
  assert.equal(h.browser.snapshot().destination, 'chat'); assert.equal(h.browser.snapshot().library.selectedId, null);
  h.browser.close();
});

test('collection reads started before native item selection cannot clear that selection', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'ideas' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  const id = h.browser.snapshot().library.ideas.items[0].id;
  let release; const previous = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => section === 'ideas' ? new Promise(resolve => { release = resolve; }) : previous(contents, section);
  const refreshing = h.browser.dispatch({ type: 'refreshLibrary' }); await microtasks(); assert.equal(typeof release, 'function');
  await h.browser.dispatch({ type: 'selectItem', id }); release({ status: 'ready', items: [libraryItem('ideas')], selectedKey: null }); await refreshing;
  assert.equal(h.browser.snapshot().library.selectedId, id);
  h.browser.close();
});

test('an explicitly selected idea survives refresh when the official preview does not expose its selected key', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'ideas' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  const id = h.browser.snapshot().library.ideas.items[0].id;
  await h.browser.dispatch({ type: 'selectItem', id }); await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(h.browser.snapshot().library.selectedId, id);
  await h.browser.dispatch({ type: 'navigate', destination: 'goals' }); assert.equal(h.browser.snapshot().library.selectedId, null);
  h.browser.close();
});

test('visible personal workspace refreshes the native library and hiding or closing stops polling', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = libraryHarness(); let reads = 0; const read = h.libraryAdapter.read;
  h.libraryAdapter.read = (...args) => { reads++; return read(...args); };
  await h.browser.dispatch(layout); t.mock.timers.tick(250); await microtasks();
  assert.equal(h.browser.snapshot().library.ideas.items.length, 1);
  await h.browser.dispatch({ type: 'layout', visible: false }); const previous = reads;
  t.mock.timers.tick(10000); await microtasks(); assert.equal(reads, previous);
  h.browser.close(); t.mock.timers.tick(10000); await microtasks(); assert.equal(reads, previous);
});

test('a signed-out Muse form stays in place while background refresh clears prior account metadata', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  const contents = h.views[0].webContents, count = contents.loads.length;
  h.libraryAdapter.read = async () => ({ status: 'signed-out', items: [] });
  await h.browser.dispatch({ type: 'refreshLibrary' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(h.browser.snapshot().library.ideas.items.length, 0);
  assert.equal(contents.loads.length, count, 'polling must not repeatedly replace the sign-in form');
  h.browser.close();
});

test('new draft navigation leaves the independent collection reader and main conversation intact', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  let release; const previous = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => section === 'chats' ? new Promise(resolve => { release = resolve; }) : previous(contents, section);
  const refreshing = h.browser.dispatch({ type: 'refreshLibrary' }); await microtasks();
  h.views[0].webContents.loadURL = () => new Promise(() => {});
  await h.browser.dispatch({ type: 'newMuseChat' });
  release({ status: 'ready', items: [libraryItem('chats')], selectedKey: 'one' }); await refreshing;
  assert.equal(h.browser.snapshot().library.chats.items.length, 1);
  assert.equal(h.browser.snapshot().library.selectedId, null);
  assert.equal(h.views[0].webContents.getURL(), 'https://muse.ai/');
  h.browser.close();
});

test('retained native chat views navigate from validated catalog routes without needing a thread-page navigation list', async () => {
  const h = libraryHarness(); const read = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => section === 'chats' ? { status: 'ready', items: [libraryItem('chats'), ...['a', 'b'].map(key => ({ key, title: `Chat ${key}`, target: { type: 'link', value: `/thread/${key}` } }))], selectedKey: 'one' } : read(contents, section);
  h.libraryAdapter.activate = async () => { throw Error('Thread pages have no sidebar controls'); };
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const items = h.browser.snapshot().library.chats.items;
  await h.browser.dispatch({ type: 'selectItem', id: items[1].id }); const a = h.views.find(view => view.visible);
  a.webContents.unsentDraft = 'keep A'; assert.equal(a.webContents.getURL(), 'https://muse.ai/thread/a');
  await h.browser.dispatch({ type: 'selectItem', id: items[2].id }); const b = h.views.find(view => view.visible);
  assert.equal(b.webContents.getURL(), 'https://muse.ai/thread/b'); assert.notEqual(a, b);
  await h.browser.dispatch({ type: 'selectItem', id: items[1].id }); assert.equal(a.visible, true); assert.equal(a.webContents.unsentDraft, 'keep A'); assert.equal(a.webContents.loads.length, 1);
  await h.browser.dispatch({ type: 'selectItem', id: items[0].id }); assert.equal(h.views[0].visible, true); assert.equal(h.views[0].webContents.getURL(), 'https://muse.ai/');
  assert.equal(h.browser.snapshot().notice, null); h.browser.close();
});

test('New Muse chat returns to an unsent draft and retains a sent draft as its saved thread', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  await h.browser.dispatch({ type: 'newMuseChat' }); const first = h.views.find(view => view.visible);
  first.webContents.unsentDraft = 'unfinished';
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' }); await h.browser.dispatch({ type: 'newMuseChat' });
  assert.equal(first.visible, true); assert.equal(first.webContents.loads.length, 1); assert.equal(first.webContents.unsentDraft, 'unfinished');
  first.webContents.url = 'https://muse.ai/thread/saved'; first.webContents.emit('did-navigate-in-page', {}, first.webContents.url, true);
  await h.browser.dispatch({ type: 'newMuseChat' }); const second = h.views.find(view => view.visible);
  assert.notEqual(second, first); assert.equal(first.webContents.isDestroyed(), false); assert.equal(second.webContents.getURL(), 'https://muse.ai/thread/new');
  const read = h.libraryAdapter.read; h.libraryAdapter.read = (contents, section) => section === 'chats' ? { status: 'ready', items: [{ key: 'saved', title: 'Saved chat', target: { type: 'link', value: '/thread/saved' } }] } : read(contents, section);
  await h.browser.dispatch({ type: 'refreshLibrary' }); await h.browser.dispatch({ type: 'selectItem', id: h.browser.snapshot().library.chats.items[0].id });
  assert.equal(first.visible, true); assert.equal(first.webContents.loads.length, 1); h.browser.close();
});

test('Muse auth popups clear old metadata immediately, suspend reads, and close stale extra chats after completion', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const oldId = h.browser.snapshot().library.ideas.items[0].id;
  await h.browser.dispatch({ type: 'newMuseChat' }); const draft = h.views.find(view => view.visible);
  let release, calls = 0; const read = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => { calls++; return section === 'chats' ? new Promise(resolve => { release = resolve; }) : read(contents, section); };
  const refreshing = h.browser.dispatch({ type: 'refreshLibrary' }); await microtasks();
  draft.webContents.openHandler({ url: 'https://auth.muse.ai/login' }).createWindow({});
  assert.equal(h.browser.snapshot().library.ideas.items.length, 0); await assert.rejects(h.browser.dispatch({ type: 'selectItem', id: oldId }));
  release({ status: 'ready', items: [libraryItem('chats')] }); await refreshing;
  const before = calls; await h.browser.dispatch({ type: 'refreshLibrary' }); assert.equal(calls, before);
  assert.equal(draft.webContents.isDestroyed(), false, 'the authentication opener must remain alive during its popup flow');
  h.popups[0].destroy(); assert.equal(draft.webContents.isDestroyed(), true);
  h.libraryAdapter.read = read; await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(h.browser.snapshot().library.ideas.items.length, 1); assert.notEqual(h.browser.snapshot().library.ideas.items[0].id, oldId);
  h.browser.close();
});

test('Meta AI account popups invalidate the shared library at both authentication boundaries', async () => {
  const h = libraryHarness(); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const oldId = h.browser.snapshot().library.ideas.items[0].id;
  h.views[0].webContents.openHandler({ url: 'https://www.facebook.com/login' }).createWindow({});
  assert.equal(h.browser.snapshot().library.ideas.items.length, 0); h.popups[0].destroy();
  await h.browser.dispatch({type:'refreshLibrary'});
  assert.notEqual(h.browser.snapshot().library.ideas.items[0].id, oldId); h.browser.close();
});

test('known closed idea previews clear native selection on the next read', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'ideas' }); await h.browser.dispatch({ type: 'refreshLibrary' });
  const id = h.browser.snapshot().library.ideas.items[0].id;
  await h.browser.dispatch({ type: 'selectItem', id });
  const read = h.libraryAdapter.read; h.libraryAdapter.read = async (...args) => ({ ...await read(...args), selectionKnown: true });
  await h.browser.dispatch({ type: 'refreshLibrary' }); assert.equal(h.browser.snapshot().library.selectedId, null);
  h.browser.close();
});

test('repeated New Muse chat clicks during initial load reuse the same pending draft document', async () => {
  const h = libraryHarness(); await h.browser.dispatch(layout);
  const prototype = Object.getPrototypeOf(h.views[0].webContents), original = prototype.loadURL;
  prototype.loadURL = function(url) { if (url.endsWith('/thread/new')) { this.loads.push(url); return new Promise(() => {}); } return original.call(this, url); };
  try {
    await h.browser.dispatch({ type: 'newMuseChat' }); const count = h.views.length;
    await h.browser.dispatch({ type: 'newMuseChat' }); assert.equal(h.views.length, count);
  } finally { prototype.loadURL = original; h.browser.close(); }
});

test('auth redirects preserve the login document while disposing other retained account chats', async () => {
  const h = libraryHarness(); await h.browser.dispatch(layout);
  await h.browser.dispatch({ type: 'newMuseChat' }); const first = h.views.find(view => view.visible);
  first.webContents.url = 'https://muse.ai/thread/saved'; first.webContents.emit('did-navigate-in-page', {}, first.webContents.url, true);
  await h.browser.dispatch({ type: 'newMuseChat' }); const second = h.views.find(view => view.visible);
  second.webContents.url = 'https://auth.muse.ai/login'; second.webContents.emit('did-navigate', {}, second.webContents.url);
  assert.equal(first.webContents.isDestroyed(), true); assert.equal(second.webContents.isDestroyed(), false);
  await h.browser.dispatch({ type: 'refreshLibrary' }); assert.equal(second.webContents.getURL(), 'https://auth.muse.ai/login');
  h.browser.close();
});

test('retained Muse authentication suspends old reads and invalidates account documents again on return', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const bot = h.views[0].webContents, oldId = h.browser.snapshot().library.ideas.items[0].id;
  await h.browser.dispatch({ type: 'newMuseChat' }); const draft = h.views.find(view => view.visible).webContents;
  const originalRead = h.libraryAdapter.read; let release, reads = 0;
  h.libraryAdapter.read = (contents, section) => { reads++; return section === 'chats' ? new Promise(resolve => { release = resolve; }) : originalRead(contents, section); };
  const pending = h.browser.dispatch({ type: 'refreshLibrary' }); await microtasks();
  draft.url = 'https://auth.muse.ai/login'; draft.emit('did-navigate', {}, draft.url);
  assert.equal(h.browser.snapshot().library.ideas.items.length, 0);
  release({ status: 'ready', items: [libraryItem('chats')] }); await pending;
  h.libraryAdapter.read = (...args) => { reads++; return originalRead(...args); };
  const before = reads; await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(reads, before, 'old account DOM must not be read while any retained Muse authentication flow is pending');
  assert.equal(h.browser.snapshot().library.ideas.items.length, 0); assert.equal(draft.isDestroyed(), false);
  const loads = bot.loads.length;
  draft.url = 'https://muse.ai/thread/saved'; draft.emit('did-navigate', {}, draft.url);
  await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(bot.loads.length, loads + 1, 'returning from auth reloads old account collection documents before use');
  assert.notEqual(h.browser.snapshot().library.ideas.items[0].id, oldId); assert.equal(draft.isDestroyed(), false);
  h.browser.close();
});

test('explicit section selection reloads stale account documents while preserving the completing sign-in page', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const ideas = h.views[1].webContents, bot = h.views[0].webContents;
  bot.url = 'https://auth.muse.ai/login'; bot.emit('did-navigate', {}, bot.url);
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); assert.equal(bot.getURL(), 'https://auth.muse.ai/login');
  bot.url = 'https://muse.ai/'; bot.emit('did-navigate', {}, bot.url);
  const oldLoads = ideas.loads.length;
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' });
  assert.equal(ideas.loads.length, oldLoads + 1, 'explicit navigation cannot expose a stale account page before the background timer');
  h.browser.close();
});

test('a delayed old navigation commit cannot adopt the account generation created by a completed auth popup', async () => {
  const h = libraryHarness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout); await h.browser.dispatch({ type: 'refreshLibrary' });
  const bot = h.views[0].webContents, ideas = h.views[1].webContents;
  ideas.accountTitle = 'Previous account idea';
  let finishOldReload;
  ideas.reload = () => {
    const url = ideas.getURL(); ideas.loads.push(url); ideas.emit('did-start-loading');
    return new Promise(resolve => { finishOldReload = () => { ideas.url = url; ideas.emit('did-navigate', {}, url); ideas.emit('did-stop-loading'); resolve(); }; });
  };
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' }); await h.browser.dispatch({ type: 'reload' });
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  bot.openHandler({ url: 'https://auth.muse.ai/login' }).createWindow({}); h.popups[0].destroy();
  finishOldReload(); const oldLoadCount = ideas.loads.length;
  const load = ideas.loadURL.bind(ideas); ideas.loadURL = url => { ideas.accountTitle = 'Current account idea'; return load(url); };
  const read = h.libraryAdapter.read;
  h.libraryAdapter.read = (contents, section) => section === 'ideas' ? { status: 'ready', items: [{ key: 'i', title: contents.accountTitle, target: { type: 'title', value: contents.accountTitle } }] } : read(contents, section);
  await h.browser.dispatch({ type: 'refreshLibrary' });
  assert.equal(ideas.loads.length, oldLoadCount + 1, 'an old commit must remain stale and require a new-generation load');
  assert.equal(h.browser.snapshot().library.ideas.items[0].title, 'Current account idea');
  h.browser.close();
});

test('the Meta AI product opens regular chat on first use', async () => {
  const h = harness();
  assert.equal(h.browser.snapshot().destination, 'chat');
  await h.browser.dispatch(layout);
  assert.equal(h.views[0].webContents.loads.at(-1), 'https://www.meta.ai/');
  assert(h.sessions.has('persist:musebench-personal-muse'));
  h.browser.close();
});

test('personal services use isolated sandboxed sessions with no preload and denied device permissions', async () => {
  const h = harness();
  assert.equal(h.views.length, 0, 'web services are lazy');
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  await h.browser.dispatch(layout);
  const options = h.views[0].options.webPreferences;
  assert.equal(options.preload, undefined);
  assert.equal(options.nodeIntegration, false); assert.equal(options.contextIsolation, true); assert.equal(options.sandbox, true); assert.equal(options.webSecurity, true); assert.equal(options.webviewTag, false);
  const webSession = h.sessions.get('persist:musebench-personal-muse');
  assert.equal(options.session, webSession); assert.equal(webSession.check(), false);
  let granted; webSession.request(null, 'media', value => { granted = value; }); assert.equal(granted, false);
  assert.equal(webSession.device(), false);
  assert.equal(h.views[0].visible, true);
  h.browser.close();
});

test('mode switches retain each service web contents and hide native content under local overlays', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const muse = h.views[0];
  await h.browser.dispatch({ type: 'layout', visible: false }); assert.equal(muse.visible, false);
  await h.browser.dispatch(layout); assert.equal(muse.visible, true);
  await h.browser.dispatch({ type: 'navigate', destination: 'chat' });
  assert.equal(muse.visible, false); assert.equal(h.views[1].visible, true);
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  assert.equal(muse.visible, true); assert.equal(h.views[1].visible, false); assert.equal(muse.webContents.loads.length, 1, 'switching must preserve website drafts');
  h.browser.close();
});

test('bot, Ideas and Goals retain independent pages in the existing shared Muse session', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const muse = h.views[0];
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' });
  assert.equal(h.views.length, 2, 'Ideas gets its own retained page');
  const ideas = h.views[1];
  assert.equal(ideas.webContents.loads.at(-1), 'https://muse.ai/ideas');
  assert.equal(h.browser.snapshot().destination, 'ideas'); assert.equal(h.browser.snapshot().available.ideas, true);
  await h.browser.dispatch({ type: 'navigate', destination: 'goals' });
  const goals = h.views[2];
  assert.equal(goals.webContents.loads.at(-1), 'https://muse.ai/goals');
  assert.equal(h.browser.snapshot().destination, 'goals'); assert.equal(h.browser.snapshot().available.goals, true);
  assert.equal(h.views.length, 3); assert.equal(h.sessions.size, 1); assert.equal(goals.visible, true);
  assert.equal(muse.options.webPreferences.session, ideas.options.webPreferences.session);
  assert.equal(ideas.options.webPreferences.session, goals.options.webPreferences.session);
  await assert.rejects(h.browser.dispatch({ type: 'navigate', destination: 'goals', url: 'https://evil.example/' }));
  assert.equal(goals.webContents.loads.at(-1), 'https://muse.ai/goals');
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  assert.equal(muse.webContents.loads.length, 1, 'bot draft remains in its retained document');
  await h.browser.dispatch({ type: 'navigate', destination: 'ideas' });
  assert.equal(ideas.webContents.loads.length, 1, 'Ideas draft remains in its retained document');
  h.browser.close();
});

test('blocked navigations and load errors remain recoverable without leaking authentication data', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const contents = h.views[0].webContents;
  let prevented = false;
  contents.emit('will-redirect', { url: 'https://evil.example/?secret=oauth-token', isMainFrame: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert(h.browser.snapshot().error); assert.equal(h.views[0].visible, false);
  await h.browser.dispatch({ type: 'reload' }); assert.equal(h.browser.snapshot().error, null); assert.equal(h.views[0].visible, true);
  contents.url = 'https://auth.muse.ai/aymh/?secret=oauth-token'; contents.emit('did-navigate', {}, contents.url);
  assert.equal(h.browser.snapshot().origin, 'https://auth.muse.ai');
  contents.emit('did-fail-load', {}, -105, 'private auth URL oauth-token', contents.url, true);
  assert(h.browser.snapshot().error); assert.equal(JSON.stringify(h.states).includes('oauth-token'), false);
  await h.browser.dispatch({ type: 'openExternal' }); assert.deepEqual(h.external, ['https://muse.ai/']);
  assert.deepEqual(contents.openHandler({ url: 'https://evil.example/' }), { action: 'deny' });
  h.browser.close();
});

test('renderer reload and shutdown remove native overlays and close owned contents', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  h.window.webContents.zoom = 1.25; h.window.emit('resize');
  assert.deepEqual(h.views[0].bounds, { x: 375, y: 100, width: 625, height: 600 });
  h.window.webContents.emit('did-start-navigation', { isMainFrame: true });
  assert.equal(h.views[0].visible, false); assert.equal(h.browser.snapshot().visible, false);
  await h.browser.dispatch(layout); assert.equal(h.views[0].visible, true);
  h.window.webContents.emit('render-process-gone', {}, { reason: 'crashed' }); assert.equal(h.views[0].visible, false);
  h.browser.close(); assert.equal(h.views[0].webContents.destroyed, true); assert.equal(h.window.contentView.children.length, 0);
});

test('only selected application shortcuts are forwarded from focused remote pages', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  let prevented = 0; const event = { preventDefault() { prevented++; } };
  for (const key of [',', 'b', 'k', 'n']) h.views[0].webContents.emit('before-input-event', event, { type: 'keyDown', control: true, key });
  assert.deepEqual(h.shortcuts, [',', 'b', 'k', 'n']); assert.equal(prevented, 4);
  for (const key of ['ArrowLeft', 'ArrowRight']) h.views[0].webContents.emit('before-input-event', event, { type: 'keyDown', alt: true, key });
  assert.deepEqual(h.shortcuts, [',', 'b', 'k', 'n', 'back', 'forward']); assert.equal(prevented, 6);
  for (const input of [{type:'keyUp',alt:true,key:'ArrowLeft'},{type:'keyDown',alt:true,control:true,key:'ArrowLeft'},{type:'keyDown',key:'ArrowRight'}]) h.views[0].webContents.emit('before-input-event', event, input);
  assert.equal(prevented, 6);
  h.browser.close();
});

test('destroying the local renderer hides personal contents without querying its destroyed object', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  h.window.webContents.destroyed = true;
  assert.doesNotThrow(() => h.window.webContents.emit('destroyed'));
  assert.equal(h.views[0].visible, false);
  h.browser.close();
});

test('retry after a failed initial navigation reloads the curated destination instead of a blank page', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  const contents = h.views[0].webContents;
  contents.url = '';
  contents.emit('did-fail-load', {}, -105, 'private auth failure', 'https://muse.ai/', true);
  await h.browser.dispatch({ type: 'reload' });
  assert.equal(contents.loads.at(-1), 'https://muse.ai/');
  assert.equal(h.browser.snapshot().error, null);
  h.browser.close();
});

test('a prevented native close preserves personal contents for continued use', async () => {
  const h=harness();await h.browser.dispatch({type:'navigate',destination:'bot'});await h.browser.dispatch(layout);
  const remote=h.views[0].webContents;h.window.emit('close',{defaultPrevented:true});
  assert.equal(remote.destroyed,false);await h.browser.dispatch({type:'navigate',destination:'ideas'});
  h.window.emit('close',{defaultPrevented:false});assert.equal(remote.destroyed,true);
});

test('native window close cleans up before destruction and never reads destroyed window getters', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const localContents = h.window.webContents;
  const remoteContents = h.views[0].webContents;
  h.window.emit('close');
  assert.equal(remoteContents.destroyed, true, 'owned remote contents close before the native window is destroyed');
  Object.defineProperty(h.window, 'webContents', { get() { throw Error('Object has been destroyed'); } });
  h.window.isDestroyed = () => true;
  assert.doesNotThrow(() => h.window.emit('closed'));
  assert.doesNotThrow(() => h.browser.close());
  assert.equal(localContents.listenerCount('destroyed'), 0);
});

test('shutdown tolerates an already destroyed native view while still closing its contents', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  const remoteContents = h.views[0].webContents;
  h.views[0].setVisible = () => { throw Error('Object has been destroyed'); };
  Object.defineProperty(h.views[0], 'webContents', { get() { throw Error('Object has been destroyed'); } });
  assert.doesNotThrow(() => h.browser.close());
  assert.equal(remoteContents.destroyed, true);
});

test('observed routes synchronize the active section without switching views or reacting to hidden navigation', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const bot = h.views[0];
  bot.webContents.url = 'https://muse.ai/goals/some-goal?private=hidden';
  bot.webContents.emit('did-navigate-in-page', {}, bot.webContents.url, true);
  assert.equal(h.browser.snapshot().destination, 'goals');
  assert.equal(bot.visible, true); assert.equal(h.views.length, 1);
  await h.browser.dispatch({ type: 'navigate', destination: 'chat' });
  bot.webContents.emit('did-navigate', {}, 'https://muse.ai/ideas');
  assert.equal(h.browser.snapshot().destination, 'chat');
  await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  assert.equal(bot.webContents.loads.at(-1), 'https://muse.ai/', 'explicit bot selection restores its section after website navigation moved away');
  assert.equal(h.browser.snapshot().destination, 'bot');
  assert.equal(JSON.stringify(h.states).includes('private=hidden'), false);
  h.browser.close();
});

test('presentation and official service actions are finite, recoverable and scoped to the bot view', async () => {
  const h = harness(); await h.browser.dispatch(layout);
  assert.equal(h.browser.snapshot().compact, true);
  await h.browser.dispatch({ type: 'presentation', compact: false });
  assert.equal(h.browser.snapshot().compact, false);
  assert.equal(h.presentations.at(-1).compact, false);
  await h.browser.dispatch({ type: 'serviceAction', action: 'whatsapp' });
  assert.equal(h.browser.snapshot().destination, 'bot');
  assert.equal(h.actions.at(-1).action, 'whatsapp');
  assert.equal(h.actions.at(-1).contents, h.views[1].webContents);
  h.presentation.action = async () => false;
  await h.browser.dispatch({ type: 'presentation', compact: true });
  await h.browser.dispatch({ type: 'serviceAction', action: 'connections' });
  assert.equal(h.browser.snapshot().compact, false);
  assert(h.browser.snapshot().notice); assert.equal(h.browser.snapshot().error, null); assert.equal(h.views[1].visible, true);
  await h.browser.dispatch({ type: 'dismissNotice' }); assert.equal(h.browser.snapshot().notice, null);
  h.presentation.apply = async () => { throw Error('Adapter unavailable'); };
  await assert.doesNotReject(h.browser.dispatch({ type: 'presentation', compact: true }));
  h.browser.close();
});

test('official authentication popups preserve the opener session and isolation without exposing URLs', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const parent = h.views[0].webContents;
  const request = parent.openHandler({ url: 'https://www.facebook.com/login/?private=oauth-token' });
  assert.equal(request.action, 'allow'); assert.equal(typeof request.createWindow, 'function');
  const child = request.createWindow({ webPreferences: { preload: 'bad.js', nodeIntegration: true, sandbox: false, contextIsolation: false, webSecurity: false }, width: 9000, frame: false, x: -100000, y: -100000, fullscreen: true });
  const popup = h.popups[0];
  assert.equal(child, popup.webContents);
  assert.equal(popup.options.parent, h.window);
  assert.equal(popup.options.frame, true); assert.equal(popup.options.fullscreen, false);
  assert.equal('x' in popup.options, false); assert.equal('y' in popup.options, false);
  assert.equal(popup.options.webPreferences.session, h.views[0].options.webPreferences.session);
  assert.equal(popup.options.webPreferences.preload, undefined);
  for (const flag of ['sandbox', 'contextIsolation', 'webSecurity']) assert.equal(popup.options.webPreferences[flag], true);
  for (const flag of ['nodeIntegration', 'webviewTag']) assert.equal(popup.options.webPreferences[flag], false);
  assert.equal(h.browser.snapshot().authWindowOpen, true);
  assert.equal(h.browser.snapshot().authenticating, true);
  child.emit('did-navigate', {}, 'https://auth.muse.ai/callback?private=oauth-token');
  assert.equal(JSON.stringify(h.states).includes('oauth-token'), false);
  assert.equal(popup.title.includes('oauth-token'), false);
  assert.equal(child.openHandler({ url: 'https://www.facebook.com/' }).action, 'deny');
  let prevented = false;
  child.emit('will-redirect', { url: 'https://evil.example/', isMainFrame: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert(h.browser.snapshot().notice); assert.equal(h.browser.snapshot().error, null); assert.equal(h.views[0].visible, true);
  popup.destroy();
  assert.equal(h.browser.snapshot().authWindowOpen, false); assert.equal(h.browser.snapshot().authenticating, false);
  h.browser.close();
});

test('blocked secondary actions preserve the usable document and only one owned popup may open', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const contents = h.views[0].webContents;
  assert.equal(contents.openHandler({ url: 'https://evil.example/' }).action, 'deny');
  assert(h.browser.snapshot().notice); assert.equal(h.browser.snapshot().error, null); assert.equal(h.views[0].visible, true);
  await h.browser.dispatch({ type: 'dismissNotice' });
  let prevented = false;
  h.sessions.get('persist:musebench-personal-muse').emit('will-download', { preventDefault() { prevented = true; } }, {}, contents);
  assert.equal(prevented, true); assert(h.browser.snapshot().notice); assert.equal(h.views[0].visible, true);
  const response = contents.openHandler({ url: 'https://auth.muse.ai/' });
  response.createWindow({});
  assert.equal(contents.openHandler({ url: 'https://www.facebook.com/' }).action, 'deny');
  assert.equal(h.popups.length, 1); assert.equal(h.popups[0].focused, true);
  h.window.emit('close');
  assert.equal(h.popups[0].isDestroyed(), true); assert.equal(contents.isDestroyed(), true);
  assert.doesNotThrow(() => h.browser.close());
});

test('a first service action waits for the bot document commit and cancellation leaves the next section alone', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' }); await h.browser.dispatch(layout);
  const contents = h.views[0].webContents;
  contents.url = '';
  const pending = h.browser.dispatch({ type: 'serviceAction', action: 'connections' });
  await Promise.resolve();
  assert.equal(h.actions.length, 0, 'no action may run against a blank initial document');
  contents.emit('did-fail-load', {}, -105, 'Subframe unavailable', 'https://example.test/widget', false);
  contents.emit('did-fail-load', {}, -3, 'Previous provisional navigation aborted', 'https://muse.ai/', true);
  await Promise.resolve();
  assert.equal(h.browser.snapshot().notice, null, 'subframe failures and aborted provisional loads must not cancel the valid main document');
  contents.url = 'https://muse.ai/'; contents.emit('did-navigate', {}, contents.url);
  await pending; assert.equal(h.actions.length, 1);
  contents.url = '';
  const cancelled = h.browser.dispatch({ type: 'serviceAction', action: 'whatsapp' });
  await h.browser.dispatch({ type: 'navigate', destination: 'chat' });
  await cancelled;
  assert.equal(h.actions.length, 1); assert.equal(h.browser.snapshot().destination, 'chat');
  assert.equal(h.browser.snapshot().notice, null); assert.equal(h.browser.snapshot().compact, true);
  h.browser.close();
});

test('service action waits for a requested section reload instead of using the previous Muse document', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  const contents = h.views[0].webContents;
  contents.url = 'https://muse.ai/goals'; contents.emit('did-navigate', {}, contents.url);
  let finishLoad;
  contents.loadURL = () => new Promise(resolve => { finishLoad = resolve; });
  const pending = h.browser.dispatch({ type: 'serviceAction', action: 'settings' });
  await Promise.resolve(); assert.equal(h.actions.length, 0);
  contents.url = 'https://muse.ai/'; contents.emit('did-navigate', {}, contents.url); finishLoad();
  await pending; assert.equal(h.actions.length, 1);
  h.browser.close();
});

test('auth redirects do not wait for app controls, and shutdown releases pending first-load actions', async () => {
  const h = harness(); await h.browser.dispatch({ type: 'navigate', destination: 'bot' });
  const contents = h.views[0].webContents;
  contents.url = 'https://auth.muse.ai/sign-in'; contents.emit('did-navigate', {}, contents.url);
  await h.browser.dispatch({ type: 'serviceAction', action: 'whatsapp' });
  assert.equal(h.actions.length, 0); assert.equal(h.browser.snapshot().authenticating, true);
  assert(h.browser.snapshot().notice); assert.equal(h.browser.snapshot().error, null);
  contents.url = '';
  const pending = h.browser.dispatch({ type: 'serviceAction', action: 'settings' });
  h.browser.close(); await pending;
  assert.equal(h.actions.length, 0); assert.equal(contents.isDestroyed(), true);
});

test('mandatory sign-in uses the same isolated session and closes only after a ready account',async()=>{
 const h=harness();assert.equal((await h.browser.checkLogin()).status,'unknown');
 await h.browser.openLogin();const popup=h.popups[0];assert.equal(popup.webContents.getURL(),'https://muse.ai/');
 assert.equal(popup.options.webPreferences.session,h.views[0].options.webPreferences.session);
 assert.equal(popup.options.webPreferences.nodeIntegration,false);assert.equal(popup.options.webPreferences.sandbox,true);assert.equal(popup.options.webPreferences.preload,undefined);
 popup.webContents.executeJavaScript=async()=> 'required';assert.equal((await h.browser.checkLogin()).status,'required');assert.equal(popup.destroyed,false);
 await h.browser.openLogin();assert.equal(h.popups.length,1);
 popup.webContents.executeJavaScript=async()=> 'ready';assert.equal((await h.browser.checkLogin()).status,'ready');assert.equal(popup.destroyed,true);h.browser.close();
});


test('Meta apps refresh uses a disposable official document without changing the current chat or draft',async t=>{
 const calls=[];const h=harness({warmLimit:0,metaAdapter:{settings:async(c,s)=>{calls.push([c,s]);return true;},dismiss:async()=>true},metaAppsAdapter:{read:async()=>({status:'ready',items:[{id:'gmail',status:'connected'},{id:'evil',status:'connected'}]}),connect:async()=>true}});t.after(()=>h.browser.close());
 await h.browser.dispatch({type:'navigate',destination:'bot'});await h.browser.dispatch(layout);const before=h.views[0];before.webContents.draft='preserve';
 const result=await h.browser.dispatch({type:'metaApps',action:'refresh'});
 assert.equal(result.metaApps.status,'ready');assert.equal(result.metaApps.items.length,8);assert.equal(result.metaApps.items.find(x=>x.id==='gmail').status,'connected');assert.equal(result.destination,'bot');assert.equal(before.webContents.draft,'preserve');assert.equal(h.views.length,1);assert.equal(h.popups.length,1);assert.equal(h.popups[0].destroyed,true);assert.equal(h.popups[0].shown,undefined);assert.equal(calls[0][1],'apps');assert.equal(calls[0][0].getURL(),'https://www.meta.ai/');
});

test('Meta apps navigation cancels pending reads and never publishes stale account status',async t=>{
 let finish,signal;const h=harness({warmLimit:0,metaAdapter:{settings:async()=>true,dismiss:async()=>true},metaAppsAdapter:{read:async(_c,o)=>{signal=o.signal;return new Promise(r=>{finish=r;});},connect:async()=>true}});t.after(()=>h.browser.close());
 const pending=h.browser.dispatch({type:'metaApps',action:'refresh'});while(!finish)await new Promise(r=>setImmediate(r));
 await h.browser.dispatch({type:'navigate',destination:'bot'});assert.equal(signal.aborted,true);finish({status:'ready',items:[{id:'gmail',status:'connected'}]});await pending;
 assert.notEqual(h.browser.snapshot().metaApps.status,'ready');assert.equal(h.popups[0].destroyed,true);
});

test('Meta app connect opens exact selected official app but does not infer authorization success',async t=>{
 const calls=[];const h=harness({warmLimit:0,metaAdapter:{settings:async()=>true,dismiss:async()=>true},metaAppsAdapter:{read:async()=>({status:'ready',items:[]}),connect:async(c,id)=>{calls.push({c,id});return true;}}});t.after(()=>h.browser.close());
 const result=await h.browser.dispatch({type:'metaApps',action:'connect',appId:'gmail'});assert.equal(result.destination,'chat');assert.equal(calls[0].id,'gmail');assert.equal(calls[0].c,h.views[0].webContents);assert.equal(result.metaApps.items.find(x=>x.id==='gmail').status,'unknown');
});


test('Meta app refresh deduplicates focus events and clears on authentication boundaries',async t=>{
 let finish,calls=0;const h=harness({warmLimit:0,metaAdapter:{settings:async()=>true,dismiss:async()=>true},metaAppsAdapter:{read:async()=>{calls++;return new Promise(r=>{finish=r;});}}});t.after(()=>h.browser.close());
 await h.browser.dispatch({type:'navigate',destination:'chat'});
 const a=h.browser.dispatch({type:'metaApps',action:'refresh'}),b=h.browser.dispatch({type:'metaApps',action:'refresh'});while(!finish)await new Promise(r=>setImmediate(r));assert.equal(calls,1);
 await h.views[0].webContents.loadURL('https://auth.meta.com/login');finish({status:'ready',items:[{id:'gmail',status:'connected'}]});await Promise.all([a,b]);assert.equal(h.browser.snapshot().metaApps.status,'idle');assert.equal(h.browser.snapshot().metaApps.items.find(x=>x.id==='gmail').status,'unknown');assert.equal(h.popups[0].destroyed,true);
});

test('Meta apps timeout and close settle unresponsive adapters without leaving hidden documents',{timeout:15000},async t=>{
 const h=harness({warmLimit:0,metaAdapter:{settings:async()=>new Promise(()=>{}),dismiss:async()=>true}});t.after(()=>h.browser.close());
 const start=Date.now();const result=await h.browser.dispatch({type:'metaApps',action:'refresh'});assert.equal(result.metaApps.status,'unavailable');assert(Date.now()-start<10000);assert.equal(h.popups[0].destroyed,true);
 const pending=h.browser.dispatch({type:'metaApps',action:'refresh'});await new Promise(r=>setImmediate(r));h.browser.close();await pending;assert.equal(h.popups[1].destroyed,true);
});
