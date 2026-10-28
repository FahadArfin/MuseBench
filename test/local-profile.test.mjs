import test from 'node:test';
import assert from 'node:assert/strict';
import * as implementation from '../src/ui/local-profile.mjs';

const account = {accountId:'meta:fixture-alice',accountName:'Alice Rivera',displayName:'Alice Rivera',handle:'alice',avatarSeed:'account-alice'};
const other = {accountId:'meta:fixture-bob',accountName:'Bob Rivera',displayName:'Bob Rivera',handle:'bob',avatarSeed:'account-bob'};
const legacyKey = 'musebench-profile:account:local';
function api() { return implementation; }
function storage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key,value]) => [key,JSON.stringify(value)]));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}

test('account storage survives provider renames and avatar changes without sharing another account', () => {
  const {profileStorageKey} = api();
  assert.equal(profileStorageKey(account),profileStorageKey({...account,displayName:'Alice Updated',avatarSeed:'mascot-3'}));
  assert.notEqual(profileStorageKey(account),profileStorageKey(other));
  assert.notEqual(profileStorageKey(account),profileStorageKey({...account,sample:true}));
});

test('a verified account receives the old local profile once, preserving chosen fields and its backup', () => {
  const {migrateLocalProfile,readProfileOverrides,resolveLocalProfile} = api();
  const chosen = {displayName:'My chosen name',handle:'custom.handle',bio:'Building tools',avatarSeed:'mascot-2',avatarImage:'data:image/png;base64,YQ==',setupComplete:true};
  const saved = storage({[legacyKey]:chosen});
  assert.equal(migrateLocalProfile(account,saved),true);
  assert.deepEqual(readProfileOverrides(account,saved),chosen);
  assert.deepEqual(JSON.parse(saved.getItem(legacyKey)),chosen);
  migrateLocalProfile(other,saved);
  assert.deepEqual(readProfileOverrides(other,saved),{});
  assert.deepEqual(readProfileOverrides(null,saved),{});
  assert.equal(resolveLocalProfile(other,readProfileOverrides(other,saved)).displayName,'Bob Rivera');
  assert.equal(resolveLocalProfile(account,readProfileOverrides(account,saved)).accountId,account.accountId);
});

test('legacy fallback names do not mask the account name while bio and avatar survive', () => {
  const {migrateLocalProfile,readProfileOverrides,resolveLocalProfile} = api();
  const saved = storage({[legacyKey]:{displayName:'Your account',bio:'My bio',avatarSeed:'mascot-4'}});
  migrateLocalProfile(account,saved);
  const result = resolveLocalProfile(account,readProfileOverrides(account,saved));
  assert.equal(result.displayName,'Alice Rivera');
  assert.equal(result.bio,'My bio');
  assert.equal(result.avatarSeed,'mascot-4');
});

test('edits made before the first account is discovered migrate with that account', () => {
  const {writeLocalProfile,migrateLocalProfile,readProfileOverrides} = api();
  const saved=storage();
  writeLocalProfile(null,{displayName:'My local name',bio:'Keep my draft'},saved);
  assert.equal(readProfileOverrides(null,saved).displayName,'My local name');
  migrateLocalProfile(account,saved);
  assert.deepEqual(readProfileOverrides(account,saved),{displayName:'My local name',bio:'Keep my draft'});
  assert.deepEqual(readProfileOverrides(null,saved),{});
});

test('saving another field keeps unchanged provider defaults automatic', () => {
  const {writeLocalProfile,readProfileOverrides,resolveLocalProfile,profileStorageKey} = api();
  const saved = storage();
  writeLocalProfile(account,{...account,bio:'My new bio'},saved);
  assert.deepEqual(JSON.parse(saved.getItem(profileStorageKey(account))),{bio:'My new bio'});
  const renamed = {...account,accountName:'Alice Updated',displayName:'Alice Updated',handle:'alice.updated',avatarSeed:'updated-avatar'};
  const result = resolveLocalProfile(renamed,readProfileOverrides(renamed,saved));
  assert.equal(result.displayName,'Alice Updated');
  assert.equal(result.handle,'alice.updated');
  assert.equal(result.avatarSeed,'updated-avatar');
  assert.equal(result.bio,'My new bio');
});

