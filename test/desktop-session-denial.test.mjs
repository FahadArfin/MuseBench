import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySessionDenial} from '../scripts/desktop-session-denial.mjs';
const denied=()=>({ok:false,error:{code:'session_unavailable',message:'Session is unavailable.'},uncertain:false});
test('unavailable desktop CI sessions must deny every operation without data or uncertain input',async()=>{
 const calls=[];const result=await verifySessionDenial(async input=>{calls.push(input);return denied();});
 assert.deepEqual(calls.map(item=>item.op),['apps','windows','open','inspect','capture','click','type','key','scroll','drag']);
 assert.equal(result.mode,'session-denial');assert.equal(result.desktopFunctionalCoverage,false);assert.equal(calls.find(item=>item.op==='key').key,'Enter');
});
test('a session refusal check fails on success, other errors, uncertain execution or exposed content',async()=>{
 for(const result of [{ok:true,apps:[]},{...denied(),error:{code:'unavailable',message:'Unknown'}},{...denied(),uncertain:true},{...denied(),data:'pixels'},{...denied(),windows:[]}])await assert.rejects(verifySessionDenial(async()=>result));
});
