import {readPersonalAuth} from './personal-auth.mjs';
import {readMetaAccount} from './personal-account.mjs';
import {createPersonalAccountSync} from './personal-account-sync.mjs';
import {readMetaSchedules,activateMetaSchedule,scheduledDocument} from './meta-schedules.mjs';
import {runMetaAction,dismissMetaSearch,metaNavigationReady} from './meta-navigation.mjs';
import {readAgentProfile} from './personal-agent.mjs';
import { allowedPersonalPopupURL, allowedPersonalURL, clampPersonalBounds, personalAuthenticating, personalAvailability, personalOrigin, personalRoute, personalService, personalTarget, validatePersonalCommand } from './personal-policy.mjs';
import { applyPersonalPresentation, runPersonalAction, readPersonalToolState } from './personal-presentation.mjs';
import { createPersonalCatalog } from './personal-catalog.mjs';

const collectionSlots = Object.freeze({ chats: 'bot', ideas: 'ideas', goals: 'goals' });
const toolTargets = Object.freeze({
  'muse-search': { slot: 'bot', action: 'search' },
  'muse-feed': { slot: 'bot', action: 'feed' },
  'muse-library': { slot: 'bot', action: 'library' },
  'meta-search': { slot: 'chat', action: 'search' },
  'meta-media': { slot: 'chat', action: 'media' },
  'meta-artifacts': { slot: 'chat', action: 'artifacts' },
  'meta-scheduled': { slot: 'chat', action: 'scheduled' },
  'meta-vibes': { slot: 'chat', action: 'vibes' },
});
const warmDefaults = Object.freeze({
  bot: ['ideas', 'goals', 'muse-feed', 'muse-library', 'muse-search'],
  chat: ['meta-media', 'meta-artifacts', 'meta-search', 'meta-scheduled', 'meta-vibes'],
});
const defaultLibraryAdapter = {
  prepare: async (...args) => (await import('./personal-library.mjs')).preparePersonalCollection(...args),
  read: async (...args) => (await import('./personal-library.mjs')).readPersonalCollection(...args),
  activate: async (...args) => (await import('./personal-library.mjs')).activatePersonalItem(...args),
  profile: readAgentProfile,
};

