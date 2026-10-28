import {metaDocument,metaNavigationCSS} from './meta-navigation.mjs';
import { applyPersonalTimeline } from './personal-timeline.mjs';
import { personalChatCSS } from './personal-chat-style.mjs';
import { personalCollectionsCSS } from './personal-collections-style.mjs';
import { applyPersonalFonts } from './personal-fonts.mjs';

// A deliberately small presentation adapter for the official Muse application.
// These hooks were observed in its rendered UI on 2026-10-25. This is not an API:
// it neither reads account/chat data nor intercepts network requests or storage.
const styles = new WeakMap();
const pending = new WeakMap();
const actions = new Set(['search', 'feed', 'library', 'settings', 'connections', 'whatsapp']);
const compactCSS = `
  body:has([data-hatch-full-page-shell]) [data-hatch-dock] { display: none !important; }
  body:has([data-hatch-dock]) [data-hatch-full-page-shell] { margin-inline-start: 0 !important; }
  body:has([data-hatch-dock]):has([data-hatch-full-page-shell]) [data-hatch-shell-composer-layer] { left: 0 !important; }
  body:has([data-hatch-full-page-shell]) [data-testid="hatch-chat-switcher-trigger"] { display: none !important; }
`;

function museDocument(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    const url = new URL(contents.getURL());
    return url.origin === 'https://muse.ai' && !url.username && !url.password;
  } catch { return false; }
}

// Serialized into the official document. Read only navigation structure, never
// input values, messages, account state, storage, or private application data.
function observeMuseTool(action) {
  const selectors = { search: '[data-testid="hatch-nav-search"]', feed: '[role="button"][aria-label="Feed"]', library: '[role="button"][aria-label="Library"]' };
  const control = document.querySelector('[data-hatch-dock]')?.querySelector(selectors[action]);
  const attributes = ['aria-expanded', 'aria-selected', 'aria-current', 'data-active', 'data-state', 'aria-pressed'];
  const state = attributes.map(name => control?.getAttribute(name) ?? null);
  const active = state[0] === 'true' || state[1] === 'true' || Boolean(state[2] && state[2] !== 'false') || state[3] === 'true' || ['active', 'open'].includes(state[4]) || state[5] === 'true';
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(dialog => {
    const style = getComputedStyle(dialog);
    return !dialog.hidden && dialog.getClientRects().length > 0 && style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility) && style.opacity !== '0';
  });
  return { url: location.href, control, state, active, dialogs };
}

export async function readPersonalToolState(contents, action) {
  if (!['search', 'feed', 'library'].includes(action) || !museDocument(contents)) return null;
  const script = `(${async function toolState(request, observe) {
    if (location.origin !== 'https://muse.ai') return null;
    const state = observe(request);
    const structural = JSON.stringify({ url: state.url, hasControl: Boolean(state.control), control: state.state, dialogs: state.dialogs.map(dialog => [dialog.id, dialog.getAttribute('aria-label')]) });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(structural));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }.toString()})(${JSON.stringify(action)}, ${observeMuseTool.toString()})`;
  let timer;
  try {
    const result = await Promise.race([contents.executeJavaScript(script), new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); timer.unref?.(); })]);
    return typeof result === 'string' && /^[a-f0-9]{64}$/.test(result) ? result : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export function applyPersonalPresentation(contents, compact, appearance) {
  // Serialize insert/remove operations so rapid mode switches cannot leave an
  // old stylesheet applied after the user has restored the original layout.
  const previous = pending.get(contents) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!contents || contents.isDestroyed()) return false;
    const old = styles.get(contents);
    if (old) {
      styles.delete(contents);
      try { await contents.removeInsertedCSS(old); } catch { /* A navigation discarded the old document. */ }
    }
    if(compact&&metaDocument(contents)){const key=await contents.insertCSS(metaNavigationCSS,{cssOrigin:'author'});styles.set(contents,key);return true;}
    if (!compact || !museDocument(contents)) {
      await applyPersonalFonts(contents, false);
      return applyPersonalTimeline(contents, compact, appearance);
    }
    // Selector guards activate only when the application shell hydrates. The
    // login page and unrecognized layouts remain untouched, even if React mounts
    // after dom-ready. No account-state inspection is needed.
    // Electron 45 does not reliably remove user-origin sheets by key on Windows.
    // Author-origin !important rules restore correctly through removeInsertedCSS.
    const key = await contents.insertCSS(compactCSS + personalChatCSS(appearance) + personalCollectionsCSS(appearance), { cssOrigin: 'author' });
    styles.set(contents, key);
    await applyPersonalFonts(contents, true);
    await applyPersonalTimeline(contents, true, appearance);
    return true;
  }).catch(() => false);
  pending.set(contents, next);
  return next;
}

