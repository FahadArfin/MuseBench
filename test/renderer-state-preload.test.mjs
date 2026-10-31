import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';

const source=await readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8');
function fixture(){
 const ipc=new EventEmitter(),calls=[],pending=[];let bridge;
 ipc.send=(...args)=>calls.push(args);ipc.sendSync=()=>false;
 ipc.invoke=(channel,...args)=>new Promise((resolve,reject)=>pending.push({channel,args,resolve,reject}));
 vm.runInNewContext(source,{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},ipcRenderer:ipc}),process:{argv:[],platform:'win32'},console,queueMicrotask});
 const reply=(channel,value)=>{const index=pending.findIndex(p=>p.channel===channel);assert.notEqual(index,-1,channel);pending.splice(index,1)[0].resolve(value);};
 return {bridge,ipc,calls,pending,reply,push:value=>ipc.emit('musebench:update',{},value)};
}
const snap=(revision,id,generation=1)=>({version:1,generation,revision,state:{task:{id},error:null}});

test('push before initial read and delayed state-returning dispatch cannot roll back canonical consumer',async()=>{
 const f=fixture(),seen=[];f.bridge.onState(value=>seen.push(value));const initial=f.bridge.getState();
 f.push(snap(2,'new'));f.reply('musebench:state',snap(1,'old'));assert.equal((await initial).task.id,'new');assert.deepEqual(seen.map(s=>s.task.id),['new']);
 const action=f.bridge.dispatch({type:'selectTask'});f.push(snap(4,'latest'));const result={task:{id:'captured-old'},error:null};
 f.reply('musebench:action',{snapshot:snap(3,'old'),result});assert.deepEqual(await action,result);assert.equal(seen.at(-1).task.id,'latest');
});

test('late command error preserves its action result and newer navigation',async()=>{
 const f=fixture(),seen=[];f.bridge.onState(s=>seen.push(s));f.push(snap(1,'a'));const action=f.bridge.dispatch({type:'forkTask'});
 f.push(snap(5,'newer-navigation'));const result={task:{id:'captured-action-task',forkReceipts:[{commandId:'exact-command'}]},error:'Exact failed command'};
 f.reply('musebench:action',{snapshot:snap(6,'newer-navigation'),result});
 assert.deepEqual(await action,result);assert.equal(seen.at(-1).task.id,'newer-navigation');assert.equal(seen.at(-1).error,null);
});

test('reload generation rejects old push and old read; teardown stops acknowledgement until reattach',async()=>{
 const f=fixture(),seen=[];const dispose=f.bridge.onState(s=>seen.push(s));f.push(snap(99,'old',1));const read=f.bridge.getState();f.push(snap(1,'reloaded',3));f.reply('musebench:state',snap(100,'late',1));assert.equal((await read).task.id,'reloaded');
 f.push(snap(101,'stale',1));assert.equal(seen.at(-1).task.id,'reloaded');dispose();assert.ok(f.calls.some(c=>c[0]==='musebench:state-detach'));
 const count=f.calls.filter(c=>c[0]==='musebench:state-ack').length;f.push(snap(2,'detached',3));assert.equal(f.calls.filter(c=>c[0]==='musebench:state-ack').length,count);
 f.bridge.onState(s=>seen.push(s));f.push(snap(1,'reattached',5));assert.equal(seen.at(-1).task.id,'reattached');assert.ok(f.pending.filter(p=>p.channel==='musebench:state-attach').length>=2);
});

test('ack is after consumer acceptance; chooseProject keeps its string/null public result without state rollback',async()=>{
 const f=fixture();let consumed=false;f.bridge.onState(()=>{if(!consumed)assert.equal(f.calls.filter(c=>c[0]==='musebench:state-ack').length,0);consumed=true;});f.push(snap(1,'new'));assert.equal(consumed,true);assert.equal(f.calls.filter(c=>c[0]==='musebench:state-ack').length,1);
 const choice=f.bridge.chooseProject();f.push(snap(2,'newer-during-picker'));f.reply('musebench:choose-project','C:/fixture');assert.equal(await choice,'C:/fixture');
 const read=f.bridge.getState();f.reply('musebench:state',snap(1,'older'));assert.equal((await read).task.id,'newer-during-picker');
});

test('stale in-flight push after newer invoked read is acknowledged without replacing newer UI',async()=>{
 const f=fixture(),seen=[];f.bridge.onState(s=>seen.push(s));const read=f.bridge.getState();f.reply('musebench:state',snap(9,'canonical-newer'));await read;
 f.push(snap(3,'held-push'));assert.deepEqual(seen.map(s=>s.task.id),['canonical-newer']);
 assert.deepEqual(f.calls.filter(c=>c[0]==='musebench:state-ack').map(c=>[c[1].generation,c[1].revision]),[[1,9],[1,3]]);
});
