import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {validateAction} from '../electron/security.mjs';
function runtime(){
 let state={transport:'exec',status:'unavailable',permissionVerified:false,cleanup:'confirmed',messages:[],runId:null},listeners=new Set(),sequence=0;const sent=[];
 const emit=patch=>{state={...state,...patch};for(const fn of listeners)fn(structuredClone(state));};
 return{sent,snapshot:()=>structuredClone(state),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},connect:async()=>emit({status:'idle',permissionVerified:true,sessionId:'connection'}),send:async request=>{sent.push(request);emit({status:'running',runId:null,messages:[]});emit({status:'running',runId:`run-${++sequence}`});},finish:text=>emit({status:'completed',cleanup:'confirmed',messages:[{id:`message-${sequence}`,kind:'agentMessage',text}]}),disconnect:async()=>emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'}),close:async()=>emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'})};
}
test('background chats own events, queues and stops while navigation remains independent',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-background-')),a=path.join(dir,'a'),b=path.join(dir,'b');await mkdir(a);await mkdir(b);const runtimes=[];
 const factory=()=>{const r=runtime();runtimes.push(r);return r;};const controller=await createController({dataDir:path.join(dir,'data'),runtimeFactory:factory});t.after(async()=>{await controller.close();await rm(dir,{recursive:true,force:true});});
 const act=async action=>{const state=await controller.dispatch(action);assert.equal(state.error,null);return state;};
 await act({type:'openProject',path:a});let state=await act({type:'newTask',mode:'muse',request:'First'});const first=state.task.id;
 await act({type:'sendMessage',text:'First request'});const firstRuntime=runtimes.find(r=>r.sent.length);
 await act({type:'queueMessage',text:'Queued follow-up'});
 await act({type:'openProject',path:b});state=await act({type:'newTask',mode:'muse',request:'Second'});const second=state.task.id;await act({type:'sendMessage',text:'Second request'});const secondRuntime=runtimes.find(r=>r!==firstRuntime&&r.sent.length);
 assert.equal(firstRuntime.snapshot().status,'running');assert.equal(controller.getState().tasks.find(t=>t.id===first).runtimeStatus,'running');
 firstRuntime.finish('Only first chat gets this');
 const deadline=Date.now()+5000;
 while(firstRuntime.sent.length!==2&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
 assert.equal(firstRuntime.sent.length,2,'background queue continues');
 state=controller.getState();assert.equal(state.task.id,second);assert.ok(!state.task.messages.some(m=>m.text==='Only first chat gets this'));
 await act({type:'disconnectMuse'});assert.equal(secondRuntime.snapshot().status,'unavailable');assert.equal(firstRuntime.snapshot().status,'running');
 state=await act({type:'selectTask',id:first});assert.ok(state.task.messages.some(m=>m.text==='Only first chat gets this'));assert.equal(state.runtime.status,'running');
 await act({type:'newTask',mode:'muse',request:'Same checkout'});state=await controller.dispatch({type:'sendMessage',text:'Conflicting write'});assert.match(state.error,/another chat|checkout/i);
 await controller.close();assert.equal(firstRuntime.snapshot().status,'unavailable');
});

async function fixture(t){
 const dir=await mkdtemp(path.join(tmpdir(),'muse-lifecycle-')),project=path.join(dir,'project');await mkdir(project);const runtimes=[];
 const factory=()=>{const r=runtime(),connect=r.connect;r.connect=async options=>{assert.equal(r.snapshot().permissionVerified,false,'must not reconnect a verified runtime');await connect(options);};r.refreshModels=async()=>{};runtimes.push(r);return r;};
 const c=await createController({dataDir:path.join(dir,'data'),runtimeFactory:factory,discoverModels:async()=>({source:'providerCatalog',models:[]})});t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
 const act=async action=>{const s=await c.dispatch(action);assert.equal(s.error,null);return s;};await act({type:'openProject',path:project});const s=await act({type:'newTask',mode:'muse',request:'First'});return{c,act,runtimes,id:s.task.id};
}
test('desktop model discovery action crosses the IPC boundary',()=>{assert.deepEqual(validateAction({type:'refreshModels'}),{type:'refreshModels'});});
test('loading models before the first prompt leaves session connection to the prompt',async t=>{
 const {act,runtimes}=await fixture(t);const state=await act({type:'refreshModels'});assert.equal(state.runtime.permissionVerified,false);assert.equal(state.task.nativeSession,undefined);assert.ok(runtimes.every(r=>r.sent.length===0));await act({type:'sendMessage',text:'Use the selected model'});assert.equal(runtimes.reduce((n,r)=>n+r.sent.length,0),1);
});
test('inactive retained chats preserve pin, archive and sidebar changes when reopened',async t=>{
 const {act,id}=await fixture(t);let s=await act({type:'newTask',mode:'muse',request:'Second'});const second=s.task.id;
 await act({type:'setTaskFlags',id,pinned:true});s=await act({type:'selectTask',id});assert.equal(s.task.pinned,true);
 await act({type:'selectTask',id:second});await act({type:'moveSidebarItem',kind:'chat',id,section:'recents'});s=await act({type:'selectTask',id});assert.equal(s.task.pinned,false);
 await act({type:'selectTask',id:second});await act({type:'moveSidebarItem',kind:'chat',id,section:'pinned'});s=await act({type:'selectTask',id});assert.equal(s.task.pinned,true);
 await act({type:'selectTask',id:second});await act({type:'setTaskFlags',id,archived:true});s=await act({type:'selectTask',id});assert.equal(s.task.archived,true);assert.equal(s.task.pinned,false);
});
test('deleting the selected chat keeps runtime events connected for the next chat',async t=>{
 const {act,id,c,runtimes}=await fixture(t);await act({type:'setTaskFlags',id,archived:true});await act({type:'deleteTask',id});await act({type:'newTask',mode:'muse',request:'Successor'});await act({type:'sendMessage',text:'Continue here'});
 runtimes.find(r=>r.sent.length).finish('Successor reply');await new Promise(r=>setTimeout(r,40));assert.ok(c.getState().task.messages.some(m=>m.text==='Successor reply'));assert.equal(c.getState().runtime.status,'completed');
});

test('renaming a retained chat updates its runtime context without selecting it',async t=>{
 const {act,id}=await fixture(t);const second=(await act({type:'newTask',mode:'muse',request:'Second'})).task.id;
 let s=await act({type:'renameTask',id,title:'First renamed'});assert.equal(s.task.id,second);assert.equal(s.task.title,'Second');
 s=await act({type:'selectTask',id});assert.equal(s.task.title,'First renamed');
});

test('running background chats reject targeted rename and confirmed direct deletion',async t=>{
 const {act,id,c,runtimes}=await fixture(t);await act({type:'sendMessage',text:'Keep working'});const running=runtimes.find(r=>r.sent.length);const second=(await act({type:'newTask',mode:'muse',request:'Second'})).task.id;
 for(const action of [{type:'renameTask',id,title:'Must not rename'},{type:'deleteTask',id,allowUnarchived:true}]){const s=await c.dispatch(action);assert.match(s.error,/Stop this chat/i);assert.equal(s.task.id,second);assert.equal(s.tasks.find(item=>item.id===id).title,'First');assert.equal(running.snapshot().status,'running');}
});
