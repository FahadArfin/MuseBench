import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCodeBilling} from '../electron/code-billing.mjs';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readNativeAccount} from '../src/runtime/account.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

async function fixture(t){
 const dataDir=await mkdtemp(path.join(tmpdir(),'musebench-billing-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const key=randomBytes(32),iv=randomBytes(16),safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>{const c=createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([c.update(value),c.final()]);},decryptString:value=>{const c=createDecipheriv('aes-256-cbc',key,iv);return Buffer.concat([c.update(value),c.final()]).toString();}};
 let busy=false,account='accountLogin',resets=0;const probes=[];
 const options={dataDir,safeStorage,getBinary:()=>path.resolve('muse.exe'),isActive:()=>busy,beforeChange:async()=>{resets++;},readBilling:async()=>({accountId:'team-fixture'}),probe:async input=>{probes.push(input);return{state:input.environment.META_API_KEY?'apiKey':account,usage:{windows:[{label:'Weekly',remainingPercent:27}]}};}};
 return{options,service:await createCodeBilling(options),setBusy:v=>busy=v,setAccount:v=>account=v,get probes(){return probes;},get resets(){return resets;}};
}
test('API selection saves encrypted credentials and never falls back to the account',async t=>{
 const f=await fixture(t),key='fixture-api-secret-abcdef';
 await assert.rejects(f.service.command({type:'select',source:'api'}),/API key/);
 const state=await f.service.command({type:'saveApiKey',key});assert.equal(state.mode,'api');assert.equal(state.hasApiKey,true);assert.ok(!JSON.stringify(state).includes(key));
 assert.ok(!(await readFile(path.join(f.options.dataDir,'code-billing.bin'))).includes(Buffer.from(key)));
 const reopened=await createCodeBilling(f.options),c=await reopened.credentials({binary:'muse.exe',environment:{PATH:'safe',META_API_KEY:'inherited'}});
 assert.equal(c.environment.META_API_KEY,key);assert.equal(c.source,'api');assert.equal(f.resets,1);
 await reopened.command({type:'select',source:'account'});await assert.rejects(c.verify(),/changed/);
 const a=await reopened.credentials({binary:'muse.exe',environment:{PATH:'safe',META_API_KEY:'inherited'}});assert.equal(a.environment.META_API_KEY,undefined);assert.equal(a.source,'account');
});
test('account selection refuses a higher priority stored API key and busy work',async t=>{
 const f=await fixture(t);f.setBusy(true);await assert.rejects(f.service.command({type:'saveApiKey',key:'fixture-secret-abcdefgh'}),/work|running/i);assert.equal(f.resets,0);
 f.setBusy(false);f.setAccount('apiKey');await assert.rejects(f.service.command({type:'select',source:'account'}),/sign in/i);assert.equal(f.resets,0);
 f.setAccount('accountLogin');await f.service.command({type:'select',source:'account'});const c=await f.service.credentials({binary:'muse.exe',environment:{}});
 f.setAccount('apiKey');await assert.rejects(c.verify(),/sign in/i);
});
test('corrupt credential storage blocks usage rather than reverting to another payer',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.options.dataDir,'code-billing.bin'),'broken');
 const r=await createCodeBilling(f.options);assert.equal((await r.status()).status,'error');await assert.rejects(r.credentials({binary:'muse.exe',environment:{}}),/credential|storage/i);
});
test('API billing display is explicitly associated and invalidated when the key changes',async t=>{
 const f=await fixture(t);await f.service.command({type:'saveApiKey',key:'fixture-api-one-abcdefgh'});
 await f.service.command({type:'linkBilling',accountId:'team-fixture'});assert.equal((await f.service.status()).billingAccountId,'team-fixture');
 await f.service.command({type:'saveApiKey',key:'fixture-api-two-abcdefgh'});assert.equal((await f.service.status()).billingAccountId,null);
});

