import path from 'node:path';
import {promises as fs,constants as FS} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {validateWorkDocument} from '../shared/work-documents.mjs';
import {applyWorkOperations} from '../shared/work-operations.mjs';

const MAX_DOCUMENT_BYTES=16*1024*1024,MAX_POINTER_BYTES=2*1024*1024,MAX_VERSIONS=10000;
const ORIGINS=new Set(['user','muse','import','restore']);
const SNAPSHOT=/^r(0|[1-9]\d*)-([a-f0-9]{64})\.json$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const isRevision=value=>Number.isSafeInteger(value)&&value>=0;

export class WorkDocumentStoreError extends Error{
  constructor(code,message,details={}){super(message);this.name='WorkDocumentStoreError';this.code=code;Object.assign(this,details);}
}
const fault=(code,message,details)=>new WorkDocumentStoreError(code,message,details);
const samePath=(a,b)=>path.relative(a,b)==='';

// Inspect every ancestor: Windows junctions must not turn a managed reference
// into access outside this service's root. Inputs never become path components.
async function inspect(target,{missing=false,directory=false}={}){
  if(typeof target!=='string'||!path.isAbsolute(target)||target.includes('\0')||target.split(/[\\/]/).includes('..'))throw fault('PATH_UNSAFE','Work document storage requires an absolute managed path.');
  target=path.resolve(target);let current=path.parse(target).root;
  for(const part of path.relative(current,target).split(path.sep).filter(Boolean)){
    current=path.join(current,part);let stat;
    try{stat=await fs.lstat(current);}catch(error){if(missing&&error.code==='ENOENT')return target;throw error;}
    if(stat.isSymbolicLink()||!samePath(current,await fs.realpath(current)))throw fault('PATH_UNSAFE','Symbolic links and junctions are not allowed in Work document storage.');
    if(current!==target&&!stat.isDirectory())throw fault('PATH_UNSAFE','A Work document storage ancestor is not a folder.');
    if(current===target&&directory&&!stat.isDirectory())throw fault('PATH_UNSAFE','The Work document storage folder is invalid.');
  }
  return target;
}
async function directory(target){await inspect(target,{missing:true});await fs.mkdir(target,{recursive:true});await inspect(target,{directory:true});}
async function boundedRead(target,limit){
  await inspect(target);const handle=await fs.open(target,FS.O_RDONLY|(FS.O_NOFOLLOW??0));
  try{
    const opened=await handle.stat();if(!opened.isFile()||opened.size>limit)throw fault('CORRUPT','Work document file exceeds its size limit or is not a regular file.');
    const buffer=Buffer.alloc(Math.min(opened.size+1,limit+1));let count=0;
    while(count<buffer.length){const result=await handle.read(buffer,count,buffer.length-count,null);if(!result.bytesRead)break;count+=result.bytesRead;}
    if(count>limit||count!==opened.size)throw fault('CORRUPT','Work document changed while being read.');
    await inspect(target);const current=await fs.lstat(target);
    if(current.ino!==opened.ino||(current.dev!==0&&opened.dev!==0&&current.dev!==opened.dev))throw fault('PATH_UNSAFE','Work document file ownership changed while being read.');
    const bytes=buffer.subarray(0,count),text=bytes.toString('utf8');
    if(bytes.includes(0)||!Buffer.from(text,'utf8').equals(bytes))throw fault('CORRUPT','Work document storage must contain UTF-8 JSON.');
    return text;
  }finally{await handle.close();}
}
async function syncDirectory(parent){
  let handle;
  try{handle=await fs.open(parent,FS.O_RDONLY);await handle.sync();}
  catch(error){if(!['EISDIR','EPERM','EACCES','EINVAL','ENOTSUP','EBADF'].includes(error.code))throw error;}
  finally{await handle?.close();}
}
async function atomicWrite(target,text){
  const parent=path.dirname(target);await inspect(parent,{directory:true});await inspect(target,{missing:true});
  const temporary=path.join(parent,`.work-document-${randomUUID()}.tmp`);let owned=false;
  try{
    const handle=await fs.open(temporary,FS.O_WRONLY|FS.O_CREAT|FS.O_EXCL|(FS.O_NOFOLLOW??0),0o600);owned=true;
    try{await handle.writeFile(text,'utf8');await handle.sync();}finally{await handle.close();}
    await inspect(parent,{directory:true});await inspect(target,{missing:true});await fs.rename(temporary,target);owned=false;
    await syncDirectory(parent);
  }finally{if(owned){try{await inspect(temporary);await fs.unlink(temporary);}catch{/* Never unlink a file whose ownership changed. */}}}
}
function itemIdentity(value){
  if(typeof value!=='string'||!value.trim()||value.length>512||value.includes('\0'))throw fault('INVALID','Choose a valid Work item ID.');
  return value;
}
function validateSnapshot(value,itemId){
  let document;
  try{document=validateWorkDocument(value);}catch(error){throw fault(value?.version>2?'UNSUPPORTED':'INVALID',String(error.message).slice(0,1000));}
  if(document.id!==itemId)throw fault('INVALID','Work document identity must match its owning item.');
  const text=JSON.stringify(document);
  if(Buffer.byteLength(text)>MAX_DOCUMENT_BYTES)throw fault('INVALID','Work document exceeds the 16 MiB storage limit.');
  return document;
}
function validatePointer(value,itemId){
  if(value?.version>1)throw fault('UNSUPPORTED','This Work revision history was saved by a newer application version. Its files have been preserved.');
  if(!value||value.version!==1||value.itemId!==itemId||!isRevision(value.head)||!Array.isArray(value.history)||!value.history.length||value.history.length>MAX_VERSIONS)throw fault('CORRUPT','The Work revision pointer is invalid.');
  const seen=new Set();let previous=-1;
  for(const entry of value.history){
    const match=SNAPSHOT.exec(entry?.file??'');
    if(!entry||!isRevision(entry.revision)||entry.revision<=previous||seen.has(entry.revision)||!match||Number(match[1])!==entry.revision||entry.hash!==match[2]||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_DOCUMENT_BYTES||typeof entry.title!=='string'||entry.title.length>2000||!Number.isFinite(Date.parse(entry.createdAt))||!ORIGINS.has(entry.origin)||entry.name!==undefined&&(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>120))throw fault('CORRUPT','The Work revision history is invalid.');
    seen.add(entry.revision);previous=entry.revision;
  }
  if(previous!==value.head)throw fault('CORRUPT','The Work revision pointer does not identify its latest revision.');
  return clone(value);
}

