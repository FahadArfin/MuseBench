// Keep native caption buttons in the same 42px row as the workspace toolbar.
export const CHROME_HEIGHT = 42;
export function titleBarOverlay(theme) {
  if (theme !== 'light' && theme !== 'dark') throw new Error('Invalid window theme.');
  return {height: CHROME_HEIGHT, color: theme === 'light' ? '#faf9f7' : '#181818', symbolColor: theme === 'light' ? '#242424' : '#eeeeee'};
}
export function updateWindowTheme(window, theme, platform = process.platform) {
  const overlay = titleBarOverlay(theme);
  if (platform === 'win32' && window && !window.isDestroyed()) window.setTitleBarOverlay(overlay);
}
