import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createController} from '../src/controller/index.mjs';import {validateAction} from '../electron/security.mjs';
function runtime(){let value={transport:'exec',status:'unavailable',permissionVerified:false,cleanup:'confirmed',runId:null,messages:[]},listeners=new Set(),sequence=0;const emit=patch=>{value={...value,...patch};for(const fn of listeners)fn(value);};return{sent:[],stops:0,full:0,emit,silent(patch){value={...value,...patch};},snapshot(){this.full++;return structuredClone(value);},statusSnapshot:()=>({status:value.status,cleanup:value.cleanup,pending:!!value.pending,operationBusy:!!value.operationBusy,childrenBusy:!!value.childrenBusy}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async connect(){emit({status:'idle',permissionVerified:true,sessionId:'session'});},async send(input){this.sent.push(input);emit({status:'running',runId:null,inputAccepted:false,messages:[]});emit({runId:'run-'+(++sequence),inputAccepted:true});},finish(){emit({status:'completed',cleanup:'confirmed',pending:null});},async disconnect(){this.stops++;emit({status:'unavailable',pending:null,cleanup:'confirmed',permissionVerified:false});}};}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'muse-work-activity-')),runtimes=[],dataDir=join(root,'data');const factory=()=>{const r=runtime();runtimes.push(r);return r;};const c=await createController({dataDir,runtimeFactory:factory});t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});const act=async input=>{const s=await c.dispatch(input);assert.equal(s.error,null);return s;};const add=async title=>{const project=join(root,title);await mkdir(project);await act({type:'openProject',path:project});return act({type:'newTask',request:title,mode:'muse'});};return{root,dataDir,c,act,add,runtimes,factory};}
const stop=row=>({type:'stopWork',taskId:row.taskId,id:row.id,controlId:row.controlId});
test('activity stops only the bound background owner and preserves selected draft and queue',async t=>{
 const f=await fixture(t);let s=await f.add('First');const first=s.task.id;await f.act({type:'sendMessage',text:'Work first'});await f.act({type:'queueMessage',text:'Later'});const one=f.runtimes.find(r=>r.sent.length);
 s=await f.add('Second');await f.act({type:'sendMessage',text:'Work second'});const two=f.runtimes.find(r=>r!==one&&r.sent.length);await f.act({type:'saveDraft',projectId:s.task.projectId,taskId:s.task.id,text:'Unsent draft',mode:'plan',files:[]});
 s=f.c.getState();assert.equal(s.workActivity.length,2);const row=s.workActivity.find(r=>r.taskId===first);assert.equal(row.label,'Working');assert.equal(row.canStop,true);assert.equal(validateAction(stop(row)).type,'stopWork');
 assert.ok(f.c.getUpdateBlockers().some(item=>item.label==='Code · First'&&/queued/.test(item.detail)));
 s=await f.act(stop(row));assert.equal(s.task.title,'Second');assert.equal(s.drafts[`${s.task.projectId}:${s.task.id}`].text,'Unsent draft');assert.equal(one.stops,1);assert.equal(two.stops,0);assert.equal(s.workActivity.length,1);
 s=await f.act({type:'selectTask',id:first});assert.equal(s.task.queuePaused,true);assert.equal(s.task.promptQueue[0].text,'Later');
 assert.ok(!f.c.getUpdateBlockers().some(item=>item.label==='Code · First'&&/queued/.test(item.detail)));
});
test('stale stop controls cannot stop a later run or a different owner',async t=>{
 const f=await fixture(t);await f.add('First');await f.act({type:'sendMessage',text:'First request'});const old=f.c.getState().workActivity[0],r=f.runtimes.find(r=>r.sent.length);r.finish();assert.equal(f.c.getState().workActivity.length,0);await f.act({type:'sendMessage',text:'Second request'});
 let s=await f.c.dispatch(stop(old));assert.match(s.error,/changed|current/i);assert.equal(r.stops,0);const row=f.c.getState().workActivity[0];s=await f.c.dispatch({...stop(row),taskId:'different'});assert.match(s.error,/changed|current/i);assert.equal(r.stops,0);
});
test('questions and cleanup problems stay visible without copying inactive transcripts',async t=>{
 const f=await fixture(t);await f.add('First');await f.act({type:'sendMessage',text:'Inspect'});const r=f.runtimes.find(r=>r.sent.length);r.emit({status:'blocked',pending:{kind:'input',question:'private question'},messages:[{text:'private transcript'.repeat(10000)}]});r.full=0;
 const row=f.c.getState().workActivity[0];assert.equal(row.label,'Needs your answer');assert.equal(r.full,0);assert.doesNotMatch(JSON.stringify(row),/private/);
 r.emit({status:'uncertain',pending:null,cleanup:'unconfirmed'});assert.equal(f.c.getState().workActivity[0].label,'Needs attention');
});
test('restarts do not present historical running flags as active owners',async t=>{
 const f=await fixture(t);await f.add('First');await f.act({type:'sendMessage',text:'Inspect'});await f.c.close();const reopened=await createController({dataDir:f.dataDir,runtimeFactory:f.factory});t.after(()=>reopened.close());assert.deepEqual(reopened.getState().workActivity,[]);await reopened.close();
});
test('stop actions require bounded exact operation identities',()=>{
 for(const input of [{taskId:'t',id:'w'},{taskId:'t',id:'w',controlId:'wrong'},{taskId:3,id:'w',controlId:'a'.repeat(64)},{taskId:'t',id:'w',controlId:'a'.repeat(64),all:true}])assert.throws(()=>validateAction({type:'stopWork',...input}));
});

