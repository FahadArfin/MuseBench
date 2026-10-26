import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
const { createStartupFailureHandler } = await import('../electron/startup.mjs').catch(() => ({}));

function harness(window) {
  assert.equal(typeof createStartupFailureHandler, 'function');
  const app = new EventEmitter();
  const dialogs = [];
  let quitCalls = 0;
  app.quit = () => { quitCalls++; app.emit('before-quit'); };
  const handle = createStartupFailureHandler({ app, dialog: { showErrorBox: (title, message) => dialogs.push({ title, message }) }, getWindow: () => window });
  return { app, handle, dialogs, quitCalls: () => quitCalls };
}

test('quitting during initial navigation does not show a startup failure', () => {
  const h = harness({ isDestroyed: () => false });
  h.app.emit('before-quit');
  h.handle(new Error('ERR_FAILED (-2) loading local document'));
  assert.deepEqual(h.dialogs, []);
  assert.equal(h.quitCalls(), 0, 'an in-progress quit is not restarted');
});

test('a destroyed startup window does not show a startup failure', () => {
  const h = harness({ isDestroyed: () => true });
  h.handle(new Error('ERR_FAILED (-2) loading local document'));
  assert.deepEqual(h.dialogs, []);
  assert.equal(h.quitCalls(), 0);
});

test('genuine local document failure still reports the error and quits', () => {
  const h = harness({ isDestroyed: () => false });
  h.handle(new Error('ERR_FAILED (-2) loading local document'));
  assert.equal(h.dialogs.length, 1);
  assert.match(h.dialogs[0].message, /ERR_FAILED/);
  assert.equal(h.quitCalls(), 1);
});

test('failure before a window exists still reports the error and quits', () => {
  const h = harness(undefined);
  h.handle(new Error('Controller could not open its database'));
  assert.equal(h.dialogs.length, 1);
  assert.match(h.dialogs[0].message, /database/);
  assert.equal(h.quitCalls(), 1);
});
