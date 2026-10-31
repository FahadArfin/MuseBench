import test from 'node:test';
import assert from 'node:assert/strict';
import {MuseSessionAdapter} from '../session-adapter.mjs';
import {FixturePort,descriptor,events,sessionResult} from './fixture-port.mjs';
const methods=['turn/modelRetryScheduled','turn/retryScheduled'];
const notice=(method=methods[0],extra={})=>({method,params:{sessionId:sessionResult.session.sessionId,turnId:'turn-fixture',viewCursor:'retry-1',attempt:1,nextAttempt:2,maxAttempts:3,retryDelayMs:1500,reason:'private provider text',errorKind:'private kind',system:'private system',sourceRange:{stream:{kind:'session',id:sessionResult.session.sessionId},first:{id:'record',sequence:1},last:{id:'record',sequence:1}},...extra}});
async function setup(options={}){const port=new FixturePort(),adapter=new MuseSessionAdapter({connection:port,...descriptor(),...options});await adapter.open(sessionResult.session.workspaceRoot);await adapter.send({text:'Injected fixture'});return{port,adapter,frame:(method,extra={})=>notice(method,{turnId:adapter.snapshot().turnId,...extra})};}
for(const method of methods)test(method+' projects only counts and scheduled delay without native work',async()=>{
 const {adapter:a,port:p,frame}=await setup(),calls=structuredClone(p.calls),mints=p.counter,f=frame(method);p.emit(f);
 assert.deepEqual(a.snapshot().nativeRetry,{kind:method===methods[0]?'model':'turn',attempt:1,nextAttempt:2,maxAttempts:3,retryDelayMs:1500});
 assert.equal(a.snapshot().status,'running');assert.equal(a.snapshot().outcome,null);assert.equal(a.snapshot().reason,null);assert.doesNotMatch(JSON.stringify(a.snapshot()),/private/);
 p.emit(f);assert.deepEqual(p.calls,calls);assert.equal(p.counter,mints);assert.equal(p.calls.filter(c=>c.method==='turn/start').length,1);
});
test('retry notices preserve session, turn and cursor ownership gates',async()=>{
 const {adapter:a,port:p,frame}=await setup();p.emit(frame(methods[0],{sessionId:'foreign'}));assert.equal(a.snapshot().nativeRetry,null);assert.equal(a.snapshot().status,'running');
 const valid=frame();p.emit(valid);p.emit({...valid,params:{...valid.params,retryDelayMs:1600}});assert.equal(a.snapshot().reason,'conflicting-event-cursor');assert.equal(a.snapshot().nativeRetry,null);
 for(const extra of [{turnId:'foreign'},{turnId:null},{viewCursor:''}]){const h=await setup();h.port.emit(h.frame(methods[0],extra));assert.equal(h.adapter.snapshot().status,'unavailable');assert.equal(h.adapter.snapshot().nativeRetry,null);}
});
test('malformed retry counts, delay and source never publish and fail closed',async()=>{
 for(const extra of [{attempt:0},{attempt:1.2},{nextAttempt:1},{maxAttempts:1},{retryDelayMs:-1},{retryDelayMs:Infinity},{retryDelayMs:'100'},{sourceRange:null},{sourceRange:{stream:{id:'foreign',kind:'session'},first:{id:'r',sequence:1},last:{id:'r',sequence:1}}}]){
  const h=await setup(),before=h.port.calls.length;h.port.emit(h.frame(methods[1],extra));assert.equal(h.adapter.snapshot().status,'unavailable',JSON.stringify(extra));assert.equal(h.adapter.snapshot().nativeRetry,null);assert.equal(h.port.calls.length,before);
 }
});
test('native progress, terminal and disconnect clear notices; replay cannot resurrect them',async()=>{
 for(const progress of ['turn/started','item/started','item/delta','item/completed','turn/completed','disconnect']){
  const h=await setup();if(progress==='item/delta')h.port.emit(structuredClone(events.find(f=>f.method==='item/started')));
  const f=h.frame();h.port.emit(f);assert.ok(h.adapter.snapshot().nativeRetry);
  if(progress==='disconnect')h.adapter.disconnect();else h.port.emit(structuredClone(events.find(f=>f.method===progress&&(!f.params.item||f.params.item.kind==='agentMessage'))));
  assert.equal(h.adapter.snapshot().nativeRetry,null,progress);h.port.emit(f);assert.equal(h.adapter.snapshot().nativeRetry,null,progress+' replay');
 }
 const h=await setup();h.port.emit(structuredClone(events.find(f=>f.method==='turn/completed')));h.port.emit(h.frame());assert.equal(h.adapter.snapshot().status,'completed');assert.equal(h.adapter.snapshot().nativeRetry,null);
});
test('retry cursor conflicts across turns retain the existing session gate',async()=>{
 const h=await setup(),f=h.frame();h.port.emit(f);h.port.emit(structuredClone(events.find(f=>f.method==='turn/completed')));await h.adapter.send({text:'Second injected turn'});
 h.port.emit(f);assert.equal(h.adapter.snapshot().nativeRetry,null);assert.equal(h.adapter.snapshot().status,'running');
 h.port.emit(h.frame(methods[1]));assert.equal(h.adapter.snapshot().reason,'conflicting-event-cursor');assert.equal(h.adapter.snapshot().nativeRetry,null);assert.equal(h.port.calls.filter(c=>c.method==='turn/start').length,2);
});
test('retry observations buffered during submission wait for exact acknowledged turn ownership',async()=>{
 for(const turnId of ['acknowledged','foreign']){
  const port=new FixturePort(),adapter=new MuseSessionAdapter({connection:port,...descriptor()});await adapter.open(sessionResult.session.workspaceRoot);const command=port.command.bind(port);
  port.command=async(...args)=>{const result=await command(...args);if(args[0]==='turn/start')port.emit(notice(methods[0],{turnId:turnId==='acknowledged'?result.turnId:turnId}));return result;};
  await adapter.send({text:'Buffered injection'});assert.equal(adapter.snapshot().status,turnId==='acknowledged'?'running':'unavailable');assert.equal(!!adapter.snapshot().nativeRetry,turnId==='acknowledged');assert.equal(port.calls.filter(c=>c.method==='turn/start').length,1);
 }
});
test('each native terminal clears a scheduled retry without upgrading failure or cancellation',async()=>{
 for(const terminal of ['completed','failed','cancelled']){const h=await setup();h.port.emit(h.frame());const final=structuredClone(events.find(f=>f.method==='turn/completed'));final.params.terminal=terminal;h.port.emit(final);assert.equal(h.adapter.snapshot().nativeRetry,null);assert.equal(h.adapter.snapshot().status,terminal);assert.equal(h.port.calls.filter(c=>c.method==='turn/start').length,1);}
});
test('only current-turn tool and compaction progress clears a native retry observation',async()=>{
 for(const kind of ['toolCall','compaction']){
  const h=await setup({observeToolItem:()=>{},observeContextItem:()=>{}});h.port.emit(h.frame());
  const item={kind,turnId:'foreign',itemId:'progress',revision:1,status:'inProgress'};
  h.port.emit({method:'item/updated',params:{sessionId:sessionResult.session.sessionId,viewCursor:'foreign-progress',item}});assert.ok(h.adapter.snapshot().nativeRetry);
  h.port.emit({method:'item/updated',params:{sessionId:sessionResult.session.sessionId,viewCursor:'own-progress',item:{...item,turnId:h.adapter.snapshot().turnId}}});assert.equal(h.adapter.snapshot().nativeRetry,null);assert.equal(h.port.calls.filter(c=>c.method==='turn/start').length,1);
 }
});
