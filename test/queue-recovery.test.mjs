import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';
import {validateAction} from '../electron/security.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'musebench-queue-edit-')),dataDir=path.join(root,'data'),project=path.join(root,'project');await mkdir(project);await writeFile(path.join(project,'notes.txt'),'Read me');
 let state={status:'idle',transport:'exec',permissionVerified:true,messages:[],cleanup:'confirmed'},sequence=0;const listeners=new Set();
 const runtime={sent:[],fail:false,snapshot:()=>structuredClone(state),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(patch){state={...state,...patch};for(const fn of listeners)fn(state);},async connect(){this.emit({status:'idle',permissionVerified:true,cleanup:'confirmed'});},async disconnect(){this.emit({status:'closed',cleanup:'confirmed'});},async send(input){if(this.preflightFail)throw Object.assign(Error('Model unavailable before dispatch'),{inputAdmission:'not-sent'});this.sent.push(input);if(this.fail)throw Error('Acknowledgment lost');this.emit({status:'running',runId:null,inputAccepted:false,messages:[],cleanup:'pending'});if(!this.delayed)this.accept();},accept(){this.emit({runId:'queue-'+(++sequence),inputAccepted:true});},finish(){this.emit({status:'completed',cleanup:'confirmed',messages:[]});}};
 let c=await createController({dataDir,runtime});const act=async action=>{const s=await c.dispatch(action);assert.equal(s.error,null);return s;};await act({type:'openProject',path:project});const initial=await act({type:'newTask',request:'Queue fixture',mode:'muse'}),binding={projectId:initial.activeProject.id,taskId:initial.task.id};
 const image=await c.importImage({...binding,name:'screen.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='});const info=await c.inspectContext({...binding,text:'Context'}),files=info.files.filter(f=>f.path==='notes.txt').map(({path,hash})=>({path,hash}));
 await c.saveCodeDraft({...binding,text:'Keep my current draft',files,images:[image],mode:'plan'});
 t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});
 return {get c(){return c;},runtime,act,binding,files,image,project,dataDir,key:binding.projectId+':'+binding.taskId,async reopen(){await c.close();c=await createController({dataDir,runtime});},async add(text='Queued request'){const s=await act({type:'queueMessage',text,files,images:[image],mode:'chat',runOptions:{reasoning:'low',approval:'ask'}});return s.task.promptQueue.at(-1);}};
}
const bound=(f,item)=>({taskId:f.binding.taskId,id:item.id,expectedRevision:item.revision??0});

