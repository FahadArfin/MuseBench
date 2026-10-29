import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'musebench-drafts-')),dataDir=path.join(root,'data'),project=path.join(root,'project');
 await mkdir(project);await writeFile(path.join(project,'note.txt'),'Draft fixture source.');
 let snapshots=0,current={status:'unavailable',permissionVerified:false,cleanup:'confirmed',messages:[]};
 const listeners=new Set(),runtime={snapshot(){snapshots++;return current;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async disconnect(){},emit(patch){current={...current,...patch};for(const fn of listeners)fn(current);}};
 let controller=await createController({dataDir,runtime});
 const act=async action=>{const state=await controller.dispatch(action);assert.equal(state.error,null);return state;};
 await act({type:'openProject',path:project});
 const state=await act({type:'newTask',request:'Draft fixture',mode:'manual'});
 const input={projectId:state.activeProject.id,taskId:state.task.id,files:[],images:[],mode:'chat'};
 const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));
 t.after(async()=>{db.close();await controller.close();await rm(root,{recursive:true,force:true});});
 return{root,dataDir,db,input,key:input.projectId+':'+input.taskId,act,runtime,get c(){return controller;},
  snapshots:()=>snapshots,resetSnapshots:()=>{snapshots=0;},
  async save(patch){const value={...input,...patch};if(controller.saveCodeDraft)return controller.saveCodeDraft(value);const result=await controller.dispatch({...value,type:'saveDraft'});if(result.error)throw Error(result.error);},
  async reopen(){await controller.close();controller=await createController({dataDir,runtime});},
  async otherProject(){const folder=path.join(root,'other');await mkdir(folder);await writeFile(path.join(folder,'note.txt'),'Other draft fixture.');return(await act({type:'openProject',path:folder})).activeProject;},
  stored(key=input.projectId+':'+input.taskId){const row=db.prepare('SELECT json FROM code_drafts WHERE draft_key=?').get(key);return row?JSON.parse(row.json):undefined;},
 };
}

test('draft acknowledgement avoids unrelated state writes and runtime snapshots',async t=>{
 const f=await fixture(t),app=f.db.prepare('SELECT json FROM app').get().json,task=f.db.prepare('SELECT json FROM tasks WHERE id=?').get(f.input.taskId).json;
 f.resetSnapshots();assert.equal(await f.save({text:'Durable immediately'}),undefined);
 assert.equal(f.db.prepare('SELECT json FROM app').get().json,app,'typing must not rewrite the app snapshot');
 assert.equal(f.db.prepare('SELECT json FROM tasks WHERE id=?').get(f.input.taskId).json,task,'typing must not rewrite a conversation');
 assert.equal(f.snapshots(),0,'typing must not read native runtime snapshots');
 assert.equal(f.stored().text,'Durable immediately');assert.equal(f.c.getState().drafts[f.key].text,'Durable immediately');
});

test('saving a draft preserves an unrelated controller error',async t=>{
 const f=await fixture(t);const before=await f.c.dispatch({type:'selectTask',id:'missing-chat'});
 assert.ok(before.error);await f.save({text:'Keep typing after a navigation error'});
 assert.equal(f.c.getState().error,before.error);
});

test('invalid draft bindings and attachments reject without replacing the previous draft',async t=>{
 const f=await fixture(t);await f.save({text:'Keep this'});
 for(const patch of [{projectId:'missing'},{taskId:'missing'},{text:'x'.repeat(16001)},{mode:'invalid'},{files:[{path:'note.txt',hash:'bad'}]},{images:[{id:'a'.repeat(64),name:'missing.png',mime:'image/png',bytes:8}]}]){
  await assert.rejects(f.save({text:'Must not replace',...patch}));assert.equal(f.c.getState().drafts[f.key].text,'Keep this');
 }
});

test('a failed draft write keeps its prior durable and in-memory value',async t=>{
 const f=await fixture(t);await f.save({text:'Previous draft'});
 f.db.exec("CREATE TRIGGER deny_draft BEFORE UPDATE ON code_drafts WHEN NEW.json LIKE '%denied%' BEGIN SELECT RAISE(ABORT,'owned write failure'); END");
 await assert.rejects(f.save({text:'denied draft'}),/owned write failure/);
 assert.equal(f.stored().text,'Previous draft');assert.equal(f.c.getState().drafts[f.key].text,'Previous draft');
});

test('close drains accepted saves in order and rejects new saves',async t=>{
 const f=await fixture(t);const first=f.save({text:'First queued draft'}),last=f.save({text:'Last queued draft'}),closing=f.c.close();
 await assert.rejects(f.save({text:'Too late'}),/closed/i);await Promise.all([first,last,closing]);
 assert.equal(f.stored().text,'Last queued draft');await f.reopen();assert.equal(f.c.getState().drafts[f.key].text,'Last queued draft');
});

