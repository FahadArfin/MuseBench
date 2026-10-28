import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCodeBilling} from '../electron/code-billing.mjs';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

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
