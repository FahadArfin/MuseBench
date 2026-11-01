import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictationRecovery,DICTATION_RECOVERY_KEY} from '../src/shared/dictation-recovery.mjs';

function storage(){const values=new Map();let failed=false;return{getItem:key=>values.get(key)??null,setItem(key,value){if(failed)throw Error('QuotaExceededError');values.set(key,value);},removeItem:key=>values.delete(key),fail:value=>{failed=value;}};}
const fixture=(durable=storage(),legacy=storage(),limits={})=>({durable,legacy,open:()=>createDictationRecovery({storage:()=>durable,legacyStorage:()=>legacy,...limits})});

test('a fresh recovery store restores committed text only for its original draft owner',()=>{
 const h=fixture(),first=h.open();first.load();first.retain('project:chat-a','Retained suffix');first.flush();
 const reopened=h.open();reopened.load();assert.equal(reopened.text('project:chat-a'),'Retained suffix');assert.equal(reopened.text('project:chat-b'),'');assert.equal(reopened.error(),'');
 reopened.remove('project:chat-a');reopened.flush();const afterDiscard=h.open();afterDiscard.load();assert.equal(afterDiscard.text('project:chat-a'),'');
});
test('per-chat recovery bounds retain unsaved text without evicting another owner',()=>{
 const h=fixture(undefined,undefined,{maxChatChars:10,maxTotalChars:30}),store=h.open();store.load();store.retain('a','aaaaaa');store.retain('b','bbbbbb');store.flush();
 const committed=h.durable.getItem(DICTATION_RECOVERY_KEY);store.retain('a','ccccc');store.flush();
 assert.match(store.error(),/copy.*clos/i);assert.equal(store.text('a'),'aaaaaa ccccc');assert.equal(h.durable.getItem(DICTATION_RECOVERY_KEY),committed);
 const reopened=h.open();reopened.load();assert.equal(reopened.text('b'),'bbbbbb');assert.equal(reopened.text('a'),'aaaaaa');
});
test('aggregate and owner bounds never silently remove previously saved recovery',()=>{
 for(const limits of [{maxChatChars:20,maxTotalChars:12},{maxChatChars:20,maxTotalChars:100,maxChats:2}]){
  const h=fixture(undefined,undefined,limits),store=h.open();store.load();store.retain('a','aaaaaa');store.retain('b','bbbbbb');store.flush();
  const committed=h.durable.getItem(DICTATION_RECOVERY_KEY);store.retain('c','c');store.flush();
  assert.match(store.error(),/copy.*clos/i);assert.equal(store.text('c'),'c');assert.equal(h.durable.getItem(DICTATION_RECOVERY_KEY),committed);
 }
});
test('a quota failure preserves the durable snapshot and retry saves every pending owner',()=>{
 const h=fixture(),store=h.open();store.load();store.retain('a','Saved before quota');store.flush();const committed=h.durable.getItem(DICTATION_RECOVERY_KEY);
 h.durable.fail(true);store.retain('b','Pending during quota');store.flush();assert.match(store.error(),/copy.*clos/i);assert.equal(h.durable.getItem(DICTATION_RECOVERY_KEY),committed);assert.equal(store.text('b'),'Pending during quota');
 h.durable.fail(false);store.retry();assert.equal(store.error(),'');const reopened=h.open();reopened.load();assert.equal(reopened.text('a'),'Saved before quota');assert.equal(reopened.text('b'),'Pending during quota');
});
test('unreadable or corrupt durable recovery fails closed and cannot be overwritten by a flush',()=>{
 for(const raw of ['{broken',JSON.stringify({version:1,records:{a:42}})]){
  const h=fixture();h.durable.setItem(DICTATION_RECOVERY_KEY,raw);const store=h.open();store.load();assert.match(store.error(),/load/i);
  store.retain('b','Pending text');store.flush();assert.equal(h.durable.getItem(DICTATION_RECOVERY_KEY),raw);assert.equal(store.text('b'),'Pending text');
  h.durable.setItem(DICTATION_RECOVERY_KEY,JSON.stringify({version:1,records:{a:'Recovered older text'}}));store.retry();assert.equal(store.error(),'');
  const reopened=h.open();reopened.load();assert.equal(reopened.text('a'),'Recovered older text');assert.equal(reopened.text('b'),'Pending text');
 }
});
test('session recovery is removed only after its durable migration is confirmed',()=>{
 const h=fixture();h.legacy.setItem(DICTATION_RECOVERY_KEY,JSON.stringify({a:'Legacy suffix'}));h.durable.fail(true);
 const store=h.open();store.load();assert.equal(store.text('a'),'Legacy suffix');assert.match(store.error(),/copy.*clos/i);assert.notEqual(h.legacy.getItem(DICTATION_RECOVERY_KEY),null);
 h.durable.fail(false);store.retry();assert.equal(store.error(),'');assert.equal(h.legacy.getItem(DICTATION_RECOVERY_KEY),null);
 const reopened=h.open();reopened.load();assert.equal(reopened.text('a'),'Legacy suffix');
});
test('oversized existing recovery stays selectable but is marked unsaved before dictation admission',()=>{
 const h=fixture(undefined,undefined,{maxChatChars:5,maxTotalChars:20});h.durable.setItem(DICTATION_RECOVERY_KEY,JSON.stringify({version:1,records:{a:'Existing long text'}}));
 const store=h.open();store.load();assert.equal(store.text('a'),'Existing long text');assert.match(store.error(),/copy.*clos/i);
});
