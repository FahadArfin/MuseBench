import test from 'node:test';import assert from 'node:assert/strict';import {normalizeModels,modelForOptions} from '../src/shared/models.mjs';
const row={modelId:'muse-sample',displayLabel:'Muse Sample',providerId:'meta',profileId:'tbh',isDefault:true,variants:['low','high'],defaultReasoningEffort:'high'};
test('native model catalog excludes unknown providers, profiles and unsupported efforts',()=>{
 const result=normalizeModels({source:'providerCatalog',providerId:'meta',profileId:'tbh',models:[row,{...row,modelId:'foreign',providerId:'other'},{...row,modelId:'other-profile',profileId:'other'},{...row,modelId:'unknown',variants:{kind:'unknown'}}]});
 assert.equal(result.models.length,2);assert.equal(result.models[1].efforts.length,0);assert.equal(modelForOptions(result,{model:'muse-sample',reasoning:'low'}).id,'muse-sample');assert.throws(()=>modelForOptions(result,{model:'muse-sample',reasoning:'ultra'}),/reasoning/);assert.throws(()=>modelForOptions(result,{model:'missing',reasoning:'high'}),/catalog/);assert.throws(()=>normalizeModels({source:'fakeCatalog',providerId:'meta',models:[row]}),/catalog/);
});
test('configured native catalogs retain their source and the same provider, profile and effort boundaries',()=>{
 const catalog={source:'configCatalog',providerId:'meta',profileId:'tbh',models:[row,{...row,modelId:'foreign',providerId:'other'},{...row,modelId:'other-profile',profileId:'other'},{...row,modelId:'unsupported-effort',variants:['impossible','low']}]};
 const result=normalizeModels(catalog);
 assert.equal(result.source,'configCatalog');assert.deepEqual(result.models.map(x=>x.id),['muse-sample','unsupported-effort']);
 assert.equal(modelForOptions(result,{model:null,reasoning:'high'}).id,'muse-sample');assert.deepEqual(result.models[1].efforts,['low']);
 for(const source of ['fakeCatalog','unresolvedCatalog','unknown'])assert.throws(()=>normalizeModels({...catalog,source}),/catalog/);
 assert.throws(()=>normalizeModels({...catalog,providerId:'other'}),/catalog/);
});
import {readNativeModels} from '../src/runtime/models.mjs';import {EXPECTED_SCHEMA_FINGERPRINT} from '@muse-code/sdk';
import * as modelDiscovery from '../src/runtime/models.mjs';
import path from 'node:path';
test('catalog discovery uses only a sessionless query and always closes its host',async()=>{
 const calls=[],spawn=spec=>{calls.push(spec.args);return{initialize:async()=>({initializeResult:{schema:{fingerprint:EXPECTED_SCHEMA_FINGERPRINT},serverInfo:{version:'1.4.14'},sandboxAvailability:'unavailable'},connection:{request:async(method)=>{calls.push(method);return {source:'providerCatalog',providerId:'meta',profileId:'tbh',models:[row]};}}}),close:async()=>{calls.push('close');}};};
 const result=await readNativeModels({binary:'muse.exe',environment:{},workspace:'.',spawn});assert.equal(result.models.length,1);assert.deepEqual(calls,[['serve','--provider','meta'],'model/list','close']);
 await assert.rejects(readNativeModels({binary:'muse.exe',environment:{},workspace:'.',timeoutMs:10,spawn:()=>({initialize:()=>new Promise(()=>{}),close:async()=>{}})}),/timed out/);
 await assert.rejects(readNativeModels({binary:'muse.exe',environment:{},workspace:'.',spawn:()=>({initialize:async()=>{throw Error('bad');},close:async()=>{throw Error('not closed');}})}),e=>e.code==='CATALOG_CLEANUP');
});
test('timed-out initialization never issues a late model request',async()=>{
 let initialize,requests=0,closes=0;
 const pending=readNativeModels({binary:'muse.exe',environment:{},workspace:'.',timeoutMs:10,spawn:()=>({initialize:()=>new Promise(resolve=>{initialize=resolve;}),close:async()=>{closes++;}})});
 await assert.rejects(pending,/timed out/);
 initialize({initializeResult:{schema:{fingerprint:EXPECTED_SCHEMA_FINGERPRINT},serverInfo:{version:'1.4.14'}},connection:{request:async()=>{requests++;return{source:'providerCatalog',providerId:'meta',profileId:'tbh',models:[row]};}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);assert.equal(closes,1);
});
test('catalog cleanup has its own deadline and reports unconfirmed shutdown',async()=>{
 await assert.rejects(readNativeModels({binary:'muse.exe',environment:{},workspace:'.',closeTimeoutMs:10,spawn:()=>({initialize:async()=>{throw Error('initialization failed');},close:()=>new Promise(resolve=>setTimeout(resolve,100))})}),error=>error.code==='CATALOG_CLEANUP');
});
test('incompatible native catalog host closes without asking for models',async()=>{
 const calls=[];await assert.rejects(readNativeModels({binary:'muse.exe',environment:{},workspace:'.',spawn:()=>({initialize:async()=>({initializeResult:{schema:{fingerprint:'old'},serverInfo:{version:'old'}},connection:{request:async()=>{calls.push('request');}}}),close:async()=>{calls.push('close');}})}),/compatibility/);assert.deepEqual(calls,['close']);
});
test('standalone discovery uses selected billing credentials and verifies the source after the read',async()=>{
 const calls=[],binary=path.resolve('muse.exe'),workspace=path.resolve('.');
 const discover=modelDiscovery.createNativeModelDiscovery({environment:{PATH:'safe-path',UNRELATED_SECRET:'never-pass'},credentials:async input=>{calls.push('credentials');assert.deepEqual(input,{binary,environment:{PATH:'safe-path'}});return{environment:{PATH:'safe-path',META_API_KEY:'fixture-selected'},verify:async()=>{calls.push('verify');}};},readModels:async input=>{calls.push('catalog');assert.equal(input.binary,binary);assert.equal(input.workspace,workspace);assert.equal(input.environment.META_API_KEY,'fixture-selected');return{source:'bundledCatalog',models:[]};}});
 assert.deepEqual(await discover({binary,workspace}),{source:'bundledCatalog',models:[]});assert.deepEqual(calls,['credentials','catalog','verify']);
});
test('standalone discovery discards a catalog when billing changes and sanitizes native failures',async()=>{
 const binary=path.resolve('muse.exe'),workspace=path.resolve('.');let changed=false;
 const discover=modelDiscovery.createNativeModelDiscovery({credentials:async()=>({environment:{},verify:async()=>{if(changed)throw Error('private billing source detail');}}),readModels:async()=>{changed=true;return{source:'providerCatalog',models:[]};}});
 await assert.rejects(discover({binary,workspace}),error=>/catalog/i.test(error.message)&&!error.message.includes('private'));
 const unsafe=modelDiscovery.createNativeModelDiscovery({credentials:async()=>({environment:{},verify:async()=>{}}),readModels:async()=>{throw Error('secret provider payload');}});
 await assert.rejects(unsafe({binary,workspace}),error=>!error.message.includes('secret'));
});
test('account verification cleanup failures fail closed before and after catalog discovery',async()=>{
 for(const phase of ['before','after']){
  let reads=0;const cleanup=()=>{throw Object.assign(Error('private account cleanup failure'),{code:'ACCOUNT_CLEANUP'});};
  const discover=modelDiscovery.createNativeModelDiscovery({credentials:async()=>{if(phase==='before')cleanup();return{environment:{},verify:async()=>cleanup()};},readModels:async()=>{reads++;return{source:'providerCatalog',models:[]};}});
  await assert.rejects(discover({binary:path.resolve('muse.exe'),workspace:path.resolve('.')}),error=>error.code==='CATALOG_CLEANUP'&&!error.message.includes('private'));
  assert.equal(reads,phase==='before'?0:1);
 }
});

test('native identifier labels are readable without replacing provider display names or inventing models',()=>{
 const input={source:'providerCatalog',providerId:'meta',profileId:'tbh',models:[
 {...row,modelId:'muse-spark-1.3-contributor',displayLabel:'muse-spark-1.3-contributor'},
 {...row,modelId:'muse-wonder-1.0',displayLabel:'muse-wonder-1.0'},
 {...row,modelId:'custom',displayLabel:'Team model'},
 {...row,modelId:'unrecognized',displayLabel:'unrecognized'}]};
 const catalog=normalizeModels(input);
 assert.deepEqual(catalog.models.map(row=>row.label),['Muse Spark 1.3 · Contributor','Muse Wonder 1.0','Team model','unrecognized']);
 assert.deepEqual(catalog.models.map(row=>row.id),input.models.map(row=>row.modelId));
});
