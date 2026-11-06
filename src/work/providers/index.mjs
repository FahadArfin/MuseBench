// Main-process orchestration only. No provider, auth inference, network endpoints or ambient fetch.
// Adapters are trusted native code, installed only after API/auth/cost/cancellation verification.
import {randomUUID} from 'node:crypto';
export const PROVIDER_ACTIONS=Object.freeze(['image.generate','image.edit','image.remove-background','image.outpaint','audio.voice','audio.transcribe','video.generate']);
const clone=value=>structuredClone(value);
const text=(v,max=256)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const fail=code=>Object.assign(Error(code.replaceAll('_',' ').toLowerCase()),{code});
const terminal=s=>['completed','failed','cancelled'].includes(s);
const errors=new Set(['RATE_LIMIT','PROMPT_REJECTED','AUTH_UNAVAILABLE','INVALID_OUTPUT','PROVIDER_UNAVAILABLE','INVALID_REFERENCE','INVALID_REQUEST','OUTPUT_IMPORT_FAILED']);
function capability(adapter,c){
 if(!PROVIDER_ACTIONS.includes(c?.action))throw fail('INVALID_CAPABILITY');
 const strings=v=>Array.isArray(v)&&v.length<=100&&v.every(x=>text(x,120))?v:[];
 return{providerId:adapter.id,connectionId:adapter.connectionId??null,label:adapter.label??adapter.id,model:adapter.model??'',action:c.action,available:adapter.verified===true&&text(adapter.connectionId)&&c.available===true,reason:c.available===true&&adapter.verified===true&&text(adapter.connectionId)?undefined:'No verified media provider connection.',sizes:strings(c.sizes),aspects:strings(c.aspects),maxCount:Number.isInteger(c.maxCount)?Math.min(16,Math.max(1,c.maxCount)):1,maxPromptLength:Number.isInteger(c.maxPromptLength)?Math.min(20000,Math.max(1,c.maxPromptLength)):4000,maxReferences:Number.isInteger(c.maxReferences)?Math.min(16,Math.max(0,c.maxReferences)):0,cancellation:['none','best-effort','confirmed'].includes(c.cancellation)?c.cancellation:'none',costEstimate:text(c.costEstimate,300)?c.costEstimate:null,...(c.voices?{voices:strings(c.voices)}:{}),...(c.languages?{languages:strings(c.languages)}:{}),...(c.speeds?{speeds:c.speeds.filter(n=>Number.isFinite(n)&&n>0&&n<=4)}:{}),...(c.durations?{durations:c.durations.filter(n=>Number.isFinite(n)&&n>0&&n<=600)}:{})};
}
function validateRequest(r,c){
 if(!exact(r,['itemId','revision','providerId','connectionId','action','clientRequestId','prompt','referenceAssetIds','settings','userAuthorized'])||![r.itemId,r.providerId,r.connectionId,r.clientRequestId].every(v=>text(v))||!Number.isSafeInteger(r.revision)||r.revision<0||r.userAuthorized!==true||typeof r.prompt!=='string'||r.prompt.length>c.maxPromptLength||!Array.isArray(r.referenceAssetIds)||r.referenceAssetIds.length>c.maxReferences||!r.referenceAssetIds.every(v=>text(v)))throw fail('INVALID_REQUEST');
 if(r.connectionId!==c.connectionId)throw fail('AUTH_UNAVAILABLE');
 const s=r.settings;
 if(!exact(s,['size','aspect','count','voice','language','speed','duration','mask'])||!Number.isInteger(s.count)||s.count<1||s.count>c.maxCount)throw fail('INVALID_SETTINGS');
 for(const [key,list]of [['size','sizes'],['aspect','aspects'],['voice','voices'],['language','languages'],['speed','speeds'],['duration','durations']])if(s[key]!==undefined&&!(c[list]??[]).includes(s[key]))throw fail('UNSUPPORTED_SETTING');
 if(c.sizes.length&&s.size===undefined||c.aspects.length&&s.aspect===undefined)throw fail('INVALID_SETTINGS');
 if(s.mask!==undefined){const m=s.mask;if(!exact(m,['version','sourceAssetId','width','height','inverted','feather','strokes'])||m.version!==1||!r.referenceAssetIds.includes(m.sourceAssetId)||!Number.isInteger(m.width)||m.width<1||m.width>16384||!Number.isInteger(m.height)||m.height<1||m.height>16384||typeof m.inverted!=='boolean'||!Number.isFinite(m.feather)||m.feather<0||m.feather>256||!Array.isArray(m.strokes)||m.strokes.length>2000||m.strokes.some(stroke=>!exact(stroke,['mode','radius','points'])||!['brush','erase'].includes(stroke.mode)||!Number.isFinite(stroke.radius)||stroke.radius<=0||stroke.radius>16384||!Array.isArray(stroke.points)||stroke.points.length<1||stroke.points.length>20000||stroke.points.some(p=>!exact(p,['x','y'])||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>m.width||p.y<0||p.y>m.height)))throw fail('INVALID_MASK');}
 return clone(r);
}
function validateAsset(asset,action){
 const types=action.startsWith('image.')?['image/png','image/jpeg','image/webp']:action==='audio.voice'?['audio/wav','audio/mpeg','audio/ogg','audio/mp4']:['video/mp4','video/webm'];
 if(!object(asset)||!text(asset.id)||!/^[a-f\d]{64}$/i.test(asset.hash)||!text(asset.name)||!types.includes(asset.mediaType)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>512*1024*1024||!text(asset.storageRef)||/^(?:[a-z]+:|\/|\\)|(?:^|[\\/])\.\.(?:[\\/]|$)/i.test(asset.storageRef))throw fail('INVALID_OUTPUT');
 if(action.startsWith('image.')&&(!Number.isInteger(asset.width)||asset.width<1||asset.width>16384||!Number.isInteger(asset.height)||asset.height<1||asset.height>16384))throw fail('INVALID_OUTPUT');
 if((action==='audio.voice'||action==='video.generate')&&(!Number.isFinite(asset.duration)||asset.duration<=0||asset.duration>3600))throw fail('INVALID_OUTPUT');
 return Object.fromEntries(['id','hash','name','mediaType','bytes','storageRef','width','height','duration'].filter(k=>asset[k]!==undefined).map(k=>[k,asset[k]]));
}
/** journal is required for configured adapters: durable {read(),write(snapshot)} owned by main.
 * importOutput must download/probe/copy via the managed asset pipeline; never return unvalidated URLs.
 * remote start timeout is uncertain and is never retried automatically. */
