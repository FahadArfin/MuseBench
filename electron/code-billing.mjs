import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {curateEnvironment} from '../src/runtime/index.mjs';
import {readNativeAccount} from '../src/runtime/account.mjs';

export async function createCodeBilling({dataDir,safeStorage,getBinary,isActive=()=>false,beforeChange=async()=>{},readBilling=async()=>null,probe=readNativeAccount,environment=process.env}){
 const file=path.join(dataDir,'code-billing.bin');
 let record={version:1,mode:'cli',key:null,billingAccountId:null},storageError=false,busy=false,revision=0,statusPending=null;
 try{
  const bytes=await readFile(file);if(bytes.length>40000)throw Error('Invalid storage');
  const parsed=JSON.parse(safeStorage.decryptString(bytes));
  if(!parsed||parsed.version!==1||!['cli','account','api'].includes(parsed.mode)||parsed.key!==null&&(typeof parsed.key!=='string'||!validKey(parsed.key))||parsed.billingAccountId!==null&&!validAccount(parsed.billingAccountId))throw Error('Invalid storage');
  record=parsed;
 }catch(error){if(error.code!=='ENOENT')storageError=true;}
 const base=()=>curateEnvironment(environment);
 const envFor=(r,env=base())=>{
  if(storageError)throw Error('Protected credential storage could not be opened. Save your API key again or select your Muse account.');
  const result={...env};for(const name of Object.keys(result))if(name.toUpperCase()==='META_API_KEY')delete result[name];
  if(r.mode==='api'){if(!r.key)throw Error('Add a Meta API key before selecting API billing.');result.META_API_KEY=r.key;}
  return result;
 };
 const snapshot=()=>({mode:record.mode,hasApiKey:!!record.key,billingAccountId:record.billingAccountId,status:storageError?'error':'ready',busy:busy||isActive()});
 function status(){
  if(statusPending?.revision===revision)return statusPending.promise;
  const entry={revision,promise:null};statusPending=entry;
  entry.promise=readStatus().finally(()=>{if(statusPending===entry)statusPending=null;});return entry.promise;
 }
 async function readStatus(){
  const initial=revision,s=snapshot();if(storageError)return{...s,source:'unknown',usage:{windows:[]},message:'Protected credential storage needs attention.'};
  if(record.mode==='api')return{...s,source:'api',usage:{windows:[]}};
  try{
   const result=await probe({binary:getBinary(),environment:envFor(record),refreshUsage:true});
   if(initial!==revision)return status();
   const source=record.mode==='api'?'api':result.state==='accountLogin'?'account':['apiKey','environmentApiKey','envApiKey'].includes(result.state)?'api':'unknown';
   return{...snapshot(),source,accountState:result.state,usage:source==='account'?result.usage:{windows:[]},...(result.usageUnavailable?{message:'Meta did not return subscription allowance. Check your plan on Meta.'}:{})};
  }catch{if(initial!==revision)return status();return{...snapshot(),source:record.mode==='api'?'api':'unknown',usage:{windows:[]},message:'Muse account details are unavailable. Check your CLI sign-in and version.'};}
 }
 async function save(next){
  if(!safeStorage.isEncryptionAvailable())throw Error('Device credential protection is unavailable. Nothing was saved.');
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{await mkdir(dataDir,{recursive:true});await writeFile(tmp,safeStorage.encryptString(JSON.stringify(next)),{mode:0o600,flag:'wx'});await rename(tmp,file);}
  catch{throw Error('Could not save protected billing settings. The previous source is still selected.');}
  finally{await rm(tmp,{force:true}).catch(()=>{});}
  record=next;storageError=false;revision++;
 }
 async function command(input){
  if(input?.type==='status')return status();
  if(!input||!['select','saveApiKey','linkBilling'].includes(input.type))throw Error('Unknown billing action.');
  if(busy||isActive())throw Error('Finish running or queued work before changing the billing source.');
  busy=true;
  try{
   const next={...record};
   if(input.type==='saveApiKey'){if(!validKey(input.key))throw Error('Enter a valid Meta API key.');next.key=input.key;next.mode='api';next.billingAccountId=null;}
   if(input.type==='select'){
    if(!['account','api'].includes(input.source))throw Error('Choose a Muse account or API billing.');
    if(input.source==='api'&&!record.key)throw Error('Add a Meta API key first.');
    if(input.source==='account'){
     const result=await probe({binary:getBinary(),environment:base()});
     if(result.state!=='accountLogin')throw Error('Please sign in with your Muse Code account first. A stored API key cannot use a subscription.');
    }
    next.mode=input.source;
   }
   if(input.type==='linkBilling'){
    if(record.mode!=='api'||!validAccount(input.accountId))throw Error('Connect the Meta billing account for your API key first.');
    const billing=await readBilling();
    if(!billing?.accountId||billing.accountId!==input.accountId)throw Error('Refresh the connected billing account before linking its usage.');
    next.billingAccountId=input.accountId;
   }
   await beforeChange();await save(next);
   return snapshot();
  }finally{busy=false;}
 }
 async function signIn(start){
  if(busy||isActive())throw Error('Finish running or queued work before signing in.');
  // Reserve before the first await; IPC rejects new work until onboarding owns login.
  busy=true;
  try{await beforeChange();return await start();}finally{busy=false;}
 }
 async function credentials({binary,environment:env}){
  if(busy)throw Error('Billing source is changing. Try again when it finishes.');
  const captured=revision,r={...record},providerEnv=envFor(r,env);
  async function verify(){
   if(busy||captured!==revision)throw Error('Billing source changed. Reconnect before sending the next request.');
   if(r.mode==='account'){
    const result=await probe({binary,environment:providerEnv});
    if(result.state!=='accountLogin')throw Error('Please sign in with your Muse Code account in Usage & billing before sending.');
   }
   if(busy||captured!==revision)throw Error('Billing source changed. Reconnect before sending the next request.');
  }
  await verify();return{environment:providerEnv,source:r.mode,verify};
 }
 return{status,command,credentials,signIn,isBusy:()=>busy};
}
function validKey(key){return typeof key==='string'&&key.length>=10&&key.length<=8192&&!/[\s\x00-\x1f\x7f]/.test(key);}
function validAccount(id){return typeof id==='string'&&/^[\w-]{1,200}$/.test(id);}
