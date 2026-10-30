const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const source=v=>typeof v==='string'&&/^global:[A-Za-z0-9_.-]{1,100}$/.test(v);
const opaque=v=>text(v,200)&&/^[A-Za-z0-9_-]{8,200}$/.test(v);
export function validateDiscoveryAuthCommand(value){
 const fail=()=>{throw Error('Invalid discovery sign-in action.');};if(!object(value)||!text(value.taskId)||!text(value.type))return fail();
 let keys=['type','taskId'],required={};
 if(['inspect','prepare','forget'].includes(value.type)){
  keys.push('sourceId','sourceRevision');if(!source(value.sourceId)||!digest(value.sourceRevision))return fail();
  if(value.type==='prepare'){keys.push('reviewedEndpoint');if(value.reviewedEndpoint!==true)return fail();}
  if(value.type==='forget'){keys.push('bindingRevision');if(!digest(value.bindingRevision))return fail();}
 }else if(['reviewDestination','selectIssuer','savePublicClient','begin','retrySave','status','cancel'].includes(value.type)){
  keys.push('attemptId');if(!opaque(value.attemptId))return fail();
  if(value.type==='reviewDestination'){keys.push('destinationChoiceId');if(!opaque(value.destinationChoiceId))return fail();}
  if(value.type==='selectIssuer'){keys.push('issuerChoiceId');if(!opaque(value.issuerChoiceId))return fail();}
  if(value.type==='savePublicClient'){keys.push('clientId','callbackPort');if(!text(value.clientId,16384)||new TextEncoder().encode(value.clientId).length>16384||!Number.isInteger(value.callbackPort)||value.callbackPort<1024||value.callbackPort>65535)return fail();}
 }else return fail();
 if(['forget','reviewDestination','selectIssuer','savePublicClient','begin','retrySave'].includes(value.type)){keys.push('reviewRevision','reviewed');if(!digest(value.reviewRevision)||value.reviewed!==true)return fail();}
 if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return fail();
 for(const k of keys)required[k]=value[k];return required;
}
const statuses=new Set(['not-configured','discovering','issuer-review','review-required','registration-required','waiting-browser','exchanging','saving','ready','refreshing','scope-review-required','needs-sign-in','storage-unavailable','save-recovery','cancelled','failed','forget-review']);
const reasons={
 'registration-required':'Set up a public client before signing in.',
 'unsupported-public-client':'This provider requires an unsupported sign-in method.',
 'issuer-mismatch':'The sign-in issuer did not match the reviewed provider.',
 'network-failed':'The sign-in request could not be completed.',
 'storage-unavailable':'Device credential protection is unavailable.',
 'storage-full':'Saved sign-ins have reached the device storage limit.',
 'reauthorization-required':'Sign in again on this device.',
 'source-changed':'Review this source again before signing in.',
 'owner-changed':'The active chat or folder changed.',
 'invalid-grant':'Sign in again on this device.',
 'save-failed':'Credentials could not be saved. Retry saving on this device.',
 'callback-unavailable':'The sign-in callback port is unavailable.',
 'cancelled':'Sign-in was cancelled.',
 'expired':'The sign-in attempt expired.',
 'scope-changed':'Review the requested permissions again.',
 'busy':'Finish active source work before changing sign-in.',
 'unsupported':'This sign-in configuration is unsupported.',
};
function origin(value){try{const url=new URL(value);return text(value,2048)&&url.origin===value&&['https:','http:'].includes(url.protocol)?value:undefined;}catch{return undefined;}}
function labels(value,max,count){return Array.isArray(value)&&value.length<=count&&value.every(s=>text(s,max))?[...value]:undefined;}
export function safeAuthState(value){
 if(!object(value)||!source(value.sourceId)||!digest(value.sourceRevision)||!statuses.has(value.status))throw Error('Invalid discovery sign-in state.');
 const result={sourceId:value.sourceId,sourceRevision:value.sourceRevision,status:value.status,credentialAvailable:value.credentialAvailable===true};
 for(const k of ['bindingRevision','reviewRevision'])if(digest(value[k]))result[k]=value[k];
 if(opaque(value.attemptId))result.attemptId=value.attemptId;
 if(Number.isSafeInteger(value.deadline)&&value.deadline>=0)result.deadline=value.deadline;
 for(const k of ['origin','issuerOrigin','resourceOrigin','registrationOrigin','tokenOrigin']){const v=origin(value[k]);if(v)result[k]=v;}
 if(text(value.urlTemplate,16384))result.urlTemplate=value.urlTemplate;
 if(Array.isArray(value.environmentNames)&&value.environmentNames.length<=256&&value.environmentNames.every(v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,199}$/.test(v)))result.environmentNames=[...value.environmentNames];
 const scopes=labels(value.scopes,200,256);if(scopes)result.scopes=scopes;
 for(const key of ['issuerChoices','destinationChoices'])if(Array.isArray(value[key])&&value[key].length<=12&&value[key].every(v=>object(v)&&opaque(v.id)&&origin(v.origin)))result[key]=value[key].map(v=>({id:v.id,origin:v.origin}));
 if(['stored','preregistered','cimd','dcr','manual'].includes(value.registrationMethod))result.registrationMethod=value.registrationMethod;
 if(Number.isInteger(value.callbackPort)&&value.callbackPort>=1024&&value.callbackPort<=65535)result.callbackPort=value.callbackPort;
 for(const k of ['canPrepare','canBegin','canCancel','canRetrySave','canForget','canSavePublicClient','canSelectIssuer','canReviewDestination'])if(typeof value[k]==='boolean')result[k]=value[k];
 if(Object.hasOwn(reasons,value.reasonCode)){result.reasonCode=value.reasonCode;result.reason=reasons[value.reasonCode];}
 return result;
}
