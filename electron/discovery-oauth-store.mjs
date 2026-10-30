import * as filesystem from 'node:fs/promises';
import {constants,renameSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeAuthBinding} from '../src/runtime/discovery-auth-identity.mjs';

const MAX_BYTES=1024*1024,MAX_GRANT=64*1024;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=16384)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const credential=v=>text(v)&&Buffer.byteLength(v)<=16384;
const clone=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const failure=(code='storage-unavailable')=>Object.assign(Error(code==='storage-full'?'Protected sign-in storage limit reached.':'Protected sign-in storage is unavailable.'),{code});
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
function boundedJson(value,depth=0){
 if(depth>16)throw failure('storage-full');
 if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){for(const v of value)boundedJson(v,depth+1);return;}
 if(!object(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 for(const [key,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw failure();boundedJson(v,depth+1);}
}
function tokens(value,ready=true){
 if(!exact(value,['accessToken','refreshToken','expiresAt','scopes'])||ready&&!credential(value.accessToken)||value.accessToken!==undefined&&!credential(value.accessToken)||value.refreshToken!==undefined&&!credential(value.refreshToken)||value.expiresAt!==null&&(!Number.isSafeInteger(value.expiresAt)||value.expiresAt<0))throw failure('invalid-grant');
 return{...(value.accessToken!==undefined?{accessToken:value.accessToken}:{}),...(value.refreshToken!==undefined?{refreshToken:value.refreshToken}:{}),expiresAt:value.expiresAt};
}
function grant(value){
 boundedJson(value);
 if(!exact(value,['binding','registration','metadata','destinations','tokens','tokenGeneration','phase','refreshTransactionId','reasonCode'])||!['ready','refresh-in-flight','reauthorization-required'].includes(value.phase)||!Number.isSafeInteger(value.tokenGeneration)||value.tokenGeneration<0)throw failure();
 let binding;try{binding=normalizeAuthBinding(value.binding);}catch{throw failure('invalid-grant');}
 if(value.tokens?.scopes!==undefined){
  let scoped;try{scoped=normalizeAuthBinding({...binding,bindingRevision:undefined,scopes:value.tokens.scopes});}catch{throw failure('invalid-grant');}
  if(scoped.bindingRevision!==binding.bindingRevision)throw failure('invalid-grant');
 }
 const r=value.registration;
 if(!exact(r,['clientId','callbackPort','callbackUri','method','clientMetadata'])||!credential(r.clientId)||!Number.isInteger(r.callbackPort)||r.callbackPort<1024||r.callbackPort>65535||r.callbackUri!==`http://127.0.0.1:${r.callbackPort}/oauth/mcp/callback`||!['dcr','manual','preregistered','cimd','stored'].includes(r.method)||!object(value.metadata)||!Array.isArray(value.destinations)||value.destinations.length>12||value.destinations.some(v=>!text(v)))throw failure('invalid-grant');
 if(value.phase==='refresh-in-flight'&&(typeof value.refreshTransactionId!=='string'||! /^[a-f0-9-]{36}$/.test(value.refreshTransactionId)))throw failure();
 if(value.phase!=='refresh-in-flight'&&value.refreshTransactionId!==undefined)throw failure();
 const result={binding,registration:clone(r),metadata:clone(value.metadata),destinations:[...value.destinations],tokens:tokens(value.tokens,value.phase==='ready'),tokenGeneration:value.tokenGeneration,phase:value.phase,...(value.refreshTransactionId?{refreshTransactionId:value.refreshTransactionId}:{}),...(value.reasonCode==='reauthorization-required'?{reasonCode:value.reasonCode}:{})};
 if(Buffer.byteLength(JSON.stringify(result))>MAX_GRANT)throw failure('storage-full');return result;
}
function envelope(value){
 boundedJson(value);
 if(!exact(value,['version','generation','grants'])||value.version!==1||!Number.isSafeInteger(value.generation)||value.generation<0||!Array.isArray(value.grants)||value.grants.length>100)throw failure('storage-full');
 const grants=value.grants.map(grant),ids=new Set(),bindings=new Set();for(const g of grants){if(ids.has(g.binding.grantId)||bindings.has(g.binding.bindingRevision))throw failure();ids.add(g.binding.grantId);bindings.add(g.binding.bindingRevision);}
 const result={version:1,generation:value.generation,grants};if(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES)throw failure('storage-full');return result;
}

/** Main owns one instance under the app's single-instance lock. No network here. */
export async function createDiscoveryOAuthStore({dataDir,protection,fsAdapter=filesystem,finalizeRename=fsAdapter===filesystem?renameSync:undefined,now=Date.now}){
 const fs=fsAdapter;
 if(typeof dataDir!=='string'||!path.isAbsolute(dataDir))throw failure();
 const dir=path.resolve(dataDir),file=path.join(dir,'discovery-oauth.bin');
 let status='ready',record={version:1,generation:0,grants:[]},fileDigest=null,tail=Promise.resolve(),closed=false;
 const activeRefreshes=new Set();
 const pathKey=v=>process.platform==='win32'?v.toLowerCase():v;
 async function protectedBackend(){
  if(!protection||typeof protection.available!=='function'||typeof protection.encrypt!=='function'||typeof protection.decrypt!=='function'||await protection.available()!==true)throw failure();
  // The actual Electron wrapper must include its backend check in available().
  if(typeof protection.backend==='function'&&['basic_text','plaintext'].includes(await protection.backend()))throw failure();
 }
 async function validateDirectory(){
  const info=await fs.lstat(dir),actual=await fs.realpath(dir);
  if(info.isSymbolicLink()||!info.isDirectory()||pathKey(actual)!==pathKey(dir))throw failure();
 }
 async function readCurrent(){
  try{
   await validateDirectory();const before=await fs.lstat(file);
   if(before.isSymbolicLink()||!before.isFile()||before.nlink!==1||before.size<1||before.size>MAX_BYTES)throw failure();
   const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
   try{
    // On Windows lstat's device ID is zero while fstat reports the volume ID.
    const info=await handle.stat();if(!info.isFile()||info.nlink!==1||(before.dev!==0&&info.dev!==before.dev)||info.ino!==before.ino||info.size!==before.size)throw failure();
    const bytes=Buffer.alloc(before.size+1);let total=0;
    while(total<bytes.length){const read=await handle.read(bytes,total,bytes.length-total,null);if(!read.bytesRead)break;total+=read.bytesRead;}
    const after=await fs.lstat(file),end=await handle.stat();if(total!==before.size||after.isSymbolicLink()||!after.isFile()||after.nlink!==1||after.dev!==before.dev||after.ino!==info.ino||end.dev!==info.dev||end.ino!==info.ino||end.size!==info.size||end.mtimeMs!==info.mtimeMs||after.mtimeMs!==info.mtimeMs)throw failure();
    return bytes.subarray(0,total);
   }finally{await handle.close();}
  }catch(error){
   if(error.code==='ENOENT'){
    // Missing is empty only when the parent is absent or the final entry is absent.
    // A dangling final symlink is caught by lstat above; dangling parents fail realpath.
    try{const info=await fs.lstat(dir);if(info.isSymbolicLink()||!info.isDirectory())throw failure();await validateDirectory();}catch(parent){if(parent.code!=='ENOENT')throw parent;}
    return null;
   }throw error;
  }
 }
 async function compareFile(){
  try{const current=await readCurrent();if((current===null?null:hash(current))!==fileDigest)throw failure('storage-conflict');}
  catch{status='unavailable';throw failure('storage-conflict');}
 }
 async function save(next,{authorityGuard}={}){
  if(status!=='ready')throw failure();
  next=envelope(next);const plaintext=JSON.stringify(next);let tmp,handle;
  try{
   await protectedBackend();await compareFile();
   const bytes=await protection.encrypt(plaintext);if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_BYTES)throw failure('storage-full');
   await fs.mkdir(dir,{recursive:true,mode:0o700});await validateDirectory();
   tmp=path.join(dir,`.discovery-oauth-${randomUUID()}.tmp`);handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
   await compareFile();
   if(authorityGuard!==undefined){
    // Guard + atomic replace + memory publication form one synchronous commit point.
    // A custom async fs adapter must supply its own explicit synchronous finalizer.
    if(typeof authorityGuard!=='function')throw failure('source-changed');if(typeof finalizeRename!=='function')throw failure();
    let approved=false;try{const result=authorityGuard();if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});approved=result===true;}catch{}if(!approved)throw failure('source-changed');
    const committedDigest=hash(bytes);finalizeRename(tmp,file);tmp=null;record=next;fileDigest=committedDigest;
   }else{
    await fs.rename(tmp,file);tmp=null;
    // No fallible operation may follow the durable rename before publishing memory.
    record=next;fileDigest=hash(bytes);
   }
  }catch(error){if(['storage-full','storage-conflict','source-changed'].includes(error?.code))throw error;throw failure();}
  finally{if(handle)await handle.close().catch(()=>{});if(tmp)await fs.unlink(tmp).catch(()=>{});}
 }
 function queue(action){
  if(closed)return Promise.reject(failure());const result=tail.then(()=>{if(status!=='ready')throw failure();return action();});tail=result.catch(()=>{});return result;
 }
 function expected(generation){if(!Number.isSafeInteger(generation)||generation!==record.generation)throw failure('storage-conflict');}
 function next(grants){if(record.generation>=Number.MAX_SAFE_INTEGER)throw failure();return{version:1,generation:record.generation+1,grants};}
 function findBinding(revision){const g=record.grants.find(g=>g.binding.bindingRevision===revision);if(!g)throw failure('invalid-grant');return g;}
 function publicPrivateRead(g){
  const result=clone(g);if(result.phase!=='ready')delete result.tokens.refreshToken;return result;
 }
 try{
  await protectedBackend();const bytes=await readCurrent();
  if(bytes!==null){
   fileDigest=hash(bytes);const decoded=await protection.decrypt(bytes);
   if(!object(decoded)||typeof decoded.result!=='string'||Buffer.byteLength(decoded.result)>MAX_BYTES||typeof decoded.shouldReEncrypt!=='boolean')throw failure();
   const parsed=JSON.parse(decoded.result);if(parsed?.version!==1){status='unsupported';}else{
    record=envelope(parsed);
    // A refresh intent loaded after restart is never an authority to replay refresh.
    record={...record,grants:record.grants.map(g=>g.phase==='refresh-in-flight'?{...g,phase:'reauthorization-required',tokens:{expiresAt:g.tokens.expiresAt},refreshTransactionId:undefined,reasonCode:'reauthorization-required'}:g)};
    for(const g of record.grants)if(g.refreshTransactionId===undefined)delete g.refreshTransactionId;
    if(decoded.shouldReEncrypt)await save(next(record.grants));
   }
  }
 }catch{status='unavailable';}
 return{
  inspect:()=>({status,generation:record.generation}),
  listBindings(sourceId){
   if(typeof sourceId!=='string'||!/^global:[A-Za-z0-9_.-]{1,100}$/.test(sourceId))throw failure('invalid-grant');
   if(closed||status!=='ready')return[];
   // Trusted main only: this projection supports orphan Forget review, never use.
   return record.grants.filter(g=>g.binding.sourceId===sourceId).map(g=>({binding:clone(g.binding),phase:g.phase}));
  },
  get(authSourceRef,bindingRevision){
   if(closed||status!=='ready'||!object(authSourceRef))return null;
   const g=record.grants.findLast(g=>g.binding.sourceId===authSourceRef.sourceId&&g.binding.authSourceIdentity===authSourceRef.authSourceIdentity&&(bindingRevision===undefined||g.binding.bindingRevision===bindingRevision));return g?publicPrivateRead(g):null;
  },
  commitGrant(value,{expectedGeneration,authorityGuard}={}){return queue(async()=>{
   expected(expectedGeneration);const g=grant(value);if(g.phase!=='ready')throw failure('invalid-grant');
   const existing=record.grants.find(v=>v.binding.grantId===g.binding.grantId);if(existing&&(existing.phase==='refresh-in-flight'||existing.binding.bindingRevision!==g.binding.bindingRevision))throw failure('invalid-grant');
   const retired=[];
   const grants=record.grants.filter(v=>v.binding.grantId!==g.binding.grantId).map(previous=>{
    if(previous.binding.sourceId!==g.binding.sourceId||previous.binding.authSourceIdentity!==g.binding.authSourceIdentity)return previous;
    // A successful new enrollment replaces reusable credentials atomically.
    // Keep its old metadata for explicit Forget, never resurrect old tokens.
    if(previous.refreshTransactionId)retired.push(previous.refreshTransactionId);
    const value={...previous,phase:'reauthorization-required',tokens:{expiresAt:previous.tokens.expiresAt},reasonCode:'reauthorization-required'};delete value.refreshTransactionId;return value;
   });grants.push(g);await save(next(grants),{authorityGuard});for(const id of retired)activeRefreshes.delete(id);return clone(g);
  });},
  beginRefresh(bindingRevision,{expectedTokenGeneration}={}){return queue(async()=>{
   const g=findBinding(bindingRevision);if(g.phase!=='ready'||g.tokenGeneration!==expectedTokenGeneration||!g.tokens.refreshToken)throw failure('invalid-grant');
   const transactionId=randomUUID(),pending={...g,phase:'refresh-in-flight',refreshTransactionId:transactionId};await save(next(record.grants.map(v=>v===g?pending:v)));activeRefreshes.add(transactionId);
   return{transactionId,grant:clone(pending)};
  });},
  completeRefresh(transactionId,value){return queue(async()=>{
   if(!activeRefreshes.has(transactionId))throw failure('invalid-grant');const g=record.grants.find(v=>v.refreshTransactionId===transactionId&&v.phase==='refresh-in-flight');if(!g)throw failure('invalid-grant');
   if(value?.scopes!==undefined){let checked;try{checked=normalizeAuthBinding({...g.binding,bindingRevision:undefined,scopes:value.scopes});}catch{throw failure('invalid-grant');}if(checked.bindingRevision!==g.binding.bindingRevision)throw failure('invalid-grant');}
   const candidate={...g,tokens:tokens(value),tokenGeneration:g.tokenGeneration+1,phase:'ready'};delete candidate.refreshTransactionId;
   const updated=grant(candidate);
   // Lost/failed save retains both the durable intent and active transaction. The
   // caller may retry this save with its private candidate, never repeat the POST.
   await save(next(record.grants.map(v=>v===g?updated:v)));activeRefreshes.delete(transactionId);return clone(updated);
  });},
  requireReauthorization(transactionId,reasonCode){return queue(async()=>{
   if(!text(reasonCode,100)||!activeRefreshes.has(transactionId))throw failure('invalid-grant');const g=record.grants.find(v=>v.refreshTransactionId===transactionId);if(!g)throw failure('invalid-grant');
   const updated={...g,phase:'reauthorization-required',tokens:{expiresAt:g.tokens.expiresAt},reasonCode:'reauthorization-required'};delete updated.refreshTransactionId;
   await save(next(record.grants.map(v=>v===g?updated:v)));activeRefreshes.delete(transactionId);
  });},
  forget(bindingRevision,{expectedGeneration}={}){return queue(async()=>{
   expected(expectedGeneration);const g=findBinding(bindingRevision);await save(next(record.grants.filter(v=>v!==g)));if(g.refreshTransactionId)activeRefreshes.delete(g.refreshTransactionId);
  });},
  async close(){closed=true;await tail;activeRefreshes.clear();record={version:1,generation:record.generation,grants:[]};},
 };
}
