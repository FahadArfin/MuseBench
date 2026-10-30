import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {validateAction} from '../electron/security.mjs';

function fakeRuntime(){
 let state={transport:'exec',status:'unavailable',permissionVerified:false,cleanup:'confirmed',messages:[],runId:null,fullAccess:false};const listeners=new Set(),sent=[],connections=[];
 const emit=patch=>{state={...state,...patch};for(const fn of listeners)fn(structuredClone(state));};
 return{sent,connections,emit,snapshot:()=>structuredClone(state),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},connect:async input=>{connections.push(input);emit({status:'idle',permissionVerified:true,sessionId:'fixture',fullAccess:input.fullAccess});},send:async input=>{sent.push(input);emit({status:'running',runId:null,messages:[]});emit({status:'running',runId:'fixture-run',inputAccepted:true});},finish:()=>emit({status:'completed',cleanup:'confirmed',messages:[{id:'answer',kind:'agentMessage',text:'Injected scheduled result'}]}),disconnect:async()=>emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed',pending:null})};
}
async function fixture(t,{decorate=()=>{}}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'muse-schedule-')),root=path.join(dir,'project'),runtimes=[];await mkdir(root);let clock=Date.now();
 const options={dataDir:path.join(dir,'profile'),runtimeFactory:()=>{const r=fakeRuntime();decorate(r,runtimes.length);runtimes.push(r);return r;},scheduleNow:()=>clock,schedulePollMs:0};let c=await createController(options);
 t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});const act=async action=>{const s=await c.dispatch(action);assert.equal(s.error,null);return s;};
 await act({type:'openProject',path:root});const original=(await act({type:'newTask',mode:'muse',request:'Personal work'})).task.id;await act({type:'saveDraft',projectId:c.getState().activeProject.id,taskId:original,text:'Keep my draft',files:[],images:[],mode:'plan'});
 const save=async overrides=>{const spec={title:'Scheduled review',projectId:c.getState().activeProject.id,prompt:'Inspect the current project.',startAt:new Date(clock+60000).toISOString(),intervalMinutes:60,maxRuns:3,runOptions:{reasoning:'high',approval:'ask',budget:'standard'},fullAccess:false,...overrides};const state=await act({type:'codeSchedule',operation:'save',spec});return state.codeSchedules.at(-1);};
 const enable=s=>act({type:'codeSchedule',operation:'enable',id:s.id,expectedRevision:s.revision,confirmed:true});
 return{get c(){return c;},act,root,original,runtimes,save,enable,advance:ms=>clock+=ms,restart:async()=>{await c.close();c=await createController(options);return c;}};
}
test('scheduled requests own a fresh chat, exact options and durable history without moving selection or drafts',async t=>{
 const f=await fixture(t),s=await f.save();assert.equal(s.enabled,false);await f.enable(s);const before=f.c.getState();f.advance(60000);await f.c.tickCodeSchedules();let state=f.c.getState(),row=state.codeSchedules[0];assert.ok(row.active.taskId);assert.notEqual(row.active.taskId,f.original);assert.equal(state.task.id,f.original);assert.deepEqual(state.drafts,before.drafts);assert.equal(f.c.canRestartForUpdate(),false);
 const runtime=f.runtimes.find(r=>r.sent.length);assert.equal(runtime.connections[0].transport,'exec');assert.equal(runtime.connections[0].fullAccess,false);assert.deepEqual(runtime.sent[0].runOptions,s.spec.runOptions);assert.match(runtime.sent[0].text,/Inspect the current project/);
 runtime.finish();await new Promise(r=>setTimeout(r,40));row=f.c.getState().codeSchedules[0];assert.equal(row.active,null);assert.equal(row.history[0].status,'completed');assert.equal(f.c.getState().task.id,f.original);assert.deepEqual(f.c.getState().drafts,before.drafts);
 await f.act({type:'selectTask',id:row.history[0].taskId});assert.ok(f.c.getState().task.messages.some(m=>m.text==='Injected scheduled result'));await f.restart();assert.equal(f.c.getState().codeSchedules[0].history[0].status,'completed');assert.equal(f.runtimes.reduce((n,r)=>n+r.sent.length,0),1);
});
test('busy checkouts skip occurrences without starting another runtime request',async t=>{
 const f=await fixture(t),s=await f.save();await f.enable(s);await f.act({type:'sendMessage',text:'User work owns this checkout'});f.advance(60000);await f.c.tickCodeSchedules();const row=f.c.getState().codeSchedules[0];assert.equal(row.history[0].status,'skipped');assert.equal(row.attempts,0);assert.equal(f.runtimes.reduce((n,r)=>n+r.sent.length,0),1);
});
test('approval, explicit stop and uncertain completion pause future work with exact occurrence ownership',async t=>{
 const f=await fixture(t),s=await f.save();await f.enable(s);f.advance(60000);await f.c.tickCodeSchedules();const runtime=f.runtimes.find(r=>r.sent.length);runtime.emit({status:'blocked',pending:{kind:'approval',sessionId:'fixture',id:'approval'}});await new Promise(r=>setTimeout(r,20));let row=f.c.getState().codeSchedules[0];assert.equal(row.enabled,false);assert.equal(row.active.status,'waiting');
 let state=await f.c.dispatch({type:'codeSchedule',operation:'stop',id:row.id,runId:'stale'});assert.match(state.error,/changed|unavailable/i);assert.equal(runtime.snapshot().status,'blocked');
 await f.act({type:'codeSchedule',operation:'stop',id:row.id,runId:row.active.id});row=f.c.getState().codeSchedules[0];assert.equal(row.active,null);assert.equal(row.history[0].status,'stopped');
 await f.enable(row);f.advance(3600000);await f.c.tickCodeSchedules();const second=f.runtimes.find(r=>r!==runtime&&r.sent.length);second.emit({status:'uncertain',cleanup:'unconfirmed',reason:'Lost native outcome'});await new Promise(r=>setTimeout(r,20));row=f.c.getState().codeSchedules[0];assert.equal(row.enabled,false);assert.equal(row.history[0].status,'uncertain');assert.equal(f.c.canRestartForUpdate(),false);
});
test('deadlines stop only the owned scheduled run and do not authorize a retry',async t=>{
 const f=await fixture(t),s=await f.save();await f.enable(s);f.advance(60000);await f.c.tickCodeSchedules();f.advance(180001);await f.c.tickCodeSchedules();const row=f.c.getState().codeSchedules[0];assert.equal(row.history[0].status,'timed-out');assert.equal(row.enabled,false);assert.equal(f.runtimes.reduce((n,r)=>n+r.sent.length,0),1);assert.equal(f.c.getState().task.id,f.original);
});
test('missing project folders pause admission and restart never replays an active occurrence',async t=>{
 const f=await fixture(t),s=await f.save();await f.enable(s);await rename(f.root,f.root+'-moved');f.advance(60000);await f.c.tickCodeSchedules();let row=f.c.getState().codeSchedules[0];assert.equal(row.enabled,false);assert.equal(row.history[0].status,'failed');assert.equal(f.runtimes.reduce((n,r)=>n+r.sent.length,0),0);
 await rename(f.root+'-moved',f.root);await f.enable(row);f.advance(3600000);await f.c.tickCodeSchedules();assert.ok(f.c.getState().codeSchedules[0].active);await f.restart();row=f.c.getState().codeSchedules[0];assert.equal(row.enabled,false);assert.ok(['uncertain','stopped'].includes(row.history[0].status));await f.c.tickCodeSchedules();assert.equal(f.runtimes.reduce((n,r)=>n+r.sent.length,0),1);
});
test('renderer actions cannot smuggle internal scheduling or omit explicit approval',()=>{
 assert.throws(()=>validateAction({type:'sendMessage',text:'do work',fromSchedule:{id:'fake'}}),/options/i);
 assert.throws(()=>validateAction({type:'codeSchedule',operation:'enable',id:'x',expectedRevision:1}),/confirm/i);
 assert.deepEqual(validateAction({type:'codeSchedule',operation:'pause',id:'x',expectedRevision:1}),{type:'codeSchedule',operation:'pause',id:'x',expectedRevision:1});
});
test('removing a completed schedule does not break retained chat events or shutdown',async t=>{
 const f=await fixture(t),s=await f.save();await f.enable(s);f.advance(60000);await f.c.tickCodeSchedules();const runtime=f.runtimes.find(r=>r.sent.length);runtime.finish();const row=f.c.getState().codeSchedules[0];await f.act({type:'codeSchedule',operation:'remove',id:row.id,expectedRevision:row.revision});await f.act({type:'selectTask',id:row.history[0].taskId});await f.act({type:'sendMessage',text:'A later manual request'});runtime.finish();await f.c.close();assert.equal(runtime.sent.length,2);
});
test('closing during scheduled connection cancels admission without sending or retrying',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const f=await fixture(t,{decorate:(r,index)=>{if(index!==1)return;const connect=r.connect,disconnect=r.disconnect;r.connect=async options=>{entered();await gate;await connect(options);};r.disconnect=async()=>{release();await disconnect();};}}),s=await f.save();await f.enable(s);f.advance(60000);const tick=f.c.tickCodeSchedules();await started;await Promise.all([tick,f.c.close()]);assert.equal(f.runtimes.reduce((n,r)=>n+r.sent.length,0),0);
});