test('queue edit pauses delivery, preserves attachments/options and never replaces the composer draft',async t=>{
 const f=await fixture(t),item=await f.add(),draft=f.c.getState().drafts[f.key];await f.act({type:'beginQueueEdit',...bound(f,item)});
 const s=await f.act({type:'editQueued',...bound(f,item),text:'Edited request',mode:'plan'}),changed=s.task.promptQueue[0];
 assert.equal(changed.text,'Edited request');assert.equal(changed.mode,'plan');assert.equal(changed.revision,1);assert.deepEqual(changed.files,item.files);assert.deepEqual(changed.images,item.images);assert.deepEqual(changed.runOptions,item.runOptions);assert.equal(s.task.queuePaused,true);assert.equal(s.task.queueHold,true);assert.deepEqual(s.drafts[f.key],draft);assert.equal(f.runtime.sent.length,0);
 assert.match((await f.c.dispatch({type:'editQueued',...bound(f,item),text:'Stale edit',mode:'chat'})).error,/changed/i);
 assert.match((await f.c.dispatch({type:'sendQueued',...bound(f,changed),taskId:'wrong-chat'})).error,/chat/i);
 await f.reopen();assert.equal(f.c.getState().task.promptQueue[0].text,'Edited request');assert.deepEqual(f.c.getState().drafts[f.key],draft);
});
test('Send now starts only the chosen ready request and keeps the remaining queue and draft paused',async t=>{
 const f=await fixture(t),first=await f.add('First'),second=await f.add('Second'),draft=f.c.getState().drafts[f.key];
 let s=await f.act({type:'sendQueued',...bound(f,second)});assert.equal(f.runtime.sent.length,1);assert.match(f.runtime.sent[0].text,/Second/);assert.equal(s.task.promptQueue.length,1);assert.equal(s.task.promptQueue[0].id,first.id);assert.equal(s.task.queueHold,true);assert.deepEqual(s.drafts[f.key],draft);
 s=await f.c.dispatch({type:'sendQueued',...bound(f,second)});assert.ok(s.error);f.runtime.finish();await new Promise(r=>setTimeout(r,35));assert.equal(f.runtime.sent.length,1);
});
test('known source rejection leaves request ready and preserves the unrelated draft',async t=>{
 const f=await fixture(t),item=await f.add(),draft=f.c.getState().drafts[f.key];await writeFile(path.join(f.project,'notes.txt'),'Changed');
 const s=await f.c.dispatch({type:'sendQueued',...bound(f,item)});assert.match(s.error,/changed/i);assert.equal(s.task.promptQueue[0].delivery,'ready');assert.deepEqual(s.drafts[f.key],draft);assert.equal(f.runtime.sent.length,0);
});
test('unknown dispatch cannot be replayed by edit, Send now, resume or restart',async t=>{
 const f=await fixture(t),item=await f.add(),draft=f.c.getState().drafts[f.key];f.runtime.fail=true;let s=await f.c.dispatch({type:'sendQueued',...bound(f,item)});assert.match(s.error,/lost/);assert.equal(s.task.promptQueue[0].delivery,'unknown');assert.deepEqual(s.drafts[f.key],draft);
 for(const action of [{type:'sendQueued',...bound(f,item)},{type:'editQueued',...bound(f,item),text:'retry',mode:'chat'},{type:'resumeQueue'}])assert.match((await f.c.dispatch(action)).error,/unknown/i);
 assert.equal(f.runtime.sent.length,1);await f.reopen();s=f.c.getState();assert.equal(s.task.promptQueue[0].delivery,'unknown');assert.deepEqual(s.drafts[f.key],draft);assert.match((await f.c.dispatch({type:'resumeQueue'})).error,/unknown/i);assert.equal(f.runtime.sent.length,1);
});
test('a persisted sending entry restores as unknown without automatic dispatch',async t=>{
 const f=await fixture(t);await f.add();await f.c.close();const db=new DatabaseSync(path.join(f.dataDir,'musebench.sqlite')),row=db.prepare('SELECT json FROM tasks WHERE id=?').get(f.binding.taskId),task=JSON.parse(row.json);task.promptQueue[0].delivery='sending';db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(task),task.id);db.close();await f.reopen();assert.equal(f.c.getState().task.promptQueue[0].delivery,'unknown');assert.equal(f.runtime.sent.length,0);
});
test('trusted queue edit actions validate exact identities, revisions and bounded text',()=>{
 const binding={taskId:'chat',id:'prompt',expectedRevision:0};assert.equal(validateAction({type:'sendQueued',...binding}).id,'prompt');
 for(const value of [{...binding,expectedRevision:-1},{...binding,expectedRevision:1.1},{...binding,id:''},{...binding,expectedRevision:undefined}])assert.throws(()=>validateAction({type:'sendQueued',...value}));
 for(const text of ['', 'x'.repeat(16001)])assert.throws(()=>validateAction({type:'editQueued',...binding,text,mode:'chat'}));assert.throws(()=>validateAction({type:'editQueued',...binding,text:'Ok',mode:'other'}));
});
test('process startup keeps the full queued request until observed native acceptance',async t=>{
 const f=await fixture(t),item=await f.add(),draft=f.c.getState().drafts[f.key];f.runtime.delayed=true;let s=await f.act({type:'sendQueued',...bound(f,item)});assert.equal(s.task.promptQueue.length,1);assert.equal(s.task.promptQueue[0].delivery,'sending');assert.deepEqual(s.task.promptQueue[0].images,item.images);
 const db=new DatabaseSync(path.join(f.dataDir,'musebench.sqlite'));assert.equal(JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(f.binding.taskId).json).promptQueue[0].delivery,'sending');db.close();
 f.runtime.accept();s=f.c.getState();assert.equal(s.task.promptQueue.length,0);assert.deepEqual(s.drafts[f.key],draft);assert.equal(f.runtime.sent.length,1);
});
test('asynchronous rejection restores the original queue metadata without changing the composer',async t=>{
 const f=await fixture(t);let item=await f.add();item=(await f.act({type:'editQueued',...bound(f,item),text:item.text,mode:'plan'})).task.promptQueue[0];const draft=f.c.getState().drafts[f.key];f.runtime.delayed=true;await f.act({type:'sendQueued',...bound(f,item)});f.runtime.emit({status:'failed',inputAccepted:false,runId:null,cleanup:'confirmed',reason:'Not admitted'});
 const s=f.c.getState();assert.equal(s.task.promptQueue[0].delivery,'ready');assert.equal(s.task.promptQueue[0].mode,'plan');assert.deepEqual(s.task.promptQueue[0].images,item.images);assert.deepEqual(s.task.promptQueue[0].files,item.files);assert.deepEqual(s.drafts[f.key],draft);assert.equal(s.task.queuePaused,true);
});
test('restart during pending native admission retains an unknown request without replay',async t=>{
 const f=await fixture(t),item=await f.add();f.runtime.delayed=true;await f.act({type:'sendQueued',...bound(f,item)});await f.reopen();const s=f.c.getState();assert.equal(s.task.promptQueue[0].delivery,'unknown');assert.deepEqual(s.task.promptQueue[0].images,item.images);assert.equal(f.runtime.sent.length,1);
});
test('runtime-proven preflight rejection leaves the queue ready, with no provider dispatch',async t=>{
 const f=await fixture(t),item=await f.add();f.runtime.preflightFail=true;const s=await f.c.dispatch({type:'sendQueued',...bound(f,item)});assert.match(s.error,/before dispatch/);assert.equal(s.task.promptQueue[0].delivery,'ready');assert.equal(f.runtime.sent.length,0);assert.equal(s.task.messages.filter(m=>m.role==='user').length,0);
});
