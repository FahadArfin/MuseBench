import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
const annotations=[{id:'a',page:'https://example.com/page',target:{selector:'html > body > button',tag:'button',title:'Button',text:'Page reference',rect:{x:0,y:0,width:.5,height:.5}},note:'Make this blue',styleChanges:{color:'blue'}}];
async function fixture(t,mode='manual'){
 const root=await mkdtemp(path.join(os.tmpdir(),'browser-annotations-')),project=path.join(root,'project'),dataDir=path.join(root,'data');await mkdir(project);
 let native={status:'idle',transport:'exec',messages:[],permissionVerified:true,cleanup:'confirmed'},sequence=0;const listeners=new Set();
 const runtime={sent:[],steered:[],snapshot:()=>structuredClone(native),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(patch){native={...native,...patch};for(const fn of listeners)fn(native);},async disconnect(){this.emit({status:'closed',cleanup:'confirmed'});},async connect(){this.emit({status:'idle',permissionVerified:true,cleanup:'confirmed'});},async send(input){this.sent.push(input);this.emit({status:'running',runId:null,inputAccepted:false,cleanup:'pending',steeringSupported:true,turnId:'turn-'+(++sequence)});this.emit({runId:'run-'+sequence,inputAccepted:true});},async steer(input){this.steered.push(input);this.emit({steering:{status:'accepted',commandId:'steer-'+(++sequence),turnId:input.expectedTurnId}});}};
 let c=await createController({dataDir,runtime});await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',request:'Annotation fixture',mode});
 t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});
 const state=c.getState(),owner={projectId:state.activeProject.id,taskId:state.task.id},key=owner.projectId+':'+owner.taskId;
 return{owner,key,runtime,get c(){return c;},async reopen(){await c.close();c=await createController({dataDir,runtime});},save:patch=>c.saveCodeDraft({...owner,text:'Apply',files:[],images:[],mode:'chat',...patch})};
}
test('annotation-only drafts survive shelf swaps, reload and new-chat transfer',async t=>{
 const f=await fixture(t);await f.save({text:'',annotations});await f.reopen();assert.deepEqual(f.c.getState().drafts[f.key].annotations,annotations);
 const parked=await f.c.parkCodeDraft({...f.owner,expected:f.c.getState().drafts[f.key]});assert.equal(parked.draft,null);assert.deepEqual(parked.entries[0].draft.annotations,annotations);
 await f.reopen();await f.c.restoreSavedPrompt({...f.owner,id:parked.entries[0].id,expected:{text:'',files:[],images:[],mode:'chat'}});assert.deepEqual(f.c.getState().drafts[f.key].annotations,annotations);
 await f.save({text:'',annotations:[]});const owner={...f.owner,taskId:null},draft={text:'Transfer',files:[],images:[],mode:'plan',annotations};await f.c.saveCodeDraft({...owner,...draft});
 await assert.rejects(f.c.transferCodeDraft({...owner,targetTaskId:f.owner.taskId,expected:{...draft,annotations:[]}}),/changed/);
 await f.c.transferCodeDraft({...owner,targetTaskId:f.owner.taskId,expected:draft});await f.reopen();assert.deepEqual(f.c.getState().drafts[f.key].annotations,annotations);
});
test('sending preserves a changed bundle and consumes only the exact draft including attachments',async t=>{
 const f=await fixture(t);await f.save({annotations});let result=await f.c.dispatch({type:'sendMessage',text:'Apply',annotations:[{...annotations[0],note:'Other bundle'}]});assert.equal(result.error,null);assert.deepEqual(result.drafts[f.key].annotations,annotations);
 result=await f.c.dispatch({type:'sendMessage',text:'Apply',annotations});assert.equal(result.error,null);assert.equal(result.drafts[f.key],undefined);assert.deepEqual(result.task.messages.findLast(m=>m.role==='user').annotations,annotations);
 await f.reopen();assert.deepEqual(f.c.getState().task.messages.findLast(m=>m.role==='user').annotations,annotations);
 const history=await f.c.readChatHistory({taskId:f.owner.taskId});assert.ok(history.messages.some(m=>m.annotations?.[0]?.note==='Make this blue'));
});

test('native queue delivery and steering use the exact annotation bundle and preserve unrelated drafts',async t=>{
 const f=await fixture(t,'muse');await f.save({annotations});
 let state=await f.c.dispatch({type:'queueMessage',text:'Apply',annotations});assert.equal(state.error,null);assert.equal(state.drafts[f.key],undefined);assert.deepEqual(state.task.promptQueue[0].annotations,annotations);
 const queued=state.task.promptQueue[0];await f.reopen();assert.deepEqual(f.c.getState().task.promptQueue[0].annotations,annotations);
 await f.save({text:'Unrelated draft',annotations:[{...annotations[0],note:'Retain this'}]});
 state=await f.c.dispatch({type:'sendQueued',taskId:f.owner.taskId,id:queued.id,expectedRevision:queued.revision??0});assert.equal(state.error,null);assert.match(f.runtime.sent[0].text,/Browser annotation references/);assert.match(f.runtime.sent[0].text,/Make this blue/);assert.equal(state.drafts[f.key].text,'Unrelated draft');assert.deepEqual(state.task.messages.findLast(m=>m.role==='user').annotations,annotations);
 state=await f.c.dispatch({type:'queueMessage',text:'Correction',annotations:[{...annotations[0],note:'Steer blue'}]});assert.equal(state.error,null);const item=state.task.promptQueue[0],turnId=f.runtime.snapshot().turnId;
 state=await f.c.dispatch({type:'steerQueued',taskId:f.owner.taskId,id:item.id,expectedRevision:item.revision??0,expectedTurnId:turnId});assert.equal(state.error,null);assert.match(f.runtime.steered[0].text,/Steer blue/);assert.equal(state.task.promptQueue.length,0);assert.equal(state.drafts[f.key].text,'Unrelated draft');assert.equal(state.task.messages.at(-1).annotations[0].note,'Steer blue');
});