test('custom names persist and choosing the account name removes only its override', () => {
  const {writeLocalProfile,readProfileOverrides,resolveLocalProfile} = api();
  const saved = storage();
  writeLocalProfile(account,{...account,displayName:'A custom name',bio:'Keep this',avatarSeed:'mascot-7'},saved);
  const profile = resolveLocalProfile(account,readProfileOverrides(account,saved));
  assert.equal(profile.displayName,'A custom name');
  writeLocalProfile(account,{...profile,displayName:account.accountName},saved);
  assert.deepEqual(readProfileOverrides(account,saved),{bio:'Keep this',avatarSeed:'mascot-7'});
});

test('saved identity fields cannot replace the authenticated account', () => {
  const {writeLocalProfile,readProfileOverrides,profileStorageKey,resolveLocalProfile} = api();
  const saved = storage();
  writeLocalProfile(account,{...other,displayName:'Custom',sample:true,bio:'Saved'},saved);
  const raw = JSON.parse(saved.getItem(profileStorageKey(account)));
  for (const field of ['accountId','accountName','sample']) assert.equal(Object.hasOwn(raw,field),false);
  saved.setItem(profileStorageKey(account),JSON.stringify({...raw,accountId:'wrong',accountName:'Wrong',sample:true}));
  const result = resolveLocalProfile(account,readProfileOverrides(account,saved));
  assert.equal(result.accountId,account.accountId);
  assert.equal(result.accountName,account.accountName);
  assert.equal(result.sample,undefined);
});

test('malformed preferences and inaccessible storage keep the provider name available', () => {
  const {readProfileOverrides,profileStorageKey,resolveLocalProfile,writeLocalProfile,migrateLocalProfile} = api();
  for (const invalid of ['{broken','null','[]','7']) {
    const saved = storage(); saved.setItem(profileStorageKey(account),invalid);
    assert.equal(resolveLocalProfile(account,readProfileOverrides(account,saved)).displayName,account.displayName);
  }
  const unavailable = {getItem(){throw Error('Unavailable');},setItem(){throw Error('Unavailable');}};
  assert.deepEqual(readProfileOverrides(account,unavailable),{});
  assert.equal(migrateLocalProfile(account,unavailable),false);
  assert.throws(()=>writeLocalProfile(account,{displayName:'Custom'},unavailable),/Unavailable/);
});

test('a partially written migration is recoverable only by its original account', () => {
  const {migrateLocalProfile,readProfileOverrides,profileStorageKey} = api();
  const saved = storage({[legacyKey]:{displayName:'Keep me'}}),write=saved.setItem;
  saved.setItem=(key,value)=>{if(key===profileStorageKey(account))throw Error('Full');write(key,value);};
  migrateLocalProfile(account,saved);
  assert.equal(readProfileOverrides(account,saved).displayName,'Keep me');
  migrateLocalProfile(other,saved);
  assert.deepEqual(readProfileOverrides(other,saved),{});
  saved.setItem=write;
  migrateLocalProfile(account,saved);
  assert.equal(JSON.parse(saved.getItem(profileStorageKey(account))).displayName,'Keep me');
});

test('sample edits stay separate and a new signed-out profile does not migrate into later accounts', () => {
  const {migrateLocalProfile,readProfileOverrides,writeLocalProfile} = api();
  const sample={displayName:'Sample',avatarSeed:'sample-account',sample:true};
  const saved=storage({[legacyKey]:{displayName:'Original'}});
  writeLocalProfile(sample,{...sample,displayName:'Sample edit'},saved);
  migrateLocalProfile(sample,saved);
  assert.equal(readProfileOverrides(null,saved).displayName,'Original');
  migrateLocalProfile(account,saved);
  writeLocalProfile(null,{displayName:'New local profile'},saved);
  migrateLocalProfile(other,saved);
  assert.deepEqual(readProfileOverrides(other,saved),{});
  assert.equal(readProfileOverrides(null,saved).displayName,'New local profile');
  assert.equal(readProfileOverrides(sample,saved).displayName,'Sample edit');
});
