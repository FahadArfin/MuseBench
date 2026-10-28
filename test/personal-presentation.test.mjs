import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const adapter = await import('../electron/personal-presentation.mjs').catch(() => ({}));

function navigationFixture({ effect = 'url', hydrateAt = 0, initialDialog = false } = {}) {
  let time = 0, clicks = 0, hydrated = hydrateAt === 0;
  const location = { origin: 'https://muse.ai', href: 'https://muse.ai/' };
  const attrs = new Map(), dialogs = [];
  const dialog = (id, visible = true) => ({ id, hidden: !visible, getClientRects: () => visible ? [{}] : [], getAttribute: name => name === 'aria-label' ? 'Search Muse' : null });
  if (initialDialog) dialogs.push(dialog('existing-dialog'));
  function makeControl(ready) {
    return { disabled: false, getAttribute: name => attrs.get(name) ?? null, dispatchEvent() {}, click() {
      clicks++;
      if (!ready) return;
      if (effect === 'url') location.href = 'https://muse.ai/fixture-destination';
      if (effect === 'control') attrs.set('aria-expanded', 'true');
      if (effect === 'dialog') dialogs.push(dialog('new-dialog'));
      if (effect === 'hidden-dialog') dialogs.push(dialog('new-dialog', false));
    } };
  }
  let control = makeControl(hydrated);
  const dock = { querySelector: () => control };
  const context = {
    location, crypto: webcrypto, TextEncoder,
    Date: { now: () => time },
    setTimeout(callback, milliseconds) { time += milliseconds; if (!hydrated && time >= hydrateAt) { hydrated = true; control = makeControl(true); } queueMicrotask(callback); },
    PointerEvent: class {}, MouseEvent: class {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    document: {
      readyState: 'complete',
      querySelector: selector => selector === '[data-hatch-dock]' ? dock : null,
      querySelectorAll: selector => selector === '[role="dialog"]' ? dialogs : [],
    },
  };
  return {
    contents: { isDestroyed: () => false, getURL: () => location.href, executeJavaScript: code => runInNewContext(code, context) },
    location, attrs, dialogs, clicks: () => clicks, hydrated: () => hydrated, removeControl: () => { control = null; },
  };
}

test('inert dock controls do not report success or get retried, and a later hydrated click can succeed', async () => {
  for (const action of ['search', 'feed', 'library']) {
    const fixture = navigationFixture({ hydrateAt: 160 });
    assert.equal(await adapter.runPersonalAction(fixture.contents, action), false, `${action}: an inert click is not completed navigation`);
    assert.equal(fixture.clicks(), 1, `${action}: do not retry a possible toggle during hydration`);
    assert.equal(fixture.hydrated(), true);
    assert.equal(await adapter.runPersonalAction(fixture.contents, action), true, `${action}: a later explicit click can use the hydrated replacement`);
    assert.equal(fixture.clicks(), 2);
  }
});

test('Muse shortcut completion accepts an observed URL, active control or new visible dialog', async () => {
  for (const effect of ['url', 'control', 'dialog']) {
    const fixture = navigationFixture({ effect });
    assert.equal(await adapter.runPersonalAction(fixture.contents, 'search'), true, effect);
    assert.equal(fixture.clicks(), 1);
  }
  for (const effect of ['none', 'hidden-dialog']) {
    const fixture = navigationFixture({ effect, initialDialog: true });
    assert.equal(await adapter.runPersonalAction(fixture.contents, 'search'), false, 'An existing or hidden dialog is not successful navigation');
    assert.equal(fixture.clicks(), 1);
  }
});

test('Feed and Library already marked active are ready without another navigation click', async () => {
  for (const action of ['feed', 'library']) {
    for (const [attribute, value] of [['aria-selected', 'true'], ['aria-current', 'page'], ['aria-pressed', 'true'], ['data-active', 'true'], ['data-state', 'active']]) {
      const fixture = navigationFixture({ effect: 'none' });
      fixture.attrs.set(attribute, value);
      assert.equal(await adapter.runPersonalAction(fixture.contents, action), true, `${action}: ${attribute}`);
      assert.equal(fixture.clicks(), 0, 'An active navigation control must not be toggled or clicked again');
    }
  }
});

test('a reloaded Feed or Library can reuse its previously verified URL without guessing routes or clicking again', async () => {
  for (const action of ['feed', 'library']) {
    const first = navigationFixture();
    assert.equal(await adapter.runPersonalAction(first.contents, action), true);
    const verifiedURL = first.location.href;
    const reloaded = navigationFixture({ effect: 'none' });
    reloaded.location.href = verifiedURL;
    assert.equal(await adapter.runPersonalAction(reloaded.contents, action, verifiedURL), true);
    assert.equal(reloaded.clicks(), 0);
    const unverified = navigationFixture({ effect: 'none' });
    unverified.location.href = verifiedURL;
    assert.equal(await adapter.runPersonalAction(unverified.contents, action), false, 'The same URL is not evidence without a previous verified result');
    assert.equal(unverified.clicks(), 1);
  }
  for (const expectedURL of ['https://muse.ai/', 'https://muse.ai/?tool=feed', 'https://name:secret@muse.ai/tool', 'https://other.example/tool', 'http://muse.ai/tool']) {
    const fixture = navigationFixture({ effect: 'none' });
    fixture.location.href = expectedURL;
    assert.equal(await adapter.runPersonalAction(fixture.contents, 'feed', expectedURL), false, 'Root and non-service URLs cannot validate a cached tool');
  }
  const search = navigationFixture({ effect: 'none' });
  search.location.href = 'https://muse.ai/fixture-search';
  assert.equal(await adapter.runPersonalAction(search.contents, 'search', search.location.href), false, 'Search still requires its overlay to open');
});

test('tool state is an opaque stable structural signature that changes on closed dialogs without reading queries', async () => {
  assert.equal(typeof adapter.readPersonalToolState, 'function');
  const fixture = navigationFixture({ effect: 'dialog' });
  const initial = await adapter.readPersonalToolState(fixture.contents, 'search');
  assert.match(initial, /^[a-f0-9]{64}$/);
  assert.equal(await adapter.runPersonalAction(fixture.contents, 'search'), true);
  const opened = await adapter.readPersonalToolState(fixture.contents, 'search');
  assert.notEqual(opened, initial);
  fixture.dialogs[0].query = 'Private query must not be inspected';
  assert.equal(await adapter.readPersonalToolState(fixture.contents, 'search'), opened);
  fixture.dialogs.pop();
  assert.equal(await adapter.readPersonalToolState(fixture.contents, 'search'), initial);
  fixture.attrs.set('aria-expanded', 'true');
  assert.notEqual(await adapter.readPersonalToolState(fixture.contents, 'search'), initial);
  fixture.attrs.clear();
  fixture.removeControl();
  assert.notEqual(await adapter.readPersonalToolState(fixture.contents, 'search'), initial, 'Removing an unmarked control must invalidate its cached state');
  assert.equal(await adapter.readPersonalToolState(fixture.contents, 'settings'), null);
  assert.equal(await adapter.readPersonalToolState({ isDestroyed: () => true }, 'search'), null);
});

test('presentation adapter never executes in authentication or unrelated documents', async () => {
  assert.equal(typeof adapter.applyPersonalPresentation, 'function');
  for (const url of ['https://auth.muse.ai/', 'https://auth.meta.ai/', 'https://www.facebook.com/', 'https://muse.ai.evil.example/', 'file:///test.html', 'https://name:secret@muse.ai/']) {
    const contents = { isDestroyed: () => false, getURL: () => url, executeJavaScript() { assert.fail('must not inspect this document'); }, insertCSS() { assert.fail('must not style this document'); } };
    assert.equal(await adapter.applyPersonalPresentation(contents, true), false, url);
    assert.equal(await adapter.runPersonalAction(contents, 'whatsapp'), false, url);
  }
});

test('page actions accept only the finite navigation contract', async () => {
  assert.equal(typeof adapter.runPersonalAction, 'function');
  const contents = { isDestroyed: () => false, getURL: () => 'https://muse.ai/', executeJavaScript() { assert.fail('unknown action must not execute'); } };
  for (const action of ['sendMessage', 'logout', 'grant', 'whatsapp;alert(1)', null, {}]) assert.equal(await adapter.runPersonalAction(contents, action), false);
});

test('destroyed contents do not access native getters', async () => {
  assert.equal(typeof adapter.applyPersonalPresentation, 'function');
  const contents = { isDestroyed: () => true, getURL() { assert.fail('destroyed native getter'); } };
  assert.equal(await adapter.applyPersonalPresentation(contents, true), false);
  assert.equal(await adapter.runPersonalAction(contents, 'settings'), false);
});

test('rapid appearance changes and original-layout restoration leave no stale stylesheet', async () => {
  const sheets = new Map(); let sequence=0, release;
  const ready = new Promise(resolve=>{release=resolve;});
  const contents={isDestroyed:()=>false,getURL:()=>'https://muse.ai/',
    async insertCSS(css,options){await ready;assert.equal(options.cssOrigin,'author');const key=String(++sequence);sheets.set(key,css);return key;},
    async removeInsertedCSS(key){sheets.delete(key);},
  };
  const dark=adapter.applyPersonalPresentation(contents,true,{theme:'dark'});
  const light=adapter.applyPersonalPresentation(contents,true,{theme:'light',textSize:'large'});
  const original=adapter.applyPersonalPresentation(contents,false);
  release(); await Promise.all([dark,light,original]); assert.equal(sheets.size,0);
  await adapter.applyPersonalPresentation(contents,true,{theme:'light',textSize:'large'});
  assert.equal(sheets.size,1); assert.match([...sheets.values()][0],/--mb-chat-bg:#faf9f7/);
});