test('a queued save remains bound to its original chat across navigation',async t=>{
 const f=await fixture(t),second=(await f.act({type:'newTask',request:'Second draft fixture',mode:'manual'})).task;
 const saved=f.save({text:'Original chat text'}),selected=f.act({type:'selectTask',id:second.id});
 await Promise.all([saved,selected]);assert.equal(f.c.getState().task.id,second.id);assert.equal(f.stored().text,'Original chat text');
 assert.equal(f.c.getState().drafts[f.input.projectId+':'+second.id],undefined);await f.reopen();assert.equal(f.stored().text,'Original chat text');
});

test('send clears an acknowledged draft and stale legacy data cannot resurrect it',async t=>{
 const f=await fixture(t);await f.save({text:'Send my draft'});
 const saving=f.save({text:'Final submitted text'}),sending=f.act({type:'sendMessage',text:'Final submitted text'});
 await Promise.all([saving,sending]);assert.equal(f.stored(),undefined);
 await f.c.close();const app=JSON.parse(f.db.prepare('SELECT json FROM app').get().json);
 app.drafts[f.key]={text:'Stale legacy copy',files:[],mode:'chat'};
 f.db.prepare('UPDATE app SET json=? WHERE id=1').run(JSON.stringify(app));
 await f.reopen();assert.equal(f.c.getState().drafts[f.key],undefined);
});

test('attachment-only drafts remain durable and empty drafts clear immediately',async t=>{
 const f=await fixture(t),file={path:'note.txt',hash:'a'.repeat(64)};
 await f.save({text:'',files:[file],mode:'plan'});assert.deepEqual(f.stored().files,[file]);
 await f.reopen();assert.equal(f.c.getState().drafts[f.key].mode,'plan');
 await f.save({text:'',files:[],images:[]});assert.equal(f.stored(),undefined);await f.reopen();assert.equal(f.c.getState().drafts[f.key],undefined);
});

test('legacy controller drafts and new screenshot drafts survive the storage upgrade',async t=>{
 const f=await fixture(t);await f.c.close();
 const app=JSON.parse(f.db.prepare('SELECT json FROM app').get().json),legacy={text:'Existing profile draft',files:[{path:'note.txt',hash:'b'.repeat(64)}],images:[],mode:'plan'};
 app.drafts[f.key]=legacy;f.db.prepare('UPDATE app SET json=? WHERE id=1').run(JSON.stringify(app));f.db.exec('DROP TABLE code_drafts');
 await f.reopen();assert.deepEqual(f.c.getState().drafts[f.key],legacy);assert.deepEqual(f.stored(),legacy);
 const image=await f.c.importImage({projectId:f.input.projectId,taskId:f.input.taskId,name:'owned.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='});
 await f.save({text:'Keep the screenshot',images:[image]});assert.deepEqual(f.stored().images,[image]);await f.reopen();
 assert.deepEqual(f.c.getState().drafts[f.key].images,[image]);assert.match(await f.c.readImage({projectId:f.input.projectId,image}),/^data:image\/png/);
});

test('deleting a chat removes its separately persisted draft',async t=>{
 const f=await fixture(t);await f.save({text:'Deleted with this chat'});
 await f.act({type:'deleteTask',id:f.input.taskId,allowUnarchived:true});assert.equal(f.stored(),undefined);
 await f.reopen();assert.equal(f.c.getState().drafts[f.key],undefined);
});

test('moving a chat moves the draft binding and rollback preserves the original',async t=>{
 const f=await fixture(t),other=await f.otherProject();await f.act({type:'selectTask',id:f.input.taskId});
 await f.save({text:'Draft follows its chat'});
 const move={type:'moveSidebarItem',kind:'chat',id:f.input.taskId,section:'project',projectId:other.id},newKey=other.id+':'+f.input.taskId;
 f.db.exec("CREATE TRIGGER deny_move BEFORE UPDATE ON app WHEN json_extract(NEW.json,'$.task.projectId')='"+other.id+"' BEGIN SELECT RAISE(ABORT,'owned move failure'); END");
 const failed=await f.c.dispatch(move);assert.match(failed.error,/owned move failure/);assert.equal(failed.task.projectId,f.input.projectId);
 assert.equal(f.stored().text,'Draft follows its chat');assert.equal(f.stored(newKey),undefined);
 f.db.exec('DROP TRIGGER deny_move');await f.act(move);assert.equal(f.stored(),undefined);assert.equal(f.stored(newKey).text,'Draft follows its chat');
 await f.reopen();assert.equal(f.c.getState().drafts[newKey].text,'Draft follows its chat');assert.equal(f.c.getState().drafts[f.key],undefined);
});

test('typing leaves streaming updates coalesced and close flushes pending progress',async t=>{
 const f=await fixture(t);t.mock.timers.enable({apis:['setTimeout']});
 f.runtime.emit({status:'running',runId:'owned-stream',reason:'First progress'});
 let updates=0;f.c.subscribe(()=>updates++);
 f.runtime.emit({reason:'Coalesced progress'});await f.save({text:'Typing during progress'});assert.equal(updates,0,'typing must not flush stream updates');
 t.mock.timers.tick(40);assert.equal(updates,1);
 f.runtime.emit({reason:'Final pending progress'});assert.equal(updates,1);await f.c.close();
 assert.equal(JSON.parse(f.db.prepare('SELECT json FROM app').get().json).runtime.reason,'Final pending progress');
});