test('native identity changes without events invalidate the stop token',async t=>{
 const f=await fixture(t);await f.add('First');await f.act({type:'sendMessage',text:'Inspect'});const row=f.c.getState().workActivity[0],r=f.runtimes.find(r=>r.sent.length);r.silent({runId:'unobserved-new-run'});const next=await f.c.dispatch(stop(row));assert.match(next.error,/changed/);assert.equal(r.stops,0);assert.notEqual(next.workActivity[0].controlId,row.controlId);await f.act(stop(next.workActivity[0]));assert.equal(r.stops,1);
});
test('check activity binds the actual process and rejects a previous check token',async t=>{
 const f=await fixture(t);const project=join(f.root,'checks');await mkdir(project);await writeFile(join(project,'package.json'),JSON.stringify({name:'checks',scripts:{test:'node -e "setTimeout(()=>{},15000)"'}}));await f.act({type:'openProject',path:project});await f.act({type:'newTask',request:'Check fixture',mode:'manual'});
 let s=await f.act({type:'runCheck',script:'test'});const old=s.workActivity.find(row=>row.kind==='check');assert(old);assert.equal(old.label,'Checking test');s=await f.act(stop(old));assert.equal(s.task.check.status,'cancelled');assert.deepEqual(s.workActivity,[]);
 s=await f.act({type:'runCheck',script:'test'});const current=s.workActivity.find(row=>row.kind==='check');s=await f.c.dispatch(stop(old));assert.match(s.error,/changed/);assert.equal(s.task.check.status,'running');await f.act(stop(current));
});

test('sequential compaction and child operations invalidate earlier stop controls on the same turn',async t=>{
 const f=await fixture(t);await f.add('First');await f.act({type:'sendMessage',text:'Inspect'});const r=f.runtimes.find(r=>r.sent.length);r.finish();
 for(const field of ['compaction','childReceipts']){
  const receipt=commandId=>field==='compaction'?{commandId}:[{commandId,status:'submitting'}];
  r.emit({operationBusy:true,[field]:receipt('one')});const old=f.c.getState().workActivity[0];r.emit({operationBusy:false});r.emit({operationBusy:true,[field]:receipt('two')});assert.notEqual(f.c.getState().workActivity[0].controlId,old.controlId);const s=await f.c.dispatch(stop(old));assert.match(s.error,/changed/);assert.equal(r.stops,0);r.emit({operationBusy:false});
 }
});
