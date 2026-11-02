import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createDesktopHelper} from '../electron/desktop-helper.mjs';

function fixture(options={}) {
 const children=[];
 const helper=createDesktopHelper({helperPath:'C:\\MuseBenchDesktop.exe',timeoutMs:60,...options,spawnProcess:(file,args,options)=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.killed=false;
  child.kill=()=>{child.killed=true;queueMicrotask(()=>child.emit('close',null,'SIGTERM'));return true;};
  children.push({child,file,args,options});return child;
 }});
 return {helper,children};
}
test('desktop adapter is lazy, uses fixed hidden invocation and waits for one-shot helper exit',async()=>{
 const {helper,children}=fixture();assert.equal(children.length,0);
 const result=helper.call({op:'apps'});const {child,args,options}=children[0];
 assert.deepEqual(args,['--parent',String(process.pid)]);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);
 assert.equal(child.stdin.read().toString(),'{"op":"apps"}\n');
 let settled=false;result.then(()=>settled=true);child.stdout.write('{"ok":true,"apps":[]}\n');await new Promise(r=>setImmediate(r));assert.equal(settled,false);
 child.emit('close',0);assert.deepEqual(await result,{ok:true,apps:[]});await helper.close();
});
test('desktop timeout kills and reaps helper and marks uncertain input outcomes',async()=>{
 const {helper,children}=fixture();const pending=helper.call({op:'click'});
 await assert.rejects(pending,error=>error.code==='desktop_timeout'&&error.uncertain===true);
 assert.equal(children[0].child.killed,true);await helper.close();
});
test('desktop close cancels active helper and forbids later starts',async()=>{
 const {helper,children}=fixture();const pending=helper.call({op:'apps'});const rejected=assert.rejects(pending,error=>error.code==='desktop_closed'&&error.uncertain===false);
 await helper.close();await rejected;assert.equal(children[0].child.killed,true);
 await assert.rejects(helper.call({op:'apps'}),/closed/);assert.equal(children.length,1);
});
test('desktop cancellation reaps current work and permits an explicit later call',async()=>{
 const {helper,children}=fixture();const pending=helper.call({op:'type'});const rejected=assert.rejects(pending,error=>error.uncertain===true);
 await helper.cancel();await rejected;assert.equal(children[0].child.killed,true);
 const next=helper.call({op:'apps'});children[1].child.stdout.write('{"ok":true,"apps":[]}\n');children[1].child.emit('close',0);assert.equal((await next).ok,true);await helper.close();
});
test('desktop helper refuses malformed, oversized and multiple response objects',async()=>{
 for(const payload of ['{}\n','{"ok":true}\n{"ok":true}\n','x'.repeat(16*1024*1024+1)]){
  const {helper,children}=fixture();const pending=helper.call({op:'apps'});children[0].child.stdout.write(payload);children[0].child.emit('close',0);
  await assert.rejects(pending,error=>error.code==='desktop_protocol');await helper.close();
 }
});
test('desktop validation rejects oversized and unknown requests before spawning',async()=>{
 const {helper,children}=fixture();for(const input of [{op:'shell'},null,{op:'type',text:'x'.repeat(70000)}])await assert.rejects(helper.call(input),/request/i);
 assert.equal(children.length,0);await helper.close();
});
test('desktop response preserves split UTF-8 and native denial without retrying',async()=>{
 const {helper,children}=fixture();const pending=helper.call({op:'inspect'});const bytes=Buffer.from('{"ok":false,"error":{"code":"protected","message":"sécurité"}}\n');const i=bytes.indexOf(Buffer.from('é'))+1;
 children[0].child.stdout.write(bytes.subarray(0,i));children[0].child.stdout.write(bytes.subarray(i));children[0].child.emit('close',0);
 assert.equal((await pending).error.message,'sécurité');assert.equal(children.length,1);await helper.close();
});
