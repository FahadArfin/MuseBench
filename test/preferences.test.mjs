import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, normalizePreferences, readPreferences, writePreferences, resolveTheme } from '../src/ui/preferences.mjs';

test('missing, malformed and unavailable saved preferences use dark defaults without throwing', () => {
  for (const value of [null, '', '{broken', 'null', '[]', 'true', '7', '"dark"']) {
    assert.deepEqual(readPreferences({getItem: () => value}), DEFAULT_PREFERENCES);
  }
  assert.deepEqual(readPreferences({getItem: () => { throw new Error('storage unavailable'); }}), DEFAULT_PREFERENCES);
  assert.deepEqual(readPreferences(null), DEFAULT_PREFERENCES);
  assert.equal(DEFAULT_PREFERENCES.enterToSend, true);
  assert.equal(DEFAULT_PREFERENCES.theme, 'dark');
});

test('unknown saved values fall back individually while valid preferences survive', () => {
  const preferences = normalizePreferences({theme:'sepia',textSize:'large',font:'serif',reducedMotion:true,enterToSend:'true',sidebarCollapsed:true,unrelated:'ignored'});
  assert.deepEqual(preferences, {...DEFAULT_PREFERENCES,textSize:'large',reducedMotion:true,sidebarCollapsed:true});
  const inherited = Object.create({theme:'light',enterToSend:true});
  assert.deepEqual(normalizePreferences(inherited), DEFAULT_PREFERENCES);
});

test('saving and reloading preserves every supported preference without mutating defaults', () => {
  const stored = new Map();
  const storage = {getItem:key=>stored.get(key) ?? null,setItem:(key,value)=>stored.set(key,value)};
  const preferences = {theme:'system',textSize:'small',font:'mono',reducedMotion:true,enterToSend:true,sidebarCollapsed:true};
  assert.equal(writePreferences(preferences,storage),true);
  assert.equal(stored.size,1);
  assert.ok(stored.has(PREFERENCES_KEY));
  assert.deepEqual(readPreferences(storage),{...DEFAULT_PREFERENCES,...preferences});
  const recovered=readPreferences(storage);
  recovered.theme='light';
  assert.equal(readPreferences(storage).theme,'system');
  assert.equal(DEFAULT_PREFERENCES.theme,'dark');
});

test('new settings migrate old preferences and reject unsafe or malformed defaults independently', () => {
  const old = normalizePreferences({theme:'light',enterToSend:true});
  assert.equal(old.transcriptWidth,'narrow');
  assert.equal(old.defaultReasoning,'high');
  assert.equal(old.defaultApproval,'ask');
  assert.equal(old.notifyCompletion,false);
  const valid = normalizePreferences({...old,transcriptWidth:'wide',defaultReasoning:'ultra',defaultApproval:'auto',notifyCompletion:true,notifyAttention:true,notificationSound:true});
  const storage={getItem:()=>JSON.stringify(valid)};
  assert.equal(readPreferences(storage).defaultApproval,'auto');
  assert.equal(readPreferences(storage).transcriptWidth,'wide');
  const invalid=normalizePreferences({...valid,defaultApproval:'full-access',defaultReasoning:'infinite',transcriptWidth:100,notifyCompletion:'true'});
  assert.equal(invalid.defaultApproval,'ask');
  assert.equal(invalid.defaultReasoning,'high');
  assert.equal(invalid.transcriptWidth,'narrow');
  assert.equal(invalid.notifyCompletion,false);
  assert.equal(invalid.notifyAttention,true);
});

test('storage failures leave preferences usable and theme follows system only when selected', () => {
  assert.equal(writePreferences(DEFAULT_PREFERENCES,{setItem:()=>{throw new Error('quota');}}),false);
  assert.equal(writePreferences(DEFAULT_PREFERENCES,null),false);
  assert.equal(resolveTheme('system',true),'dark');
  assert.equal(resolveTheme('system',false),'light');
  assert.equal(resolveTheme('dark',false),'dark');
  assert.equal(resolveTheme('light',true),'light');
});

test('legacy Enter preference upgrades once and later explicit opt-outs survive reload', () => {
  let saved=JSON.stringify({theme:'light',enterToSend:false,defaultApproval:'auto'});
  const storage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
  const upgraded=readPreferences(storage);
  assert.equal(upgraded.enterToSend,true);
  assert.equal(upgraded.theme,'light');
  assert.equal(upgraded.defaultApproval,'auto');
  writePreferences(upgraded,storage);
  assert.equal(readPreferences(storage).enterToSend,true);
  writePreferences({...upgraded,enterToSend:false},storage);
  assert.equal(readPreferences(storage).enterToSend,false);
});

test('prediction preferences default to local suggestions and persist explicit Muse opt-in',()=>{const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};assert.equal(DEFAULT_PREFERENCES.showPredictions,true);assert.equal(DEFAULT_PREFERENCES.musePredictions,false);writePreferences({...DEFAULT_PREFERENCES,showPredictions:false,musePredictions:true},storage);const restored=readPreferences(storage);assert.equal(restored.showPredictions,false);assert.equal(restored.musePredictions,true);assert.equal(normalizePreferences({musePredictions:'yes'}).musePredictions,false);});
