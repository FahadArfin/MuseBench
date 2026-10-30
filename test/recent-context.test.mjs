import test from 'node:test';
import assert from 'node:assert/strict';
import {composeChatContext} from '../src/shared/chat-context.mjs';
const api=await import('../src/shared/recent-context.mjs').catch(()=>({}));
test('recent excerpts select only bounded local user/assistant text with outcomes and no attachments',()=>{
 assert.equal(typeof api.selectRecentContext,'function');
 const messages=Array.from({length:300},(_,i)=>({id:'m'+i,role:i%2?'assistant':'user',text:'text '+i,outcome:'completed',sources:[{text:'private source'}],images:[{id:'private image'}]}));
 messages.push({id:'tool',role:'tool',text:'tool secret'},{id:'reasoning',role:'reasoning',text:'reasoning secret'});
 const result=api.selectRecentContext(messages,4);
 assert.deepEqual(result.entries.map(e=>e.id),['m296','m297','m298','m299']);
 assert.equal(result.entries[0].outcome,'completed');assert.doesNotMatch(result.section,/private source|private image|tool secret|reasoning secret/);
 assert.throws(()=>api.selectRecentContext(messages,3));
 // Only the last 256 candidates may be examined, including ineligible records.
 assert.equal(api.selectRecentContext([messages[0],...Array.from({length:256},()=>({role:'tool',text:'no'}))],8).entries.length,0);
});
test('escaped Unicode text fits the entire formatted section and marks truncation explicitly',()=>{
 assert.equal(typeof api.selectRecentContext,'function');
 const result=api.selectRecentContext(Array.from({length:8},(_,i)=>({id:'m'+i,role:'assistant',outcome:'failed',text:'"\\\n😀'.repeat(12000),contextTruncated:i===0})),8);
 assert.ok(result.section.length<=8000);assert.equal(result.entries.length,8);assert.ok(result.entries.every(e=>e.truncated));assert.equal(result.entries.at(-1).outcome,'failed');
 assert.ok(result.entries.every(e=>!/[\uD800-\uDBFF]$/.test(e.text)));
 const prepared=composeChatContext({text:'Current user intent',history:false,nativeSession:true,recentContext:{section:result.section,digest:'a'.repeat(64)}});
 assert.ok(prepared.prompt.includes(result.section));assert.ok(prepared.prompt.endsWith('Current request:\nCurrent user intent'));assert.ok(prepared.prompt.length<=64000);
 assert.match(result.section,/untrusted|reference/i);assert.match(result.section,/permission|authoriz/i);
});
