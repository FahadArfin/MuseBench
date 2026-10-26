import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateArtifact} from '../shared/work-artifacts.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SECRET=/^[A-Za-z0-9_-]{43}$/;
const ROLES=['owner','editor','commenter','viewer'];
const clone=value=>structuredClone(value);
function text(value,max=160,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))throw Error('Invalid shared-space text.');return value;}
function id(value){if(typeof value!=='string'||!UUID.test(value))throw Error('Invalid shared-space identifier.');return value;}
function list(value,max){if(!Array.isArray(value)||value.length>max)throw Error('The space response exceeds its supported limits.');return value;}
function date(value){return typeof value==='string'&&value.length<40?value:'';}
function member(value){if(!value||!ROLES.includes(value.role))throw Error('Invalid space member.');return{id:id(value.id),name:text(value.name,100),role:value.role,joinedAt:date(value.joinedAt)};}
function summary(value){if(!value||!['note','artifact'].includes(value.type)||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('Invalid shared page.');return{id:id(value.id),title:text(value.title),type:value.type,revision:value.revision,updatedAt:date(value.updatedAt),updatedBy:typeof value.updatedBy==='string'?text(value.updatedBy,100,true):''};}
function snapshot(value){return{space:{id:id(value.space?.id),name:text(value.space.name,100),description:text(value.space.description??'',2000,true),createdAt:date(value.space.createdAt)},self:member(value.self),members:list(value.members,100).map(member),pages:list(value.pages,100).map(summary),invites:list(value.invites,200).map(v=>{if(!['viewer','commenter','editor'].includes(v.role))throw Error('Invalid invitation role.');return{id:id(v.id),role:v.role,expiresAt:date(v.expiresAt),used:v.used===true,revoked:v.revoked===true};})};}
function pageResponse(value){const page=summary(value.page);if(page.type==='artifact')page.artifact=validateArtifact(value.page.artifact);else page.body=text(value.page.body??'',100000,true);return{page,comments:list(value.comments,200).map(v=>({id:id(v.id),text:text(v.text,4000),by:text(v.by,100),createdAt:date(v.createdAt),resolved:v.resolved===true,canResolve:v.canResolve===true})),history:list(value.history,30).map(v=>{if(!Number.isSafeInteger(v.revision)||v.revision<1)throw Error('Invalid page revision.');return{revision:v.revision,title:text(v.title),by:text(v.by,100),at:date(v.at)};})};}

export function spaceServerUrl(value){
 const url=new URL(text(value,1000));
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['https:','http:'].includes(url.protocol))throw Error('Use a server origin without a path, credentials, or query.');
 if(url.protocol==='http:'&&!['127.0.0.1','[::1]'].includes(url.hostname))throw Error('Shared-space servers require HTTPS outside this computer.');
 return url.origin;
}
export function parseSpaceInvitation(value){
 const url=new URL(text(value,2200));
 if(url.protocol!=='musebench-space:'||!['join','owner'].includes(url.hostname)||url.username||url.password||url.port||url.pathname||[...url.searchParams.keys()].sort().join(',')!=='server,space')throw Error('Paste a complete MuseBench space invitation.');
 const secret=url.hash.slice(1);if(!SECRET.test(secret))throw Error('This invitation is incomplete or invalid.');
 return{url:spaceServerUrl(url.searchParams.get('server')),spaceId:id(url.searchParams.get('space')),secret,...(url.hostname==='owner'?{owner:true}:{})};
}
export function makeSpaceInvitation(url,spaceId,secret){if(!SECRET.test(secret))throw Error('Invalid invitation secret.');return`musebench-space://join?server=${encodeURIComponent(spaceServerUrl(url))}&space=${id(spaceId)}#${secret}`;}