test('sign-in reserves the credential lock while idle connections close',async t=>{
 const f=await fixture(t);let release,started=false;
 const closing=new Promise(resolve=>{release=resolve;});
 const service=await createCodeBilling({...f.options,beforeChange:()=>closing});
 const login=service.signIn(()=>{started=true;f.setBusy(true);return{code:{status:'pending'}};});
 assert.equal(service.isBusy(),true);assert.equal(started,false);
 await assert.rejects(service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'}),/work|running/i);
 release();assert.equal((await login).code.status,'pending');assert.equal(started,true);assert.equal(service.isBusy(),false);
 await assert.rejects(service.signIn(()=>assert.fail('Second login started')),/work|running/i);
 f.setBusy(false);await assert.rejects(service.signIn(()=>{throw Error('Login failed');}),/Login failed/);assert.equal(service.isBusy(),false);
});

test('billing account confirmation holds the key revision through the page read',async t=>{
 const f=await fixture(t);let release;
 const service=await createCodeBilling({...f.options,readBilling:()=>new Promise(resolve=>{release=resolve;})});
 await service.command({type:'saveApiKey',key:'fixture-api-one-abcdefgh'});
 const link=service.command({type:'linkBilling',accountId:'team-fixture'});
 assert.equal(service.isBusy(),true);
 await assert.rejects(service.command({type:'saveApiKey',key:'fixture-api-two-abcdefgh'}),/work|running/i);
 release({accountId:'different-team'});await assert.rejects(link,/Refresh/);
 assert.equal((await service.status()).billingAccountId,null);
 const retry=service.command({type:'linkBilling',accountId:'team-fixture'});release({accountId:'team-fixture'});await retry;
 assert.equal((await service.status()).billingAccountId,'team-fixture');
 await service.command({type:'saveApiKey',key:'fixture-api-two-abcdefgh'});assert.equal((await service.status()).billingAccountId,null);
});

test('failed protected persistence keeps the previous payer selected',async t=>{
 const f=await fixture(t);await f.service.command({type:'select',source:'account'});
 f.options.safeStorage.isEncryptionAvailable=()=>false;
 await assert.rejects(f.service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'}),/protection/);
 const c=await f.service.credentials({binary:'fixture.exe',environment:{}});assert.equal(c.source,'account');assert.equal(c.environment.META_API_KEY,undefined);
 assert.equal((await f.service.status()).hasApiKey,false);
});

test('a delayed or failed account read cannot relabel the newly selected API route',async t=>{
 for(const fails of [false,true]){
  const f=await fixture(t);let release,reject;
  const service=await createCodeBilling({...f.options,probe:()=>new Promise((resolve,fail)=>{release=resolve;reject=fail;})});
  const pending=service.status();await service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'});
  if(fails)reject(Error('Private old account error'));else release({state:'accountLogin',usage:{windows:[{remainingPercent:90}]}});
  const result=await pending;assert.equal(result.source,'api');assert.equal(result.mode,'api');assert.deepEqual(result.usage.windows,[]);
 }
});

function delayedCleanupProbe({rejectClose=false}={}){
 let finishExit,finishClose,spawns=0;const exited=new Promise(resolve=>{finishExit=resolve;}),closing=new Promise(resolve=>{finishClose=resolve;});
 return{
  probe:input=>readNativeAccount({...input,closeTimeoutMs:10,spawn:()=>{spawns++;return{exited,initialize:async()=>({initializeResult:{serverInfo:{version:TARGET.hostVersion},schema:{fingerprint:TARGET.fingerprint}},connection:{request:async method=>method==='account/read'?{state:'accountLogin'}:{}}}),close:()=>rejectClose?Promise.reject(Error('private cleanup failure')):closing};}}),
  finish:()=>{finishClose();finishExit({code:0,signal:null});},get spawns(){return spawns;}
 };
}

for(const rejectClose of [false,true])test(`billing retains ${rejectClose?'failed':'timed-out'} account cleanup and recovers only after confirmed exit`,async t=>{
 const f=await fixture(t),native=delayedCleanupProbe({rejectClose});t.after(native.finish);
 const service=await createCodeBilling({...f.options,probe:native.probe});
 const state=await service.status();assert.equal(state.status,'error');assert.equal(state.busy,true);assert.equal(service.isBusy(),true);assert.deepEqual(state.usage.windows,[]);assert.ok(!JSON.stringify(state).includes('private'));
 assert.equal((await service.status()).status,'error');assert.equal(native.spawns,1);
 for(const action of [{type:'saveApiKey',key:'fixture-api-new-abcdefgh'},{type:'select',source:'account'}])await assert.rejects(service.command(action),/cleanup|shut down/i);
 await assert.rejects(service.signIn(()=>assert.fail('A second process started')),/cleanup|shut down/i);
 await assert.rejects(service.credentials({binary:'fixture.exe',environment:{}}),/cleanup|shut down/i);assert.equal(native.spawns,1);
 native.finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(service.isBusy(),false);
 await service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'});assert.equal((await service.status()).status,'ready');assert.equal(native.spawns,1);
});

test('cleanup failures from account selection and credential verification remain blockers',async t=>{
 for(const action of ['select','verify']){
  const f=await fixture(t);let failing=false,probes=0;
  const service=await createCodeBilling({...f.options,probe:async()=>{probes++;if(failing)throw Object.assign(Error('private cleanup error'),{code:'ACCOUNT_CLEANUP'});return{state:'accountLogin',usage:{windows:[]}};}});
  if(action==='verify')await service.command({type:'select',source:'account'});failing=true;
  const request=action==='select'?service.command({type:'select',source:'account'}):service.credentials({binary:'fixture.exe',environment:{}});
  await assert.rejects(request,error=>error.code==='ACCOUNT_CLEANUP'&&!error.message.includes('private'));assert.equal(service.isBusy(),true);
  const count=probes;assert.equal((await service.status()).status,'error');await assert.rejects(service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'}),/cleanup|shut down/i);assert.equal(probes,count);
 }
});

test('an account cleanup fault arriving during a payer change prevents persistence',async t=>{
 const f=await fixture(t);let rejectProbe,releaseChange;
 const service=await createCodeBilling({...f.options,probe:()=>new Promise((_,reject)=>{rejectProbe=reject;}),beforeChange:()=>new Promise(resolve=>{releaseChange=resolve;})});
 const read=service.status();await new Promise(resolve=>setImmediate(resolve));const change=service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'});
 rejectProbe(Object.assign(Error('private cleanup failure'),{code:'ACCOUNT_CLEANUP'}));assert.equal((await read).status,'error');releaseChange();await assert.rejects(change,/cleanup|shut down/i);
 assert.equal((await service.status()).hasApiKey,false);await assert.rejects(readFile(path.join(f.options.dataDir,'code-billing.bin')),error=>error.code==='ENOENT');
});

test('an account cleanup fault during a protected write cannot commit a new payer',async t=>{
 const f=await fixture(t);let rejectProbe;
 const service=await createCodeBilling({...f.options,probe:()=>new Promise((_,reject)=>{rejectProbe=reject;})});
 const read=service.status();await new Promise(resolve=>setImmediate(resolve));
 const encrypt=f.options.safeStorage.encryptString;f.options.safeStorage.encryptString=value=>{rejectProbe(Object.assign(Error('private cleanup failure'),{code:'ACCOUNT_CLEANUP'}));return encrypt(value);};
 await assert.rejects(service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'}),/cleanup|shut down/i);assert.equal((await read).status,'error');
 assert.equal((await service.status()).hasApiKey,false);await assert.rejects(readFile(path.join(f.options.dataDir,'code-billing.bin')),error=>error.code==='ENOENT');
});

test('billing shutdown is bounded while an account owner is unconfirmed',async t=>{
 const f=await fixture(t),native=delayedCleanupProbe();t.after(native.finish);
 const service=await createCodeBilling({...f.options,probe:native.probe,closeTimeoutMs:10});await service.status();
 await assert.rejects(service.close(),error=>error.code==='ACCOUNT_CLEANUP');assert.equal(service.isBusy(),true);assert.equal(native.spawns,1);
 native.finish();await new Promise(resolve=>setImmediate(resolve));await service.close();assert.equal(service.isBusy(),false);
 await service.status();assert.equal(native.spawns,1);await assert.rejects(service.credentials({binary:'fixture.exe',environment:{}}),/closed|shut down/i);
});

test('billing shutdown aborts an active account query and waits for cleanup',async t=>{
 const f=await fixture(t);let finishInitialize,closes=0,spawns=0;
 const service=await createCodeBilling({...f.options,probe:input=>readNativeAccount({...input,spawn:()=>{spawns++;return{initialize:()=>new Promise(resolve=>{finishInitialize=resolve;}),close:async()=>{closes++;}};}})});
 const read=service.status();await new Promise(resolve=>setImmediate(resolve));const closing=service.close();assert.equal(service.isBusy(),true);await closing;await read;
 assert.equal(service.isBusy(),false);assert.equal(closes,1);assert.equal(spawns,1);
 finishInitialize({initializeResult:{serverInfo:{version:TARGET.hostVersion},schema:{fingerprint:TARGET.fingerprint}},connection:{request:()=>assert.fail('Late credential read')}});await new Promise(resolve=>setImmediate(resolve));await service.status();assert.equal(spawns,1);
});

test('a probe that ignores shutdown cancellation remains owned through the close deadline',async t=>{
 const f=await fixture(t);let finishProbe,probes=0;
 const service=await createCodeBilling({...f.options,closeTimeoutMs:10,probe:()=>{probes++;return new Promise(resolve=>{finishProbe=resolve;});}});
 const read=service.status();await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(service.close(),error=>error.code==='ACCOUNT_CLEANUP');assert.equal(service.isBusy(),true);
 finishProbe({state:'accountLogin',usage:{windows:[]}});await read;assert.equal(service.isBusy(),false);await service.close();
 assert.equal((await service.status()).status,'error');assert.equal(probes,1);
});

test('shutdown cannot abandon a payer change waiting for idle connections to close',async t=>{
 const f=await fixture(t);let finishChange;
 const service=await createCodeBilling({...f.options,closeTimeoutMs:10,beforeChange:()=>new Promise(resolve=>{finishChange=resolve;})});
 const change=service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'});change.catch(()=>{});
 await assert.rejects(service.close(),error=>error.code==='ACCOUNT_CLEANUP');assert.equal(service.isBusy(),true);
 finishChange();await assert.rejects(change,/closed|shut down/i);await service.close();assert.equal(service.isBusy(),false);
 await assert.rejects(readFile(path.join(f.options.dataDir,'code-billing.bin')),error=>error.code==='ENOENT');
});

test('usage probes retain shutdown ownership while payer changes alone block work',async t=>{
 const f=await fixture(t);let finishProbe,finishChange;
 const service=await createCodeBilling({...f.options,probe:()=>new Promise(resolve=>{finishProbe=resolve;}),beforeChange:()=>new Promise(resolve=>{finishChange=resolve;})});
 assert.equal(typeof service.blocksWork,'function');assert.equal(service.blocksWork(),false);
 const read=service.status();await new Promise(resolve=>setImmediate(resolve));assert.equal(service.isBusy(),true);assert.equal(service.blocksWork(),false);
 const change=service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'});assert.equal(service.blocksWork(),true);
 finishProbe({state:'accountLogin',usage:{windows:[]}});await read;assert.equal(service.isBusy(),true);assert.equal(service.blocksWork(),true);
 finishChange();await change;assert.equal(service.isBusy(),false);assert.equal(service.blocksWork(),false);
 await service.close();assert.equal(service.isBusy(),false);assert.equal(service.blocksWork(),true);
});

test('unconfirmed account cleanup blocks work until the original owner exits',async t=>{
 const f=await fixture(t),native=delayedCleanupProbe();t.after(native.finish);
 const service=await createCodeBilling({...f.options,probe:native.probe});assert.equal(typeof service.blocksWork,'function');
 assert.equal((await service.status()).status,'error');assert.equal(service.isBusy(),true);assert.equal(service.blocksWork(),true);
 native.finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(service.isBusy(),false);assert.equal(service.blocksWork(),false);
});

test('failed native spawn leaves billing usable for an API payer without a process cleanup blocker',async t=>{
 const f=await fixture(t);let spawns=0;
 const service=await createCodeBilling({...f.options,probe:input=>readNativeAccount({...input,closeTimeoutMs:10,spawn:()=>{
  spawns++;const failure=Object.assign(Error('private spawn failure'),{code:'ENOENT'}),exited=Promise.reject(failure);exited.catch(()=>{});
  return{exited,initialize:async()=>{throw failure;},close:async()=>{await exited;}};
 }})});
 const state=await service.status();assert.equal(state.busy,false);assert.equal(service.isBusy(),false);assert.equal(service.blocksWork(),false);assert.ok(!JSON.stringify(state).includes('private'));
 await service.command({type:'saveApiKey',key:'fixture-api-new-abcdefgh'});assert.equal((await service.status()).source,'api');assert.equal(spawns,1);await service.close();
});
