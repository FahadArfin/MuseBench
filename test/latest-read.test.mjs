import test from 'node:test';
import assert from 'node:assert/strict';
import {createLatestReadQueue} from '../src/shared/latest-read.mjs';

const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function clock(){let time=0,id=0;const jobs=new Map();return{now:()=>time,setTimer:(fn,delay)=>{jobs.set(++id,{at:time+delay,fn});return id;},clearTimer:id=>jobs.delete(id),tick(ms){time+=ms;for(;;){const next=[...jobs].filter(([,job])=>job.at<=time).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;jobs.delete(next[0]);next[1].fn();}}};}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('rapid changes wait for quiet time and admit only the latest request',async()=>{
 const timer=clock(),queue=createLatestReadQueue(timer),calls=[],values=[];
 const request=name=>queue.schedule({delay:150,read:()=>{calls.push(name);return name;},onValue:value=>values.push(value),onError:assert.fail});
 request('a');timer.tick(50);request('b');timer.tick(50);request('c');timer.tick(149);await settle();assert.deepEqual(calls,[]);timer.tick(1);await settle();assert.deepEqual(calls,['c']);assert.deepEqual(values,['c']);
});
test('one active read retains only the newest pending request and discards its old result',async()=>{
 const timer=clock(),queue=createLatestReadQueue(timer),calls=[],values=[],a=deferred(),c=deferred();let active=0,maxActive=0;
 const request=(name,work)=>queue.schedule({delay:0,read:()=>{calls.push(name);active++;maxActive=Math.max(maxActive,active);return work.finally(()=>active--);},onValue:value=>values.push(value),onError:assert.fail});
 request('a',a.promise);timer.tick(0);await settle();request('b',Promise.resolve('b'));request('c',c.promise);timer.tick(500);await settle();assert.deepEqual(calls,['a']);a.resolve('old');await settle();assert.deepEqual(calls,['a','c']);assert.deepEqual(values,[]);c.resolve('new');await settle();assert.deepEqual(values,['new']);assert.equal(maxActive,1);
});
test('an obsolete error cannot replace a newer result; current errors do not trigger retries',async()=>{
 const timer=clock(),queue=createLatestReadQueue(timer),a=deferred(),values=[],errors=[],calls=[];
 const request=(name,read)=>queue.schedule({delay:0,read:()=>{calls.push(name);return read();},onValue:value=>values.push(value),onError:error=>errors.push(error.message)});
 request('old',()=>a.promise);timer.tick(0);await settle();request('current',()=>{throw Error('current failure');});a.reject(Error('obsolete'));await settle();assert.deepEqual(errors,['current failure']);timer.tick(5000);await settle();assert.deepEqual(calls,['old','current']);request('recovery',()=>42);timer.tick(0);await settle();assert.deepEqual(values,[42]);
});
test('cancelling before admission and while running suppresses callbacks and queued follow-up',async()=>{
 const timer=clock(),queue=createLatestReadQueue(timer),calls=[],values=[],a=deferred();
 const request=(name,read)=>queue.schedule({delay:150,read:()=>{calls.push(name);return read();},onValue:value=>values.push(value),onError:assert.fail});
 const never=request('never',()=>1);never();timer.tick(150);await settle();assert.deepEqual(calls,[]);
 const cancel=request('active',()=>a.promise);timer.tick(150);await settle();const pending=request('pending',()=>2);cancel();pending();a.resolve(1);await settle();timer.tick(1000);await settle();assert.deepEqual(calls,['active']);assert.deepEqual(values,[]);
});
test('cleanup from an older request does not cancel the current request',async()=>{
 const timer=clock(),queue=createLatestReadQueue(timer),values=[];
 const old=queue.schedule({delay:150,read:()=>1,onValue:value=>values.push(value),onError:assert.fail});queue.schedule({delay:0,read:()=>2,onValue:value=>values.push(value),onError:assert.fail});old();timer.tick(0);await settle();assert.deepEqual(values,[2]);
});
