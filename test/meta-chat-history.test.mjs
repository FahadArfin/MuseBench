import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMetaChatRows} from '../electron/meta-chat-history.mjs';
import {createMetaChatPinStore,mergeMetaChatPins} from '../electron/meta-chat-pins.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validatePersonalCommand} from '../electron/personal-policy.mjs';

test('Meta history keeps only bounded titles and official conversation targets, with account-scoped IDs',()=>{
 const input=[{title:'Tea notes',label:'Tea notes Oct 31',path:'/conversation/tea',pinned:true},{title:'Unsafe',label:'Unsafe',path:'https://evil.example/conversation/x'},{title:'Login',label:'Login',path:'/login'},{title:'Title only',label:'Title only Oct 30'}];
 const rows=normalizeMetaChatRows(input,'account-a');
 assert.equal(rows.length,2);assert.equal(rows[0].title,'Tea notes');assert.equal(rows[0].pinned,true);
 assert.match(rows[0].id,/^[a-f0-9]{24}$/);assert.notEqual(rows[0].id,normalizeMetaChatRows(input,'account-b')[0].id);
 assert.equal(rows[0].id,normalizeMetaChatRows(input,'account-a')[0].id);
 assert.equal(normalizeMetaChatRows([{title:'Same',label:'Same'},{title:'Same',label:'Same'}],'account-a').length,0,'Ambiguous title-only targets must not open an arbitrary chat');
 assert.equal(normalizeMetaChatRows(input,null).length,0);
});

test('local pins survive a new store instance, stay account scoped and retain old pinned conversations',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'meta-chat-pins-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=path.join(directory,'pins.json'),alice='meta:'+'a'.repeat(64),bob='meta:'+'b'.repeat(64),store=createMetaChatPinStore(file);
 const rows=normalizeMetaChatRows([{title:'Alice chat',label:'Alice chat Oct 31',path:'/conversation/alice'}],alice);
 await store.write(alice,rows);assert.deepEqual((await createMetaChatPinStore(file).read(alice)).map(row=>row.title),['Alice chat']);assert.deepEqual(await store.read(bob),[]);
 const merged=mergeMetaChatPins([],await store.read(alice));assert.equal(merged[0].localPinned,true);assert.equal(merged[0].recent,false);
 await store.write(bob,normalizeMetaChatRows([{title:'Bob chat',label:'Bob chat',path:'/conversation/bob'}],bob));await store.write(alice,[]);
 assert.equal((await store.read(bob)).length,1);assert.equal((await store.read(alice)).length,0);
 await writeFile(file,'broken');await assert.rejects(store.write(alice,rows));assert.equal(await readFile(file,'utf8'),'broken','A corrupt store is preserved rather than overwritten');
});

test('history IPC accepts opaque chat IDs and explicit local pin flags, never renderer URLs or account overrides',()=>{
 assert.deepEqual(validatePersonalCommand({type:'metaChats',action:'refresh'}),{type:'metaChats',action:'refresh'});
 assert.deepEqual(validatePersonalCommand({type:'metaChats',action:'pin',id:'a'.repeat(24),pinned:true}),{type:'metaChats',action:'pin',id:'a'.repeat(24),pinned:true});
 for(const command of [{type:'metaChats',action:'open',id:'https://evil.example'},{type:'metaChats',action:'open',id:'a'.repeat(24),url:'/conversation/a'},{type:'metaChats',action:'refresh',owner:'other'},{type:'metaChats',action:'pin',id:'a'.repeat(24),pinned:'yes'}])assert.throws(()=>validatePersonalCommand(command));
});
