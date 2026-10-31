import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationCommitGate,settleNavigationVisuals} from '../src/ui/native-navigation.mjs';

test('commit is bound to a fresh request token and exact destination including section and chat',async()=>{
 const gate=createNavigationCommitGate();
 const expected={modal:'settings',section:'updates',taskId:'chat-a'};
 const pending=gate.begin({id:'first',deadline:Date.now()+8000},expected);
 let done=false;pending.then(()=>{done=true;});
 assert.equal(gate.commit('other',expected,{}),false);
 assert.equal(gate.commit('first',{...expected,section:'control'},{}),false);
 assert.equal(gate.commit('first',{...expected,taskId:'chat-b'},{}),false);
 await Promise.resolve();assert.equal(done,false);
 const root={};assert.equal(gate.commit('first',expected,root),true);assert.equal(await pending,root);
 const second=gate.begin({id:'second',deadline:Date.now()+8000},expected);
 assert.equal(gate.commit('first',expected,root),false);
 gate.cancel('second');await assert.rejects(second,/cancelled/);
 assert.equal(gate.commit('second',expected,root),false);
});

test('an overdue commit cannot succeed and cancellation after commit stops visual waiting',async t=>{
 let now=100;t.mock.method(Date,'now',()=>now);
 const gate=createNavigationCommitGate(),pending=gate.begin({id:'late',deadline:200},{target:'code'});
 const rejected=assert.rejects(pending,/expired/);now=201;
 assert.equal(gate.commit('late',{target:'code'},{}),false);await rejected;
 const abort=new AbortController();abort.abort();assert.equal(await settleNavigationVisuals({},Date.now()+8000,abort.signal),false);
});

const root={contains:target=>target?.relevant===true};
function animation(overrides={}){return {playState:'running',playbackRate:1,pending:false,effect:{target:{relevant:true,matches:()=>true,checkVisibility:()=>true,closest:()=>null,getBoundingClientRect:()=>({width:40,height:40,bottom:40,right:40,top:0,left:0})},getComputedTiming:()=>({endTime:1000})},...overrides};}
test('visual wait ignores hidden, unrelated, infinite and paused/zero-rate animations without rAF',async()=>{
 const hidden=animation(),outside=animation(),unrelated=animation(),infinite=animation();
 hidden.effect.target.checkVisibility=()=>false;outside.effect.target.getBoundingClientRect=()=>({width:40,height:40,top:0,left:-41,right:-1,bottom:40});
 unrelated.effect.target.matches=()=>false;infinite.effect.getComputedTiming=()=>({endTime:Infinity});
 const items=[animation({playbackRate:0}),animation({playState:'paused'}),animation({effect:{target:{relevant:false},getComputedTiming:()=>({endTime:100})}}),hidden,outside,unrelated,infinite];
 assert.equal(await settleNavigationVisuals(root,Date.now()+8000,undefined,{animations:()=>items}),true);
});
test('relevant visible transitions settle, but stalled progress remains bounded at 400 ms',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let items=[animation()];const settled=settleNavigationVisuals(root,Date.now()+8000,undefined,{animations:()=>items});
 items=[];t.mock.timers.tick(20);assert.equal(await settled,true);
 const stalled=settleNavigationVisuals(root,Date.now()+8000,undefined,{animations:()=>[animation()]});
 t.mock.timers.tick(400);assert.equal(await stalled,false);
 const controller=new AbortController(),cancelled=settleNavigationVisuals(root,Date.now()+8000,controller.signal,{animations:()=>[animation()]});controller.abort();assert.equal(await cancelled,false);
});
