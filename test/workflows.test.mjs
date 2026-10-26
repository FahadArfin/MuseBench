import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {createController} from '../src/controller/index.mjs';import {validateWorkflow,workflowPrompts,DEFAULT_WORKFLOWS} from '../src/shared/workflows.mjs';
test('workflow templates validate bounded phases and relative scope',()=>{
 for(const w of DEFAULT_WORKFLOWS){assert.equal(validateWorkflow(w).id,w.id);const prompts=workflowPrompts(w,'Fix the bug');assert.equal(prompts.length,w.phases.length);assert.match(prompts[0].text,/Fix the bug/);assert.match(prompts[0].text,/completion checks/i);}
 const w=structuredClone(DEFAULT_WORKFLOWS[0]);assert.throws(()=>validateWorkflow({...w,phases:[]}));assert.throws(()=>validateWorkflow({...w,scope:['../outside']}));assert.throws(()=>validateWorkflow({...w,phases:[{...w.phases[0],budget:'infinite'}]}));
});
test('workflow edits persist and queue immutable phases with recipient permissions',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-workflows-')),root=path.join(dir,'project'),dataDir=path.join(dir,'data');await mkdir(root);let c=await createController({dataDir});t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
 const act=async a=>{const s=await c.dispatch(a);assert.equal(s.error,null);return s;};await act({type:'openProject',path:root});let s=await act({type:'newTask',request:'Workflow test',mode:'muse',runOptions:{reasoning:'low',approval:'ask'}});
 const workflow={...structuredClone(DEFAULT_WORKFLOWS[0]),id:'my-flow',title:'My flow'};await act({type:'saveWorkflow',workflow});await c.close();c=await createController({dataDir});assert.ok(c.getState().workflows.some(w=>w.id==='my-flow'));
 s=await act({type:'queueWorkflow',id:'request-1',taskId:s.task.id,workflowId:'my-flow',objective:'Fix the bug'});const prompts=s.task.promptQueue;assert.equal(prompts.length,workflow.phases.length);assert.equal(prompts[0].runOptions.approval,'ask');assert.equal(prompts[0].runOptions.reasoning,'low');assert.equal(prompts[0].runOptions.budget,workflow.phases[0].budget);assert.equal(s.task.queuePaused,true);
 s=await act({type:'queueWorkflow',id:'request-1',taskId:s.task.id,workflowId:'my-flow',objective:'Fix the bug'});assert.equal(s.task.promptQueue.length,prompts.length);
 await act({type:'saveWorkflow',workflow:{...workflow,title:'Changed'}});s=await act({type:'deleteWorkflow',id:'my-flow'});assert.equal(s.task.promptQueue[0].workflow.title,'My flow');assert.equal(s.workflows.some(w=>w.id==='my-flow'),false);
 s=await c.dispatch({type:'queueWorkflow',id:'request-2',taskId:'stale',workflowId:DEFAULT_WORKFLOWS[0].id,objective:'x'});assert.match(s.error,/selected|changed/i);
});

function runtime(){
 let state={transport:'exec',status:'unavailable',permissionVerified:false,cleanup:'confirmed',messages:[],runId:null},listeners=new Set(),sequence=0;const sent=[];
 const emit=patch=>{state={...state,...patch};for(const fn of listeners)fn(structuredClone(state));};
 return{sent,snapshot:()=>structuredClone(state),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},connect:async()=>emit({status:'idle',permissionVerified:true,sessionId:'connection'}),send:async request=>{sent.push(request);emit({status:'running',runId:null,messages:[]});emit({status:'running',runId:`run-${++sequence}`});},fail:()=>emit({status:'failed',reason:'Phase failed'}),finish:text=>emit({status:'completed',cleanup:'confirmed',messages:[{id:`message-${sequence}`,kind:'agentMessage',text}]}),disconnect:async()=>emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'}),close:async()=>emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'})};
}
test('workflow phases run in order and stop after native failure',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-workflow-run-')),root=path.join(dir,'project');await mkdir(root);const r=runtime(),c=await createController({dataDir:path.join(dir,'data'),runtime:r});t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
 const act=async a=>{const s=await c.dispatch(a);assert.equal(s.error,null);return s;};await act({type:'openProject',path:root});const s=await act({type:'newTask',mode:'muse',request:'Test'});
 await act({type:'queueWorkflow',id:'run-1',taskId:s.task.id,workflowId:'implement-verify',objective:'Fix the bug'});assert.equal(r.sent.length,0);await act({type:'resumeQueue'});assert.equal(r.sent.length,1);assert.match(r.sent[0].text,/Phase 1\/3: Plan/);assert.equal(r.sent[0].runOptions.budget,'standard');
 r.finish('Plan done');await new Promise(r=>setTimeout(r,40));assert.equal(r.sent.length,2);assert.match(r.sent[1].text,/Phase 2\/3: Implement/);assert.equal(r.sent[1].runOptions.budget,'extended');r.fail();await new Promise(r=>setTimeout(r,40));assert.equal(r.sent.length,2);assert.equal(c.getState().task.promptQueue.length,1);assert.equal(c.getState().task.queuePaused,true);
});
