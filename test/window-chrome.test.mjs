import test from 'node:test';
import assert from 'node:assert/strict';
import {titleBarOverlay, updateWindowTheme} from '../electron/window-chrome.mjs';

test('window theme accepts only the two resolved appearances', () => {
  for (const value of [undefined, null, {}, 'system', 'red']) assert.throws(() => titleBarOverlay(value), /Invalid window theme/);
  assert.equal(titleBarOverlay('dark').height, 42);
  assert.notEqual(titleBarOverlay('dark').symbolColor, titleBarOverlay('light').symbolColor);
});
test('theme updates cannot touch a destroyed window or unsupported native frame', () => {
  const calls = [];
  const window = {isDestroyed: () => false, setTitleBarOverlay: value => calls.push(value)};
  updateWindowTheme(window, 'light', 'win32');
  updateWindowTheme(window, 'dark', 'darwin');
  updateWindowTheme({...window, isDestroyed: () => true}, 'dark', 'win32');
  updateWindowTheme(null, 'dark', 'win32');
  assert.deepEqual(calls, [titleBarOverlay('light')]);
});
