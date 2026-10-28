import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSessionDurability } from '../electron/session-durability.mjs';
import { createAppUpdates, createUpdateShutdown } from '../electron/app-updates.mjs';

function setup(options = {}) {
  const app = new EventEmitter(), timers = new Map();
  let id = 0;
  const durability = createSessionDurability({ app, setTimeout(fn, ms) { const token = ++id; timers.set(token, {fn, ms}); return token; }, clearTimeout: token => timers.delete(token), ...options });
  const session = (persistent = true, flush = async () => {}) => {
    const writes = [], cookies = new EventEmitter();
    cookies.flushStore = async () => { writes.push('cookies'); await flush(); };
    const value = { cookies, isPersistent: () => persistent, flushStorageData: () => writes.push('storage') };
    app.emit('session-created', value);
    return { value, writes };
  };
  return { app, timers, durability, session };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('only native persistent sessions are tracked, deduplicated and flushed on close', async () => {
  const {app, durability, session} = setup();
  const personal = session(), billing = session(), temporary = session(false);
  durability.track(personal.value);
  assert.equal(personal.value.cookies.listenerCount('changed'), 1);
  const closing = durability.close();
  assert.equal(durability.close(), closing);
  await closing;
  assert.deepEqual(personal.writes, ['storage', 'cookies']);
  assert.deepEqual(billing.writes, ['storage', 'cookies']);
  assert.deepEqual(temporary.writes, []);
  assert.equal(app.listenerCount('session-created'), 0);
  assert.equal(personal.value.cookies.listenerCount('changed'), 0);
  const late = session();
  assert.equal(late.value.cookies.listenerCount('changed'), 0);
});

test('cookie changes are coalesced without reading event arguments and final close writes again', async () => {
  const {timers, durability, session} = setup();
  const persistent = session();
  const forbidden = new Proxy({}, {get() { assert.fail('Cookie values must not be inspected'); }});
  persistent.value.cookies.emit('changed', forbidden, forbidden);
  persistent.value.cookies.emit('changed', forbidden, forbidden);
  assert.equal(timers.size, 1);
  const [token, timer] = [...timers][0]; timers.delete(token); assert.equal(timer.ms, 1000); timer.fn();
  await tick();
  assert.deepEqual(persistent.writes, ['storage', 'cookies']);
  await durability.close();
  assert.deepEqual(persistent.writes, ['storage', 'cookies', 'storage', 'cookies']);
});

test('final flush waits for an in-flight early write and includes later changes', async () => {
  const {timers, durability, session} = setup();
  let release, count = 0;
  const persistent = session(true, () => ++count === 1 ? new Promise(resolve => {release = resolve;}) : undefined);
  persistent.value.cookies.emit('changed');
  const [token, timer] = [...timers][0]; timers.delete(token); timer.fn();
  persistent.value.cookies.emit('changed');
  const closing = durability.close();
  await tick(); assert.equal(count, 1);
  release(); await closing; assert.equal(count, 2);
  assert.equal(timers.size, 0);
});

test('a failed early write is retried on close and a final error is sanitized', async () => {
  const {timers, durability, session} = setup();
  let count = 0;
  const persistent = session(true, async () => { if (++count === 1) throw Error('private provider information'); });
  persistent.value.cookies.emit('changed');
  const [token, timer] = [...timers][0]; timers.delete(token); timer.fn();
  await tick(); await durability.close(); assert.equal(count, 2);
  const failed = setup(); failed.session(true, async () => {throw Error('private provider information');});
  await assert.rejects(failed.durability.close(), {message:'Browser session storage could not be saved.'});
});

test('stalled storage is bounded and blocks update installation after teardown', async () => {
  const {durability, session} = setup({setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, timeoutMs: 20});
  session(true, () => new Promise(() => {}));
  let installed = false;
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => updater.emit('update-available', {version:'0.2.999'});
  updater.downloadUpdate = async () => updater.emit('update-downloaded', {version:'0.2.999'});
  updater.quitAndInstall = () => {installed = true;};
  const shutdown = createUpdateShutdown({isBusy:()=>false, voice:async()=>({status:'idle'}), lock:()=>{}, closeServices:()=>durability.close(), verifyClosed:()=>true});
  const updates = createAppUpdates({updater, version:'0.2.1', enabled:true, isBusy:()=>false, prepareInstall:()=>shutdown.prepare()});
  await updates.dispatch('check'); await updates.dispatch('download'); await updates.dispatch('install');
  assert.equal(installed, false); assert.equal(updates.snapshot().status, 'restart-required');
  updates.close();
});
