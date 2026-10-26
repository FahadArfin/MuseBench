import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDictation} from '../electron/dictation.mjs';
function fixture(t) {
 const children=[],events=[];
 const service=createDictation({helperPath:'C:\\MuseBench\\Speech.exe',probe:async()=>({available:true,language:'en-US'}),spawnHelper:(_file,args,options)=>{const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stdin={write:()=>{p.emit('close',0);}};p.kill=()=>{p.emit('close',1);};children.push({p,args,options});return p;},onState:value=>events.push(value)});
 t.after(()=>service.close());return{service,children,events};
}
test('dictation starts explicitly, returns editable text, and discards cancelled late output',async t=>{
 const h=fixture(t);assert.equal(h.children.length,0);
 await h.service.dispatch('status');assert.equal(h.children.length,0);
 const started=await h.service.dispatch('start');assert.equal(started.status,'starting');
 const {p,args,options}=h.children[0];assert.deepEqual(args,['--parent',String(process.pid)]);assert.equal(options.shell,false);
 p.stdout.emit('data',Buffer.from('{"kind":"listening"}\n{"kind":"text","text":"Explain this project"}\n'));
 assert.equal(h.service.snapshot().text,'Explain this project');
 await assert.rejects(h.service.dispatch('start'),/already/);
 await h.service.dispatch('cancel');p.stdout.emit('data',Buffer.from('{"kind":"text","text":"late"}\n'));
 assert.equal(h.service.snapshot().status,'idle');assert.equal(h.service.snapshot().text,'');
});
test('dictation errors and invalid IPC commands never execute arbitrary options',async t=>{
 const h=fixture(t);await assert.rejects(h.service.dispatch({type:'start',executable:'other'}),/command/);assert.equal(h.children.length,0);
 await h.service.dispatch('start');h.children[0].p.stdout.emit('data',Buffer.from('{"kind":"error","code":"microphone"}\n'));
 assert.equal(h.service.snapshot().status,'error');assert.match(h.service.snapshot().error,/microphone/i);
 assert.equal(h.service.snapshot().text,'');
});
test('cancelling during speech availability checks cannot start a microphone later',async t=>{
 let finish;const ready=new Promise(r=>finish=r);let starts=0;
 const service=createDictation({helperPath:'speech.exe',probe:()=>ready,spawnHelper:()=>{starts++;throw Error('Must not launch');}});t.after(()=>service.close());
 const start=service.dispatch('start');await service.dispatch('cancel');finish({available:true,language:'en-US'});await start;
 assert.equal(starts,0);assert.equal(service.snapshot().status,'idle');
});
test('dictation preserves UTF-8 words split across native output chunks',async t=>{
 const h=fixture(t);await h.service.dispatch('start');const bytes=Buffer.from('{"kind":"text","text":"café"}\n');const split=bytes.indexOf(Buffer.from('é'))+1;
 h.children[0].p.stdout.emit('data',bytes.subarray(0,split));h.children[0].p.stdout.emit('data',bytes.subarray(split));
 assert.equal(h.service.snapshot().text,'café');
});
test('cancel stays authoritative when a later stop races with microphone shutdown',async t=>{
 const h=fixture(t);await h.service.dispatch('start');const {p}=h.children[0];p.stdin.write=()=>{};
 p.stdout.emit('data',Buffer.from('{"kind":"text","text":"Existing words"}\n'));
 const cancelled=h.service.dispatch('cancel');const stopped=h.service.dispatch('stop');
 p.stdout.emit('data',Buffer.from('{"kind":"text","text":"Late words"}\n'));
 assert.equal(h.service.snapshot().text,'');p.emit('close',0);
 const results=await Promise.all([cancelled,stopped]);
 for(const result of results){assert.equal(result.status,'idle');assert.equal(result.text,'');}
});
test('cancel during an ordinary stop clears the buffer and discards late words',async t=>{
 const h=fixture(t);await h.service.dispatch('start');const {p}=h.children[0];p.stdin.write=()=>{};
 p.stdout.emit('data',Buffer.from('{"kind":"text","text":"Existing words"}\n'));
 const stopped=h.service.dispatch('stop');const cancelled=h.service.dispatch('cancel');
 assert.equal(h.service.snapshot().text,'');
 p.stdout.emit('data',Buffer.from('{"kind":"text","text":"Late words"}\n'));p.emit('close',0);
 for(const result of await Promise.all([stopped,cancelled]))assert.equal(result.text,'');
});
