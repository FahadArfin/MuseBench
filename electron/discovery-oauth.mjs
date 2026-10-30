// Trusted main-only service. Renderer commands never carry network destinations or credentials.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {safeAuthState,validateDiscoveryAuthCommand} from '../src/shared/discovery-auth.mjs';
import {normalizeAuthBinding} from '../src/runtime/discovery-auth-identity.mjs';
import {oauthFailure} from './discovery-oauth-flow.mjs';
const opaque=()=>randomBytes(24).toString('base64url');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ownerEqual=(a,b)=>a&&b&&a.taskId===b.taskId&&a.root===b.root&&a.epoch===b.epoch;
const ref=s=>({sourceId:s.id,authSourceIdentity:s.authSourceIdentity});
const origin=v=>new URL(v).origin;
const errorCode=error=>['registration-required','unsupported-public-client','issuer-mismatch','scope-changed','storage-unavailable','storage-full','callback-unavailable','source-changed','owner-changed','expired','busy','invalid-grant'].includes(error?.code)?error.code:'network-failed';
export function createDiscoveryOAuth({store,flow,callbackFactory,resolveSource,getSourceSnapshot,ownerSnapshot,runtimeOwnerSnapshot,stopSourceLeases,withIdleLease,openBrowser,onSafeUpdate=()=>{},now=Date.now}){
 let attempt=null,closed=false,mutation=false,mutationSourceId=null;const leases=new Map(),accountGenerations=new Map();
 function snapshot(read,reference){
  if(typeof read!=='function')return null;
  try{const value=reference===undefined?read():read({...reference});if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});return null;}
   if(!value||typeof value.taskId!=='string'||!value.taskId||value.taskId.length>200||typeof value.root!=='string'||!value.root||value.root.length>16384||!Number.isSafeInteger(value.epoch)||value.epoch<0)return null;
   return{taskId:value.taskId,root:value.root,epoch:value.epoch};
  }catch{return null;}
 }
 const selectedOwner=()=>snapshot(ownerSnapshot),runtimeOwner=reference=>snapshot(runtimeOwnerSnapshot,reference);
 function owner(taskId){const current=selectedOwner();if(closed||!current||current.taskId!==taskId)throw oauthFailure('owner-changed');return current;}
 const generation=id=>accountGenerations.get(id)??0;
 function accountBlocked(id){return mutation&&mutationSourceId===id||attempt&&!attempt.lease&&attempt.source.id===id&&!['ready','failed','cancelled','needs-sign-in'].includes(attempt.status);}
 function leaseAuthority(l,{insideIdleAdmission=false,allowPreparing=false}={}){
  if(closed||!l||leases.get(l.leaseId)!==l||l.controller.signal.aborted||!ownerEqual(l.owner,runtimeOwner(l.owner))||l.phase!=='ready'&&!allowPreparing)throw oauthFailure('owner-changed');
  if(l.refreshing&&!insideIdleAdmission)throw oauthFailure('busy');
  for(const row of l.sources){if(row.accountGeneration!==generation(row.id))throw oauthFailure('source-changed');if(accountBlocked(row.id))throw oauthFailure('busy');}
 }
 function revokeLease(l){if(!l)return;if(leases.get(l.leaseId)===l)leases.delete(l.leaseId);l.controller.abort();if(attempt?.lease===l)attempt.controller.abort();}
 function attemptOwner(a){if(!a.lease)return ownerEqual(a.owner,selectedOwner());try{leaseAuthority(a.lease,{insideIdleAdmission:true,allowPreparing:true});return true;}catch{return false;}}
 function attemptAuthority(a){if(closed||attempt!==a||a.controller.signal.aborted||now()>=a.deadline||!attemptOwner(a))throw oauthFailure('source-changed');}
 async function source(sourceRef,forMutation=false){
  let s;try{s=await resolveSource({id:sourceRef.id,revision:sourceRef.revision});}catch{throw oauthFailure('source-changed');}
  if(!s||s.id!==sourceRef.id||s.revision!==sourceRef.revision||!/^global:[A-Za-z0-9_.-]{1,100}$/.test(s.id)||s.global!==true||s.reviewed!==true||s.transport!=='streamable-http'||forMutation&&s.disabled!==true||!/^[a-f0-9]{64}$/.test(s.authSourceIdentity)||Object.keys(s.headers??{}).some(k=>k.toLowerCase()==='authorization'))throw oauthFailure('source-changed');return s;
 }
 function update(a){try{onSafeUpdate({taskId:a.owner.taskId,sourceId:a.source.id});}catch{}}
 async function current(a){if(closed||attempt!==a||a.controller.signal.aborted||now()>=a.deadline||!attemptOwner(a))return false;try{const s=await source(a.source,true);return !closed&&attempt===a&&!a.controller.signal.aborted&&now()<a.deadline&&attemptOwner(a)&&s.authSourceIdentity===a.source.authSourceIdentity&&s.url===a.source.url;}catch{return false;}}
 function safe(a){const review=a.review,r=a.registration;return safeAuthState({sourceId:a.source.id,sourceRevision:a.source.revision,status:a.status,credentialAvailable:a.status==='ready',attemptId:a.id,reviewRevision:a.reviewRevision,deadline:a.deadline,urlTemplate:a.source.urlTemplate,origin:origin(a.source.url),environmentNames:a.source.environmentNames??[],...(review?{resourceOrigin:review.resource?origin(review.resource):undefined,scopes:review.scopes,issuerOrigin:review.issuer?origin(review.issuer):undefined,registrationOrigin:review.metadata?.registration_endpoint?origin(review.metadata.registration_endpoint):undefined,tokenOrigin:review.metadata?.token_endpoint?origin(review.metadata.token_endpoint):undefined,issuerChoices:review.issuerChoices?.map(v=>({id:v.id,origin:origin(v.exactIssuer)})),destinationChoices:review.pendingDestination?[{id:review.pendingDestination.id,origin:origin(review.pendingDestination.url)}]:[]}:{}),registrationMethod:r?.method??a.registrationMethod,callbackPort:a.listener?Number(new URL(a.listener.uri).port):undefined,bindingRevision:a.bindingRevision,reasonCode:a.reasonCode,canPrepare:['ready','failed','cancelled','needs-sign-in'].includes(a.status)&&store.inspect().status==='ready',canBegin:a.status==='review-required'&&!!review?.metadata&&!review?.pendingDestination,canCancel:!['ready','cancelled'].includes(a.status),canSelectIssuer:a.status==='issuer-review',canReviewDestination:a.status==='review-required'&&!!review?.pendingDestination,canSavePublicClient:['registration-required','review-required'].includes(a.status)&&!!review?.metadata&&!a.registrationStarted,canRetrySave:a.status==='save-recovery',canForget:false});}
 function reviewDigest(a){a.reviewRevision=digest({attemptId:a.id,sourceRevision:a.source.revision,identity:a.source.authSourceIdentity,owner:a.owner,review:a.review,callback:a.listener?.uri,client:a.clientMetadata,registrationMethod:a.registrationMethod});}
 async function dispose(a,status='cancelled',reasonCode='cancelled'){
  a.controller.abort();clearTimeout(a.timer);a.verifier=undefined;a.candidate=undefined;a.state=undefined;a.status=status;a.reasonCode=reasonCode;await a.listener?.close();a.listener=null;update(a);
 }
 async function invalidate(a){await dispose(a,'cancelled',now()>=a.deadline?'expired':!ownerEqual(a.owner,selectedOwner())?'owner-changed':'source-changed');return safe(a);}
 async function check(a){if(!await current(a)){await invalidate(a);throw oauthFailure(a.reasonCode);}return a;}
 function commitAuthority(a){
  if(typeof getSourceSnapshot!=='function'||closed||attempt!==a||a.controller.signal.aborted||now()>=a.deadline||!ownerEqual(a.owner,selectedOwner()))return false;
  try{const s=getSourceSnapshot({id:a.source.id,revision:a.source.revision});if(s&&typeof s.then==='function'){Promise.resolve(s).catch(()=>{});return false;}return !!s&&s.id===a.source.id&&s.revision===a.source.revision&&s.authSourceIdentity===a.source.authSourceIdentity&&s.url===a.source.url&&s.global===true&&s.reviewed===true&&s.disabled===true&&s.transport==='streamable-http'&&!Object.keys(s.headers??{}).some(k=>k.toLowerCase()==='authorization')&&ownerEqual(a.owner,selectedOwner())&&!a.controller.signal.aborted&&attempt===a;}catch{return false;}
 }
 async function stop(s){const next=generation(s.id)+1;if(!Number.isSafeInteger(next))throw oauthFailure('source-changed');accountGenerations.set(s.id,next);for(const l of leases.values())if(l.sources.some(v=>v.id===s.id))revokeLease(l);try{if(await stopSourceLeases(s.id)===false)throw 0;}catch{throw oauthFailure('busy');}}
 async function summary(sourceRef){
  const s=await source(sourceRef),o=selectedOwner(),grant=store.get(ref(s)),bindings=store.listBindings(s.id),selected=grant?.binding??bindings.at(-1)?.binding;
  const storage=store.inspect();const available=grant?.phase==='ready';
  return safeAuthState({sourceId:s.id,sourceRevision:s.revision,status:storage.status!=='ready'?'storage-unavailable':available?'ready':grant?'needs-sign-in':selected?'forget-review':'not-configured',credentialAvailable:available,origin:origin(s.url),urlTemplate:s.urlTemplate,environmentNames:s.environmentNames??[],...(selected?{bindingRevision:selected.bindingRevision,issuerOrigin:origin(selected.issuer),resourceOrigin:origin(selected.resource),reviewRevision:digest({owner:o,sourceId:s.id,revision:s.revision,binding:selected,generation:storage.generation}),canForget:true}:{}),canPrepare:storage.status==='ready',reasonCode:storage.status!=='ready'?'storage-unavailable':grant&&grant.phase!=='ready'?'reauthorization-required':undefined});
 }
 async function reserve(a,port){
  a.listener=await callbackFactory({port,now,isCurrent:()=>current(a),onCode:payload=>receiveCode(a,payload),onDenied:async()=>{if(await current(a))await dispose(a,'failed','reauthorization-required');}});await check(a);
 }
 async function reviewedResource(a){
  a.review=await flow.discoverResource({source:a.source,challenge:a.review?.challenge,reviewedDestinations:a.review?.reviewedDestinations??[],discoveryContext:a.review?.discoveryContext,signal:a.controller.signal});await check(a);a.status=a.review.pendingDestination?'review-required':'issuer-review';reviewDigest(a);update(a);return safe(a);
 }
 function registrationChoice(a){const previous=store.get(ref(a.source)),g=previous?.binding.issuer===a.review.issuer&&previous.binding.resource===a.review.resource&&previous.registration.callbackUri===a.listener.uri?previous:null;a.clientMetadata={callbackUri:a.listener.uri,...(a.manualClient?{clientId:a.manualClient.clientId,method:'manual'}:g?.registration?{stored:g.registration}:a.source.publicClient?.clientId?{clientId:a.source.publicClient.clientId}:a.source.cimd?{cimd:a.source.cimd}:{})};a.registrationMethod=a.manualClient?'manual':a.clientMetadata.stored?'stored':a.source.publicClient?.clientId?'preregistered':a.source.cimd?'cimd':a.review.metadata.registration_endpoint?'dcr':undefined;a.status=a.registrationMethod?'review-required':'registration-required';if(!a.registrationMethod)a.reasonCode='registration-required';else delete a.reasonCode;}
 async function commitCandidate(a){
  await check(a);attemptAuthority(a);a.status='saving';update(a);
  try{attemptAuthority(a);const saved=a.refreshTransactionId?await store.completeRefresh(a.refreshTransactionId,a.candidate):await store.commitGrant(a.candidate,{expectedGeneration:store.inspect().generation,authorityGuard:()=>commitAuthority(a)});if(!await current(a))return invalidate(a);a.bindingRevision=saved.binding.bindingRevision;a.status='ready';a.reasonCode=undefined;a.candidate=undefined;a.verifier=undefined;a.state=undefined;clearTimeout(a.timer);await a.listener?.close();a.listener=null;update(a);return safe(a);}catch(error){if(!await current(a))return invalidate(a);if(error?.code==='source-changed'){await dispose(a,'cancelled','source-changed');return safe(a);}a.status='save-recovery';a.reasonCode=error?.code==='storage-full'?'storage-full':'save-failed';reviewDigest(a);update(a);return safe(a);}
 }
 async function receiveCode(a,{code,iss}){
  if(a.status!=='waiting-browser'||!await current(a))return;a.status='exchanging';update(a);
  try{
   attemptAuthority(a);
   const tokens=await flow.exchange({review:a.review,registration:a.registration,callbackUri:a.listener.uri,code,iss,codeVerifier:a.verifier,signal:a.controller.signal});a.verifier=undefined;await check(a);
   const binding=normalizeAuthBinding({grantId:randomUUID(),sourceId:a.source.id,authSourceIdentity:a.source.authSourceIdentity,endpoint:a.source.url,issuer:a.review.issuer,resource:a.review.resource,registrationId:digest({client:a.registration.clientId,callback:a.registration.callbackUri,issuer:a.review.issuer}),scopes:tokens.scopes});
   a.candidate={binding,registration:a.registration,metadata:a.review.metadata,destinations:a.review.destinations,tokens,tokenGeneration:0,phase:'ready'};await commitCandidate(a);
  }catch(error){if(attempt===a&&await current(a))await dispose(a,'failed',errorCode(error));}
 }
 async function getAttempt(command){const a=attempt;if(!a||a.id!==command.attemptId||a.owner.taskId!==command.taskId)throw oauthFailure('source-changed');if(a.controller.signal.aborted&&ownerEqual(a.owner,selectedOwner())){try{const s=await source(a.source);if(s.authSourceIdentity===a.source.authSourceIdentity)return a;}catch{}}if(!await current(a)){await invalidate(a);return a;}if(command.reviewRevision!==undefined&&command.reviewRevision!==a.reviewRevision)throw oauthFailure('source-changed');return a;}
 async function command(input){
  const c=validateDiscoveryAuthCommand(input);if(attempt&&!attempt.lease&&!ownerEqual(attempt.owner,selectedOwner())&&!['ready','failed','cancelled','needs-sign-in'].includes(attempt.status))await invalidate(attempt);const o=owner(c.taskId);
  if(c.type==='inspect')return inspectSource({id:c.sourceId,revision:c.sourceRevision});
  if(c.type==='status'||c.type==='cancel'){const a=await getAttempt(c);if(c.type==='cancel'&&a.status!=='cancelled')await dispose(a);return safe(a);}
  if(mutation)throw oauthFailure('busy');mutation=true;mutationSourceId=['prepare','begin','forget'].includes(c.type)?c.sourceId??attempt?.source.id??null:null;
  try{
   if(c.type==='forget'){
    const s=await source({id:c.sourceId,revision:c.sourceRevision},true),inspection=await summary(s),binding=store.listBindings(s.id).find(v=>v.binding.bindingRevision===c.bindingRevision);if(!binding||inspection.bindingRevision!==c.bindingRevision||inspection.reviewRevision!==c.reviewRevision)throw oauthFailure('source-changed');await stop(s);if(attempt?.source.id===s.id)await dispose(attempt);if(!ownerEqual(o,selectedOwner()))throw oauthFailure('owner-changed');await source(s,true);await store.forget(c.bindingRevision,{expectedGeneration:store.inspect().generation});return summary(s);
   }
   if(c.type==='prepare'){
    if(attempt&&!['ready','failed','cancelled','needs-sign-in'].includes(attempt.status))throw oauthFailure('busy');const s=await source({id:c.sourceId,revision:c.sourceRevision},true);if(store.inspect().status!=='ready')return safeAuthState({sourceId:s.id,sourceRevision:s.revision,status:'storage-unavailable',reasonCode:'storage-unavailable'});await stop(s);if(!ownerEqual(o,selectedOwner()))throw oauthFailure('owner-changed');await source(s,true);if(attempt)await dispose(attempt);
    const a={id:opaque(),source:s,owner:o,status:'discovering',controller:new AbortController(),deadline:now()+600000};attempt=a;a.timer=setTimeout(()=>{if(attempt===a)void dispose(a,'cancelled','expired');},600000);a.timer.unref?.();
    try{const old=store.get(ref(s));await reserve(a,old?.registration.callbackPort??s.publicClient?.callbackPort);return await reviewedResource(a);}catch(error){if(await current(a))await dispose(a,'failed',errorCode(error));return safe(a);}
   }
   const a=await getAttempt(c);if(a.status==='cancelled')return safe(a);
   // Invalid/stale UI choices are rejected before changing the valid pending attempt.
   if(c.type==='reviewDestination'&&(!a.review?.pendingDestination||a.review.pendingDestination.id!==c.destinationChoiceId||a.status!=='review-required')||c.type==='selectIssuer'&&(a.status!=='issuer-review'||!a.review.issuerChoices.some(v=>v.id===c.issuerChoiceId))||c.type==='savePublicClient'&&(!['registration-required','review-required'].includes(a.status)||!a.review?.metadata||a.registrationStarted)||c.type==='retrySave'&&(a.status!=='save-recovery'||!a.candidate)||c.type==='begin'&&(a.status!=='review-required'||!a.review.metadata||a.registrationStarted))throw oauthFailure('source-changed');
   try{
    if(c.type==='reviewDestination'){
     if(!a.review?.pendingDestination||a.review.pendingDestination.id!==c.destinationChoiceId||a.status!=='review-required')throw oauthFailure('source-changed');a.review.reviewedDestinations.push(a.review.pendingDestination.url);return await reviewedResource(a);
    }
    if(c.type==='selectIssuer'){
     if(a.status!=='issuer-review'||!a.review.issuerChoices.some(v=>v.id===c.issuerChoiceId))throw oauthFailure('source-changed');a.review=await flow.discoverIssuer({resourceReview:a.review,issuerChoiceId:c.issuerChoiceId,signal:a.controller.signal});await check(a);registrationChoice(a);reviewDigest(a);update(a);return safe(a);
    }
    if(c.type==='savePublicClient'){
     if(!['registration-required','review-required'].includes(a.status)||!a.review?.metadata||a.registrationStarted)throw oauthFailure('source-changed');await a.listener?.close();a.listener=null;a.manualClient={clientId:c.clientId,callbackPort:c.callbackPort};await reserve(a,c.callbackPort);registrationChoice(a);reviewDigest(a);return safe(a);
    }
    if(c.type==='retrySave'){if(a.status!=='save-recovery'||!a.candidate)throw oauthFailure('source-changed');return commitCandidate(a);}
    if(c.type==='begin'){
     if(a.status!=='review-required'||!a.review.metadata||a.registrationStarted)throw oauthFailure('source-changed');await stop(a.source);await check(a);attemptAuthority(a);a.registrationStarted=true;a.registration=await flow.register({review:a.review,clientMetadata:a.clientMetadata,signal:a.controller.signal});await check(a);
     a.state=randomBytes(32).toString('base64url');const started=await flow.authorize({review:a.review,registration:a.registration,callbackUri:a.listener.uri,state:a.state});await check(a);attemptAuthority(a);a.verifier=started.codeVerifier;a.listener.arm({attemptId:a.id,state:a.state,issuer:a.review.issuer,issRequired:a.review.metadata.authorization_response_iss_parameter_supported===true,expiresAt:a.deadline});a.status='waiting-browser';await openBrowser(started.authorizationUrl);await check(a);update(a);return safe(a);
    }
    throw oauthFailure('unsupported');
   }catch(error){if(!await current(a))return invalidate(a);await dispose(a,'failed',errorCode(error));return safe(a);}
  }finally{mutation=false;mutationSourceId=null;}
 }
 async function inspectSource(sourceRef){
  if(attempt?.source.id===sourceRef.id&&attempt.source.revision===sourceRef.revision&&!['ready','cancelled'].includes(attempt.status)){
   if(attempt.controller.signal.aborted){const local=await summary(sourceRef);return attempt.status==='failed'&&ownerEqual(attempt.owner,selectedOwner())?safeAuthState({...local,status:'failed',reasonCode:attempt.reasonCode}):local;}
   if(!await current(attempt))await invalidate(attempt);else return safe(attempt);
  }return summary(sourceRef);
 }
 async function verifyLease(leaseId,insideIdleAdmission=false){
  const l=leases.get(leaseId),options={insideIdleAdmission};
  try{leaseAuthority(l,options);for(const row of l.sources){const s=await source(row);leaseAuthority(l,options);const grant=store.get(ref(s),row.authBindingRevision);if(s.authSourceIdentity!==row.authSourceIdentity||!grant||grant.phase!=='ready')throw oauthFailure('source-changed');}leaseAuthority(l,options);return l;}catch(error){if(error?.code!=='busy')revokeLease(l);throw oauthFailure(errorCode(error));}
 }
 async function ensureFresh(l,row){
  const options={insideIdleAdmission:true,allowPreparing:true};leaseAuthority(l,options);const s=await source(row);leaseAuthority(l,options);const g=store.get(ref(s),row.authBindingRevision);if(s.authSourceIdentity!==row.authSourceIdentity||!g||g.phase!=='ready')throw oauthFailure('invalid-grant');if(g.tokens.expiresAt===null||g.tokens.expiresAt>now())return;if(!g.tokens.refreshToken)throw oauthFailure('invalid-grant');if(attempt&&!['ready','failed','cancelled','needs-sign-in'].includes(attempt.status))throw oauthFailure('busy');
  const checked=await source(row);leaseAuthority(l,options);if(checked.authSourceIdentity!==g.binding.authSourceIdentity)throw oauthFailure('source-changed');
  const a={id:opaque(),source:s,owner:l.owner,lease:l,status:'refreshing',controller:new AbortController(),deadline:now()+600000,bindingRevision:g.binding.bindingRevision};if(attempt)await dispose(attempt);leaseAuthority(l,options);attempt=a;reviewDigest(a);update(a);
  let intent,tokens;try{await check(a);attemptAuthority(a);intent=await store.beginRefresh(g.binding.bindingRevision,{expectedTokenGeneration:g.tokenGeneration});a.refreshTransactionId=intent.transactionId;await check(a);attemptAuthority(a);tokens=await flow.refresh({grant:intent.grant,signal:a.controller.signal});await check(a);attemptAuthority(a);}catch(error){if(intent)await store.requireReauthorization(intent.transactionId,'reauthorization-required').catch(()=>{});await dispose(a,'needs-sign-in','invalid-grant');throw oauthFailure('invalid-grant');}
  a.candidate=tokens;const result=await commitCandidate(a);if(result.status!=='ready')throw oauthFailure('storage-unavailable');
 }
 return{
  command,inspectSource,
  async prepareConnection({owner:requested,selection}){
   if(!ownerEqual(requested,runtimeOwner(requested))||closed||!selection||selection.sessionId!==undefined&&(typeof selection.sessionId!=='string'||!selection.sessionId||selection.sessionId.length>200)||!Array.isArray(selection.sources)||selection.sources.length>4||selection.sources.some(s=>!s||!/^global:[A-Za-z0-9_.-]{1,100}$/.test(s.id)||!/^[a-f0-9]{64}$/.test(s.revision)||!/^[a-f0-9]{64}$/.test(s.authBindingRevision))||new Set(selection.sources.map(s=>s.id)).size!==selection.sources.length)throw oauthFailure('source-changed');
   const l={leaseId:opaque(),owner:{...requested},knownSessionId:selection.sessionId,sessionId:null,phase:'preparing',controller:new AbortController(),sources:selection.sources.map(row=>({id:row.id,revision:row.revision,authBindingRevision:row.authBindingRevision,accountGeneration:generation(row.id)})),refreshing:false},options={allowPreparing:true};
   leases.set(l.leaseId,l);
   try{leaseAuthority(l,options);for(const row of l.sources){const s=await source(row);leaseAuthority(l,options);const g=store.get(ref(s),row.authBindingRevision);if(!g||g.phase!=='ready'||g.binding.bindingRevision!==row.authBindingRevision)throw oauthFailure('invalid-grant');row.authSourceIdentity=s.authSourceIdentity;await ensureFresh(l,row);leaseAuthority(l,options);}leaseAuthority(l,options);l.phase='ready';return{leaseId:l.leaseId};}catch(error){revokeLease(l);throw oauthFailure(errorCode(error));}
  },
  async bindSession({leaseId,sessionId}){const l=await verifyLease(leaseId);leaseAuthority(l);if(typeof sessionId!=='string'||!sessionId||sessionId.length>200||/[\x00-\x1f\x7f]/.test(sessionId)||l.sessionId!==null&&l.sessionId!==sessionId||l.knownSessionId!==undefined&&l.knownSessionId!==sessionId)throw oauthFailure('source-changed');l.sessionId=sessionId;},
  async prepareTurn({owner:requested,leaseId}){const l=leases.get(leaseId);leaseAuthority(l);if(!l.sessionId||!ownerEqual(requested,l.owner))throw oauthFailure('owner-changed');if(typeof withIdleLease!=='function')throw oauthFailure('busy');l.refreshing=true;try{await withIdleLease({leaseId,owner:{...l.owner}},async()=>{await verifyLease(leaseId,true);leaseAuthority(l,{insideIdleAdmission:true});for(const row of l.sources)await ensureFresh(l,row);await verifyLease(leaseId,true);leaseAuthority(l,{insideIdleAdmission:true});});leaseAuthority(l,{insideIdleAdmission:true});}catch(error){throw oauthFailure(errorCode(error));}finally{l.refreshing=false;}},
  async readAccessToken({leaseId,sessionId,sourceId,sourceRevision,authBindingRevision}){const l=await verifyLease(leaseId);leaseAuthority(l);const row=l.sources.find(v=>v.id===sourceId&&v.revision===sourceRevision&&v.authBindingRevision===authBindingRevision);if(!l.sessionId||l.sessionId!==sessionId||!row)throw oauthFailure('source-changed');const g=store.get({sourceId,authSourceIdentity:row.authSourceIdentity},authBindingRevision);if(!g||g.phase!=='ready'||g.tokens.expiresAt!==null&&g.tokens.expiresAt<=now())throw oauthFailure('invalid-grant');return{token:g.tokens.accessToken,expiresAt:g.tokens.expiresAt};},
  verifyLease:async leaseId=>{const l=await verifyLease(leaseId);leaseAuthority(l);},async closeLease(leaseId){revokeLease(leases.get(leaseId));},isBusy:()=>mutation||!!attempt&&!['ready','failed','cancelled','needs-sign-in'].includes(attempt.status)||[...leases.values()].some(v=>v.refreshing),
  async close(){closed=true;for(const l of leases.values())revokeLease(l);if(attempt)await dispose(attempt);attempt=null;},
 };
}
