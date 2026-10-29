import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {waitForProbeCondition} from '../scripts/probe-wait.mjs';

test('a missing native receipt times out and leaves no timer keeping the diagnostic alive',async()=>{
 const source=`import {waitForProbeCondition} from ${JSON.stringify(new URL('../scripts/probe-wait.mjs',import.meta.url).href)};
 try{await waitForProbeCondition(()=>false,{timeoutMs:30});process.exitCode=2;}
 catch(error){if(error.message!=='Probe deadline.')throw error;console.log('deadline handled');}`;
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{timeout:2000,windowsHide:true});
 assert.equal(result.stdout.trim(),'deadline handled');
 assert.equal(result.stderr,'');
});

test('a native receipt arriving during the wait completes without timing out',async()=>{
 let received=false;
 const timer=setTimeout(()=>{received=true;},15);
 try{await waitForProbeCondition(()=>received,{timeoutMs:1000});assert.equal(received,true);}
 finally{clearTimeout(timer);}
});

test('shutdown cancels receipt waiting even without a terminal notification',async()=>{
 await assert.rejects(waitForProbeCondition(()=>false,{cancelled:()=>true}),/cancelled/);
});
