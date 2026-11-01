import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';

test('unchanged long-history runtime observations do not rewrite durable task and app snapshots',async t=>{
 const base=await fs.mkdtemp(path.join(tmpdir(),'musebench-stream-persistence-')),project=path.join(base,'project'),dataDir=path.join(base,'data');await fs.mkdir(project);
 let c=await createController({dataDir});await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',mode:'manual',request:'Stream persistence'});const taskId=c.getState().task.id;await c.close();
 const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));t.after(async()=>{await c.close();db.close();await fs.rm(base,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
 const task=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(taskId).json);task.messages=Array.from({length:150},(_,i)=>({id:'bench-'+i,role:i%2?'assistant':'user',text:'x'.repeat(16000),at:task.createdAt}));
 db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(task),taskId);const app=JSON.parse(db.prepare('SELECT json FROM app').get().json);app.task=task;db.prepare('UPDATE app SET json=?').run(JSON.stringify(app));
 let callback;const observed={status:'running',permissionVerified:false,cleanup:'confirmed',messages:[],runId:'fixture-stream'};
 const runtime={snapshot:()=>structuredClone(observed),statusSnapshot:()=>({status:observed.status,cleanup:'confirmed'}),subscribe:fn=>{callback=fn;return()=>{};},disconnect:async()=>{observed.status='unavailable';}};
 c=await createController({dataDir,runtime});callback(observed);await new Promise(resolve=>setTimeout(resolve,50));
 db.exec("CREATE TABLE persistence_writes(kind TEXT); CREATE TRIGGER task_write AFTER UPDATE ON tasks BEGIN INSERT INTO persistence_writes VALUES('task'); END; CREATE TRIGGER app_write AFTER UPDATE ON app BEGIN INSERT INTO persistence_writes VALUES('app'); END; CREATE TRIGGER history_write AFTER UPDATE ON chat_history BEGIN INSERT INTO persistence_writes VALUES('history'); END;");
 let notifications=0;const off=c.subscribe(()=>notifications++);
 for(let i=0;i<3;i++){callback(observed);await new Promise(resolve=>setTimeout(resolve,50));}off();
 assert.deepEqual(db.prepare('SELECT kind FROM persistence_writes').all(),[],'identical progress must not repeat whole-history persistence');
 assert.equal(notifications,0,'identical progress must not clone and republish the retained transcript');
 observed.status='idle';const state=await c.dispatch({type:'sendMessage',text:'A later durable journal message'});assert.equal(state.error,null);
 assert(db.prepare('SELECT count(*) n FROM persistence_writes WHERE kind=?').get('task').n>0);
 const saved=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(taskId).json);assert(saved.messages.some(message=>message.text==='A later durable journal message'));
 assert.equal(c.readChatHistory({taskId,messageId:'bench-0'}).messages[0].text.length,12000);
 await c.close();c=await createController({dataDir});assert(c.getState().task.messages.some(message=>message.text==='A later durable journal message'));
 assert.equal(c.readChatHistory({taskId,messageId:'bench-0',offset:15000}).messages[0].text.length,1000);
});

test('changing streamed tails persist once per flush and keep complete indexed text after restart',async t=>{
 const base=await fs.mkdtemp(path.join(tmpdir(),'musebench-changing-stream-')),project=path.join(base,'project'),dataDir=path.join(base,'data');await fs.mkdir(project);
 let c=await createController({dataDir});await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',mode:'muse',request:'Real changing tail fixture'});const taskId=c.getState().task.id;await c.close();
 const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));t.after(async()=>{await c.close();db.close();await fs.rm(base,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
 const task=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(taskId).json);task.messages=Array.from({length:150},(_,i)=>({id:'old-'+i,role:i%2?'assistant':'user',text:'x'.repeat(16000),at:task.createdAt}));
 const optionalMetadata={optional:null,flags:[true,false,0],nested:{quote:'"\\\n😀é'}};task.messages[149].fixtureMetadata=optionalMetadata;
 db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(task),taskId);const app=JSON.parse(db.prepare('SELECT json FROM app').get().json);app.task=task;db.prepare('UPDATE app SET json=?').run(JSON.stringify(app));
 let state={status:'unavailable',transport:'exec',permissionVerified:false,cleanup:'confirmed',messages:[],runId:null},callback;
 const emit=patch=>{state={...state,...patch};callback?.(state);};
 const runtime={snapshot:()=>structuredClone(state),statusSnapshot:()=>({status:state.status,cleanup:state.cleanup}),subscribe:fn=>{callback=fn;return()=>{callback=null;};},async connect(){emit({status:'idle',permissionVerified:true});},async disconnect(){emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'});},async send(){emit({status:'running',runId:null,inputAccepted:false,messages:[],cleanup:undefined});emit({runId:'changing',inputAccepted:true});}};
 c=await createController({dataDir,runtime});assert.equal((await c.dispatch({type:'sendMessage',text:'Start changing tail'})).error,null);
 let wholeTranscriptEncodings=0;const stringify=JSON.stringify;
 const mocked=t.mock.method(JSON,'stringify',function(value,...args){if(value?.id===taskId&&Array.isArray(value.messages)||value?.task?.id===taskId&&Array.isArray(value.task.messages))wholeTranscriptEncodings++;return stringify(value,...args);});
 for(let i=0;i<4;i++){
  const text='s'.repeat(15950)+' changing tail 😀é "\\ '+i;emit({messages:[{id:'tail',kind:'agentMessage',text}]});await new Promise(resolve=>setTimeout(resolve,50));
  const durable=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(taskId).json);assert.equal(durable.messages.find(message=>message.id==='runtime:tail').text,text);assert.deepEqual(durable.messages.find(message=>message.id==='old-149').fixtureMetadata,optionalMetadata);
 }
 mocked.mock.restore();assert.equal(wholeTranscriptEncodings,0,'changing tails must reuse the already encoded retained messages');
 const marker=' canonical searchable terminal evidence';emit({status:'completed',cleanup:'confirmed',messages:[{id:'tail',kind:'agentMessage',text:'z'.repeat(17000)+marker}]});await c.dispatch({type:'refresh'});await c.close();
 c=await createController({dataDir});assert.equal(c.readChatHistory({taskId,messageId:'runtime:tail',offset:17000}).messages[0].text,marker);assert(c.searchChats({query:'searchable terminal evidence'}).some(row=>row.id===taskId));
 assert.equal(c.getState().task.messages.find(message=>message.id==='runtime:tail').text,'z'.repeat(16000));assert.equal(c.getState().task.messages.find(message=>message.id==='runtime:tail').outcome,'completed');assert.deepEqual(c.getState().task.messages.find(message=>message.id==='old-149').fixtureMetadata,optionalMetadata);
});
