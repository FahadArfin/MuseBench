import {UI_FONT_FAMILY, MONO_FONT_FAMILY} from '../src/shared/typography.mjs';
// Private aliases prevent a document-wide font registration from changing any
// provider element that already uses the original family name.
export const PERSONAL_UI_FONT_NAME = 'MuseBench Inter Variable';
export const PERSONAL_MONO_FONT_NAME = 'MuseBench JetBrains Mono Variable';
// Finite local preferences only: never interpolate supplied CSS values.
const palettes = {
  dark: { bg:'#181818', surface:'#242424', hover:'#303030', border:'#303030', text:'#ececec', muted:'#999999', accent:'#75b3ff', action:'#0866eb', onAction:'#ffffff', code:'#111111' },
  light: { bg:'#faf9f7', surface:'#ffffff', hover:'#e5e4e0', border:'#deddd8', text:'#282828', muted:'#6e6d69', accent:'#075bcd', action:'#0866eb', onAction:'#ffffff', code:'#f0efec' },
};
const sizes = { small:'13px', medium:'14px', large:'16px' };
const systemFont = UI_FONT_FAMILY.replace('"Inter Variable"', `"${PERSONAL_UI_FONT_NAME}"`);
const monoFont = MONO_FONT_FAMILY.replace('"JetBrains Mono Variable"', `"${PERSONAL_MONO_FONT_NAME}"`);
export function resolvePersonalAppearance(appearance = {}) {
  const theme = appearance?.theme === 'light' ? 'light' : 'dark';
  return { theme, color:{...palettes[theme]}, size:Object.hasOwn(sizes,appearance?.textSize)?sizes[appearance.textSize]:sizes.medium,
    font:appearance?.font === 'mono'?monoFont:systemFont, systemFont, monoFont, reducedMotion:appearance?.reducedMotion === true };
}
