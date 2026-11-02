import {readFile,writeFile,rename,rm,realpath,stat,open,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {validateDesktopInput,validateDesktopCommand} from '../src/shared/desktop-assist.mjs';

const blocked=/^(?:musebench(?:control|desktop)?|chatgpt|codex|cmd|powershell|pwsh|windowsterminal|wt|conhost|openconsole|consent|logonui|credentialuibroker|runas|regedit|taskmgr|mmc|rundll32|wscript|cscript|mshta|bash|wsl|mintty|git-bash|pythonw?|node)(?:\.exe)?$/i;
const inputOps=new Set(['click','type','key','scroll','drag']);
const clean=(value,max=200)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max):'';
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const sameRect=(a,b)=>a&&b&&['x','y','width','height'].every(key=>Number.isFinite(a[key])&&a[key]===b[key]);
const sameWindow=(a,b)=>a&&b&&a.handle===b.handle&&a.pid===b.pid&&a.startedAt===b.startedAt&&samePath(a.executable,b.executable)&&sameRect(a.rect,b.rect);

/** App authorization belongs to the host, never to model arguments or page UI. */
export async function createDesktopAssist({dataDir,getState,helper,normalizeImage,onState=()=>{},beginVisual,platform=process.platform,approvalTimeoutMs=120000,now=Date.now}={}){
 if(!path.isAbsolute(dataDir)||typeof getState!=='function')throw Error('Desktop Assist requires a trusted profile and owner.');
 const file=path.join(dataDir,'desktop-assist.json'),supported=platform==='win32',available=supported&&!!helper?.available;
 let enabled=true,stopped=false,closed=false,active=null,pending=null,busy=false,error='',persistQueue=Promise.resolve(),policyEpoch=0;
 const saved=new Map(),catalog=new Map(),leases=new Map(),identities=new Map();
 try{const config=JSON.parse(await readFile(file,'utf8'));if(config.version===1){enabled=config.enabled!==false;for(const app of (config.apps??[]).slice(0,200))if(typeof app.id==='string'&&/^[a-f0-9]{64}$/.test(app.id)&&typeof app.name==='string'&&typeof app.path==='string'&&path.isAbsolute(app.path))saved.set(app.id,{id:app.id,name:clean(app.name),path:app.path});}}catch{}
 const snapshot=()=>({supported,available,enabled,stopped,active:active?{...active}:null,pending:pending?{id:pending.id,taskId:pending.binding.taskId,appId:pending.app.id,appName:pending.app.name,reason:pending.reason,expiresAt:pending.expiresAt}:null,allowedApps:[...saved.values()].map(app=>({...app})),...(error?{error}:{})});
 const emit=()=>{try{onState(snapshot());}catch{}};
 const persist=()=>{const contents=JSON.stringify({version:1,enabled,apps:[...saved.values()]})+'\n';const operation=persistQueue.then(async()=>{await mkdir(dataDir,{recursive:true});const tmp=file+'.'+randomUUID();try{await writeFile(tmp,contents,{flag:'wx',mode:0o600});await rename(tmp,file);}finally{await rm(tmp,{force:true});}});persistQueue=operation.catch(()=>{});return operation;};
 function assertOwner(binding,requireAccess=true){
  const state=getState();if(closed||!binding||!binding.isCurrent?.()||state.task?.id!==binding.taskId||!samePath(state.activeProject?.root,binding.root)||state.task?.mode!=='muse'||!state.runtime?.permissionVerified||state.runtime.status!=='running'||state.runtime.planning)throw Error('The desktop request owner changed.');
  if(requireAccess){if(!enabled)throw Error('Enable Desktop Assist in Settings before using desktop apps.');if(stopped)throw Error('Desktop Assist is stopped. Only the user can resume it.');if(!available)throw Error('Native Desktop Assist is unavailable on this host.');}
 }
 function lease(binding){assertOwner(binding);if(typeof binding.leaseId!=='string'||!binding.leaseId)throw Error('Missing desktop connection identity.');let value=leases.get(binding.leaseId);if(!value){value={binding:{...binding,isCurrent:binding.isConnected??binding.isCurrent},grants:new Set(),windows:new Map(),observations:new Map()};leases.set(binding.leaseId,value);}return value;}
 async function identity(executable,name){
  if(typeof executable!=='string'||!path.isAbsolute(executable)||blocked.test(path.basename(executable)))throw Error('This application cannot be controlled by Desktop Assist.');
  const canonical=await realpath(executable),handle=await open(canonical,'r');
  try{const before=await handle.stat();if(!before.isFile()||before.size>256*1024*1024)throw Error('Application identity cannot be verified.');const cached=identities.get(canonical);if(cached&&cached.signature.ino===before.ino&&cached.signature.size===before.size&&cached.signature.mtimeMs===before.mtimeMs&&cached.signature.ctimeMs===before.ctimeMs)return{...cached,name:clean(name)||cached.name};const hash=createHash('sha256'),buffer=Buffer.alloc(128*1024);let offset=0;
   while(offset<before.size){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset);if(!bytesRead)throw Error('Application identity changed.');hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}
   const after=await handle.stat(),current=await stat(canonical);if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||after.ino!==current.ino||after.size!==current.size||after.mtimeMs!==current.mtimeMs)throw Error('Application identity changed.');
   const digest=hash.digest('hex'),id=createHash('sha256').update(canonical.toLowerCase()+'\0'+digest).digest('hex'),value={id,name:clean(name)||path.basename(canonical),path:canonical,signature:{ino:after.ino,size:after.size,mtimeMs:after.mtimeMs,ctimeMs:after.ctimeMs}};identities.set(canonical,value);return value;
  }finally{await handle.close();}
 }
 async function currentApp(id){const app=catalog.get(id);if(!app)throw Error('List desktop apps again; this app identity is unknown.');const next=await identity(app.path,app.name);if(next.id!==id)throw Error('Application identity changed. List desktop apps again.');return app;}
 function cancelPending(message){if(!pending)return;const request=pending;pending=null;clearTimeout(request.timer);clearInterval(request.watch);request.reject(Error(message));emit();}
 function invalidate(){policyEpoch++;for(const value of leases.values()){value.grants.clear();value.observations.clear();value.windows.clear();}active=null;cancelPending('Desktop access was revoked.');helper?.cancel?.();emit();}
 async function authorize(binding,app,reason){
  const owner=lease(binding);if(owner.grants.has(app.id)||saved.has(app.id))return;
  if(pending)throw Error('Another desktop app approval is pending.');
  await new Promise((resolve,reject)=>{const request={id:randomUUID(),app,binding,reason,resolve,reject,expiresAt:now()+approvalTimeoutMs};pending=request;
   request.timer=setTimeout(()=>cancelPending('Desktop app approval expired.'),approvalTimeoutMs);request.timer.unref?.();
   request.watch=setInterval(()=>{try{assertOwner(binding);}catch{if(pending===request)cancelPending('The desktop request owner changed.');}},250);request.watch.unref?.();emit();
  });assertOwner(binding);await currentApp(app.id);if(!owner.grants.has(app.id)&&!saved.has(app.id))throw Error('Desktop app access was revoked.');
 }
 async function native(binding,input,guard=()=>{}){assertOwner(binding);guard();const result=await helper.call(input);assertOwner(binding);guard();if(!result?.ok)throw Object.assign(Error(clean(result?.error?.message,400)||'Desktop operation failed.'),{uncertain:!!result?.uncertain});return result;}
 const activate=(binding,app,windowId='')=>{active={taskId:binding.taskId,appId:app.id,appName:app.name,windowId,since:new Date(now()).toISOString()};emit();};
 function windowFor(owner,id){const value=owner.windows.get(id);if(!value)throw Error('List the approved app windows again.');return value;}
 async function refreshWindow(binding,value,guard){
  const result=await native(binding,{op:'windows',executable:value.app.path},guard),window=result.windows?.find(w=>w.handle===value.window.handle&&w.pid===value.window.pid&&w.startedAt===value.window.startedAt&&samePath(w.executable,value.app.path));
  if(!window||window.elevated)throw Error('The approved window changed or is unavailable.');value.window=window;return window;
 }
 async function agentCommand(binding,value){
  const input=validateDesktopInput(value);if(input.type==='status'){assertOwner(binding,false);return snapshot();}const owner=lease(binding),operationEpoch=policyEpoch;
  const operation=()=>{assertOwner(binding);if(operationEpoch!==policyEpoch)throw Error('Desktop app access was revoked.');};
  if(busy)throw Error('Another Desktop Assist action is running.');busy=true;
  try{
   if(input.type==='release'){owner.grants.clear();owner.windows.clear();owner.observations.clear();if(active?.taskId===binding.taskId)active=null;emit();return{released:true};}
   if(input.type==='apps'){
    const result=await native(binding,{op:'apps'},operation),apps=[];catalog.clear();
    for(const entry of (result.apps??[]).slice(0,200)){try{const app=await identity(entry.executable,entry.name);operation();catalog.set(app.id,{...app,nativeId:entry.id,launchable:entry.launchable!==false});if(!apps.some(row=>row.id===app.id))apps.push({id:app.id,name:app.name,allowed:saved.has(app.id)||owner.grants.has(app.id),launchable:entry.launchable!==false});}catch(cause){operation();}}
    return{apps};
   }
   let app,selected;
   if(input.appId)app=await currentApp(input.appId);
   if(input.windowId){selected=windowFor(owner,input.windowId);app??=await currentApp(selected.app.id);if(selected.app.id!==app.id)throw Error('Window does not belong to this approved app.');}
   operation();if(!app)throw Error('Choose an app returned by desktop_apps.');
   await authorize(binding,app,'Muse wants to '+({windows:'inspect windows in',open:'open or focus',capture:'capture',inspect:'inspect'}[input.type]??'interact with')+' '+app.name+'.');
   const access=()=>{operation();if(!owner.grants.has(app.id)&&!saved.has(app.id))throw Error('Desktop app access was revoked.');};access();activate(binding,app,input.windowId??'');
   if(input.type==='windows'){
    const result=await native(binding,{op:'windows',executable:app.path},access),windows=[];
    owner.windows.clear();owner.observations.clear();
    for(const window of (result.windows??[]).slice(0,40))if(!window.elevated&&samePath(window.executable,app.path)){const id=randomUUID();owner.windows.set(id,{app,window});windows.push({id,appId:app.id,title:clean(window.title),bounds:window.rect});}return{windows};
   }
   if(input.type==='open'){const result=await native(binding,{op:'open',app:{id:app.nativeId,name:app.name,executable:app.path},...(selected?{window:await refreshWindow(binding,selected,access)}:{})},access);owner.observations.clear();return{opened:!!(result.launched||result.focused),...('pid'in result?{pid:result.pid}:{})};}
   if(input.type==='inspect'||input.type==='capture'){
    const window=await refreshWindow(binding,selected,access),observationId=randomUUID();owner.observations.clear();
    const result=await native(binding,{op:input.type,window},access);
    if(!sameWindow(window,result.window)||input.type==='capture'&&(!sameRect(window.rect,result.bounds)||result.width!==window.rect.width||result.height!==window.rect.height))throw Error('The desktop snapshot bounds or identity changed; inspect again.');
    const observation={windowId:input.windowId,window,at:now(),refs:new Map()};owner.observations.set(observationId,observation);
    if(input.type==='inspect'){const elements=(result.elements??[]).slice(0,160).map((element,index)=>{const ref='e'+index;observation.refs.set(ref,element);return{ref,name:element.protected?'Protected control':clean(element.name),role:clean(element.role),bounds:element.rect,enabled:element.enabled===true,protected:!!element.protected};});return{windowId:input.windowId,observationId,title:clean(window.title),elements};}
    if(typeof normalizeImage!=='function')throw Error('Desktop screenshot normalization is unavailable.');const encoded=result.data??result.imageDataUrl?.split(',')[1];if(typeof encoded!=='string'||encoded.length>28*1024*1024)throw Error('Invalid desktop capture.');
    const record=beginVisual?.(binding),image=await normalizeImage(Buffer.from(encoded,'base64'),{mimeType:'image/png',width:result.width,height:result.height});access();if(record)await record({...image,kind:'capture',name:app.name+' screenshot'});access();return{windowId:input.windowId,observationId,app:app.name,...image};
   }
   if(inputOps.has(input.type)){
    const observed=owner.observations.get(input.observationId);if(!observed||observed.windowId!==input.windowId||now()-observed.at>30000)throw Error('Inspect or capture this window again; the observation expired.');
    const target=input.ref?observed.refs.get(input.ref):null;if(input.ref&&!target)throw Error('Inspect this desktop control again.');if(target?.protected)throw Error('Protected controls cannot receive desktop input.');
    const request={op:input.type,window:observed.window,...(target?{runtimeId:target.runtimeId}:{}),...(input.x!==undefined?{point:{x:input.x,y:input.y}}:{}),...(input.type==='drag'?{endPoint:{x:input.toX,y:input.toY}}:{}),...(input.text!==undefined?{text:input.text}:{}),...(input.key?{key:input.key,modifiers:input.modifiers??[]}:{}),...(input.type==='scroll'?{delta:{x:Math.sign(input.deltaX)*Math.ceil(Math.abs(input.deltaX)/120),y:Math.sign(input.deltaY)*Math.ceil(Math.abs(input.deltaY)/120)}}:{})};
    owner.observations.clear();try{await native(binding,request,access);}catch(cause){throw Error(clean(cause.message,300)+(cause.uncertain?' The input outcome is unknown; inspect before retrying.':''));}return{completed:true,inspectAgain:true};
   }
   throw Error('Unsupported desktop operation.');
  }finally{busy=false;}
 }
 async function command(value){const input=validateDesktopCommand(value);if(closed)throw Error('Desktop Assist is closed.');error='';
  if(input.type==='set'){if(input.enabled&&!available)throw Error('Desktop Assist is unavailable on this host.');enabled=input.enabled;if(!enabled)invalidate();await persist();}
  if(input.type==='stop'){stopped=true;invalidate();}
  if(input.type==='resume'){stopped=false;}
  if(input.type==='revoke'){policyEpoch++;saved.delete(input.appId);for(const l of leases.values())l.grants.delete(input.appId);if(pending?.app.id===input.appId)cancelPending('Desktop access was revoked.');if(active?.appId===input.appId)invalidate();await persist();}
  if(input.type==='decide'){
   const request=pending,decisionEpoch=policyEpoch;if(!request||request.id!==input.id)throw Error('This desktop approval expired.');
   try{assertOwner(request.binding);if(now()>=request.expiresAt)throw Error('Desktop approval expired.');await currentApp(request.app.id);assertOwner(request.binding);if(pending!==request||decisionEpoch!==policyEpoch||now()>=request.expiresAt)throw Error('This desktop approval expired or was revoked.');}catch(cause){if(pending===request)cancelPending(cause.message);return snapshot();}
   pending=null;clearTimeout(request.timer);clearInterval(request.watch);
   if(input.decision==='deny')request.reject(Error('Desktop app access denied by the user.'));
   else{const owner=lease(request.binding);owner.grants.add(request.app.id);if(input.decision==='always'){saved.set(request.app.id,{id:request.app.id,name:request.app.name,path:request.app.path});try{await persist();assertOwner(request.binding);if(decisionEpoch!==policyEpoch)throw Error('Desktop access was revoked.');}catch(cause){saved.delete(request.app.id);owner.grants.delete(request.app.id);await persist().catch(()=>{});request.reject(cause);emit();throw cause;}}request.resolve();}
  }
  emit();return snapshot();
 }
 return{snapshot,command,agentCommand,isBusy:()=>busy||!!pending,reconcile(){for(const owner of leases.values())try{assertOwner(owner.binding);}catch{if(active?.taskId===owner.binding.taskId)invalidate();if(pending?.binding.leaseId===owner.binding.leaseId)cancelPending('The desktop request owner changed.');leases.delete(owner.binding.leaseId);}},revokeLease(id){const owner=leases.get(id);if(pending?.binding.leaseId===id)cancelPending('Desktop connection changed.');if(active?.taskId===owner?.binding.taskId){active=null;helper?.cancel?.();}leases.delete(id);emit();},async close(){if(closed)return;closed=true;invalidate();await helper?.close?.();await persistQueue;}};
}
