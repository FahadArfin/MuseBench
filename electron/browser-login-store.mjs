import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {renameSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
import path from 'node:path';

// Electron does not restore session-only cookies. Keep only the personal
// browser's provider cookies, protected by the OS, inside the SAME profile.
// Nothing is sent to a renderer or IPC, and no cookie expiry is extended.
const roots=['meta.ai','muse.ai','facebook.com','instagram.com','meta.com'];
const allowed=domain=>typeof domain==='string'&&roots.some(root=>domain.replace(/^\./,'')===root||domain.endsWith('.'+root));
function details(cookie){
 if(!cookie||!cookie.session||!allowed(cookie.domain)||typeof cookie.name!=='string'||typeof cookie.value!=='string'||cookie.name.length>4096||cookie.value.length>16384||typeof cookie.path!=='string'||!cookie.path.startsWith('/')||/[\r\n]/.test(cookie.domain+cookie.path))return null;
 const host=cookie.domain.replace(/^\./,'');
 try{const url=new URL(`${cookie.secure?'https':'http'}://${host}${cookie.path}`);if(url.hostname!==host)return null;}catch{return null;}
 return {url:`${cookie.secure?'https':'http'}://${host}${cookie.path}`,name:cookie.name,value:cookie.value,path:cookie.path,...(!cookie.hostOnly?{domain:cookie.domain}:{}),secure:!!cookie.secure,httpOnly:!!cookie.httpOnly,sameSite:cookie.sameSite};
}
export const BROWSER_LOGIN_SESSION_BLOCKED_MESSAGE='Browser sign-in restoration did not finish safely. Restart MuseBench before opening the personal browser.';

const messages={
 BROWSER_LOGIN_RESTORE_FAILED:'Saved browser sign-in could not be restored.',
 BROWSER_LOGIN_RESTORE_TIMEOUT:'Saved browser sign-in restoration timed out.',
 BROWSER_LOGIN_RESTORE_CHANGED:'Saved browser sign-in restoration was interrupted by a cookie change.',
 BROWSER_LOGIN_SAVE_FAILED:'Browser login storage could not be saved.',
 BROWSER_LOGIN_SAVE_TIMEOUT:'Browser login storage save timed out.',
 BROWSER_LOGIN_CLOSE_FAILED:'Browser login storage could not be saved before closing.',
 BROWSER_LOGIN_CLOSE_TIMEOUT:'Browser login storage save timed out before closing.',
 BROWSER_LOGIN_CLOSED:'Browser login storage is closed.',
};
// Only fixed failure codes become UI text; native errors and cookies never do.
export function browserLoginNotice(state){
 if(state?.sessionBlocked)return BROWSER_LOGIN_SESSION_BLOCKED_MESSAGE;
 const code=state?.failure?.code;
 if(!Object.hasOwn(messages,code)||code==='BROWSER_LOGIN_CLOSED')return null;
 const paused=code.endsWith('_TIMEOUT')||code==='BROWSER_LOGIN_RESTORE_CHANGED';
 const prefix=code.startsWith('BROWSER_LOGIN_RESTORE_')?'Saved browser sign-in could not be restored.':'Browser sign-in could not be saved.';
 return paused?`${prefix} Protected sign-in storage is paused until MuseBench restarts. You may need to sign in again after restarting.`:`${prefix} You may need to sign in again after restarting MuseBench.`;
}
class LoginStoreFailure extends Error{
 constructor(code,stage){super(messages[code]);this.code=code;this.stage=stage;}
}
const safeError=(stage,suffix='FAILED')=>new LoginStoreFailure(`BROWSER_LOGIN_${stage.toUpperCase()}_${suffix}`,stage);
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;

/**
 * The caller must keep this partition unused until creation completes, and must
 * gate every browser view with canUseSession(). A native cookies.set cannot be
 * cancelled: if it outlives restore, that same partition stays quarantined for
 * this process. Deadlines alone cannot safely expose it to a new login/logout.
 */
export async function createBrowserLoginStore({dataDir,protection,session,debounceMs=500,restoreTimeoutMs=5000,saveTimeoutMs=5000,closeTimeoutMs=5000,onFailure=()=>{},setTimeout:later=globalThis.setTimeout,clearTimeout:clear=globalThis.clearTimeout}){
 const file=path.join(dataDir,'browser-login.bin'),operations=new Set();
 let timer=null,closed=false,revision=0,committedRevision=-1,generation=0,pending=Promise.resolve(),completion;
 let enabled=false,suspended=false,attached=false,failure=null,sessionBlocked=false,restoring;
 const key=cookie=>`${cookie?.domain?.replace(/^\./,'')}\n${cookie?.path}\n${cookie?.name}`;
 const snapshot=()=>({status:closed?'closed':failure?'failed':enabled?'ready':'disabled',sessionBlocked,failure:failure?{...failure}:null});
 const report=error=>{
  failure=Object.freeze({code:error.code,stage:error.stage,message:error.message});
  // Neither native errors nor cookie data cross this diagnostic boundary.
  try{Promise.resolve(onFailure({...failure})).catch(()=>{});}catch{}
 };
 const discard=()=>{try{unlinkSync(file);}catch{}};
 const clearDebounce=()=>{if(timer!==null)clear(timer);timer=null;};
 const detach=()=>{clearDebounce();if(attached){session.cookies.removeListener('changed',changed);attached=false;}};
 const suspend=error=>{
  // A late native set is allowed to finish only in this quarantined partition.
  // Do not remove cookies: that could erase an unrelated current Chromium login.
  sessionBlocked ||= !!restoring?.setting;
  suspended=true;enabled=false;generation++;discard();detach();
  for(const operation of operations)operation.cancel(error);
 };
 function bounded(stage,timeoutMs,work){
  let resolve,reject,deadline;
  const operation={active:true,generation,setting:false,replayed:new Map()};
  operation.promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  operation.cancel=error=>{if(!operation.active)return;operation.active=false;operation.replayed.clear();clear(deadline);operations.delete(operation);reject(error);};
  operation.guard=()=>{if(!operation.active||operation.generation!==generation)throw safeError(stage);};
  operations.add(operation);
  deadline=later(()=>{
   if(!operation.active)return;
   const error=safeError(stage,'TIMEOUT');report(error);suspend(error);
  },positive(timeoutMs,5000));
  Promise.resolve().then(()=>{operation.guard();return work(operation);}).then(value=>{
   if(!operation.active)return;
   operation.active=false;operation.replayed.clear();clear(deadline);operations.delete(operation);resolve(value);
  },error=>{
   if(!operation.active)return;
   // Only internally constructed errors are trusted, never native code/message.
   const safe=error instanceof LoginStoreFailure?error:safeError(stage);
   operation.active=false;operation.replayed.clear();clear(deadline);operations.delete(operation);report(safe);
   if(stage==='restore')discard();
   reject(safe);
  });
  return operation;
 }
 function changed(_event,cookie,_cause,removed){
  // Startup owns this partition exclusively. Native change notifications may
  // arrive after the corresponding set promise, even during a later set.
  // Ignore only matching replay insertions; a removal still aborts restoration.
  if(restoring?.active&&removed===false&&restoring.replayed.has(key(cookie))&&restoring.replayed.get(key(cookie))===cookie?.value)return;
  revision++;discard();clearDebounce();
  if(restoring?.active){
   const error=safeError('restore','CHANGED');report(error);suspend(error);return;
  }
  if(!closed&&!suspended){timer=later(()=>{timer=null;void save().catch(()=>{});},Math.max(0,Number.isFinite(debounceMs)?debounceMs:500));timer?.unref?.();}
 }
 const enqueueSave=()=>{
  const previous=pending;
  const operation=bounded('save',saveTimeoutMs,async token=>{
   await previous.catch(()=>{});token.guard();
   const start=revision;
   const cookies=(await session.cookies.get({})).filter(cookie=>details(cookie));token.guard();
   if(start!==revision)return;
   if(cookies.length>1000)throw safeError('save');
   const text=JSON.stringify({version:1,cookies});if(Buffer.byteLength(text)>1024*1024)throw safeError('save');
   const encrypted=await (protection.encryptStringAsync?protection.encryptStringAsync(text):protection.encryptString(text));token.guard();
   if(start!==revision)return;
   if(!Buffer.isBuffer(encrypted)||encrypted.length>2*1024*1024)throw safeError('save');
   const temporary=file+'.'+randomUUID()+'.tmp';
   try{
    await mkdir(dataDir,{recursive:true});token.guard();
    await writeFile(temporary,encrypted,{flag:'wx',mode:0o600});token.guard();
    // Both logout and a deadline invalidate a late encrypted snapshot. The
    // atomic rename has no asynchronous gap after the final generation check.
    if(start===revision){renameSync(temporary,file);committedRevision=start;failure=null;}
   }finally{await rm(temporary,{force:true}).catch(()=>{});}
  });
  pending=operation.promise;
  return pending;
 };
 const save=()=>{
  if(closed)return Promise.reject(new LoginStoreFailure('BROWSER_LOGIN_CLOSED','save'));
  if(suspended)return Promise.reject(new LoginStoreFailure(failure.code,failure.stage));
  return enabled?enqueueSave():Promise.resolve();
 };
 const close=()=>{
  if(completion)return completion;
  closed=true;clearDebounce();
  if(!enabled||suspended){detach();completion=Promise.resolve();return completion;}
  const previous=pending;
  const retries=new AbortController();
  const operation=bounded('close',closeTimeoutMs,async token=>{
   // Retry an ordinary failed early write, but include the wait for any active
   // save and every final-save retry in this SAME close deadline.
   await previous.catch(()=>{});token.guard();
   for(;;){
    await enqueueSave();token.guard();
    if(committedRevision===revision){
     // Seal the stable revision synchronously, with no async gap before the
     // listener is removed. A stale save is never a successful final barrier.
     detach();return;
    }
    // A fast native fixture (or repeated changes) must not starve the original
    // deadline by keeping all retries in the microtask queue.
    await yieldToLoop(undefined,{signal:retries.signal});token.guard();
   }
  });
  completion=operation.promise.finally(()=>{retries.abort();detach();});
  return completion;
 };
 const store={save,close,snapshot,canUseSession:()=>!sessionBlocked&&!closed};
 restoring=bounded('restore',restoreTimeoutMs,async token=>{
  const available=protection.isAsyncEncryptionAvailable?await protection.isAsyncEncryptionAvailable():protection.isEncryptionAvailable();token.guard();
  if(!available||['basic_text','plaintext'].includes(protection.getSelectedStorageBackend?.()))return;
  enabled=true;session.cookies.on('changed',changed);attached=true;
  let bytes;
  try{bytes=await readFile(file);}catch(error){token.guard();if(error.code==='ENOENT')return;throw error;}
  token.guard();if(bytes.length>2*1024*1024)throw safeError('restore');
  const decrypted=protection.decryptStringAsync?await protection.decryptStringAsync(bytes):protection.decryptString(bytes);token.guard();
  const saved=JSON.parse(typeof decrypted==='string'?decrypted:decrypted.result);
  if(saved?.version!==1||!Array.isArray(saved.cookies)||saved.cookies.length>1000)throw safeError('restore');
  const current=await session.cookies.get({});token.guard();
  const existing=new Set(current.map(key));
  for(const cookie of saved.cookies){
   token.guard();const value=details(cookie);
   if(!value||existing.has(key(cookie)))continue;
   token.replayed.set(key(cookie),value.value);token.setting=true;
   try{await session.cookies.set(value);}finally{token.setting=false;}
   token.guard();existing.add(key(cookie));
  }
 });
 await restoring.promise.catch(()=>{});
 return store;
}
