import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

async function fixture(){
 const {createRendererStatePublisher}=await import('../electron/renderer-state-publisher.mjs');
 let time=0,state={task:{id:'first'},runtime:{status:'working',pending:null}},serial=0;
 const timers=new Map(),sent=[],observed=[];
 const publisher=createRendererStatePublisher({send:value=>sent.push(value),readState:()=>structuredClone(state),now:()=>time,setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id)});
 const source=new EventEmitter();source.on('state',value=>publisher.publish(structuredClone(value)));source.on('state',value=>observed.push(value));
 const tick=ms=>{time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}};
 return {publisher,sent,observed,tick,advanceWithoutTimers(ms){time+=ms;},set(value){state=value;source.emit('state',value);},get state(){return state;},setCanonical(value){state=value;},timers};
}

test('10,000 held acknowledgements retain one in-flight and one newest pending; other observer sees every fact',async()=>{
 const f=await fixture();f.publisher.attach();
 for(let i=1;i<=10000;i++)f.set({task:{id:'first',terminal:i===10000},runtime:{status:i===10000?'waiting':'working',pending:i===10000?{id:'approval-final'}:null},i});
 assert.equal(f.sent.length,1);assert.equal(f.observed.length,10000);
 assert.equal(f.publisher.diagnostics.inFlight,1);assert.equal(f.publisher.diagnostics.pending,1);
 assert.equal(f.publisher.diagnostics.maxInFlight,1);assert.equal(f.publisher.diagnostics.maxPending,1);
 f.publisher.ack(f.sent[0]);assert.equal(f.sent.length,2);assert.deepEqual(f.sent[1].state,f.state);
 assert.equal(f.sent[1].state.runtime.pending.id,'approval-final');assert.equal(f.sent[1].state.task.terminal,true);
 f.publisher.close();assert.equal(f.timers.size,0);
});

test('forged and stale acknowledgements cannot release current ownership',async()=>{
 const f=await fixture();f.publisher.attach();const old=f.sent[0];f.set({i:1});
 for(const ack of [{...old,revision:old.revision+1},{...old,generation:old.generation+1},{generation:'1',revision:1},null])assert.equal(f.publisher.ack(ack),false);
 assert.equal(f.sent.length,1);f.publisher.detach();f.publisher.attach();const current=f.sent.at(-1);f.set({i:2});
 assert.notEqual(old.generation,current.generation);assert.equal(f.publisher.ack(old),false);assert.equal(f.sent.length,2);
 assert.equal(f.publisher.ack(current),true);assert.deepEqual(f.sent.at(-1).state,{i:2});f.publisher.close();
});

test('two-second timeout suspends without resends and matching ack recovers fresh canonical facts',async()=>{
 const f=await fixture();f.publisher.attach();const held=f.sent[0];f.tick(1999);assert.equal(f.publisher.diagnostics.suspended,false);
 f.tick(1);assert.equal(f.publisher.diagnostics.suspended,true);for(let i=0;i<100;i++){f.set({i});f.tick(2000);}
 assert.equal(f.sent.length,1);assert.equal(f.publisher.diagnostics.pending,1);
 f.setCanonical({task:{id:'newest',terminal:true},runtime:{pending:{id:'approval-canonical'}}});
 assert.equal(f.publisher.ack(held),true);assert.equal(f.sent.length,2);assert.deepEqual(f.sent[1].state,f.state);assert.equal(f.publisher.diagnostics.suspended,false);f.publisher.close();
});

test('explicit reattach rotates generation and reads authoritative state; detach leaves background publications independent',async()=>{
 const f=await fixture();f.publisher.attach();const first=f.sent[0];f.tick(2000);f.setCanonical({i:42});f.publisher.attach();
 assert.equal(f.sent.length,2);assert.deepEqual(f.sent[1].state,{i:42});assert.ok(f.sent[1].generation>first.generation);
 f.publisher.detach();for(let i=0;i<100;i++)f.set({i});assert.equal(f.sent.length,2);assert.equal(f.publisher.diagnostics.inFlight,0);assert.equal(f.publisher.diagnostics.pending,1);
 f.publisher.attach();assert.deepEqual(f.sent.at(-1).state,{i:99});assert.equal(f.publisher.ack(first),false);f.publisher.close();f.set({i:101});assert.equal(f.sent.length,3);
});

test('canonical reads have their own revision without relabeling captured action state',async()=>{
 const f=await fixture();f.publisher.attach();const initial=f.publisher.read();f.setCanonical({task:{id:'new-navigation'}});const action=f.publisher.read();
 assert.ok(action.revision>initial.revision);assert.deepEqual(initial.state.task,{id:'first'});assert.deepEqual(action.state,{task:{id:'new-navigation'}});f.publisher.close();
});

test('ack after the timeout budget recovers canonical state even when the timeout callback is overdue',async()=>{
 const f=await fixture();f.publisher.attach();const held=f.sent[0];f.set({i:'pending-older'});f.setCanonical({i:'canonical-newer'});f.advanceWithoutTimers(2100);f.publisher.ack(held);
 assert.deepEqual(f.sent.at(-1).state,{i:'canonical-newer'});f.publisher.close();
});
