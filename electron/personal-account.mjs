const META_ORIGINS = new Set(['https://www.meta.ai', 'https://meta.ai']);
const ACCOUNT_TIMEOUT_MS = 1500;
const HANDLE = /^[A-Za-z0-9_.]{1,100}$/;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

// Account metadata is display text only. Do not forward provider objects, image
// URLs, messages, credentials, or other fields into the local application.
export function normalizeMetaAccount(value) {
  if (!value || typeof value !== 'object') return {status:'unavailable'};
  if (['signed-out','loading','unavailable'].includes(value.status)) return {status:value.status};
  if (value.status !== 'ready' || typeof value.handle !== 'string' || !HANDLE.test(value.handle)) return {status:'unavailable'};
  const result = {status:'ready',handle:value.handle};
  if (typeof value.displayName === 'string' && !UNSAFE_TEXT.test(value.displayName)) {
    const name = value.displayName.trim().replace(/\s+/g, ' ');
    if (name && name.length <= 100) result.displayName = name;
  }
  return result;
}

function metaURL(contents) {
  try {
    if (!contents || contents.isDestroyed()) return null;
    const url = new URL(contents.getURL());
    return META_ORIGINS.has(url.origin) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Only the rendered account menu and verified own-profile heading are read.
// These hooks were observed on Meta AI on 2026-10-28. No clicks, requests,
// framework state, cookies, or browser storage are needed for this reader.
function renderedMetaAccount(expectedURL) {
  if (!['https://www.meta.ai','https://meta.ai'].includes(location.origin) || location.href !== expectedURL) return {status:'unavailable'};
  const pageURL = new URL(location.href);
  if (pageURL.username || pageURL.password) return {status:'unavailable'};
  if (document.readyState !== 'complete') return {status:'loading'};
  const text = element => (element?.textContent ?? '').trim();
  const visible = element => {
    if (!element || !element.getClientRects().length) return false;
    let current = element;
    for (let depth = 0; current && depth < 50; depth++, current = current.parentElement) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(current);
      if (style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    return !current;
  };
  const bounded = (root, selector, limit) => {
    const nodes = root.querySelectorAll(selector);
    return nodes.length <= limit ? Array.from(nodes) : null;
  };
  const sidebars = bounded(document, 'nav[data-slot="sidebar"][aria-label="Sidebar"]', 1);
  if (!sidebars) return {status:'unavailable'};
  const menus = sidebars.length === 1 ? bounded(sidebars[0], 'div[data-testid="user-menu-button"][data-slot="dropdown-menu-trigger"]', 1) : [];
  const labels = menus?.length === 1 ? bounded(menus[0], ':scope > span', 1) : [];
  const handle = labels?.length === 1 && !labels[0].childElementCount ? text(labels[0]) : '';
  const recognized = /^[A-Za-z0-9_.]{1,100}$/.test(handle);
  // A conversation can contain an ordinary "Log in" link. Once the official
  // account is recognized, only its sidebar and authentication UI can sign out.
  const controls = bounded(recognized ? sidebars[0] : document, 'button,a,[role="button"]', 1000);
  const fields = bounded(document, recognized ? '[role="dialog"] input[type="password"],form[action*="login"]' : 'input[type="password"],form[action*="login"]', 30);
  const dialogs = bounded(document, '[role="dialog"]', 30);
  if (!controls || !fields || !dialogs) return {status:'unavailable'};
  const signIn = /^(?:log\s*in|sign\s*in|continue with (?:facebook|instagram|meta))\b/i;
  if (controls.some(control => visible(control) && [text(control), control.getAttribute('aria-label')].some(label => signIn.test((label ?? '').trim()))) ||
      fields.some(visible) || dialogs.some(dialog => visible(dialog) && [dialog.getAttribute('aria-label'), text(dialog.querySelector('h1,h2,[role="heading"]'))].some(label => signIn.test((label ?? '').trim())))) {
    return {status:'signed-out'};
  }
  // MuseBench intentionally hides the official sidebar. Its exact observed
  // identity structure remains usable when app presentation makes it invisible.
  if (!recognized) return {status:'unavailable'};
  const result = {status:'ready',handle};
  if (location.pathname.replace(/\/$/, '') !== `/@${handle}`) return result;
  const profileControls = bounded(document, 'button', 250);
  if (!profileControls?.some(control => visible(control) && text(control) === 'Edit profile')) return result;
  const headings = bounded(document, 'h2', 50);
  if (!headings) return result;
  const ownHeadings = headings.filter(heading => visible(heading) && text(heading) === handle);
  if (ownHeadings.length !== 1) return result;
  const headingRow = ownHeadings[0].parentElement;
  const identityBlock = headingRow?.parentElement;
  if (headingRow?.tagName !== 'DIV' || identityBlock?.tagName !== 'DIV') return result;
  const names = bounded(identityBlock, ':scope > span', 1);
  if (names?.length === 1 && visible(names[0]) && !names[0].childElementCount) {
    const name = text(names[0]);
    if (name && name.length <= 100) result.displayName = name;
  }
  return result;
}

export async function readMetaAccount(contents) {
  const snapshot = metaURL(contents);
  if (!snapshot) return {status:'unavailable'};
  let timer;
  let changed = false;
  let observing = false;
  const navigating = (_event, _url, _inPlace, mainFrame) => { if (mainFrame !== false) changed = true; };
  try {
    if (contents.isLoadingMainFrame?.()) return {status:'loading'};
    if (typeof contents.on === 'function' && typeof contents.removeListener === 'function') {
      contents.on('did-start-navigation', navigating);
      observing = true;
    }
    const result = await Promise.race([
      contents.executeJavaScript(`(${renderedMetaAccount.toString()})(${JSON.stringify(snapshot)})`),
      new Promise(resolve => {
        timer = setTimeout(() => resolve({status:'unavailable'}), ACCOUNT_TIMEOUT_MS);
        timer.unref?.();
      })
    ]);
    if (changed || metaURL(contents) !== snapshot || contents.isLoadingMainFrame?.()) return {status:'unavailable'};
    return normalizeMetaAccount(result);
  } catch { return {status:'unavailable'}; }
  finally {
    clearTimeout(timer);
    if (observing) contents.removeListener('did-start-navigation', navigating);
  }
}