// Only the trusted local main frame calls this controller. Remote contents have
// no preload and never receive project state, credentials, or the local bridge.
export function createPersonalBrowser({ window, BrowserWindow, WebContentsView, session, shell, onState = () => {}, onShortcut = () => {}, presentation = { apply: applyPersonalPresentation, action: runPersonalAction, state: readPersonalToolState }, libraryAdapter = defaultLibraryAdapter, metaAdapter = { action: runMetaAction, dismiss: dismissMetaSearch, ready: metaNavigationReady }, authReader = readPersonalAuth, accountReader = readMetaAccount, accountTiming = {}, warmupDelay = 800, warmLimit = 3 }) {
  // Native getters can throw after destruction: cache contents while alive.
  const localContents = window.webContents;
  const entries = new Map(), serviceSessions = new Map(), popups = new Set(), pendingReady = new Set();
  let destination = 'chat', activeEntry = null, requestedVisible = false, cssBounds = null, closed = false;
  let compact = true, notice = null, actionEpoch = 0;
  let appearance = { theme: 'dark', textSize: 'medium', font: 'system', reducedMotion: false };
  const catalog = createPersonalCatalog();
  let libraryGeneration = 0, libraryEstablished = false, libraryTimer = null, refreshingLibrary = null;
  let selectedDocument = null;
  let agentProfile = null;
  let schedules = null, scheduleReading = false, scheduleTimer = null;
  let extraEntrySequence = 0, setupLoginWindow = null, knownLogin = 'unknown';
  const warmHints = new Set(), warmAttempted = new Set();
  let warmTimer = null, warming = false, warmBlocked = false;
  const warmCapacity = Math.max(0, Math.min(3, Number.isFinite(warmLimit) ? warmLimit : 3));
  const alive = entry => Boolean(entry && !entry.contents.isDestroyed());
  const current = () => activeEntry;
  const accountSync = createPersonalAccountSync({
    ...accountTiming,
    read: accountReader ?? readMetaAccount,
    enabled: () => Boolean(accountReader) && !closed && !setupLoginWindow && !museAuthPending(),
    source: () => {
      const candidates = [...new Set([current(), entries.get('chat'), ...entries.values()])];
      const eligible = entry => alive(entry) && !entry.error && !entry.awaitingCommit && !entry.museAuth && entry.collectionGeneration === libraryGeneration && ['https://www.meta.ai','https://meta.ai'].includes(personalOrigin(entry.contents.getURL()));
      const entry = candidates.find(eligible);
      if (!entry) return null;
      const generation = libraryGeneration, epoch = entry.documentEpoch, url = entry.contents.getURL();
      return { contents: entry.contents, valid: () => !closed && eligible(entry) && generation === libraryGeneration && epoch === entry.documentEpoch && url === entry.contents.getURL() };
    },
    openDocument: openAccountDocument,
    onChange: () => { if (!closed) onState(snapshot()); },
  });

  async function checkLogin(){
    if(closed)return {status:'unknown'};
    if(setupLoginWindow&&!setupLoginWindow.isDestroyed()){
      const status=await readPersonalAuth(setupLoginWindow.webContents);
      if(status==='ready'){knownLogin='ready';setupLoginWindow.close();const entry=current();if(alive(entry))entry.contents.reload();return {status:'ready'};}
      return {status:status==='required'?'required':'unknown',message:'Complete sign-in in the account window.'};
    }
    const entry=alive(current())?current():selectDestination('bot');
    let status=await readPersonalAuth(entry.contents);
    if(status==='unknown'&&entry.slot!=='bot'&&alive(entries.get('bot')))status=await readPersonalAuth(entries.get('bot').contents);
    if(status!=='unknown')knownLogin=status;
    return {status:knownLogin};
  }
  async function openLogin(){
    if(closed)return;
    if(setupLoginWindow&&!setupLoginWindow.isDestroyed()){setupLoginWindow.show();setupLoginWindow.focus();return;}
    const entry=alive(current())?current():selectDestination('bot'),owner=getServiceSession('muse');
    const target=personalTarget(destination==='chat'?'chat':'bot');
    const login=new BrowserWindow({parent:window,width:620,height:800,minWidth:390,minHeight:600,show:false,autoHideMenuBar:true,title:'Sign in to Muse',webPreferences:remotePreferences(owner.webSession)});
    const loginContents=login.webContents;
    setupLoginWindow=login;owner.owned.add(loginContents);
    guardContents(login.webContents,()=>inform('This sign-in redirect is not supported.'));
    login.webContents.setWindowOpenHandler(details=>openHandler({...entry,contents:login.webContents},owner,details));
    login.once('ready-to-show',()=>{if(!closed&&!login.isDestroyed()){login.show();login.focus();}});
    login.once('closed',()=>{owner.owned.delete(loginContents);setupLoginWindow=null;if(!closed&&alive(entry))entry.contents.reload();});
    await login.loadURL(target);
  }
  function snapshot() {
    const entry = current(), contents = alive(entry) ? entry.contents : null;
    return {
      destination, loading: Boolean(entry?.loading || (entry?.initializing && !entry?.initialized)), origin: entry?.origin ?? personalOrigin(personalTarget(destination)),
      error: entry?.error ?? null, canGoBack: Boolean(contents?.navigationHistory.canGoBack()),
      canGoForward: Boolean(contents?.navigationHistory.canGoForward()), visible: Boolean(entry?.visible),
      available: personalAvailability(), compact, notice,
      appearance: { ...appearance }, profile: accountSync.snapshot(), agentProfile, schedules: destination==='chat'&&alive(entry)&&scheduledDocument(contents)?schedules:null,
      authenticating: Boolean(personalAuthenticating(entry?.origin) || museAuthPending() || [...popups].some(popup => personalAuthenticating(popup.origin))),
      authWindowOpen: popups.size > 0,
      library: catalog.snapshot(),
    };
  }
  function applyLayout() {
    if (closed || window.isDestroyed()) return;
    const bounds = cssBounds && !localContents.isDestroyed() ? clampPersonalBounds(cssBounds, localContents.getZoomFactor(), window.getContentSize()) : null;
    let hiddenFocusedSurface = false;
    for (const entry of entries.values()) {
      if (!alive(entry)) continue;
      const visible = Boolean(requestedVisible && entry === current() && !entry.error && bounds?.width && bounds?.height);
      if (bounds && entry === current()) entry.view.setBounds(bounds);
      if (entry.visible && !visible) hiddenFocusedSurface = true;
      entry.view.setVisible(visible); entry.visible = visible;
    }
    if (hiddenFocusedSurface && !localContents.isDestroyed()) localContents.focus();
  }
  function publish() { if (!closed) { applyLayout(); onState(snapshot()); scheduleLibrary(); scheduleRefresh(); scheduleWarmup(); } }
  function stopWarmup(discardPending = false) {
    clearTimeout(warmTimer); warmTimer = null;
    if (discardPending) {
      warmHints.clear();
      // Closing a speculative document also cancels its pending page script.
      for (const entry of [...entries.values()]) if (entry.speculative && !entry.visited && (entry.loading || entry.initializing)) removeEntry(entry);
    }
  }
  function warmCandidates() {
    const defaults = warmDefaults[current()?.slot === 'chat' ? 'chat' : 'bot'];
    return [...new Set([...warmHints, ...defaults])].filter(target => {
      const entry = entries.get(target === 'meta-chat' ? 'chat' : target);
      // Hover/focus is never permission to navigate a live document or draft.
      if (alive(entry) && (entry.visited || entry === current())) { warmHints.delete(target); return false; }
      return warmHints.has(target) || (!warmAttempted.has(target) && !alive(entry));
    });
  }
  function scheduleWarmup() {
    if (closed || !requestedVisible || museAuthPending() || !alive(current())) { stopWarmup(true); return; }
    if (warming || warmTimer || warmBlocked || current().loading || current().initializing || !warmCandidates().length) return;
    warmTimer = setTimeout(() => { warmTimer = null; void warmNext(); }, Math.max(0, warmupDelay));
    warmTimer.unref?.();
  }
  async function warmNext() {
    if (warming || closed || !requestedVisible || museAuthPending() || warmBlocked || !alive(current()) || current().loading || current().initializing) return;
    warming = true;
    const foreground = current(), generation = libraryGeneration;
    try {
      const status = await authReader(foreground.contents);
      // Meta keeps sign-out inside its account menu. A complete usable sidebar
      // can prepare read-only destinations without claiming account readiness.
      const ready = status === 'ready' || (status === 'unknown' && foreground.slot === 'chat' && await metaAdapter.ready?.(foreground.contents));
      if (closed || !requestedVisible || current() !== foreground || generation !== libraryGeneration || museAuthPending()) return;
      if (!ready) { warmBlocked = true; return; }
      const target = warmCandidates()[0];
      if (!target) return;
      const hinted = warmHints.delete(target);
      const definition = toolTargets[target];
      const existing = entries.get(target === 'meta-chat' ? 'chat' : target);
      if (definition && !alive(existing)) {
        const speculative = [...entries.values()].filter(entry => entry.tool && !entry.visited && alive(entry));
        if (speculative.length >= warmCapacity) {
          // Intent can replace only unused speculative content, never a draft.
          const victim = hinted && speculative.find(entry => !entry.initializing && entry !== current());
          if (!victim) { warmAttempted.add(target); return; }
          removeEntry(victim);
        }
        if (!warmCapacity) { warmAttempted.add(target); return; }
      }
      warmAttempted.add(target);
      const entry = sectionEntry(target, false);
      if (!entry) return;
      if (entry.tool) await initializeTool(entry);
      else await waitForMuseDocument(entry, entry.slot === 'chat', false);
    } catch { /* Speculative work must never interrupt the foreground. */ }
    finally { warming = false; scheduleWarmup(); }
  }
  function scheduleRefresh(){
    if(closed||!requestedVisible||destination!=='chat'||!alive(current())||!scheduledDocument(current().contents)){clearTimeout(scheduleTimer);scheduleTimer=null;schedules=null;return;}
    if(scheduleReading||scheduleTimer)return;
    scheduleTimer=setTimeout(async()=>{
      scheduleTimer=null;scheduleReading=true;
      const entry=current(),epoch=entry.documentEpoch;
      const result=await readMetaSchedules(entry.contents);
      if(!closed&&current()===entry&&alive(entry)&&entry.documentEpoch===epoch&&scheduledDocument(entry.contents)){
        schedules=result;
        onState(snapshot());
      }
      scheduleReading=false;scheduleRefresh();
    },schedules?1500:150);
    scheduleTimer.unref?.();
  }
  function inform(message) { if (!closed) { notice = message; publish(); } }
  function fail(entry, message) { if (!closed) { entry.error = message; entry.loading = false; publish(); } }
  function hide() { requestedVisible = false; publish(); }
  async function present(entry) {
    if (closed || !alive(entry)) return false;
    try { return await presentation.apply(entry.contents, compact, appearance); }
    catch { return false; } // Site changes or navigation never crash the host.
  }
  async function presentAll() { await Promise.all([...entries.values()].map(present)); }
  function removeEntry(entry) {
    entries.delete(entry.key);
    if (current() === entry) activeEntry = null;
    try { entry.view.setVisible(false); } catch { /* Native view already gone. */ }
    entry.visible = false;
    try { if (!window.isDestroyed()) window.contentView.removeChildView(entry.view); } catch { /* Already detached. */ }
    if (alive(entry)) entry.contents.close({ waitForBeforeUnload: false });
  }
  function clearLibrary(preserveEntry = null) {
    accountSync.invalidate();
    knownLogin='unknown';
    warmBlocked = true; stopWarmup(); warmHints.clear(); warmAttempted.clear();
    libraryGeneration++; libraryEstablished = false; selectedDocument = null; agentProfile = null; catalog.reset();
    // Additional chat/draft documents belong to this account. Preserve an
    // authentication opener until its flow finishes; dispose the other copies.
    const fallback = current()?.slot === 'chat' ? 'chat' : 'bot';
    const lostActive = [...entries.values()].some(entry => entry === current() && entry.key !== entry.slot && entry !== preserveEntry);
    for (const entry of [...entries.values()]) if (entry.key !== entry.slot && entry !== preserveEntry) removeEntry(entry);
    if (lostActive && !closed) selectDestination(fallback);
  }
  const museAuthPending = () => [...popups].some(popup => popup.museAuth) || [...entries.values()].some(entry => entry.museAuth);
  const ownsMuseAuth = entry => Boolean(entry.museAuth || [...popups].some(popup => popup.museAuth && popup.opener === entry));
  function scheduleLibrary(delay = 250) {
    if (closed || !requestedVisible || museAuthPending()) { clearTimeout(libraryTimer); libraryTimer = null; return; }
    if (libraryTimer || refreshingLibrary) return;
    libraryTimer = setTimeout(() => {
      libraryTimer = null;
      void refreshLibrary().finally(() => scheduleLibrary(1800));
    }, delay);
    libraryTimer.unref?.();
  }
  function collectionEntry(section) {
    const slot = collectionSlots[section];
    let entry = entries.get(slot);
    if (!alive(entry)) { entry = createEntry(slot); load(entry, personalTarget(slot)); }
    else if (entry.collectionGeneration !== libraryGeneration && !personalAuthenticating(entry.contents.getURL())) {
      // A sign-out makes all other retained account documents stale. Reload
      // their curated pages before their metadata is allowed into a new account.
      entry.collectionGeneration = libraryGeneration; load(entry, personalTarget(slot));
    }
    return entry;
  }
  async function refreshLibrary(force = false) {
    if (closed || museAuthPending() || (!requestedVisible && !force)) return;
    if (refreshingLibrary) return refreshingLibrary;
    const generation = libraryGeneration;
    const read = async (entry, section) => {
      if (closed || generation !== libraryGeneration || !alive(entry)) return null;
      if (entry.awaitingCommit || personalOrigin(entry.contents.getURL()) !== 'https://muse.ai') return null;
      const documentEpoch = entry.documentEpoch, loadEpoch = entry.epoch, url = entry.contents.getURL(), selectionEpoch = actionEpoch;
      const valid = () => !closed && !museAuthPending() && generation === libraryGeneration && alive(entry) && !entry.awaitingCommit && loadEpoch === entry.epoch && documentEpoch === entry.documentEpoch && url === entry.contents.getURL();
      catalog.update(section, { status: 'loading' }); publish();
      let result;
      try {
        await libraryAdapter.prepare(entry.contents, section);
        if (!valid()) return null;
        result = await libraryAdapter.read(entry.contents, section);
      } catch { result = { status: 'unavailable', items: [] }; }
      if (!valid()) return null;
      if (result?.status === 'signed-out') {
        // A fresh/consistently signed-out Muse page is not an account change.
        // Meta AI can be usable independently; do not destroy its live drafts
        // on every background Muse poll. Real ready -> signed-out transitions
        // and explicit authentication navigation still invalidate all caches.
        if (libraryEstablished) { clearLibrary(entry); entry.collectionGeneration = libraryGeneration; }
        else { catalog.reset(); agentProfile = null; }
        publish(); return null;
      }
      if(section==='chats'&&result?.status==='ready'&&libraryAdapter.profile){
        const profile=await libraryAdapter.profile(entry.contents);
        if(!valid())return null;
        if(profile)agentProfile={...profile,avatar:profile.avatar??(profile.name===agentProfile?.name?agentProfile.avatar:null)};
      }
      // Idea/goal previews can remain in the same page without exposing a
      // selected marker. Keep a native selection until navigation or removal.
      const explicitPreview = section !== 'chats' && result?.selectionKnown !== true && !result?.selectedKey && selectedDocument?.entry === entry && selectedDocument.epoch === entry.documentEpoch && catalog.snapshot().selectedId === selectedDocument.id;
      catalog.update(section, result, entry === current() && selectionEpoch === actionEpoch && !explicitPreview);
      if (section === 'chats' && selectionEpoch === actionEpoch) syncChatSelection();
      publish();
      return result?.status;
    };
    // Defer the body once so the in-flight promise exists before publication.
    refreshingLibrary = Promise.resolve().then(async () => {
      const bot = collectionEntry('chats');
      const status = await read(bot, 'chats');
      if (closed || generation !== libraryGeneration) return;
      if (status === 'ready') { libraryEstablished = true; warmBlocked = false; }
      if (libraryEstablished) await Promise.all(['ideas', 'goals'].map(section => read(collectionEntry(section), section)));
    }).finally(() => { refreshingLibrary = null; scheduleLibrary(1800); });
    return refreshingLibrary;
  }
  function cancelActions() { actionEpoch++; for (const finish of pendingReady) if (closed || finish.cancelOnSelection) finish(false); }
  function waitForMuseDocument(entry,meta=false,cancelOnSelection=true) {
    return new Promise(resolve => {
      const contents = entry.contents;
      let timer;
      const finish = ready => {
        clearTimeout(timer); pendingReady.delete(finish);
        for (const event of ['did-navigate', 'dom-ready', 'did-stop-loading']) contents.removeListener(event, inspect);
        contents.removeListener('did-fail-load', failed); contents.removeListener('destroyed', destroyed);
        resolve(ready);
      };
      finish.cancelOnSelection = cancelOnSelection;
      const inspect = () => {
        if (closed || !alive(entry) || entry.error) { finish(false); return; }
        if (entry.awaitingCommit) return;
        const url = contents.getURL();
        if (!url || url === 'about:blank') return;
        finish(meta?['https://www.meta.ai','https://meta.ai'].includes(personalOrigin(url)):personalOrigin(url) === 'https://muse.ai');
      };
      const failed = (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) finish(false); };
      const destroyed = () => finish(false);
      for (const event of ['did-navigate', 'dom-ready', 'did-stop-loading']) contents.on(event, inspect);
      contents.on('did-fail-load', failed); contents.on('destroyed', destroyed);
      pendingReady.add(finish); timer = setTimeout(() => finish(false), 5000); inspect();
    });
  }
  function load(entry, url) {
    const epoch = ++entry.epoch;
    entry.loadTarget = url;
    entry.error = null; entry.loading = true; entry.awaitingCommit = true; entry.origin = personalOrigin(url); entry.route = personalRoute(url); publish();
    // Network and authentication must never block local navigation/layout IPC.
    Promise.resolve(entry.contents.loadURL(url)).catch(error => {
      if (closed || epoch !== entry.epoch || error?.code === 'ERR_ABORTED' || error?.errno === -3) return;
      entry.awaitingCommit = false;
      fail(entry, 'Muse could not load. Check your connection, retry, or open the official service in your browser.');
    });
  }
  function getServiceSession(_service) {
    // Reuse the existing Muse partition: official Meta auth cookies can serve
    // both sites. Origin isolation stays enforced; no cookies are read/copied.
    const service='meta-shared';
    if (serviceSessions.has(service)) return serviceSessions.get(service);
    const webSession = session.fromPartition('persist:musebench-personal-muse'), owned = new Set();
    webSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    webSession.setPermissionCheckHandler(() => false);
    webSession.setDevicePermissionHandler(() => false);
    const download = (event, _item, source) => {
      if (source && !owned.has(source)) return;
      event.preventDefault(); inform('To download this file, open the official service in your browser. Your current page is still available.');
    };
    webSession.on('will-download', download);
    const value = { webSession, owned, dispose: () => webSession.removeListener('will-download', download) };
    serviceSessions.set(service, value); return value;
  }
  function guardContents(contents, blocked) {
    const guard = (event, legacyURL, _inPage, legacyMainFrame) => {
      if (!(event.isMainFrame ?? legacyMainFrame ?? true)) return;
      if (!allowedPersonalURL(event.url ?? legacyURL)) { event.preventDefault(); blocked(); }
    };
    contents.on('will-navigate', guard); contents.on('will-redirect', guard);
    contents.on('will-frame-navigate', event => {
      if (event.isMainFrame) { guard(event); return; }
      try { if (new URL(event.url).protocol !== 'https:' && !['about:blank', 'about:srcdoc'].includes(event.url)) event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.on('content-bounds-updated', event => event.preventDefault());
  }
  const remotePreferences = webSession => ({ session: webSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, webSecurity: true, spellcheck: true });
  function openAccountDocument(url, signal) {
    // Read only the signed-in user's own public-facing profile, in the same
    // official session. Never navigate a live chat or copy authentication data.
    if (closed || signal.aborted || !/^https:\/\/www\.meta\.ai\/(?:@[A-Za-z0-9_.]{1,100})?$/.test(url)) throw Error('Account lookup unavailable');
    const owner = getServiceSession('chat');
    const document = new BrowserWindow({parent:window,show:false,skipTaskbar:true,width:1000,height:800,
      webPreferences:{...remotePreferences(owner.webSession),backgroundThrottling:false}});
    const contents = document.webContents;
    owner.owned.add(contents);
    const close = () => { if (!document.isDestroyed()) document.destroy(); };
    const guard = (event, legacyURL, _inPage, legacyMainFrame) => {
      if (!(event.isMainFrame ?? legacyMainFrame ?? true)) return;
      if (!['https://www.meta.ai','https://meta.ai'].includes(personalOrigin(event.url ?? legacyURL))) event.preventDefault();
    };
    guardContents(contents, () => {});
    contents.on('will-navigate', guard); contents.on('will-redirect', guard);
    contents.setWindowOpenHandler(() => ({action:'deny'}));
    document.once('closed', () => { owner.owned.delete(contents); signal.removeEventListener('abort', close); });
    signal.addEventListener('abort', close, {once:true});
    void document.loadURL(url).catch(close);
    return {contents,close};
  }
  function openHandler(entry, ownerSession, details) {
    // Background preparation cannot open authentication or other popup windows.
    if (entry.speculative && !entry.visited) return { action: 'deny' };
    if (closed || !alive(entry) || !BrowserWindow || !allowedPersonalPopupURL(details.url, entry.contents.getURL())) {
      inform('This link cannot open inside MuseBench. You can continue on the official service in your browser.');
      return { action: 'deny' };
    }
    if (popups.size) {
      const existing = [...popups][0];
      if (!existing.window.isDestroyed()) { existing.window.show(); existing.window.focus(); }
      inform('Finish or close the existing account window before opening another.');
      return { action: 'deny' };
    }
    const origin = personalOrigin(details.url);
    return { action: 'allow', outlivesOpener: false, createWindow(options) {
      // Preserve Electron's actual window.open/opener and POST flow. Override
      // remote-controlled preferences before constructing the owned child.
      const { x: _x, y: _y, ...windowOptions } = options;
      const popupWindow = new BrowserWindow({ ...windowOptions, parent: window, width: 560, height: 760, minWidth: 380, minHeight: 500,
        frame: true, center: true, fullscreen: false, kiosk: false, transparent: false, closable: true, focusable: true, skipTaskbar: false,
        show: false, autoHideMenuBar: true, title: `Meta AI account — ${origin}`,
        webPreferences: { ...remotePreferences(ownerSession.webSession), preload: undefined },
      });
      const contents = popupWindow.webContents;
      const popup = { window: popupWindow, contents, origin, museAuth: false, opener: entry };
      popups.add(popup); ownerSession.owned.add(contents);
      const invalidateMuseAccount = url => {
        if (popup.museAuth || !personalAuthenticating(url)) return;
        popup.museAuth = true; cancelActions(); clearLibrary(entry);
      };
      invalidateMuseAccount(details.url);
      guardContents(contents, () => inform('The account window blocked an unsupported redirect. Your current Muse page is still available.'));
      contents.setWindowOpenHandler(() => { inform('Complete the current account window before opening another.'); return { action: 'deny' }; });
      popupWindow.on('page-title-updated', event => event.preventDefault());
      const navigated = (_event, url) => {
        invalidateMuseAccount(url);
        const safeOrigin = personalOrigin(url);
        if (safeOrigin) { popup.origin = safeOrigin; if (!popupWindow.isDestroyed()) popupWindow.setTitle(`Meta AI account — ${safeOrigin}`); }
        publish();
      };
      contents.on('did-navigate', navigated);
      contents.on('did-navigate-in-page', (event, url, isMainFrame) => { if (isMainFrame !== false) navigated(event, url); });
      contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          if (!closed && !popupWindow.isDestroyed()) popupWindow.show();
          inform('The account window could not load. Close it and retry from the official page.');
        }
      });
      popupWindow.once('ready-to-show', () => { if (!closed && !popupWindow.isDestroyed()) { popupWindow.show(); popupWindow.focus(); } });
      popupWindow.once('closed', () => {
        popups.delete(popup); ownerSession.owned.delete(contents);
        if (popup.museAuth && !closed) {
          // The opener may still render the former account. Invalidate again
          // after completion so it cannot repopulate the cleared sidebar.
          clearLibrary(entry.museAuth ? entry : null);
        }
        publish();
      });
      notice = null; publish(); return contents;
    } };
  }
  function createEntry(section, key = section) {
    const ownerSession = getServiceSession(personalService(section));
    const view = new WebContentsView({ webPreferences: remotePreferences(ownerSession.webSession) });
    const entry = { view, contents: view.webContents, key, slot: section, route: null, loading: false, awaitingCommit: false, origin: null, error: null, epoch: 0, documentEpoch: 0, collectionGeneration: libraryGeneration, museAuth: false, visible: false, visited: false, speculative: false, tool: null, initializing: null, initialized: null };
    entries.set(key, entry); ownerSession.owned.add(entry.contents);
    view.setVisible(false); view.setBackgroundColor('#181818'); window.contentView.addChildView(view);
    const contents = entry.contents;
    guardContents(contents, () => fail(entry, 'This page tried to leave the supported Muse sign-in or service. Retry, or continue on the official website in your browser.'));
    contents.setWindowOpenHandler(details => openHandler(entry, ownerSession, details));
    contents.on('did-start-loading', () => { entry.loading = true; publish(); });
    contents.on('did-stop-loading', () => { entry.loading = false; if (entry === current()) warmBlocked = false; publish(); if (entry.visited) accountSync.request(); });
    contents.on('dom-ready', () => { void present(entry); });
    const navigated = (_event, url) => {
      entry.documentEpoch++;
      {
        const authentication = personalAuthenticating(url);
        if (authentication && entry.speculative && !entry.visited) {
          warmBlocked = true; stopWarmup(); warmHints.clear(); removeEntry(entry); publish(); return;
        }
        if (authentication && !entry.museAuth) {
          entry.museAuth = true; cancelActions(); clearLibrary(entry);
          entry.collectionGeneration = libraryGeneration;
        } else if (entry.museAuth && ['https://muse.ai','https://meta.ai','https://www.meta.ai'].includes(personalOrigin(url))) {
          // The returning document is fresh, but every other retained page may
          // still belong to the former account. Invalidate at both boundaries.
          entry.museAuth = false; cancelActions(); clearLibrary(entry);
          entry.collectionGeneration = libraryGeneration;
        }
        // Ordinary commits retain the generation of their initiating document
        // or load. A request begun before account switching can finish later.
      }
      // Navigation from the official main conversation can create a side chat.
      // Retain that document and let the collection reader own a fresh '/' view.
      if (entry.key === 'bot' && /^https:\/\/muse\.ai\/thread\/[A-Za-z0-9_-]{1,200}$/.test(url)) {
        entries.delete('bot'); entry.key = `retained-chat-${++extraEntrySequence}`; entries.set(entry.key, entry);
      }
      const origin = personalOrigin(url); if (origin) entry.origin = origin;
      entry.route = personalRoute(url);
      if (entry === current() && entry.route) destination = entry.route;
      if (entry === current() && entry.slot === 'bot') syncChatSelection();
      publish();
      if (entry.visited) accountSync.request();
    };
    contents.on('did-navigate', (event, url) => { entry.awaitingCommit = false; navigated(event, url); });
    contents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      if (isMainFrame !== false) { navigated(event, url); void present(entry); }
    });
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) { entry.awaitingCommit = false; fail(entry, 'Muse could not load. Check your connection, retry, or open the official service in your browser.'); }
    });
    contents.on('render-process-gone', () => fail(entry, 'The Muse page stopped responding. Reload the page to continue.'));
    contents.on('before-input-event', (event, input) => {
      if(input.type==='keyDown'&&input.alt&&!input.control&&!input.meta&&!input.shift&&['ArrowLeft','ArrowRight'].includes(input.key)){event.preventDefault();onShortcut?.(input.key==='ArrowLeft'?'back':'forward');return;}
      if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt || ![',', 'b', 'k', 'n'].includes(input.key.toLowerCase())) return;
      if(destination==='chat'&&['k','n'].includes(input.key.toLowerCase())){event.preventDefault();void dispatch({type:'metaAction',action:input.key.toLowerCase()==='k'?'search':'newChat'});return;}
      event.preventDefault(); if (!localContents.isDestroyed()) localContents.focus(); onShortcut(input.key.toLowerCase());
    });
    contents.once('destroyed', () => ownerSession.owned.delete(contents));
    return entry;
  }
  function selectDestination(section) {
    let entry = entries.get(section);
    const existing = alive(entry);
    if (!existing) entry = createEntry(section);
    activeEntry = entry; destination = section; entry.visited = true; entry.speculative = false;
    // Switching retained sections preserves drafts. If website navigation moved
    // that section's view elsewhere, explicitly selecting the section restores
    // its curated route. Authentication/unknown paths remain where they are.
    const staleAccount = entry.collectionGeneration !== libraryGeneration;
    if (!existing || (!ownsMuseAuth(entry) && (staleAccount || (entry.route && entry.route !== section)))) {
      entry.collectionGeneration = libraryGeneration; load(entry, personalTarget(section));
    }
    return entry;
  }
  function sectionEntry(target, activate = true) {
    const tool = toolTargets[target];
    const slot = tool?.slot ?? (target === 'meta-chat' ? 'chat' : target);
    if (!tool && !personalTarget(slot)) return null;
    const key = tool ? target : slot;
    if (activate && tool) { catalog.select(null); selectedDocument = null; }
    let entry = entries.get(key);
    if (!alive(entry)) {
      entry = createEntry(slot, key); entry.tool = tool ?? null; entry.speculative = !activate;
      if (activate) { entry.visited = true; activeEntry = entry; destination = slot; }
      load(entry, personalTarget(slot));
    } else {
      if (activate) { entry.visited = true; entry.speculative = false; activeEntry = entry; destination = slot; }
      if (!ownsMuseAuth(entry) && (entry.collectionGeneration !== libraryGeneration || entry.error)) {
        entry.collectionGeneration = libraryGeneration; entry.initialized = null; entry.toolURL = null; load(entry, personalTarget(slot));
      }
    }
    return entry;
  }
  async function initializeTool(entry) {
    if (!alive(entry) || !entry.tool) return false;
    if (entry.initializing) return entry.initializing;
    const cached = entry.initialized;
    const generation = libraryGeneration;
    const isCached = cached && cached.epoch === entry.documentEpoch && cached.url === entry.contents.getURL() && entry.collectionGeneration === generation;
    if (isCached && entry.slot === 'chat') {
      // Search is an overlay: the user may have closed it without navigating.
      // Its adapter is idempotent and leaves an open search/query untouched.
      if (entry.key === 'meta-search') return metaAdapter.action(entry.contents, 'search');
      return true;
    }
    // Set the in-flight promise before the first publication; repeated clicks
    // and a foreground selection of a warming view join the same operation.
    const job = Promise.resolve().then(async () => {
      if (isCached && (!presentation.state || (cached.state && cached.state === await presentation.state(entry.contents, entry.tool.action)))) return !closed && alive(entry) && generation === libraryGeneration;
      if (closed || !alive(entry) || generation !== libraryGeneration) return false;
      entry.initialized = null; publish();
      const ready = await waitForMuseDocument(entry, entry.slot === 'chat', false);
      if (!ready || closed || !alive(entry) || generation !== libraryGeneration) return false;
      const action = entry.slot === 'chat' ? metaAdapter.action : presentation.action;
      const succeeded = await action(entry.contents, entry.tool.action, entry.toolURL);
      if (!succeeded || closed || !alive(entry) || generation !== libraryGeneration || entry.museAuth) return false;
      const state = entry.slot === 'bot' && presentation.state ? await presentation.state(entry.contents, entry.tool.action) : null;
      if (closed || !alive(entry) || generation !== libraryGeneration || entry.museAuth) return false;
      entry.initialized = { epoch: entry.documentEpoch, url: entry.contents.getURL(), state };
      if (entry.contents.getURL() !== personalTarget(entry.slot)) entry.toolURL = entry.contents.getURL();
      return true;
    }).catch(() => false).finally(() => {
      if (entry.initializing === job) entry.initializing = null;
      publish();
    });
    entry.initializing = job; publish(); return job;
  }
  function syncChatSelection() {
    const entry = current();
    if (!alive(entry) || entry.slot !== 'bot' || entry.awaitingCommit) return;
    if (entry.tool) { catalog.select(null); return; }
    const url = entry.contents.getURL();
    const selected = catalog.snapshot().chats.items.find(item => {
      const record = catalog.get(item.id);
      return record && url === `https://muse.ai${record.target.value}`;
    });
    catalog.select(selected?.id ?? null);
  }
  function retainedChat(url) {
    // url comes only from the validated catalog or the fixed unsent draft path.
    let entry = [...entries.values()].find(candidate => candidate.slot === 'bot' && !candidate.tool && candidate.key !== 'bot' && alive(candidate) && candidate.collectionGeneration === libraryGeneration && (candidate.contents.getURL() === url || (candidate.awaitingCommit && candidate.loadTarget === url)));
    if (!entry) {
      entry = createEntry('bot', `retained-chat-${++extraEntrySequence}`);
      activeEntry = entry; destination = 'bot'; load(entry, url);
    } else { activeEntry = entry; destination = 'bot'; }
    entry.visited = true; entry.speculative = false;
    return entry;
  }
  async function dispatch(value) {
    const command = validatePersonalCommand(value);
    if (closed) throw Error('The personal Muse browser is closed.');
    if (command.type === 'prewarm') {
      if (requestedVisible && !museAuthPending()) { warmHints.delete(command.target); warmHints.add(command.target); warmBlocked = false; scheduleWarmup(); }
      return snapshot();
    }
    if (command.type === 'layout') {
      requestedVisible = command.visible;
      if (command.bounds) cssBounds = command.bounds;
      if (requestedVisible && !alive(current())) selectDestination(destination);
    } else if (command.type === 'navigate') {
      cancelActions(); notice = null; catalog.select(null); selectDestination(command.destination);
    } else if (command.type === 'refreshLibrary') {
      notice = null; await refreshLibrary(true);
    } else if (command.type === 'newMuseChat') {
      cancelActions(); notice = null; catalog.select(null);
      retainedChat('https://muse.ai/thread/new');
    } else if (command.type === 'selectItem') {
      const item = catalog.get(command.id);
      if (!item) throw Error('This Muse item is no longer available. Refresh the sidebar and try again.');
      const slot = collectionSlots[item.section];
      if (item.section === 'chats' && catalog.snapshot().selectedId === item.id && current()?.slot === slot && selectedDocument?.entry === current() && selectedDocument.id === item.id && selectedDocument.epoch === current().documentEpoch) return snapshot();
      cancelActions(); const requestEpoch = actionEpoch, generation = libraryGeneration;
      notice = null;
      const directChat = item.section === 'chats' && item.target.type === 'link';
      const entry = directChat ? retainedChat(`https://muse.ai${item.target.value}`) : selectDestination(slot); publish();
      const ready = await waitForMuseDocument(entry);
      if (closed || requestEpoch !== actionEpoch || generation !== libraryGeneration) return snapshot();
      let succeeded = false;
      try {
        if (ready) succeeded = item.section === 'chats'
          ? entry.contents.getURL() === `https://muse.ai${item.target.value}`
          : await libraryAdapter.activate(entry.contents, item.section, item);
      } catch { /* Keep original controls available below. */ }
      if (closed || requestEpoch !== actionEpoch || generation !== libraryGeneration) return snapshot();
      if (succeeded && catalog.get(item.id)) { catalog.select(item.id); selectedDocument = { id: item.id, entry, epoch: entry.documentEpoch }; }
      else { compact = false; await presentAll(); notice = 'This item is not available on the current Muse page. Refresh the sidebar or continue using Muse’s own controls.'; }
    } else if(command.type==='scheduleAction'){
      const entry=current(),item=command.action==='new'?{}:schedules?.items.find(item=>item.id===command.id);
      if(!alive(entry)||!item||!await activateMetaSchedule(entry.contents,item,command.action))notice='This reminder changed or is unavailable. Refresh Scheduled and use its original controls.';
    } else if(command.type==='metaAction'){
      cancelActions();const requestEpoch=actionEpoch;notice=null;
      const entry=command.action==='newChat'?selectDestination('chat'):sectionEntry(`meta-${command.action}`);publish();
      const succeeded=command.action==='newChat'
        ? await waitForMuseDocument(entry,true)&&!closed&&requestEpoch===actionEpoch&&await metaAdapter.action(entry.contents,'newChat')
        : await initializeTool(entry);
      if(!closed&&requestEpoch===actionEpoch&&!succeeded){compact=false;await presentAll();notice='This Meta AI shortcut is unavailable on the current page. The original navigation is shown so you can continue there.';}
    } else if (command.type === 'presentation') {
      compact = command.compact; await presentAll();
    } else if (command.type === 'appearance') {
      appearance = { ...command.appearance }; await presentAll();
    } else if (command.type === 'dismissNotice') notice = null;
    else if (command.type === 'serviceAction') {
      cancelActions(); const requestEpoch = actionEpoch;
      const cachedTool = toolTargets[`muse-${command.action}`];
      notice = null; const entry = cachedTool ? sectionEntry(`muse-${command.action}`) : selectDestination('bot'); publish();
      let succeeded = false;
      try {
        if (cachedTool) succeeded = await initializeTool(entry);
        else if (await waitForMuseDocument(entry) && !closed && requestEpoch === actionEpoch) succeeded = await presentation.action(entry.contents, command.action);
      } catch { /* Safely restore the official controls below. */ }
      if (!closed && requestEpoch === actionEpoch && !succeeded) {
        compact = false; await presentAll();
        notice = 'This shortcut is not available on the current page. The full Muse layout is restored so you can continue using its own controls.';
      }
    } else if (command.type === 'openExternal') {
      // Never export OAuth callbacks or remote-supplied URLs into the OS shell.
      await shell.openExternal(personalTarget(destination));
    } else {
      const entry = current();
      if (alive(entry)) {
        entry.error = null; notice = null;
        const contents = entry.contents;
        if (command.type === 'reload') {
          entry.initialized = null;
          if (allowedPersonalURL(contents.getURL())) { entry.loading = true; entry.awaitingCommit = true; contents.reload(); }
          else load(entry, personalTarget(destination));
          if (entry.tool) void initializeTool(entry);
        } else if (command.type === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
        else if (command.type === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
      }
    }
    publish(); return snapshot();
  }
  const localNavigation = (event, _url, _inPage, isMainFrame) => { if (event.isMainFrame ?? isMainFrame) hide(); };
  const resize = () => publish();
  const shellPointer=(_event,input)=>{if(input.type==='mouseDown'&&requestedVisible&&destination==='chat'&&!closed&&current()?.key!=='meta-search')void metaAdapter.dismiss(current()?.contents);};
  localContents.on('before-mouse-event',shellPointer);
  localContents.on('did-start-navigation', localNavigation); localContents.on('render-process-gone', hide); localContents.on('destroyed', hide); localContents.on('zoom-changed', resize);
  window.on('resize', resize); window.on('close', close);
  function close() {
    if (closed) return;
    closed = true; accountSync.close(); stopWarmup(true); if(setupLoginWindow&&!setupLoginWindow.isDestroyed())setupLoginWindow.destroy(); clearTimeout(scheduleTimer); requestedVisible = false; cancelActions(); clearLibrary(); clearTimeout(libraryTimer); libraryTimer = null;
    for (const popup of popups) {
      try { if (!popup.window.isDestroyed()) popup.window.destroy(); } catch { /* Native teardown may already have disposed the child. */ }
      if (!popup.contents.isDestroyed()) popup.contents.close({ waitForBeforeUnload: false });
    }
    popups.clear();
    for (const entry of entries.values()) {
      try { entry.view.setVisible(false); } catch { /* Already disposed. */ }
      entry.visible = false;
      try { if (!window.isDestroyed()) window.contentView.removeChildView(entry.view); } catch { /* Already detached/disposed. */ }
      if (alive(entry)) entry.contents.close({ waitForBeforeUnload: false });
    }
    for (const value of serviceSessions.values()) value.dispose();
    localContents.removeListener('before-mouse-event',shellPointer);
    localContents.removeListener('did-start-navigation', localNavigation); localContents.removeListener('render-process-gone', hide); localContents.removeListener('destroyed', hide); localContents.removeListener('zoom-changed', resize);
    window.removeListener('resize', resize); window.removeListener('close', close);
  }
  accountSync.start();
  return { snapshot, dispatch, hide, close, checkLogin, openLogin };
}