export async function runPersonalAction(contents, action, expectedURL = null) {
  if (!actions.has(action) || !museDocument(contents)) return false;
  let verifiedURL = null;
  if (typeof expectedURL === 'string') {
    try {
      const url = new URL(expectedURL);
      if (url.origin === 'https://muse.ai' && !url.username && !url.password && url.pathname !== '/') verifiedURL = url.href;
    } catch { /* A malformed prior observation cannot verify a tool. */ }
  }
  // Only fixed navigation/settings controls are invoked, following an explicit
  // local UI action. Never click Connect, scan a code, approve, or submit a form.
  // In particular WhatsApp opens Messaging channels, leaving pairing to the user.
  const script = `(${async function performMuseNavigation(request, observe, verifiedURL) {
    const deadline = Date.now() + 8000;
    const onMuse = () => location.origin === 'https://muse.ai';
    const activate = element => {
      // Muse's Radix menu trigger listens to pointerdown; click() alone leaves
      // it closed. Send the normal primary-pointer sequence to the fixed UI
      // control, then its click event. Never use this for grants or submissions.
      const pointer = { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      element.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
      element.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }));
      element.click();
    };
    const waitFor = async find => {
      while (onMuse() && Date.now() < deadline) {
        const element = find();
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      return null;
    };
    // The dock is server-rendered before its event handlers are ready. Document
    // completion is a first gate; the menu loop below also tolerates hydration
    // replacing an inert trigger after that point.
    const dock = await waitFor(() => document.readyState === 'complete' && document.querySelector('[data-hatch-dock]'));
    if (!dock || !onMuse()) return false;
    const selectors = {
      search: '[data-testid="hatch-nav-search"]',
      feed: '[role="button"][aria-label="Feed"]',
      library: '[role="button"][aria-label="Library"]',
    };
    if (selectors[request]) {
      const before = observe(request);
      // A reload may already show the selected Feed/Library. Trust its explicit
      // active marker, or the exact URL observed during a prior successful
      // activation; never guess a route or click an already selected control.
      if (request !== 'search' && (before.active || (verifiedURL && before.url === verifiedURL))) return true;
      if (!before.control || before.control.disabled) return false;
      activate(before.control);
      // A rendered dock may still have inert hydration placeholders. One click
      // is an attempt; completion requires a visible navigation change. Never
      // retry a possible toggle automatically or mark the base chat as a tool.
      const completedBy = Math.min(deadline, Date.now() + 1500);
      while (onMuse() && Date.now() < completedBy) {
        const after = observe(request);
        if (after.url !== before.url || (!before.active && after.active) || after.dialogs.some(dialog => !before.dialogs.includes(dialog))) return true;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      return false;
    }
    const settingsDialog = () => Array.from(document.querySelectorAll('[role="dialog"]')).find(dialog => Array.from(dialog.querySelectorAll('h1,h2,[role="heading"]')).some(heading => heading.textContent?.trim() === 'Settings'));
    let dialog = settingsDialog();
    if (!dialog) {
      let nextOpenAttempt = 0;
      const settings = await waitFor(() => {
        const item = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).find(item => /^Settings(?:\s|Ctrl|⌘|$)/.test(item.textContent?.trim() ?? ''));
        if (item) return item;
        const more = document.querySelector('[data-hatch-dock] [data-testid="hatch-dock-more"]');
        if (more && !more.disabled && more.getAttribute('aria-expanded') !== 'true' && Date.now() >= nextOpenAttempt) {
          // Observed on the official menu: ArrowDown opens it idempotently.
          // Retrying a pointer toggle could close a newly hydrated menu.
          more.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }));
          nextOpenAttempt = Date.now() + 400;
        }
        return null;
      });
      if (!settings || !onMuse()) return false;
      activate(settings);
      dialog = await waitFor(settingsDialog);
    }
    if (!dialog || !onMuse()) return false;
    const label = request === 'connections' ? 'Connectors' : request === 'whatsapp' ? 'Messaging channels' : 'General';
    // Settings tabs can also render before their handlers are attached. A
    // click is not completion: re-query replacements and wait for the tab's
    // observed active marker, retrying only this idempotent navigation action.
    let nextTabAttempt = 0;
    const selectedTab = await waitFor(() => {
      const currentDialog = settingsDialog();
      const tab = currentDialog && Array.from(currentDialog.querySelectorAll('button')).find(button => button.textContent?.trim() === label);
      if (!tab) return null;
      if (tab.getAttribute('data-active') === 'true' || tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('data-state') === 'active') return tab;
      if (!tab.disabled && Date.now() >= nextTabAttempt) { activate(tab); nextTabAttempt = Date.now() + 400; }
      return null;
    });
    return Boolean(selectedTab && onMuse());
  }.toString()})(${JSON.stringify(action)}, ${observeMuseTool.toString()}, ${JSON.stringify(verifiedURL)})`;
  try { return await contents.executeJavaScript(script, true) === true; }
  catch { return false; }
}
