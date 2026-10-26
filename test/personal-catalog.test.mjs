import test from 'node:test';
import assert from 'node:assert/strict';
const implementation = await import('../electron/personal-catalog.mjs').catch(() => ({}));
const sample = (key = 'trip', title = 'Plan a trip') => ({ key, title, target: { type: 'link', value: '/thread/trip-123' } });
function catalog() { assert.equal(typeof implementation.createPersonalCatalog, 'function'); return implementation.createPersonalCatalog(); }

test('catalog exposes bounded metadata with opaque IDs and keeps navigation targets in main memory', () => {
  const c = catalog(); c.update('chats', { status: 'ready', items: [sample()], selectedKey: 'trip' }, true);
  const state = c.snapshot(), item = state.chats.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['id', 'kind', 'title']);
  assert.equal(item.kind, 'chat'); assert.equal(item.title, 'Plan a trip'); assert.notEqual(item.id, 'trip');
  assert.equal(JSON.stringify(state).includes('/thread/'), false); assert.equal(state.selectedId, item.id);
  assert.equal(c.get(item.id).target.value, '/thread/trip-123');
});

test('catalog removes unsafe routes and ambiguous keys before they can be selected', () => {
  const c = catalog();
  c.update('chats', { status: 'ready', items: [sample(), ...['https://evil.example/thread/a', '//evil.example/thread/a', '/thread/new', '/thread/a?secret=x', '/thread/a#fragment', '/thread/a/b', '/thread/%2f', '/ideas/a', 'https://user:secret@muse.ai/thread/a'].map((value, index) => ({ key: `bad${index}`, title: 'Unsafe', target: { type: 'link', value } })), sample('duplicate'), sample('duplicate')] });
  assert.deepEqual(c.snapshot().chats.items.map(item => item.title), ['Plan a trip']);
  assert.equal(c.get('trip'), null); assert.equal(c.get('__proto__'), null);
});

test('catalog accepts only section-compatible finite targets and sanitizes display text', () => {
  const c = catalog();
  c.update('ideas', { status: 'ready', items: [ { key: 'i', title: '  Try\n pottery\u0000  ', target: { type: 'title', value: 'Try pottery' } }, { key: 'x', title: 'Wrong', target: { type: 'main', value: '/' } } ] });
  assert.equal(c.snapshot().ideas.items[0].title, 'Try pottery'); assert.equal(c.snapshot().ideas.items.length, 1);
  c.update('chats', { status: 'ready', items: [{ key: 'main', title: 'Main conversation', target: { type: 'main', value: '/' } }] });
  assert.equal(c.snapshot().chats.items.length, 1);
});

test('catalog stable IDs survive rename but removed entries and snapshots cannot retain selection authority', () => {
  const c = catalog(); c.update('chats', { status: 'ready', items: [sample()] });
  const first = c.snapshot().chats.items[0]; c.select(first.id);
  c.update('chats', { status: 'ready', items: [sample('trip', 'New name')] });
  assert.equal(c.snapshot().chats.items[0].id, first.id);
  const exposed = c.snapshot(); exposed.chats.items[0].title = 'Tampered';
  assert.equal(c.snapshot().chats.items[0].title, 'New name');
  c.update('chats', { status: 'ready', items: [] }); assert.equal(c.get(first.id), null); assert.equal(c.snapshot().selectedId, null);
});

test('hidden collection reads cannot change the active selection and loading preserves prior items', () => {
  const c = catalog(); c.update('chats', { status: 'ready', items: [sample()], selectedKey: 'trip' }, true);
  const selected = c.snapshot().selectedId;
  c.update('ideas', { status: 'ready', items: [{ key: 'i', title: 'Pottery', target: { type: 'title', value: 'Pottery' } }], selectedKey: 'i' }, false);
  assert.equal(c.snapshot().selectedId, selected);
  c.update('chats', { status: 'loading', items: [] }); assert.equal(c.snapshot().chats.items.length, 1);
  c.reset(); assert.equal(c.snapshot().selectedId, null); assert.equal(c.snapshot().chats.items.length, 0); assert.equal(c.get(selected), null);
});

test('catalog caps collections and rejects unbounded or malformed remote metadata', () => {
  const c = catalog(); c.update('goals', { status: 'ready', items: Array.from({ length: 140 }, (_, i) => ({ key: `g${i}`, title: `Goal ${i}`, target: { type: 'link', value: `/goals/g${i}` } })) });
  assert.equal(c.snapshot().goals.items.length, 100);
  c.update('ideas', { status: 'ready', items: [{ key: 'x'.repeat(3000), title: 'No', target: { type: 'title', value: 'No' } }, { key: 'normal', title: {}, target: { type: 'title', value: 'No' } }] });
  assert.equal(c.snapshot().ideas.items.length, 0);
});
