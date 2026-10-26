import {metaDocument,metaNavigationCSS} from './meta-navigation.mjs';
import { applyPersonalTimeline } from './personal-timeline.mjs';
import { personalChatCSS } from './personal-chat-style.mjs';
import { personalCollectionsCSS } from './personal-collections-style.mjs';

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
    if (!compact || !museDocument(contents)) return applyPersonalTimeline(contents, compact, appearance);
    // Selector guards activate only when the application shell hydrates. The
    // login page and unrecognized layouts remain untouched, even if React mounts
    // after dom-ready. No account-state inspection is needed.
    // Electron 45 does not reliably remove user-origin sheets by key on Windows.
    // Author-origin !important rules restore correctly through removeInsertedCSS.
    const key = await contents.insertCSS(compactCSS + personalChatCSS(appearance) + personalCollectionsCSS(appearance), { cssOrigin: 'author' });
    styles.set(contents, key);
    await applyPersonalTimeline(contents, true, appearance);
    return true;
  }).catch(() => false);
  pending.set(contents, next);
  return next;
}

export async function runPersonalAction(contents, action) {
  if (!actions.has(action) || !museDocument(contents)) return false;
  // Only fixed navigation/settings controls are invoked, following an explicit
  // local UI action. Never click Connect, scan a code, approve, or submit a form.
  // In particular WhatsApp opens Messaging channels, leaving pairing to the user.
  const script = `(${async function performMuseNavigation(request) {
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
      const control = dock.querySelector(selectors[request]);
      if (!control) return false;
      activate(control);
      return true;
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
  }.toString()})(${JSON.stringify(action)})`;
  try { return await contents.executeJavaScript(script, true) === true; }
  catch { return false; }
}
