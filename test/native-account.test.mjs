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
test('native account cleanup failures are typed and cleanup cannot hang indefinitely',async()=>{
 for(const close of [async()=>{throw Error('private close failure');},()=>new Promise(resolve=>setTimeout(resolve,100))]){
  await assert.rejects(readNativeAccount({binary:'fixture.exe',environment:{},closeTimeoutMs:10,spawn:()=>({initialize:async()=>{throw Error('private initialize error');},close})}),error=>error.code==='ACCOUNT_CLEANUP'&&!error.message.includes('private'));
 }
});
test('a timed-out account initialization cannot issue late credential queries',async()=>{
 let finish,requests=0;const pending=readNativeAccount({binary:'fixture.exe',environment:{},timeoutMs:10,spawn:()=>({initialize:()=>new Promise(resolve=>{finish=resolve;}),close:async()=>{}})});
 await assert.rejects(pending,/unavailable/);finish({initializeResult:{serverInfo:{version:TARGET.hostVersion},schema:{fingerprint:TARGET.fingerprint}},connection:{request:async()=>{requests++;return{state:'accountLogin'};}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
});

test('a cleanup timeout retains a sanitized handle until the original close confirms exit',async()=>{
 let finishClose;const closing=new Promise(resolve=>{finishClose=resolve;});let failure;
 try{await readNativeAccount({binary:'fixture.exe',environment:{},closeTimeoutMs:10,spawn:()=>({initialize:async()=>{throw Error('private account failure');},close:()=>closing})});}catch(error){failure=error;}
 assert.equal(failure.code,'ACCOUNT_CLEANUP');assert.equal(failure.cleanup?.confirmed,false);assert.ok(!JSON.stringify(failure).includes('private'));
 finishClose();await failure.cleanup.closed;await failure.cleanup.wait();assert.equal(failure.cleanup.confirmed,true);
});

test('an observed native exit recovers ownership after close rejects',async()=>{
 let finishExit;const exited=new Promise(resolve=>{finishExit=resolve;});let failure;
 try{await readNativeAccount({binary:'fixture.exe',environment:{},closeTimeoutMs:10,spawn:()=>({exited,initialize:async()=>{throw Error('private account failure');},close:async()=>{throw Error('private close failure');}})});}catch(error){failure=error;}
 assert.equal(failure.code,'ACCOUNT_CLEANUP');assert.equal(failure.cleanup?.confirmed,false);
 finishExit({code:1,signal:null});await failure.cleanup.closed;assert.equal(failure.cleanup.confirmed,true);await failure.cleanup.wait();
});

test('the SDK terminal spawn-failure rejection cannot become an unconfirmed cleanup fault',async()=>{
 for(const code of ['ENOENT','EACCES']){
  const failure=Object.assign(Error('private spawn failure'),{code}),exited=Promise.reject(failure);exited.catch(()=>{});let closes=0;
  await assert.rejects(readNativeAccount({binary:'fixture.exe',environment:{},closeTimeoutMs:10,spawn:()=>({exited,initialize:async()=>{throw failure;},close:async()=>{closes++;await exited;}})}),error=>error.code!=='ACCOUNT_CLEANUP'&&/unavailable/.test(error.message)&&!error.message.includes('private'));
  assert.equal(closes,1);
 }
});

test('a spawn-like close error alone cannot release an owner whose exit is still pending',async()=>{
 let finishExit;const exited=new Promise(resolve=>{finishExit=resolve;});let failure;
 try{await readNativeAccount({binary:'fixture.exe',environment:{},closeTimeoutMs:10,spawn:()=>({exited,initialize:async()=>{throw Error('private account failure');},close:async()=>{throw Object.assign(Error('private close failure'),{code:'ENOENT'});}})});}catch(error){failure=error;}
 assert.equal(failure.code,'ACCOUNT_CLEANUP');assert.equal(failure.cleanup.confirmed,false);
 finishExit({code:1,signal:null});await failure.cleanup.closed;assert.equal(failure.cleanup.confirmed,true);
});

test('aborting an account probe closes its owner and prevents late native requests',async()=>{
 const abort=new AbortController();let finish,closed=0,requests=0;
 const pending=readNativeAccount({binary:'fixture.exe',environment:{},signal:abort.signal,timeoutMs:500,spawn:()=>({initialize:()=>new Promise(resolve=>{finish=resolve;}),close:async()=>{closed++;}})});
 pending.catch(()=>{});abort.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);await assert.rejects(pending,/unavailable/);
 finish({initializeResult:{serverInfo:{version:TARGET.hostVersion},schema:{fingerprint:TARGET.fingerprint}},connection:{request:async()=>{requests++;return{state:'accountLogin'};}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
});
