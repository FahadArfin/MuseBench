import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHistoryStore} from '../src/controller/chat-history.mjs';
import {createController} from '../src/controller/index.mjs';
function fixture(t){const db=new DatabaseSync(':memory:'),store=createHistoryStore(db);t.after(()=>db.close());return store;}
const request={taskId:'t',query:'echo',direction:'next'};
const cursor=hit=>({messageId:hit.messageId,offset:hit.offset});
test('occurrences advance within a message, reverse and wrap in capture order',t=>{
 const s=fixture(t);s.put('t',{id:'a',role:'assistant',text:'Echo echo ECHO'});s.put('t',{id:'b',role:'user',text:'echo'});
 let r=s.find(request);assert.equal(r.hit.offset,0);assert.equal(r.wrapped,false);
 r=s.find({...request,cursor:cursor(r.hit)});assert.equal(r.hit.offset,5);
 r=s.find({...request,cursor:cursor(r.hit),direction:'previous'});assert.equal(r.hit.offset,0);
 r=s.find({...request,cursor:cursor(r.hit),direction:'previous'});assert.equal(r.hit.messageId,'b');assert.equal(r.wrapped,true);
 r=s.find({...request,cursor:cursor(r.hit)});assert.equal(r.hit.messageId,'a');assert.equal(r.hit.offset,0);assert.equal(r.wrapped,true);
});
test('search reaches beyond 150 retained messages and the first 12k characters with bounded excerpts',t=>{
 const s=fixture(t);s.put('t',{id:'old',role:'assistant',text:'x'.repeat(18000)+'echo <script>unsafe</script>'});for(let i=0;i<160;i++)s.put('t',{id:'m'+i,role:'assistant',text:'later'});
 const r=s.find(request);assert.equal(r.hit.messageId,'old');assert.equal(r.hit.offset,18000);assert.equal(r.hit.length,4);assert.ok(r.hit.excerpt.length<=1200);assert.equal(r.hit.excerpt.slice(r.hit.offset-r.hit.excerptOffset,r.hit.offset-r.hit.excerptOffset+4),'echo');assert.equal(r.coverage,'app-received');
});
test('literal matching preserves UTF16 offsets and actual match length through Unicode lowercase expansion',t=>{
 const s=fixture(t);s.put('t',{id:'a',role:'user',text:'😀İ [a.b] CAFÉ İ'});
 for(const [query,offset,length] of [['[a.b]',4,5],['café',10,4],['i\u0307',2,1],['i',2,1]]){const r=s.find({...request,query});assert.equal(r.hit.offset,offset,query);assert.equal(r.hit.length,length,query);}
 assert.equal(s.find({...request,query:'a.b?'}).hit,null);
});
test('invalid and stale cursors fail instead of silently selecting a different occurrence',t=>{
 const s=fixture(t);s.put('t',{id:'a',role:'assistant',text:'echo'});
 for(const extra of [{cursor:{messageId:'missing',offset:0}},{cursor:{messageId:'a',offset:1}},{cursor:{messageId:'a',offset:-1}},{cursor:{messageId:'a',offset:NaN}},{direction:'sideways'},{query:''},{query:'x'.repeat(501)}])assert.throws(()=>s.find({...request,...extra}),/Invalid history/);
 s.put('t',{id:'a',role:'assistant',text:'gone'});assert.throws(()=>s.find({...request,cursor:{messageId:'a',offset:0}}),/cursor/);
});
test('controller rejects wrong project ownership and leaves state unchanged with counted fake runtime',async t=>{
 const root=await mkdtemp(join(tmpdir(),'find-history-'));await mkdir(join(root,'project'));let calls=0;const runtime={snapshot:()=>({status:'unavailable',messages:[],shellResults:[]}),subscribe:()=>()=>{},send:async()=>{calls++;},connect:async()=>{calls++;},disconnect:async()=>{}};
 const c=await createController({dataDir:join(root,'data'),runtime});t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});await c.dispatch({type:'openProject',path:join(root,'project')});const state=await c.dispatch({type:'newTask',request:'Echo fixture',mode:'manual'}),input={...request,projectId:state.activeProject.id,taskId:state.task.id};
 await c.dispatch({type:'sendMessage',text:'Echo captured fixture'});const before=c.getState();assert.ok(c.findChatHistory(input).hit);for(const extra of [{projectId:'wrong'},{taskId:'missing'},{projectId:undefined}])assert.throws(()=>c.findChatHistory({...input,...extra}),/project|Chat|owner/i);assert.deepEqual(c.getState(),before);assert.equal(calls,0);
});

test('previous starts at the final occurrence and no-match does not claim a wrap',t=>{
 const s=fixture(t);s.put('t',{id:'a',role:'assistant',text:'echo echo'});s.put('t',{id:'b',role:'user',text:'ECHO echo'});s.put('t',{id:'system',role:'system',text:'echo'});
 const r=s.find({...request,direction:'previous'});assert.equal(r.hit.messageId,'b');assert.equal(r.hit.offset,5);assert.equal(r.wrapped,false);assert.deepEqual(s.find({...request,query:'absent'}),{hit:null,coverage:'app-received',wrapped:false});
});
test('captured text cap and legacy coverage stay explicit and other-task cursors cannot cross ownership',t=>{
 const s=fixture(t);s.sync({id:'t',messages:[{id:'a',role:'assistant',text:'echo'+'x'.repeat(1024*1024)}]},true);s.put('other',{id:'foreign',role:'assistant',text:'echo'});
 const r=s.find(request);assert.equal(r.coverage,'retained-legacy');assert.equal(r.hit.captureTruncated,true);assert.ok(r.hit.excerpt.length<=1200);assert.throws(()=>s.find({...request,cursor:{messageId:'foreign',offset:0}}),/cursor/);
});
test('production preview occurrence contract agrees on Unicode, repeat navigation and stale cursors',async()=>{
 const {findPreviewHistory}=await import('../src/shared/history-find.mjs');const messages=[{id:'a',role:'assistant',text:'😀İ echo echo'},{id:'b',role:'user',text:'echo'}];
 const initial=findPreviewHistory(messages,{...request,query:'i\u0307'});assert.equal(initial.hit.offset,2);assert.equal(initial.hit.length,1);assert.equal(initial.coverage,'preview-sample');
 const r=findPreviewHistory(messages,request);assert.equal(r.hit.offset,4);const next=findPreviewHistory(messages,{...request,cursor:{messageId:'a',offset:4}});assert.equal(next.hit.offset,9);assert.equal(findPreviewHistory(messages,{...request,direction:'previous'}).hit.messageId,'b');assert.throws(()=>findPreviewHistory(messages,{...request,cursor:{messageId:'a',offset:5}}),/cursor/);
});
