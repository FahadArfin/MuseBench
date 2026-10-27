import test from 'node:test';
import assert from 'node:assert/strict';
import {composeChatContext} from '../src/shared/chat-context.mjs';
import {contextReceipt} from '../src/controller/context-receipts.mjs';
test('receipts bind exact submitted text, source snapshots and instruction revisions without duplicating secrets',()=>{
 const input={task:{request:'Build',messages:[{id:'one',role:'user',text:'Remember this'}]},project:{instructions:'Use tests'},memories:'Personal convention',text:'Continue',attachments:[{path:'src/a.ts',hash:'a'.repeat(64),text:'source'}]};
 const prepared=composeChatContext(input),first=contextReceipt(prepared,{...input,revision:'revision-a'});
 assert.equal(first.promptHash.length,64);assert.deepEqual(first.messages.map(m=>m.id),['one']);assert.equal(first.sources[0].hash,'a'.repeat(64));assert.ok(!JSON.stringify(first).includes('Personal convention'));
 assert.equal(first.promptHash,contextReceipt(composeChatContext(input),{...input,revision:'revision-a'}).promptHash);
 const changed={...input,project:{instructions:'Use lint'}};assert.notEqual(first.instructions.project,contextReceipt(composeChatContext(changed),{...changed,revision:'revision-a'}).instructions.project);
 assert.notEqual(first.promptHash,contextReceipt(composeChatContext(changed),{...changed,revision:'revision-a'}).promptHash);
});
test('native continuation records no fabricated replay or context occupancy',()=>{
 const input={task:{messages:[{id:'old',role:'user',text:'old'}]},text:'Next',history:false,nativeSession:true};
 const receipt=contextReceipt(composeChatContext(input),input);assert.deepEqual(receipt.messages,[]);assert.equal(receipt.historyMode,'native');assert.equal(receipt.nativeContext,'unknown');
});
test('receipts disclose messages already shortened by the app before composition',()=>{
 const prepared=composeChatContext({task:{messages:[{id:'long',role:'assistant',text:'retained excerpt',contextTruncated:true}]},text:'Continue'});
 assert.equal(prepared.includedSources[0].truncated,true);assert.equal(prepared.truncatedMessages,1);
});
