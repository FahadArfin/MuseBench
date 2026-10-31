import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
function fixture(){
 const ipc=new EventEmitter(),sent=[];let bridge,claim;
 ipc.send=(channel,value)=>sent.push({channel,value});ipc.invoke=()=>new Promise(resolve=>{claim=resolve;});
 runInNewContext(source,{require:()=>({ipcRenderer:ipc,contextBridge:{exposeInMainWorld(_name,value){bridge=value;}}}),process:{argv:[],platform:process.platform},Date});
 return {ipc,bridge,sent,claim(){claim(true);}};
}
test('preload cancellation or expiry during claim prevents the callback from executing',async t=>{
 let now=0;t.mock.method(Date,'now',()=>now);
 for(const expired of [false,true]){
  const f=fixture();let calls=0;const off=f.bridge.onNativeRequest(async()=>{calls++;return {};});
  f.ipc.emit('musebench:native-request',{}, {id:'request',deadline:100});
  if(expired)now=101;else f.ipc.emit('musebench:native-cancel',{}, {id:'request'});
  f.claim();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,0);assert.deepEqual(f.sent,[]);off();now=0;
 }
});
test('preload suppresses late replies after cancellation, deadline or subscription disposal',async t=>{
 let now=0;t.mock.method(Date,'now',()=>now);
 for(const action of ['cancel','expire','dispose']){
  const f=fixture();let complete;const off=f.bridge.onNativeRequest(()=>new Promise(resolve=>{complete=resolve;}));
  f.ipc.emit('musebench:native-request',{}, {id:'request',deadline:100});f.claim();await new Promise(resolve=>setImmediate(resolve));
  if(action==='cancel')f.ipc.emit('musebench:native-cancel',{}, {id:'request'});else if(action==='expire')now=101;else off();
  complete({navigation:{committed:true,visualSettled:true}});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.sent,[]);off();now=0;
 }
});
test('preload sends one reply for a live claimed callback and no cancellation reply afterward',async()=>{
 const f=fixture(),off=f.bridge.onNativeRequest(async()=>({headings:['Settings']}));
 f.ipc.emit('musebench:native-request',{}, {id:'request',deadline:Date.now()+8000});f.claim();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].channel,'musebench:native-reply');assert.equal(f.sent[0].value.result.headings[0],'Settings');
 f.ipc.emit('musebench:native-cancel',{}, {id:'request'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.sent.length,1);off();
});
