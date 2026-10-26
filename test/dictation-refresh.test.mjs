import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictation} from '../electron/dictation.mjs';
test('explicit availability refresh recovers from a cached failure without opening the microphone',async t=>{
 let available=false,calls=0,starts=0;
 const service=createDictation({helperPath:'speech.exe',probe:async()=>{calls++;return{available,language:'en-US'};},spawnHelper:()=>{starts++;throw Error('Must not record');}});t.after(()=>service.close());
 assert.equal((await service.dispatch('status')).available,false);available=true;
 assert.equal((await service.dispatch('refresh')).available,true);assert.equal(calls,2);assert.equal(starts,0);
});
test('an older delayed availability result cannot overwrite the refreshed result',async t=>{
 let finish,calls=0;const old=new Promise(resolve=>finish=resolve);
 const service=createDictation({helperPath:'speech.exe',probe:()=>++calls===1?old:Promise.resolve({available:true,language:'en-US'})});t.after(()=>service.close());
 const first=service.dispatch('status');await Promise.resolve();
 assert.equal((await service.dispatch('refresh')).available,true);finish({available:false,language:null});await first;
 assert.equal(service.snapshot().available,true);
});
