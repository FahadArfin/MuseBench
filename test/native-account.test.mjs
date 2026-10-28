import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeAccount} from '../src/runtime/account.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

function fixture({state='accountLogin',version=TARGET.hostVersion,fingerprint=TARGET.fingerprint,request,initialize}={}){
 const calls=[];let closed=0;
 const spawn=spec=>{calls.push({spec});return{initialize:initialize??(async()=>({initializeResult:{serverInfo:{version},schema:{fingerprint}},connection:{request:async(method,params)=>{calls.push({method,params});if(request)return request(method);return method==='account/read'?{state,label:'private-fixture-label',apiKey:'private-fixture-key'}:{};}}})),close:async()=>{closed++;}};};
 return{spawn,calls,get closed(){return closed;}};
}

test('native billing queries only account and usage, removing labels and credentials',async()=>{
 const f=fixture();const value=await readNativeAccount({binary:'fixture.exe',environment:{},refreshUsage:true,spawn:f.spawn});
 assert.deepEqual(value,{state:'accountLogin',usage:{windows:[]},usageUnavailable:false});
 assert.deepEqual(f.calls.filter(c=>c.method).map(c=>c.method),['account/read','usage/refresh','usage/read']);
 assert.ok(!JSON.stringify(value).includes('private-fixture'));assert.equal(f.closed,1);
});
test('API credentials do not request or imply subscription allowance',async()=>{
 const f=fixture({state:'apiKey'});assert.equal((await readNativeAccount({binary:'fixture.exe',environment:{},refreshUsage:true,spawn:f.spawn})).state,'apiKey');
 assert.deepEqual(f.calls.filter(c=>c.method).map(c=>c.method),['account/read']);assert.equal(f.closed,1);
});
test('unsupported native versions or schemas close without account queries',async()=>{
 for(const options of [{version:'older'},{fingerprint:'different'}]){
  const f=fixture(options);await assert.rejects(readNativeAccount({binary:'fixture.exe',environment:{},spawn:f.spawn}),/unavailable/);
  assert.equal(f.calls.filter(c=>c.method).length,0);assert.equal(f.closed,1);
 }
});
test('native usage errors and timeouts cannot expose provider responses or leave an owner',async()=>{
 const f=fixture({request:method=>{if(method==='account/read')return{state:'accountLogin'};throw Error('private-fixture-error');}});
 const value=await readNativeAccount({binary:'fixture.exe',environment:{},refreshUsage:true,spawn:f.spawn});assert.equal(value.usageUnavailable,true);assert.ok(!JSON.stringify(value).includes('private-fixture'));assert.equal(f.closed,1);
 const slow=fixture({initialize:()=>new Promise(()=>{})});await assert.rejects(readNativeAccount({binary:'fixture.exe',environment:{},spawn:slow.spawn,timeoutMs:10}),/unavailable/);assert.equal(slow.closed,1);
});
