import test from 'node:test';
import assert from 'node:assert/strict';
import {composeChatContext} from '../src/shared/chat-context.mjs';
import {contextReceipt} from '../src/controller/context-receipts.mjs';

const snapshot=(personal='empty',project='empty')=>({version:1,scope:'app-settings',personal,project});
test('each request includes a complete current app snapshot, including edit, clear and unchanged scopes',()=>{
 for(const nativeSession of [false,true]){
  const task={request:'Original objective',goal:{status:'active',objective:'Active objective stays'},messages:[{id:'legacy',role:'user',text:'A historical direct request'}]};
  const input={task,nativeSession,history:!nativeSession,text:'Current direct request',memories:'Personal old',project:{instructions:'Project old'}};
  const first=composeChatContext(input),same=composeChatContext(input);
  assert.deepEqual(first.instructionSnapshot,snapshot('included','included'));
  assert.equal(first.prompt,same.prompt);
  assert.match(first.prompt,/replaces earlier.*app-saved/i);
  assert.match(first.prompt,/repository instruction files, skill bodies, direct conversational requests, objectives or permission policy/);
  const edited=composeChatContext({...input,memories:'Personal new',project:{instructions:'Project new'}});
  assert.match(edited.prompt,/Personal new/);assert.match(edited.prompt,/Project new/);
  assert.doesNotMatch(edited.prompt,/Personal old|Project old/);
  const cleared=composeChatContext({...input,memories:'',project:{instructions:''}});
  assert.deepEqual(cleared.instructionSnapshot,snapshot());
  assert.match(cleared.prompt,/Personal instructions:\n\[Empty: no current app-saved personal instructions\.\]/);
  assert.match(cleared.prompt,/Project instructions \(user-authored\):\n\[Empty: no current app-saved project instructions\.\]/);
  assert.doesNotMatch(cleared.prompt,/Personal old|Project old/);
  assert.match(cleared.prompt,/Initial objective:\nOriginal objective/);
  assert.match(cleared.prompt,/Active objective:\nActive objective stays/);
  assert.ok(cleared.prompt.endsWith('Current request:\nCurrent direct request'));
  assert.equal(cleared.prompt.includes('A historical direct request'),!nativeSession);
 }
});
test('empty first requests and legacy sessions need no previous receipt; projects remain isolated',()=>{
 const legacy={messages:[{id:'old',role:'assistant',text:'Legacy history preserved'}],contextSummary:{receipt:{instructions:{personal:'old-hash',project:'old-hash'}}}};
 const empty=composeChatContext({text:'First'});assert.deepEqual(empty.instructionSnapshot,snapshot());
 const input={task:legacy,text:'Next',memories:'Shared personal'};
 const a=composeChatContext({...input,project:{id:'a',instructions:'Project A setting'}}),b=composeChatContext({...input,project:{id:'b',instructions:''}});
 assert.deepEqual(b.instructionSnapshot,snapshot('included','empty'));assert.doesNotMatch(b.prompt,/Project A setting|old-hash/);assert.match(b.prompt,/Legacy history preserved/);
 const receipt=contextReceipt(a,{...input,project:{instructions:'Project A setting'}});
 assert.deepEqual(receipt.instructionSnapshot,a.instructionSnapshot);assert.equal(receipt.instructions.personal.length,64);assert.equal(receipt.instructions.project.length,64);
 assert.equal(contextReceipt(empty).instructions.personal,null);assert.equal(contextReceipt(empty).instructions.project,null);
});
test('complete instruction snapshots preserve full text and existing prompt/context bounds',()=>{
 const memories='P'.repeat(1500),project={instructions:'R'.repeat(4000)};
 const prepared=composeChatContext({memories,project,text:'x'.repeat(16000)});
 assert.deepEqual(prepared.instructionSnapshot,snapshot('included','included'));assert.ok(prepared.prompt.includes(memories));assert.ok(prepared.prompt.includes(project.instructions));assert.ok(prepared.characters<=64000);
 assert.throws(()=>composeChatContext({text:'x'.repeat(16001)}),/16,000/);
 assert.throws(()=>composeChatContext({memories:'x'.repeat(64000),text:'Next'}),/too large/);
});
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
