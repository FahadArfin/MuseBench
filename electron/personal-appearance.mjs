// Finite local preferences only: never interpolate supplied CSS values.
const palettes = {
  dark: { bg:'#181818', surface:'#242424', hover:'#303030', border:'#303030', text:'#ececec', muted:'#999999', accent:'#75b3ff', action:'#0866eb', onAction:'#ffffff', code:'#111111' },
  light: { bg:'#faf9f7', surface:'#ffffff', hover:'#e5e4e0', border:'#deddd8', text:'#282828', muted:'#6e6d69', accent:'#075bcd', action:'#0866eb', onAction:'#ffffff', code:'#f0efec' },
};
const sizes = { small:'13px', medium:'14px', large:'16px' };
const systemFont = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const monoFont = '"Cascadia Code", Consolas, "Courier New", monospace';
export function resolvePersonalAppearance(appearance = {}) {
  const theme = appearance?.theme === 'light' ? 'light' : 'dark';
  return { theme, color:{...palettes[theme]}, size:Object.hasOwn(sizes,appearance?.textSize)?sizes[appearance.textSize]:sizes.medium,
    font:appearance?.font === 'mono'?monoFont:systemFont, systemFont, monoFont, reducedMotion:appearance?.reducedMotion === true };
}
