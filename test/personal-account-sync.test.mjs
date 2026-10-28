import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPersonalAccountSync} from '../electron/personal-account-sync.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check, label = 'condition') => {
  const deadline = Date.now() + 1500;
  while (!check()) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${label}`);
    await delay(2);
  }
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const ready = (handle, displayName) => ({status:'ready', handle, ...(displayName ? {displayName} : {})});
function fixture(t, options = {}) {
  const changes = [], opened = [];
  let sourceAccount = ready('alex_morgan', 'Alex Morgan');
  const contents = {kind:'source'};
  const sync = createPersonalAccountSync({
    intervalMs:10000, retryMs:5, settleMs:1, timeoutMs:80,
    source:() => ({contents, valid:() => true}),
    read:async content => content === contents || content.kind === 'https://www.meta.ai/' ? sourceAccount : ready('alex_morgan', 'Alex Morgan'),
    openDocument:async (url, signal) => {
      const document = {url, signal, contents:{kind:url}, closeCount:0, close() { this.closeCount++; }};
      opened.push(document);
      return document;
    },
    onChange:profile => changes.push(profile),
    ...options,
  });
  t.after(() => sync.close());
  return {sync, changes, opened, contents, account(value) { sourceAccount = value; }};
}

test('publishes bounded account metadata under a stable account-scoped identity', async t => {
  const f = fixture(t);
  f.sync.start();
  await until(() => f.sync.snapshot());
  const id = `meta:${createHash('sha256').update('alex_morgan').digest('hex')}`;
  assert.deepEqual(f.sync.snapshot(), {accountId:id, accountName:'Alex Morgan', displayName:'Alex Morgan', handle:'alex_morgan', avatarSeed:id});
  const snapshot = f.sync.snapshot();
  snapshot.displayName = 'Not persisted';
  assert.equal(f.sync.snapshot().displayName, 'Alex Morgan');
  assert.equal(f.opened.length, 0);
  f.account(ready('Alex_Morgan', 'Alex Renamed'));
  f.sync.request();
  await until(() => f.sync.snapshot().displayName === 'Alex Renamed');
  assert.equal(f.sync.snapshot().accountId, id);
});

test('enriches a handle from its own profile, closes the document, and retains the name', async t => {
  const f = fixture(t);
  f.account(ready('alex_morgan'));
  f.sync.start();
  await until(() => f.opened[0]?.closeCount === 1);
  assert.equal(f.opened[0].url, 'https://www.meta.ai/@alex_morgan');
  assert.equal(f.sync.snapshot().displayName, 'Alex Morgan');
  assert.equal(f.changes[0].displayName, 'alex_morgan');
  f.sync.request();
  await delay(15);
  assert.equal(f.opened.length, 1);
  assert.equal(f.changes.length, 2, 'unchanged source handles do not downgrade or republish names');
});

test('own-profile refreshes are limited to once per five minutes', async t => {
  let now = 0;
  const f = fixture(t, {now:() => now});
  f.account(ready('alex_morgan'));
  f.sync.start();
  await until(() => f.opened[0]?.closeCount === 1);
  now = 299999;
  f.sync.request();
  await delay(15);
  assert.equal(f.opened.length, 1);
  now = 300000;
  f.sync.request();
  await until(() => f.opened[1]?.closeCount === 1);
  assert.equal(f.opened.length, 2);
});

test('uses an ephemeral root when there is no Meta source and polls its hydration', async t => {
  let rootReads = 0, profileReads = 0;
  const f = fixture(t, {
    source:() => null,
    read:async content => {
      if (content.kind === 'https://www.meta.ai/') return ++rootReads < 3 ? {status:'loading'} : ready('alex_morgan');
      return ++profileReads < 3 ? ready('alex_morgan') : ready('alex_morgan', 'Alex Morgan');
    },
  });
  f.sync.start();
  await until(() => f.sync.snapshot()?.displayName === 'Alex Morgan');
  assert.equal(rootReads, 3);
  assert.equal(profileReads, 3);
  assert.deepEqual(f.opened.map(document => document.url), ['https://www.meta.ai/','https://www.meta.ai/@alex_morgan']);
  assert.deepEqual(f.opened.map(document => document.closeCount), [1,1]);
});

test('clears old account immediately when the provider account switches and on logout', async t => {
  const f = fixture(t);
  f.sync.start();
  await until(() => f.sync.snapshot());
  f.account(ready('sam_rivera', 'Sam Rivera'));
  f.sync.request();
  await until(() => f.sync.snapshot()?.displayName === 'Sam Rivera');
  assert.equal(f.changes[1], null);
  assert.notEqual(f.changes[0].accountId, f.changes[2].accountId);
  f.account({status:'signed-out'});
  f.sync.request();
  await until(() => f.sync.snapshot() === null);
  assert.equal(f.changes.at(-1), null);
});

test('unknown and loading source reads never establish identity and retry later', async t => {
  let reads = 0;
  const f = fixture(t, {read:async () => ++reads === 1 ? {status:'unavailable'} : reads === 2 ? {status:'loading'} : ready('alex_morgan', 'Alex Morgan')});
  f.sync.start();
  await until(() => reads === 1);
  assert.equal(f.sync.snapshot(), null);
  await until(() => f.sync.snapshot()?.displayName === 'Alex Morgan');
  assert.equal(reads, 3);
});

test('invalidation aborts enrichment and ignores its late result', async t => {
  const response = deferred();
  let isEnabled = true;
  const f = fixture(t, {
    enabled:() => isEnabled,
    read:async content => content.kind === 'source' ? ready('alex_morgan') : response.promise,
  });
  f.sync.start();
  await until(() => f.opened.length === 1);
  isEnabled = false;
  f.sync.invalidate();
  assert.equal(f.sync.snapshot(), null);
  await until(() => f.opened[0].closeCount === 1);
  response.resolve(ready('alex_morgan', 'Stale Name'));
  await delay(15);
  assert.equal(f.sync.snapshot(), null);
  assert.equal(f.opened[0].signal.aborted, true);
});

test('source generation changes reject an in-flight account read', async t => {
  const response = deferred();
  let valid = true;
  const f = fixture(t, {source:() => ({contents:{}, valid:() => valid}), read:() => response.promise});
  f.sync.start();
  await delay(5);
  valid = false;
  response.resolve(ready('alex_morgan', 'Stale Name'));
  await delay(15);
  assert.equal(f.sync.snapshot(), null);
  assert.deepEqual(f.changes, []);
});

test('invalidation discards a late source read and recovers only from a fresh read', async t => {
  const response = deferred();
  let reads = 0, enabled = true;
  const f = fixture(t, {enabled:() => enabled, read:() => ++reads === 1 ? ready('alex_morgan', 'Alex Morgan') : reads === 2 ? response.promise : ready('sam_rivera', 'Sam Rivera')});
  f.sync.start();
  await until(() => f.sync.snapshot());
  f.sync.request();
  await until(() => reads === 2);
  enabled = false;
  f.sync.invalidate();
  assert.equal(f.sync.snapshot(), null);
  response.resolve(ready('alex_morgan', 'Stale Name'));
  await delay(15);
  assert.equal(f.sync.snapshot(), null);
  enabled = true;
  await until(() => f.sync.snapshot()?.displayName === 'Sam Rivera');
  assert.equal(f.changes.some(profile => profile?.displayName === 'Stale Name'), false);
});

test('failed enrichment retries promptly instead of suppressing a real name for five minutes', async t => {
  let ownReads = 0;
  const f = fixture(t, {read:async content => {
    if (content.kind === 'source') return ready('alex_morgan');
    if (++ownReads === 1) throw new Error('Temporary page failure');
    return ready('alex_morgan', 'Alex Morgan');
  }});
  f.sync.start();
  await until(() => f.sync.snapshot()?.displayName === 'Alex Morgan');
  assert.equal(ownReads, 2);
  assert.equal(f.opened.length, 2);
  assert.deepEqual(f.opened.map(document => document.closeCount), [1,1]);
});

test('successful owned root polling is less frequent than retained DOM polling', async t => {
  const f = fixture(t, {source:() => null, intervalMs:5});
  f.sync.start();
  await until(() => f.opened[0]?.closeCount === 1);
  await delay(40);
  assert.equal(f.opened.length, 1, 'background root remains closed between five-minute refreshes');
});

test('a mismatching profile account clears identity and does not trust the retained stale source again', async t => {
  let isEnabled = true;
  const f = fixture(t, {
    enabled:() => isEnabled,
    read:async content => content.kind === 'source' ? ready('alex_morgan') : content.kind === 'https://www.meta.ai/' ? {status:'signed-out'} : ready('sam_rivera', 'Sam Rivera'),
  });
  f.sync.start();
  await until(() => f.opened.some(document => document.url === 'https://www.meta.ai/'));
  await until(() => f.opened.every(document => document.closeCount === 1));
  isEnabled = false;
  assert.equal(f.sync.snapshot(), null);
  assert.deepEqual(f.changes.map(profile => profile?.displayName ?? null), ['alex_morgan', null]);
});

test('disabled sync never opens or reads provider documents and retries when enabled', async t => {
  let enabled = false, reads = 0;
  const f = fixture(t, {enabled:() => enabled, read:async () => { reads++; return ready('alex_morgan', 'Alex Morgan'); }});
  f.sync.start();
  await delay(15);
  assert.equal(reads, 0);
  assert.equal(f.opened.length, 0);
  enabled = true;
  await until(() => f.sync.snapshot());
  assert.equal(reads, 1);
});

test('timeouts bound stuck reads and clean up owned documents', async t => {
  const f = fixture(t, {source:() => null, read:() => new Promise(() => {}), timeoutMs:20, retryMs:10000});
  f.sync.start();
  await until(() => f.opened[0]?.closeCount === 1);
  assert.equal(f.opened[0].signal.aborted, true);
  assert.equal(f.sync.snapshot(), null);
  assert.equal(f.opened.length, 1);
});

test('late factories are disposed after close and cannot publish', async t => {
  const opening = deferred();
  let calls = 0, closes = 0;
  const f = fixture(t, {source:() => null, openDocument:() => { calls++; return opening.promise; }});
  f.sync.start();
  await until(() => calls === 1);
  f.sync.close();
  opening.resolve({contents:{}, close:() => { closes++; }});
  await until(() => closes === 1);
  f.sync.request();
  f.sync.start();
  f.sync.invalidate();
  await delay(15);
  assert.equal(calls, 1);
  assert.deepEqual(f.changes, []);
});

test('requests during an active read coalesce to one follow-up and unchanged identities do not republish', async t => {
  const first = deferred();
  let reads = 0;
  const f = fixture(t, {read:() => ++reads === 1 ? first.promise : ready('alex_morgan', 'Alex Morgan')});
  f.sync.start();
  await until(() => reads === 1);
  for (let index = 0; index < 10; index++) f.sync.request();
  first.resolve(ready('alex_morgan', 'Alex Morgan'));
  await until(() => reads === 2);
  await delay(15);
  assert.equal(reads, 2);
  assert.equal(f.changes.length, 1);
});

for (const oldName of ['Alex Morgan', undefined]) {
  test(`retained previous account ${oldName ? 'with a name' : 'with only a handle'} cannot replace the confirmed current account`, async t => {
    let rendered = ready('alex_morgan', 'Alex Morgan');
    let session = rendered;
    const f = fixture(t, {read:async content => content.kind === 'source' ? rendered : session});
    f.sync.start();
    await until(() => f.sync.snapshot()?.displayName === 'Alex Morgan');
    rendered = session = ready('sam_rivera', 'Sam Rivera');
    f.sync.request();
    await until(() => f.sync.snapshot()?.displayName === 'Sam Rivera');
    assert.equal(f.opened[0].url, 'https://www.meta.ai/', 'a changed identity is checked against the current session');
    const accepted = f.changes.length;
    rendered = ready('alex_morgan', oldName);
    f.sync.request();
    await until(() => f.opened[1]?.closeCount === 1);
    assert.equal(f.sync.snapshot()?.displayName, 'Sam Rivera');
    assert.deepEqual(f.changes.slice(accepted), [], 'the prior account must never flash in the UI');
    f.sync.request();
    await until(() => f.opened[2]?.closeCount === 1);
    assert.equal(f.sync.snapshot()?.displayName, 'Sam Rivera');
    assert.deepEqual(f.changes.slice(accepted), []);
  });
}

test('a changed source account is not published while its current-session check is pending', async t => {
  let rendered = ready('alex_morgan', 'Alex Morgan');
  const confirmation = deferred();
  const f = fixture(t, {read:content => content.kind === 'source' ? rendered : confirmation.promise});
  f.sync.start();
  await until(() => f.sync.snapshot());
  rendered = ready('sam_rivera', 'Sam Rivera');
  f.sync.request();
  await until(() => f.opened.length === 1);
  assert.equal(f.sync.snapshot().displayName, 'Alex Morgan');
  assert.equal(f.changes.some(profile => profile?.handle === 'sam_rivera'), false);
  confirmation.resolve(ready('alex_morgan', 'Alex Morgan'));
  await until(() => f.opened[0].closeCount === 1);
  assert.equal(f.sync.snapshot().displayName, 'Alex Morgan');
});

test('logout prevents a retained profile from resurrecting an account without a current-session check', async t => {
  let rendered = ready('alex_morgan', 'Alex Morgan');
  let session = rendered;
  const f = fixture(t, {read:async content => content.kind === 'source' ? rendered : session});
  f.sync.start();
  await until(() => f.sync.snapshot());
  rendered = session = {status:'signed-out'};
  f.sync.request();
  await until(() => f.sync.snapshot() === null);
  const signedOut = f.changes.length;
  rendered = ready('alex_morgan', 'Alex Morgan');
  f.sync.request();
  await until(() => f.opened[1]?.closeCount === 1);
  assert.equal(f.sync.snapshot(), null);
  assert.deepEqual(f.changes.slice(signedOut), []);
  session = ready('sam_rivera', 'Sam Rivera');
  f.sync.request();
  await until(() => f.sync.snapshot()?.displayName === 'Sam Rivera');
  assert.equal(f.changes.slice(signedOut).some(profile => profile?.handle === 'alex_morgan'), false);
});

test('a retained signed-out page cannot clear a newly confirmed account but genuine session logout does', async t => {
  let rendered = ready('alex_morgan', 'Alex Morgan');
  let session = rendered;
  const f = fixture(t, {read:async content => content.kind === 'source' ? rendered : session});
  f.sync.start();
  await until(() => f.sync.snapshot()?.displayName === 'Alex Morgan');
  rendered = session = ready('sam_rivera', 'Sam Rivera');
  f.sync.request();
  await until(() => f.sync.snapshot()?.displayName === 'Sam Rivera');
  const confirmed = f.changes.length;
  rendered = {status:'signed-out'};
  f.sync.request();
  await until(() => f.opened[1]?.closeCount === 1);
  assert.equal(f.sync.snapshot().displayName, 'Sam Rivera');
  assert.deepEqual(f.changes.slice(confirmed), [], 'stale logout must not clear the valid current profile');
  f.sync.request();
  await until(() => f.opened[2]?.closeCount === 1);
  assert.equal(f.sync.snapshot().displayName, 'Sam Rivera');
  assert.deepEqual(f.changes.slice(confirmed), []);
  session = {status:'signed-out'};
  f.sync.request();
  await until(() => f.sync.snapshot() === null);
  assert.deepEqual(f.changes.slice(confirmed), [null]);
});

test('invalidation requires fresh verification even when an old source handle matches the last account', async t => {
  let session = ready('alex_morgan', 'Alex Morgan');
  const f = fixture(t, {read:async content => content.kind === 'source' ? ready('alex_morgan', 'Alex Morgan') : session});
  f.sync.start();
  await until(() => f.sync.snapshot());
  session = ready('sam_rivera', 'Sam Rivera');
  f.sync.invalidate();
  const invalidated = f.changes.length;
  await until(() => f.sync.snapshot()?.displayName === 'Sam Rivera');
  assert.equal(f.opened[0].url, 'https://www.meta.ai/');
  assert.equal(f.changes.slice(invalidated).some(profile => profile?.handle === 'alex_morgan'), false);
});

const microtasks = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };

test('persistent background document failures back off exponentially to five minutes and explicit requests remain prompt', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let attempts = 0;
  const f = fixture(t, {source:() => null, openDocument:async () => { attempts++; throw Error('Offline'); }});
  f.sync.start();
  t.mock.timers.tick(1); await microtasks();
  assert.equal(attempts, 1);
  for (const pause of [5,10,20,40,80,160,320,640,1280,2560,5120,10240,20480,40960,81920,163840,300000,300000]) {
    const previous = attempts;
    t.mock.timers.tick(pause - 1); await microtasks();
    assert.equal(attempts, previous, `background attempt must wait ${pause} ms`);
    t.mock.timers.tick(1); await microtasks();
    assert.equal(attempts, previous + 1);
  }
  const previous = attempts;
  f.sync.request();
  t.mock.timers.tick(1); await microtasks();
  assert.equal(attempts, previous + 1);
  assert.equal(f.sync.snapshot(), null);
});

test('a provider profile with no full name closes at the deadline and backs off enrichment retries', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f = fixture(t, {timeoutMs:10, read:async () => ready('alex_morgan')});
  f.sync.start();
  t.mock.timers.tick(1); await microtasks();
  assert.equal(f.opened.length, 1);
  for (const pause of [5,10,20,40]) {
    t.mock.timers.tick(10); await microtasks();
    assert.equal(f.opened.at(-1).closeCount, 1);
    const previous = f.opened.length;
    t.mock.timers.tick(pause - 1); await microtasks();
    assert.equal(f.opened.length, previous);
    t.mock.timers.tick(1); await microtasks();
    assert.equal(f.opened.length, previous + 1);
  }
  assert.equal(f.sync.snapshot().displayName, 'alex_morgan');
});
