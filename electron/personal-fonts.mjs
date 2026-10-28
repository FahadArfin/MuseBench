import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {PERSONAL_UI_FONT_NAME, PERSONAL_MONO_FONT_NAME} from './personal-appearance.mjs';

const require = createRequire(import.meta.url);
let bundledFonts;
function fontPayload() {
  // Read the pinned production packages once. Their trusted stylesheets retain
  // the same weights, italics and Unicode subsets as the local app renderer.
  return bundledFonts ??= Promise.all([
    ['inter', PERSONAL_UI_FONT_NAME], ['jetbrains-mono', PERSONAL_MONO_FONT_NAME],
  ].flatMap(([packageName, family]) => ['index.css', 'wght-italic.css'].map(async stylesheet => {
    const file = require.resolve(`@fontsource-variable/${packageName}/${stylesheet}`);
    const css = await readFile(file, 'utf8');
    return Promise.all([...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(async ([, rule]) => {
      const source = rule.match(/url\(\.\/files\/([a-z0-9-]+\.woff2)\)/)?.[1];
      if (!source) throw Error('Bundled font source is unavailable.');
      const descriptor = name => rule.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
      return {family, data:(await readFile(path.join(path.dirname(file), 'files', source))).toString('base64'), descriptors:{style:descriptor('font-style'),weight:descriptor('font-weight'),unicodeRange:descriptor('unicode-range'),display:'swap'}};
    }));
  }))).then(groups => groups.flat());
}

function museDocument(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try { const url = new URL(contents.getURL()); return url.origin === 'https://muse.ai' && !url.username && !url.password; }
  catch { return false; }
}

// Serialized into a remote document. Only structural selectors are inspected;
// there are no URLs to fetch, account reads, CSP edits or provider font changes.
function installFonts(payload) {
  if (location.origin !== 'https://muse.ai') return false;
  const key = '__musebenchBundledFontsV1';
  if (window[key]) { window[key].setEnabled(true); return true; }
  let enabled = false, faces = null, loading = false, failed = false, registered = false, frame = null;
  const recognized = () => document.querySelector('body:has([data-hatch-full-page-shell]):has([data-hatch-chat-content],[class~="@container/ideas"],#hatch-goals-create)');
  function sync() {
    const active = enabled && location.origin === 'https://muse.ai' && Boolean(recognized());
    if (faces) {
      if (active !== registered) { for (const face of faces) active ? document.fonts.add(face) : document.fonts.delete(face); registered = active; }
      return;
    }
    if (!active || loading || failed) return;
    loading = true;
    // Binary FontFace sources work offline without allowing font URLs through
    // the provider CSP. Do not block the presentation queue on font decoding.
    Promise.all(payload.map(({family, data, descriptors}) => new FontFace(family, Uint8Array.from(atob(data), character=>character.charCodeAt(0)), descriptors).load()))
      .then(loaded => { faces = loaded; sync(); }).catch(() => { failed = true; });
    payload = null;
  }
  const observer = new MutationObserver(() => {
    if (frame === null) frame = requestAnimationFrame(() => { frame = null; sync(); });
  });
  const state = {setEnabled(value) {
    enabled = value === true;
    observer.disconnect();
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
    if (enabled) observer.observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['data-hatch-full-page-shell','data-hatch-chat-content','class','id']});
    sync();
  }};
  window[key] = state;
  state.setEnabled(true);
  return true;
}

export async function applyPersonalFonts(contents, enabled) {
  if (!museDocument(contents)) return false;
  try {
    // Appearance changes reuse document-owned faces; navigation creates a fresh
    // registry even when Electron retains the same WebContents instance.
    const reused = await contents.executeJavaScript(`(()=>{if(location.origin!=='https://muse.ai')return false;const state=window.__musebenchBundledFontsV1;if(!state)return false;state.setEnabled(${enabled===true});return true;})()`);
    if (reused === true || enabled !== true) return reused === true;
    const payload = await fontPayload();
    if (!museDocument(contents)) return false;
    return await contents.executeJavaScript(`(${installFonts.toString()})(${JSON.stringify(payload)})`) === true;
  } catch { return false; }
}