export async function createWorkProviderService({adapters=[],journal,importOutput,timeoutMs=30000,now=()=>new Date().toISOString()}={}){
 const map=new Map();for(const a of adapters){if(!text(a.id)||map.has(a.id))throw fail('INVALID_ADAPTER');map.set(a.id,a);}
 let jobs=[],tail=Promise.resolve();
 if(journal){const saved=await journal.read();if(saved!==null&&saved!==undefined){if(saved.version!==1||!Array.isArray(saved.jobs)||saved.jobs.length>5000)throw fail('INVALID_JOURNAL');jobs=clone(saved.jobs);for(const job of jobs){if(!text(job.id)||!text(job.itemId)||!text(job.providerId)||!PROVIDER_ACTIONS.includes(job.action)||!object(job.request)||!Array.isArray(job.assets)||!['running','cancelling','completed','failed','cancelled','interrupted'].includes(job.status))throw fail('INVALID_JOURNAL');if(!terminal(job.status)){job.status='interrupted';job.errorCode='RECONCILIATION_REQUIRED';}}}}
 const serial=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
 const persist=async()=>{if(!journal)throw fail('DURABLE_JOURNAL_REQUIRED');await journal.write({version:1,jobs:clone(jobs)});};
 const find=id=>{const j=jobs.find(j=>j.id===id);if(!j)throw fail('JOB_NOT_FOUND');return j;};
 async function getCapabilities(){const result=[];for(const a of map.values()){const rows=await a.getCapabilities();if(!Array.isArray(rows))throw fail('INVALID_CAPABILITY');for(const c of rows)result.push(capability(a,c));}for(const action of PROVIDER_ACTIONS)if(!result.some(c=>c.action===action))result.push({providerId:'unavailable',connectionId:null,label:'Media generation unavailable',model:'',action,available:false,reason:'No verified media provider connection. Local editing remains available.',sizes:[],aspects:[],maxCount:1,maxPromptLength:4000,maxReferences:0,cancellation:'none',costEstimate:null});return result;}
 async function call(fn){const controller=new AbortController();let timer;try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);}}
 async function apply(job,result){
  if(!object(result)||!['running','completed','failed','cancelled'].includes(result.status)||result.remoteJobId!==undefined&&!text(result.remoteJobId))throw fail('INVALID_OUTPUT');
  if(result.remoteJobId){if(job.remoteJobId&&job.remoteJobId!==result.remoteJobId)throw fail('INVALID_OUTPUT');job.remoteJobId=result.remoteJobId;}
  job.progress=Number.isFinite(result.progress)?Math.max(0,Math.min(1,result.progress)):undefined;
  if(result.status==='completed'){
   // Persist successful remote outcome before importing, so restart never resubmits a paid operation.
   job.remoteOutcome='completed';await persist();
   if(job.action==='audio.transcribe'){
    if(!Array.isArray(result.transcript)||result.transcript.length>100000||result.transcript.some(t=>!exact(t,['text','start','end'])||!text(t.text,4000)||!Number.isFinite(t.start)||t.start<0||!Number.isFinite(t.end)||t.end<=t.start))throw fail('INVALID_OUTPUT');
    job.transcript=clone(result.transcript);
   }else{
    if(!importOutput||!Array.isArray(result.outputs)||!result.outputs.length||result.outputs.length>job.request.settings.count)throw fail('INVALID_OUTPUT');
    const assets=[];for(let i=0;i<result.outputs.length;i++){
     let importedValue;try{importedValue=await importOutput({output:result.outputs[i],job:clone(job),index:i});}catch{throw fail('OUTPUT_IMPORT_FAILED');}
     const imported=validateAsset(importedValue,job.action);
     assets.push({...imported,origin:{type:'generated',providerId:job.providerId,model:map.get(job.providerId)?.model??'',requestId:job.remoteJobId??job.id,prompt:job.request.prompt,referenceAssetIds:clone(job.request.referenceAssetIds),settings:clone(job.request.settings),sourceItemId:job.itemId,sourceRevision:job.revision}});
    }job.assets=assets;
   }job.status='completed';job.progress=1;delete job.errorCode;
  }else if(result.status==='failed'){job.status='failed';job.remoteOutcome='rejected';job.errorCode=errors.has(result.errorCode)?result.errorCode:'PROVIDER_FAILED';}
  else{job.status=result.status;job.remoteOutcome=result.status;delete job.errorCode;}
  job.updatedAt=now();await persist();return clone(job);
 }
 async function caught(job,error){job.errorCode=errors.has(error?.code)?error.code:'RECONCILIATION_REQUIRED';job.status=errors.has(error?.code)?'failed':'interrupted';if(job.status==='failed'&&job.remoteOutcome!=='completed')job.remoteOutcome='rejected';job.updatedAt=now();await persist();return clone(job);}
 return{getCapabilities,list:async itemId=>{await tail;return clone(jobs.filter(j=>!itemId||j.itemId===itemId));},
  start:r=>serial(async()=>{
   const c=(await getCapabilities()).find(c=>c.providerId===r?.providerId&&c.action===r?.action&&c.available);if(!c)throw fail('PROVIDER_UNAVAILABLE');const request=validateRequest(r,c);
   const existing=jobs.find(j=>j.itemId===request.itemId&&j.clientRequestId===request.clientRequestId);if(existing){if(JSON.stringify(existing.request)!==JSON.stringify(request))throw fail('REQUEST_REUSED');return clone(existing);}
   if(jobs.length>=5000)throw fail('JOURNAL_FULL');
   const job={id:randomUUID(),itemId:request.itemId,revision:request.revision,providerId:request.providerId,connectionId:request.connectionId,action:request.action,clientRequestId:request.clientRequestId,request,status:'interrupted',remoteOutcome:'unknown',assets:[],createdAt:now(),updatedAt:now()};jobs.push(job);
   try{await persist();}catch(error){jobs.pop();throw error;}
   try{return await apply(job,await call(signal=>map.get(job.providerId).start(clone(request),{signal,localJobId:job.id})));}catch(error){return caught(job,error);}
  }),
  poll:id=>serial(async()=>{const job=find(id);if(terminal(job.status))return clone(job);const a=map.get(job.providerId);if(!job.remoteJobId||!a||a.connectionId!==job.connectionId){job.errorCode='RECONCILIATION_REQUIRED';return clone(job);}try{return await apply(job,await call(signal=>a.poll(job.remoteJobId,{signal,localJobId:job.id})));}catch(error){return caught(job,error);}}),
  cancel:id=>serial(async()=>{const job=find(id);if(terminal(job.status))return clone(job);const c=(await getCapabilities()).find(c=>c.providerId===job.providerId&&c.action===job.action);if(!job.remoteJobId||!c?.available||c.connectionId!==job.connectionId||c.cancellation==='none'){job.status='interrupted';job.errorCode='CANCELLATION_UNCONFIRMED';await persist();return clone(job);}job.status='cancelling';await persist();try{return await apply(job,await call(signal=>map.get(job.providerId).cancel(job.remoteJobId,{signal,localJobId:job.id})));}catch(error){return caught(job,error);}})
 };
}