export async function createSpacesClient({dataDir,encrypt,decrypt,getLocalHub,fetcher=fetch,publishWork,copyToWork}={}){
 if(!path.isAbsolute(dataDir??'')||typeof encrypt!=='function'||typeof decrypt!=='function')throw Error('Secure Spaces storage is unavailable.');
 await fs.mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'connections.bin');
 let connections=[],activeId=null,readable=true,closed=false,queue=Promise.resolve();const listeners=new Set(),requests=new Set();
 let current={snapshot:null,page:null,comments:[],history:[],error:null,conflict:false,busy:false,lastSynced:null,invitation:null,hosting:null};
 try{
  const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw Error('Invalid connection storage.');
  const saved=JSON.parse(decrypt(await fs.readFile(file)));if(saved.version!==1)throw Error('Unsupported connection storage.');
  connections=list(saved.connections,100).map(v=>{if(!SECRET.test(v.token))throw Error('Invalid saved membership.');return{id:id(v.id),spaceId:id(v.spaceId),name:text(v.name,100),url:spaceServerUrl(v.url),local:v.local===true,token:v.token};});
  if(new Set(connections.map(v=>v.id)).size!==connections.length)throw Error('Duplicate saved connections.');
  activeId=connections.some(v=>v.id===saved.activeId)?saved.activeId:null;
 }catch(error){if(error.code!=='ENOENT'){readable=false;current.error='Saved Spaces connections could not be decrypted. The original file was preserved.';}}
 const getState=()=>clone({...current,activeId,spaces:connections.map(({token,...safe})=>safe)});
 const emit=()=>{if(!closed)for(const listener of listeners)try{listener(getState());}catch{}};
 const connection=()=>{const found=connections.find(v=>v.id===activeId);if(!found)throw Error('Create or join a space first.');return found;};
 const clearPage=()=>{current.page=null;current.comments=[];current.history=[];};
 async function preflightStorage(){
  if(!readable)throw Error('Restore secure connection storage before joining or creating a space.');
  try{const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe connection storage.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const probe=path.join(dataDir,`.credential-check-${randomUUID()}.tmp`);
  try{await fs.writeFile(probe,encrypt('{"check":"MuseBench Spaces"}'),{flag:'wx',mode:0o600});}finally{await fs.unlink(probe).catch(()=>{});}
 }
 async function persist(){
  if(!readable)throw Error('Original Spaces connections are unreadable and will not be overwritten.');
  try{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink())throw Error('Unsafe connection storage.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=path.join(dataDir,`.connections-${randomUUID()}.tmp`);
  try{await fs.writeFile(temporary,encrypt(JSON.stringify({version:1,activeId,connections})),{flag:'wx',mode:0o600});await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
 }
 async function request(origin,token,body){
  if(closed)throw Error('Spaces is closing.');
  const payload=JSON.stringify(body);if(Buffer.byteLength(payload)>800*1024)throw Error('The shared content is too large.');
  const abort=new AbortController();requests.add(abort);const timer=setTimeout(()=>abort.abort(),12000);
  try{
   const response=await fetcher(`${spaceServerUrl(origin)}/v1`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:payload,signal:abort.signal});
   let raw='';const reader=response.body?.getReader();let bytes=0;const chunks=[];
   if(reader){try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>8*1024*1024)throw Error('The space response is too large.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}raw=Buffer.concat(chunks).toString('utf8');}
   let result;try{result=JSON.parse(raw);}catch{throw Error('The server returned an invalid Spaces response.');}
   if(!response.ok){let message=typeof result.error==='string'?result.error.slice(0,500):'The space request failed.';for(const sensitive of [token,body.secret])if(typeof sensitive==='string'&&sensitive)message=message.split(sensitive).join('[credential]');const error=Error(message);error.status=response.status;error.code=result.code;throw error;}
   return result;
  }catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw Error(closed?'Spaces is closing.':'The space server did not respond in time. Your local draft is unchanged.');if(error.message==='fetch failed')throw Error('The space server is unavailable. Check its address and try Refresh.');throw error;}
  finally{clearTimeout(timer);requests.delete(abort);}
 }
 const api=async(op,fields={})=>{
  const c=connection();
  // Never send an owned hub credential to a process that merely took its port.
  if(c.local){if(!getLocalHub)throw Error('This profile cannot start its local Spaces host.');const local=await getLocalHub();if(spaceServerUrl(local.url)!==c.url)throw Error('The saved local Spaces address does not match its running host.');}
  return request(c.url,c.token,{...fields,op,spaceId:c.spaceId});
 };
 async function read(pageId=current.page?.id){
  const value=snapshot(await api('read'));if(value.space.id!==connection().spaceId)throw Error('The server returned a different space.');
  current.snapshot=value;connection().name=value.space.name;
  if(pageId&&value.pages.some(v=>v.id===pageId)){const details=pageResponse(await api('page',{pageId}));if(details.page.id!==pageId)throw Error('The server returned a different page.');Object.assign(current,details);}else clearPage();
  current.lastSynced=new Date().toISOString();
 }
 async function addCredential(url,result,name,local){
  if(!SECRET.test(result?.token)||!UUID.test(result?.spaceId))throw Error('The server did not return a valid membership.');
  const existing=connections.find(v=>v.url===url&&v.spaceId===result.spaceId);
  if(existing)throw Error('This space is already connected.');
  const entry={id:randomUUID(),spaceId:result.spaceId,url,name,local,token:result.token};connections.push(entry);activeId=entry.id;clearPage();current.snapshot=null;current.invitation=null;
  await persist();await read();await persist();
 }
 async function perform(command){
  if(!command||typeof command!=='object'||Array.isArray(command)||typeof command.type!=='string')throw Error('Invalid Spaces action.');
  switch(command.type){
   case 'clearError':current.error=null;current.conflict=false;return;
   case 'clearInvitation':current.invitation=null;return;
   case 'create':{
    if(!readable)throw Error('Restore secure connection storage before creating a space.');
    if(connections.length>=100)throw Error('You have reached the 100 connected spaces limit.');
    if(!getLocalHub)throw Error('Local Spaces hosting is unavailable.');
    const fields={name:text(command.name,100),description:text(command.description,2000,true),displayName:text(command.displayName,100)};
    await preflightStorage();const hub=await getLocalHub();if(closed)throw Error('Spaces is closing.');current.hosting={url:hub.url,scope:'local'};
    await addCredential(spaceServerUrl(hub.url),await hub.createSpace(fields),fields.name,true);return;
   }
   case 'join':{
    if(!readable)throw Error('Restore secure connection storage before joining a space.');
    if(connections.length>=100)throw Error('You have reached the 100 connected spaces limit.');
    const invitation=parseSpaceInvitation(command.invitation);
    if(connections.some(v=>v.url===invitation.url&&v.spaceId===invitation.spaceId))throw Error('This space is already connected.');
    const displayName=text(command.displayName,100);await preflightStorage();
    const result=await request(invitation.url,null,{op:invitation.owner?'claimOwner':'join',spaceId:invitation.spaceId,secret:invitation.secret,displayName});
    await addCredential(invitation.url,result,'Shared space',false);return;
   }
   case 'select':{id(command.id);if(!connections.some(v=>v.id===command.id))throw Error('Saved space not found.');activeId=command.id;current.snapshot=null;current.invitation=null;clearPage();await persist();await read();return;}
   case 'refresh':if(activeId)await read();return;
   case 'openPage':{const pageId=id(command.pageId);const result=pageResponse(await api('page',{pageId}));if(result.page.id!==pageId)throw Error('The server returned a different page.');Object.assign(current,result);current.lastSynced=new Date().toISOString();return;}
   case 'savePage':{const result=await api('savePage',{...(command.pageId?{pageId:id(command.pageId),expectedRevision:command.expectedRevision}:{}),title:text(command.title),type:'note',body:text(command.body,100000,true)});await read(id(result.pageId));return;}
   case 'comment':await api('comment',{pageId:id(command.pageId),text:text(command.text,4000)});await read(command.pageId);return;
   case 'resolveComment':if(typeof command.resolved!=='boolean')throw Error('Invalid comment status.');await api('resolveComment',{pageId:id(command.pageId),commentId:id(command.commentId),resolved:command.resolved});await read(command.pageId);return;
   case 'restorePage':await api('restorePage',{pageId:id(command.pageId),revision:command.revision,expectedRevision:command.expectedRevision});await read(command.pageId);return;
   case 'invite':{
    if(!['editor','commenter','viewer'].includes(command.role))throw Error('Choose an invitation role.');
    const result=await api('invite',{role:command.role});current.invitation={text:makeSpaceInvitation(connection().url,connection().spaceId,result.secret),expiresAt:date(result.expiresAt)};await read();return;
   }
   case 'revokeInvite':await api('revokeInvite',{inviteId:id(command.inviteId)});current.invitation=null;await read();return;
   case 'removeMember':await api('removeMember',{memberId:id(command.memberId)});await read();return;
   case 'publishWork':{
    if(!publishWork)throw Error('Work publishing is unavailable.');const artifact=validateArtifact(await publishWork(id(command.workId)));
    const result=await api('savePage',{...(command.pageId?{pageId:id(command.pageId),expectedRevision:command.expectedRevision}:{}),title:artifact.title,type:'artifact',artifact});await read(id(result.pageId));return;
   }
   case 'copyToWork':{
    if(!copyToWork)throw Error('Copy to Work is unavailable.');if(!['finance','operations','marketing','sales','analytics','engineering'].includes(command.team))throw Error('Choose a Work team.');
    const result=pageResponse(await api('page',{pageId:id(command.pageId)}));if(result.page.id!==command.pageId||!result.page.artifact)throw Error('Choose a published Work artifact.');await copyToWork(result.page.artifact,command.team);return;
   }
   default:throw Error('Unsupported Spaces action.');
  }
 }
 return{
  getState,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  dispatch(command){
   const pending=queue.then(async()=>{
    if(closed)throw Error('Spaces is closed.');const refresh=command?.type==='refresh';if(!refresh){current.error=null;current.conflict=false;current.busy=true;emit();}
    try{await perform(command);if(refresh&&!current.conflict)current.error=null;}catch(error){current.error=String(error.message||'The space request failed.').slice(0,600);current.conflict=error.code==='CONFLICT'||(error.status===409&&!error.code);if([401,403].includes(error.status)){current.snapshot=null;current.invitation=null;clearPage();}}
    finally{current.busy=false;emit();}return getState();
   });queue=pending.catch(()=>{});return pending;
  },
  async getArtifact(pageId){return current.snapshot&&current.page?.id===pageId&&current.page.type==='artifact'?clone(current.page.artifact):null;},
  async close(){closed=true;for(const abort of requests)abort.abort();await queue;listeners.clear();}
 };
}
