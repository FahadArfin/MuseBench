import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkProviderService} from '../src/work/providers/index.mjs';

const request=()=>({itemId:'item-a',revision:3,providerId:'verified-fixture',connectionId:'native-connection',action:'image.generate',clientRequestId:'click-1',prompt:'A blue bird',referenceAssetIds:[],settings:{size:'512x512',aspect:'1:1',count:1},userAuthorized:true});
const capability={action:'image.generate',available:true,sizes:['512x512'],aspects:['1:1'],maxCount:2,maxPromptLength:1000,maxReferences:0,cancellation:'best-effort',costEstimate:null};
const asset={id:'asset-a',hash:'a'.repeat(64),name:'bird.png',mediaType:'image/png',bytes:24,storageRef:'assets/a',width:512,height:512};
function setup(overrides={}) {
 let stored=null,starts=0,imports=0;
 const adapter={id:'verified-fixture',label:'Contract fixture',model:'fixture-model',verified:true,connectionId:'native-connection',getCapabilities:async()=>[capability],start:async()=>{starts++;return{remoteJobId:'remote-1',status:'running'};},poll:async()=>({remoteJobId:'remote-1',status:'completed',outputs:[{opaque:'native-only'}]}),cancel:async()=>({remoteJobId:'remote-1',status:'cancelled'}),...overrides};
 const journal={read:async()=>structuredClone(stored),write:async value=>{stored=structuredClone(value);}};
 return{adapter,journal,importOutput:async()=>{imports++;return asset;},get starts(){return starts;},get imports(){return imports;},get stored(){return stored;}};
}
test('no configured media provider is explicitly unavailable and sends nothing',async()=>{
 const service=await createWorkProviderService();
 const caps=await service.getCapabilities();
 assert.equal(caps.length,7);assert.ok(caps.every(c=>!c.available));
 await assert.rejects(()=>service.start(request()),{code:'PROVIDER_UNAVAILABLE'});
});
test('explicit request is idempotent, revision-bound, imports output and records lineage',async()=>{
 const s=setup(),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
 const job=await service.start(request());assert.equal(job.revision,3);assert.equal(job.itemId,'item-a');
 assert.equal((await service.start(request())).id,job.id);assert.equal(s.starts,1);
 const done=await service.poll(job.id);assert.equal(done.status,'completed');assert.equal(done.assets[0].id,'asset-a');
 assert.equal(done.assets[0].origin.requestId,'remote-1');assert.equal(done.assets[0].origin.prompt,'A blue bird');
 assert.equal(s.imports,1);await service.poll(job.id);assert.equal(s.imports,1);
 await assert.rejects(()=>service.start({...request(),prompt:'different'}),{code:'REQUEST_REUSED'});
});
test('auth, consent and supported constraints fail before submission',async()=>{
 const s=setup(),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
 for(const change of [{userAuthorized:false},{connectionId:'wrong'},{settings:{size:'9000x9000',aspect:'1:1',count:1}},{apiKey:'never permitted'}])await assert.rejects(()=>service.start({...request(),...change}));
 assert.equal(s.starts,0);
});
test('timeout retains uncertain completion across restart without automatic resubmission',async()=>{
 const s=setup({start:async()=>{throw Object.assign(Error('private provider text'),{code:'ETIMEDOUT'});}});
 let service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
 const job=await service.start(request());assert.equal(job.status,'interrupted');assert.equal(job.remoteOutcome,'unknown');assert.doesNotMatch(JSON.stringify(job),/private/);
 service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
 assert.equal((await service.start(request())).id,job.id);assert.equal((await service.poll(job.id)).errorCode,'RECONCILIATION_REQUIRED');
});
test('restart preserves remote IDs and polls instead of starting another paid request',async()=>{
 const s=setup();let service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
 const job=await service.start(request());service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
 assert.equal((await service.list())[0].status,'interrupted');assert.equal((await service.poll(job.id)).status,'completed');assert.equal(s.starts,1);
});
test('rejections, rate limits, bad downloads and cancel are explicit terminal states',async()=>{
 for(const [code,expected] of [['RATE_LIMIT','RATE_LIMIT'],['PROMPT_REJECTED','PROMPT_REJECTED'],['AUTH_UNAVAILABLE','AUTH_UNAVAILABLE']]){
  const s=setup({start:async()=>{throw Object.assign(Error('secret'),{code});}}),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});
  const job=await service.start(request());assert.equal(job.status,'failed');assert.equal(job.errorCode,expected);
 }
 const s=setup(),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:async()=>({...asset,mediaType:'text/html'})});
 const job=await service.start(request());assert.equal((await service.poll(job.id)).errorCode,'INVALID_OUTPUT');
 const c=setup(),cancel=await createWorkProviderService({adapters:[c.adapter],journal:c.journal,importOutput:c.importOutput});
 assert.equal((await cancel.cancel((await cancel.start(request())).id)).status,'cancelled');
});
test('journal must succeed before any request and adapter must be verified',async()=>{
 const s=setup(),service=await createWorkProviderService({adapters:[s.adapter],journal:{read:async()=>null,write:async()=>{throw Error('disk full');}},importOutput:s.importOutput});
 await assert.rejects(()=>service.start(request()));assert.equal(s.starts,0);
 const unavailable=await createWorkProviderService({adapters:[{...s.adapter,verified:false}],journal:s.journal,importOutput:s.importOutput});
 await assert.rejects(()=>unavailable.start(request()),{code:'PROVIDER_UNAVAILABLE'});
});
test('actual deadline leaves an uncertain job and late completion cannot mutate it',async()=>{
 let finish;const s=setup({start:()=>new Promise(resolve=>{finish=resolve;})}),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput,timeoutMs:5});
 const job=await service.start(request());assert.equal(job.status,'interrupted');assert.equal(job.remoteOutcome,'unknown');finish({status:'completed',outputs:[{}]});await Promise.resolve();assert.equal((await service.list())[0].status,'interrupted');assert.equal(s.imports,0);
});
test('failed managed download is a local failure after confirmed remote completion',async()=>{
 const s=setup(),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:async()=>{throw Error('private download location');}});const job=await service.start(request()),failed=await service.poll(job.id);
 assert.equal(failed.status,'failed');assert.equal(failed.remoteOutcome,'completed');assert.equal(failed.errorCode,'OUTPUT_IMPORT_FAILED');assert.doesNotMatch(JSON.stringify(failed),/private download/);
});
test('remote completion wins a cancellation race and best-effort cancellation is not reported confirmed',async()=>{
 const s=setup({cancel:async()=>({remoteJobId:'remote-1',status:'completed',outputs:[{}]})}),service=await createWorkProviderService({adapters:[s.adapter],journal:s.journal,importOutput:s.importOutput});const job=await service.start(request());assert.equal((await service.cancel(job.id)).status,'completed');
 const s2=setup({cancel:async()=>({remoteJobId:'remote-1',status:'running'})}),service2=await createWorkProviderService({adapters:[s2.adapter],journal:s2.journal,importOutput:s2.importOutput});assert.equal((await service2.cancel((await service2.start(request())).id)).status,'running');
});
