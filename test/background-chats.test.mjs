import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
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
 firstRuntime.finish('Only first chat gets this');await new Promise(r=>setTimeout(r,40));assert.equal(firstRuntime.sent.length,2,'background queue continues');
 state=controller.getState();assert.equal(state.task.id,second);assert.ok(!state.task.messages.some(m=>m.text==='Only first chat gets this'));
 await act({type:'disconnectMuse'});assert.equal(secondRuntime.snapshot().status,'unavailable');assert.equal(firstRuntime.snapshot().status,'running');
 state=await act({type:'selectTask',id:first});assert.ok(state.task.messages.some(m=>m.text==='Only first chat gets this'));assert.equal(state.runtime.status,'running');
 await act({type:'newTask',mode:'muse',request:'Same checkout'});state=await controller.dispatch({type:'sendMessage',text:'Conflicting write'});assert.match(state.error,/another chat|checkout/i);
 await controller.close();assert.equal(firstRuntime.snapshot().status,'unavailable');
});
