import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHistoryStore} from '../src/controller/chat-history.mjs';
import {createConversationImports} from '../src/controller/conversation-imports.mjs';

async function fixture(t){const root=await mkdtemp(path.join(tmpdir(),'muse-import-store-'));let clock=1000;const handles=[];const open=()=>{const db=new DatabaseSync(path.join(root,'history.sqlite')),history=createHistoryStore(db),service=createConversationImports(db,history,{now:()=>clock});const handle={db,history,service,closed:false,async close(){if(handle.closed)return;await service.close();db.close();handle.closed=true;}};handles.push(handle);return handle;};const file=path.join(root,'conversations.json'),value=[{name:'Alpha',chat_messages:[{sender:'human',text:'find cobalt in imported history'},{sender:'assistant',text:'x'.repeat(20000)}]},{name:'Beta',chat_messages:[{sender:'human',text:'leave this unselected'}]}];await writeFile(file,JSON.stringify(value));t.after(async()=>{for(const handle of handles){await handle.close();}await rm(root,{recursive:true,force:true,maxRetries:5});});return{root,file,value,open,advance:()=>{clock+=15*60*1000;},...open()};}
test('preview is read-only; selected imports persist, deduplicate and search full saved text',async t=>{
 const f=await fixture(t),original=await readFile(f.file);const preview=await f.service.prepare(f.file);assert.equal(f.service.search('').length,0);assert.equal(preview.conversations.length,2);const first=preview.conversations[0];assert.equal(first.duplicate,false);
 const page=f.service.previewPage({token:preview.token,id:first.id});assert.equal(page.total,2);assert.equal(page.messages[1].text.length,12000);assert.equal(page.messages[1].textLength,20000);
 const result=await f.service.confirm({token:preview.token,ids:[first.id]});assert.equal(result.imported,1);assert.equal(result.skipped,0);const found=f.service.search('cobalt');assert.equal(found.length,1);assert.match(found[0].id,/^import:/);assert.equal(found[0].imported.format,'Claude');assert.equal(f.service.search('unselected').length,0);assert.equal(f.history.page({taskId:found[0].id,messageId:'m1',offset:12000}).messages[0].text.length,8000);assert.deepEqual(await readFile(f.file),original);
 await f.close();const reopened=f.open(),again=await reopened.service.prepare(f.file);assert.equal(again.conversations[0].duplicate,true);assert.equal(again.conversations[1].duplicate,false);assert.equal((await reopened.service.confirm({token:again.token,ids:[again.conversations[0].id]})).imported,0);assert.equal(reopened.service.search('').length,1);
 reopened.service.remove(found[0].id);assert.equal(reopened.service.search('').length,0);assert.equal(reopened.history.page({taskId:found[0].id}).total,0);assert.deepEqual(await readFile(f.file),original);
});
test('changed, expired, replaced and invalid preview selections cannot commit',async t=>{
 const f=await fixture(t);let preview=await f.service.prepare(f.file);await writeFile(f.file,JSON.stringify([...f.value,{name:'New',chat_messages:[]}]));await assert.rejects(f.service.confirm({token:preview.token,ids:[preview.conversations[0].id]}),/changed/i);assert.equal(f.service.search('').length,0);
 preview=await f.service.prepare(f.file);f.advance();await assert.rejects(f.service.confirm({token:preview.token,ids:[preview.conversations[0].id]}),/expired/i);
 const old=await f.service.prepare(f.file);preview=await f.service.prepare(f.file);await assert.rejects(f.service.confirm({token:old.token,ids:[old.conversations[0].id]}),/preview/i);await assert.rejects(f.service.confirm({token:preview.token,ids:['not-present']}),/selection/i);await assert.rejects(f.service.confirm({token:preview.token,ids:[]}),/selection/i);assert.throws(()=>f.service.remove('task-id'),/import/i);assert.equal(f.service.search('').length,0);
});
test('a failing selected batch rolls back both records, history and search index',async t=>{
 const f=await fixture(t),preview=await f.service.prepare(f.file);f.db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON imported_chats WHEN NEW.title='Beta' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");await assert.rejects(f.service.confirm({token:preview.token,ids:preview.conversations.map(c=>c.id)}),/rollback/i);assert.equal(f.service.search('').length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM chat_history').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM history_terms').get().n,0);
 f.db.exec('DROP TRIGGER fail_second');assert.equal((await f.service.confirm({token:preview.token,ids:preview.conversations.map(c=>c.id)})).imported,2);
});

test('selection limits, full preview search and exact duplicate batches are enforced before writes',async t=>{
 const f=await fixture(t),rows=Array.from({length:102},(_,i)=>({name:`Row ${i}`,chat_messages:[{sender:'human',text:i===101?'Hidden rainbow marker':`Message ${i}`}]}));
 await writeFile(f.file,JSON.stringify([...rows,rows[101]]));let preview=await f.service.prepare(f.file);
 assert.equal(f.service.searchPreview({token:preview.token,query:'rainbow'}).length,2);assert.equal(preview.conversations[102].duplicate,true);
 await assert.rejects(f.service.confirm({token:preview.token,ids:preview.conversations.slice(0,101).map(c=>c.id)}),/100/);assert.equal(f.service.search('').length,0);
 const saved=await f.service.confirm({token:preview.token,ids:['101','102']});assert.equal(saved.imported,1);assert.equal(saved.skipped,1);
 await writeFile(f.file,JSON.stringify([{name:'Large',chat_messages:Array.from({length:3},()=>({sender:'human',text:'x'.repeat(800000)}))}]));preview=await f.service.prepare(f.file);await assert.rejects(f.service.confirm({token:preview.token,ids:['0']}),/2 MiB/);assert.equal(f.service.search('').length,1);
});

test('short-message and distinct-word selections cannot bypass the persistence work budget',async t=>{
 const f=await fixture(t);
 for(const [messages,reason] of [[Array.from({length:50000},(_,i)=>({role:'user',text:`message ${i}`})),/2,000|message/i],[[{role:'user',text:Array.from({length:21000},(_,i)=>`word${i}`).join(' ')}],/distinct|index|text/i]]){
  await writeFile(f.file,JSON.stringify({format:'musebench-conversations',version:1,conversations:[{title:'Work budget',messages}]}));const preview=await f.service.prepare(f.file);
  await assert.rejects(f.service.confirm({token:preview.token,ids:['0']}),reason);assert.equal(f.service.search('').length,0);
 }
});

test('maximum accepted message and index-work budgets match durable index entries',async t=>{
 const f=await fixture(t),messages=Array.from({length:2000},(_,i)=>({role:'user',text:Array.from({length:10},(_,j)=>`term${i}_${j}`).join(' ')}));
 await writeFile(f.file,JSON.stringify({format:'musebench-conversations',version:1,conversations:[{title:'Accepted boundary',messages}]}));const preview=await f.service.prepare(f.file);assert.equal(preview.conversations[0].indexTerms,20000);
 assert.equal((await f.service.confirm({token:preview.token,ids:['0']})).imported,1);assert.equal(f.db.prepare('SELECT count(*) n FROM history_terms').get().n,20000);assert.equal(f.db.prepare('SELECT count(*) n FROM chat_history').get().n,2000);
});