/** A local, per-item serialized revision journal. Only revisions referenced by
 * the atomically replaced pointer are committed; orphan snapshots are inert.
 * The previous pointer and its snapshots form a bounded recovery reserve. */
export function createWorkDocumentStore({rootDir,maxHistoryCount=100,maxHistoryBytes=64*1024*1024,beforeWrite,now=()=>new Date().toISOString()}={}){
  if(typeof rootDir!=='string'||!path.isAbsolute(rootDir)||rootDir.includes('\0')||rootDir.split(/[\\/]/).includes('..'))throw fault('PATH_UNSAFE','An absolute Work document storage root without traversal is required.');
  if(!Number.isSafeInteger(maxHistoryCount)||maxHistoryCount<2||maxHistoryCount>1000||!Number.isSafeInteger(maxHistoryBytes)||maxHistoryBytes<1024)throw fault('INVALID','Invalid Work revision retention limits.');
  rootDir=path.resolve(rootDir);const queues=new Map();let initialized=false,closed=false,closing=false;
  const paths=itemId=>{itemId=itemIdentity(itemId);const root=path.join(rootDir,digest(itemId));return{root,snapshots:path.join(root,'snapshots'),pointer:path.join(root,'revisions.json'),backup:path.join(root,'revisions.previous.json'),mirror:path.join(root,'work-document.json')};};
  const check=()=>{if(closed||closing)throw fault('CLOSED','Work document storage is closed.');if(!initialized)throw fault('INVALID','Initialize Work document storage before use.');};
  const serialize=(itemId,action)=>{
    try{check();itemIdentity(itemId);}catch(error){return Promise.reject(error);}
    const prior=queues.get(itemId)??Promise.resolve();const next=prior.then(action,action);queues.set(itemId,next);
    void next.finally(()=>{if(queues.get(itemId)===next)queues.delete(itemId);}).catch(()=>{});return next;
  };
  async function initialize(){if(closed||closing)throw fault('CLOSED','Work document storage is closed.');await directory(rootDir);initialized=true;}
  async function loadPointer(itemId){
    const p=paths(itemId);let primaryError;
    try{return{pointer:validatePointer(JSON.parse(await boundedRead(p.pointer,MAX_POINTER_BYTES)),itemId),recovered:false};}
    catch(error){if(['PATH_UNSAFE','UNSUPPORTED'].includes(error.code))throw error;primaryError=error;}
    try{return{pointer:validatePointer(JSON.parse(await boundedRead(p.backup,MAX_POINTER_BYTES)),itemId),recovered:true,recovery:{message:'Recovered the previous committed Work revision pointer.',reason:String(primaryError.message).slice(0,200)}};}
    catch(error){if(['PATH_UNSAFE','UNSUPPORTED'].includes(error.code))throw error;if(primaryError.code==='ENOENT'&&error.code==='ENOENT')throw fault('MISSING','This Work item has no saved visual document.');throw fault('CORRUPT','No valid committed Work revision pointer remains. Original files have been preserved.');}
  }
  async function loadEntry(itemId,entry){
    const text=await boundedRead(path.join(paths(itemId).snapshots,entry.file),MAX_DOCUMENT_BYTES);
    if(Buffer.byteLength(text)!==entry.bytes||digest(text)!==entry.hash)throw fault('CORRUPT','The saved Work revision failed its integrity check.');
    const document=validateSnapshot(JSON.parse(text),itemId);
    if(document.revision!==entry.revision)throw fault('CORRUPT','The saved Work revision number does not match its pointer.');
    return document;
  }
  async function current(itemId,requestedRevision){
    const loaded=await loadPointer(itemId);let lastError;
    const entries=requestedRevision===undefined?[...loaded.pointer.history].reverse():loaded.pointer.history.filter(entry=>entry.revision===requestedRevision);
    if(!entries.length)throw fault('MISSING','That Work revision is no longer retained.');
    for(const entry of entries){
      try{
        const document=await loadEntry(itemId,entry),fallback=entry.revision!==loaded.pointer.head;
        return{...loaded,document,revision:document.revision,recovered:loaded.recovered||fallback,recovery:loaded.recovery??(fallback?{message:'Recovered the last complete validated Work revision.',failedRevision:loaded.pointer.head,recoveredRevision:entry.revision}:undefined)};
      }catch(error){if(error.code==='PATH_UNSAFE'||error.code==='UNSUPPORTED')throw error;lastError=error;}
    }
    if(requestedRevision===undefined&&!loaded.recovered){
      // A single document may exceed the ordinary byte budget. Its prior
      // complete revision is still retained by the previous pointer reserve.
      let backup;
      try{backup=validatePointer(JSON.parse(await boundedRead(paths(itemId).backup,MAX_POINTER_BYTES)),itemId);}catch(error){if(['PATH_UNSAFE','UNSUPPORTED'].includes(error.code))throw error;}
      for(const entry of [...(backup?.history??[])].reverse()){
        if(entries.some(e=>e.file===entry.file))continue;
        try{
          const document=await loadEntry(itemId,entry),history=[...loaded.pointer.history.filter(e=>e.revision!==entry.revision),entry].sort((a,b)=>a.revision-b.revision);
          return{...loaded,pointer:{...loaded.pointer,history},document,revision:document.revision,recovered:true,recovery:{message:'Recovered the last complete validated Work revision from the recovery reserve.',failedRevision:loaded.pointer.head,recoveredRevision:entry.revision}};
        }catch(error){if(['PATH_UNSAFE','UNSUPPORTED'].includes(error.code))throw error;lastError=error;}
      }
    }
    throw fault('CORRUPT',`No readable validated Work revision remains. ${String(lastError?.message??'').slice(0,200)}`);
  }
  async function nextRevision(itemId,head){
    const p=paths(itemId);await inspect(p.snapshots,{directory:true});let maximum=head;
    // Existing snapshot numbers are never reused, including after recovering
    // a corrupt pointer or a crash that left an uncommitted orphan snapshot.
    for(const file of await fs.readdir(p.snapshots)){const match=SNAPSHOT.exec(file);if(match){const revision=Number(match[1]);if(isRevision(revision))maximum=Math.max(maximum,revision);}}
    if(!isRevision(maximum+1))throw fault('INVALID','The Work revision counter is full.');
    return maximum+1;
  }
  const result=value=>({document:clone(value.document),revision:value.document.revision,recovered:Boolean(value.recovered),...(value.recovery?{recovery:clone(value.recovery)}:{})});
  async function writePhase(phase,target,text,context){await beforeWrite?.({phase,path:target,...context});await atomicWrite(target,text);}
  function retainedHistory(history){
    const ordinary=history.filter(entry=>!entry.name),keep=new Set(history.filter(entry=>entry.name).map(entry=>entry.revision));
    let bytes=0,count=0;
    for(const entry of ordinary.reverse()){
      if(count===0||(count<maxHistoryCount&&bytes+entry.bytes<=maxHistoryBytes)){keep.add(entry.revision);count++;bytes+=entry.bytes;}
    }
    keep.add(history.at(-1).revision);
    return history.filter(entry=>keep.has(entry.revision));
  }
  async function cleanup(itemId,pointer,backup){
    const p=paths(itemId),keep=new Set([...pointer.history,...(backup?.history??[])].map(entry=>entry.file));
    try{
      await inspect(p.snapshots,{directory:true});
      for(const file of await fs.readdir(p.snapshots)){
        if((SNAPSHOT.test(file)&&!keep.has(file))||/^\.work-document-[a-f0-9-]+\.tmp$/.test(file)){
          const target=path.join(p.snapshots,file);try{await inspect(target);const stat=await fs.lstat(target);if(stat.isFile())await fs.unlink(target);}catch{/* Recovery garbage must never make a committed save fail. */}
        }
      }
    }catch{/* A subsequent save can retry harmless orphan cleanup. */}
  }
  async function persist(itemId,document,origin,previous){
    const p=paths(itemId);await directory(p.root);await directory(p.snapshots);
    const text=JSON.stringify(document),hash=digest(text),file=`r${document.revision}-${hash}.json`;
    const entry={revision:document.revision,file,hash,bytes:Buffer.byteLength(text),title:document.title,createdAt:document.updatedAt,origin};
    const history=retainedHistory([...(previous?.history??[]),entry]);
    const pointer={version:1,itemId,head:document.revision,history};
    const pointerText=JSON.stringify(pointer);if(Buffer.byteLength(pointerText)>MAX_POINTER_BYTES)throw fault('INVALID','Work version metadata is full. Remove unneeded named versions before saving.');
    await writePhase('snapshot',path.join(p.snapshots,file),text,{itemId,revision:document.revision});
    if(previous)await writePhase('backup',p.backup,JSON.stringify(previous),{itemId,revision:document.revision});
    await writePhase('pointer',p.pointer,pointerText,{itemId,revision:document.revision});
    // The pointer is the commit point. A convenience mirror/cache failure must
    // not report an already committed revision as an unsaved edit.
    let warning;
    try{await writePhase('mirror',p.mirror,text,{itemId,revision:document.revision});}catch(error){warning=`Saved revision; the document mirror could not be updated: ${String(error.message).slice(0,200)}`;}
    await cleanup(itemId,pointer,previous);
    const prunedRevisions=(previous?.history??[]).filter(e=>!history.some(n=>n.revision===e.revision)).map(e=>e.revision);
    return{document:clone(document),revision:document.revision,recovered:false,...(warning?{warning}:{}),history:{prunedRevisions,maxHistoryCount,maxHistoryBytes}};
  }
  function create({itemId,document}){return serialize(itemId,async()=>{
    const validated=validateSnapshot(document,itemId);if(validated.revision!==0)throw fault('INVALID','A new Work document must begin at revision 0.');
    try{await loadPointer(itemId);throw fault('EXISTS','This Work item already has a saved visual document.');}catch(error){if(error.code!=='MISSING')throw error;}
    return persist(itemId,validated,'user');
  });}
  function read(itemId,{revision}={}){return serialize(itemId,async()=>{if(revision!==undefined&&!isRevision(revision))throw fault('INVALID','Choose a valid Work revision.');return result(await current(itemId,revision));});}
  function commit({itemId,expectedRevision,operations,origin='user'}){return serialize(itemId,async()=>{
    if(!isRevision(expectedRevision)||!ORIGINS.has(origin))throw fault('INVALID','Invalid Work commit revision or origin.');
    const saved=await current(itemId);
    if(saved.revision!==expectedRevision)throw fault('CONFLICT','This Work item changed since editing began. Reload the committed version before saving.',{expectedRevision,currentRevision:saved.revision});
    const edited=applyWorkOperations(saved.document,operations),revision=await nextRevision(itemId,saved.pointer.head);
    edited.revision=revision;edited.updatedAt=now();
    return persist(itemId,validateSnapshot(edited,itemId),origin,saved.pointer);
  });}
  function checkpoint({itemId,name,revision}){return serialize(itemId,async()=>{
    if(typeof name!=='string'||!name.trim()||name.length>120||name.includes('\0'))throw fault('INVALID','A version name must contain 1 to 120 characters.');
    if(revision!==undefined&&!isRevision(revision))throw fault('INVALID','Choose a valid Work revision.');
    const saved=await current(itemId,revision),pointer=clone(saved.pointer),entry=pointer.history.find(e=>e.revision===saved.revision);
    entry.name=name.trim();
    const text=JSON.stringify(pointer);if(Buffer.byteLength(text)>MAX_POINTER_BYTES)throw fault('INVALID','Work version metadata is full.');
    const p=paths(itemId);await writePhase('backup',p.backup,JSON.stringify(saved.pointer),{itemId,revision:saved.revision});await writePhase('pointer',p.pointer,text,{itemId,revision:saved.revision});
    return{...clone(entry),current:entry.revision===pointer.head};
  });}
  function listVersions(itemId){return serialize(itemId,async()=>{
    const saved=await current(itemId),versions=saved.pointer.history.map(({file,hash,...entry})=>({...entry,current:entry.revision===saved.revision}));
    const bytes=versions.reduce((sum,e)=>sum+e.bytes,0),preservedBytes=versions.filter(e=>e.name||e.current).reduce((sum,e)=>sum+e.bytes,0);
    return{versions,storage:{bytes,count:versions.length,pressure:preservedBytes>maxHistoryBytes,preservedBytes,maxHistoryCount,maxHistoryBytes},recovered:saved.recovered,...(saved.recovery?{recovery:saved.recovery}:{})};
  });}
  function restore({itemId,revision,expectedRevision}){return serialize(itemId,async()=>{
    if(!isRevision(revision)||!isRevision(expectedRevision))throw fault('INVALID','Choose valid Work revisions for restore.');
    const saved=await current(itemId);
    if(saved.revision!==expectedRevision)throw fault('CONFLICT','This Work item changed before restoring the selected version.',{expectedRevision,currentRevision:saved.revision});
    const older=await current(itemId,revision),document=clone(older.document);
    document.revision=await nextRevision(itemId,saved.pointer.head);document.createdAt=saved.document.createdAt;document.updatedAt=now();
    return persist(itemId,validateSnapshot(document,itemId),'restore',saved.pointer);
  });}
  async function close(){if(closed)return;closing=true;await Promise.allSettled([...queues.values()]);closed=true;}
  return{initialize,create,read,commit,listVersions,checkpoint,restore,close};
}
