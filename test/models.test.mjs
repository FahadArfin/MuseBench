import test from 'node:test';import assert from 'node:assert/strict';import {normalizeModels,modelForOptions} from '../src/shared/models.mjs';
const row={modelId:'muse-sample',displayLabel:'Muse Sample',providerId:'meta',profileId:'tbh',isDefault:true,variants:['low','high'],defaultReasoningEffort:'high'};
test('native model catalog excludes unknown providers, profiles and unsupported efforts',()=>{
 const result=normalizeModels({source:'providerCatalog',providerId:'meta',profileId:'tbh',models:[row,{...row,modelId:'foreign',providerId:'other'},{...row,modelId:'other-profile',profileId:'other'},{...row,modelId:'unknown',variants:{kind:'unknown'}}]});
 assert.equal(result.models.length,2);assert.equal(result.models[1].efforts.length,0);assert.equal(modelForOptions(result,{model:'muse-sample',reasoning:'low'}).id,'muse-sample');assert.throws(()=>modelForOptions(result,{model:'muse-sample',reasoning:'ultra'}),/reasoning/);assert.throws(()=>modelForOptions(result,{model:'missing',reasoning:'high'}),/catalog/);assert.throws(()=>normalizeModels({source:'fakeCatalog',providerId:'meta',models:[row]}),/catalog/);
});
import {readNativeModels} from '../src/runtime/models.mjs';import {EXPECTED_SCHEMA_FINGERPRINT} from '@muse-code/sdk';
test('catalog discovery uses only a sessionless query and always closes its host',async()=>{
 const calls=[],spawn=spec=>{calls.push(spec.args);return{initialize:async()=>({initializeResult:{schema:{fingerprint:EXPECTED_SCHEMA_FINGERPRINT},serverInfo:{version:'1.4.14'},sandboxAvailability:'unavailable'},connection:{request:async(method)=>{calls.push(method);return {source:'providerCatalog',providerId:'meta',profileId:'tbh',models:[row]};}}}),close:async()=>{calls.push('close');}};};
 const result=await readNativeModels({binary:'muse.exe',environment:{},workspace:'.',spawn});assert.equal(result.models.length,1);assert.deepEqual(calls,[['serve','--provider','meta'],'model/list','close']);
 await assert.rejects(readNativeModels({binary:'muse.exe',environment:{},workspace:'.',timeoutMs:10,spawn:()=>({initialize:()=>new Promise(()=>{}),close:async()=>{}})}),/timed out/);
 await assert.rejects(readNativeModels({binary:'muse.exe',environment:{},workspace:'.',spawn:()=>({initialize:async()=>{throw Error('bad');},close:async()=>{throw Error('not closed');}})}),e=>e.code==='CATALOG_CLEANUP');
});
