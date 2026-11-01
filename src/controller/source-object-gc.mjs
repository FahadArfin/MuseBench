import {promises as fs,lstatSync,realpathSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

export const SOURCE_GC_LIMITS=Object.freeze({graceMs:24*60*60*1000,maxEntries:128,maxDeletes:16,maxDurationMs:25,maxMarkEntries:4096,maxReferences:1000000});
const objectName=/^[a-f0-9]{64}$/,captureName=/^\.capture-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const identity=stat=>`${stat.dev}:${stat.ino}`;
const version=stat=>`${identity(stat)}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.nlink}`;
const samePath=(left,right)=>process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;
const stats=()=>({phase:'mark',marked:0,scanned:0,deleted:0,bytesDeleted:0,retained:0,recent:0,unsafe:0,errors:0,done:false});
const bounded=(value,fallback,maximum)=>Number.isSafeInteger(value)&&value>0?Math.min(value,maximum):fallback;

// This callback must enumerate *all* retained owners, including paused tasks.
// A revision must change before any retained reference changes. This lets a
// complete mark resume across slices, and final revision checks stay inexpensive.
// Unversioned inventories are validated in full again before every unlink.
function readInventory(provider){
 if(typeof provider!=='function')throw Error('references');
 const inventory=provider();
 if(inventory&&typeof inventory.then==='function')Promise.resolve(inventory).catch(()=>{});
 if(!record(inventory)||inventory.complete!==true||!Array.isArray(inventory.manifests))throw Error('references');
 if(Object.hasOwn(inventory,'revision')&&!(typeof inventory.revision==='string'&&inventory.revision.length>0||Number.isSafeInteger(inventory.revision)))throw Error('references');
 return inventory;
}
const startMark=inventory=>({revision:inventory.revision,manifests:inventory.manifests,index:0,keys:null,offset:0,retained:new Set()});
function advanceMark(mark,{maxMarkEntries,maxReferences,deadline},result){
 while(mark.index<mark.manifests.length&&result.marked<maxMarkEntries&&performance.now()<deadline){
  const files=mark.manifests[mark.index];
  if(!mark.keys){if(!record(files))throw Error('references');mark.keys=Object.keys(files);mark.offset=0;}
  if(mark.offset===mark.keys.length){mark.keys=null;mark.index++;continue;}
  const file=files[mark.keys[mark.offset++]];result.marked++;
  if(!record(file)||typeof file.hash!=='string'||!objectName.test(file.hash)||typeof file.binary!=='boolean'||file.size!==undefined&&(!Number.isSafeInteger(file.size)||file.size<0)||file.text!==undefined&&typeof file.text!=='string'||!file.binary&&file.object===undefined&&typeof file.text!=='string')throw Error('references');
  if(file.object!==undefined){if(file.binary||typeof file.object!=='string'||!objectName.test(file.object)||file.object!==file.hash)throw Error('references');mark.retained.add(file.object);if(mark.retained.size>maxReferences)throw Error('references');}
 }
 if(mark.keys&&mark.offset===mark.keys.length){mark.keys=null;mark.index++;}
 return mark.index===mark.manifests.length;
}
function freshReferences(inventory,limits){
 const mark=startMark(inventory),result=stats();
 if(!advanceMark(mark,{...limits,maxMarkEntries:Number.MAX_SAFE_INTEGER},result))throw Error('budget');
 return mark.retained;
}

function withReferenceLock(guard,work){
 if(guard===undefined)return work();
 const unavailable=()=>Object.assign(Error('Source reference lock is unavailable.'),{code:'SOURCE_REFERENCE_LOCK'});
 if(typeof guard!=='function'||Object.prototype.toString.call(guard)==='[object AsyncFunction]')throw unavailable();
 let enabled=true,called=false,failed=false,value,workError;
 try{
  let returned;
  try{returned=guard(()=>{
   // A rejected/late asynchronous grant must never execute a deferred unlink.
   if(!enabled||called)return;
   called=true;try{return value=work();}catch(error){workError=error;}
  });}catch{failed=true;}
  if(returned&&typeof returned.then==='function'){Promise.resolve(returned).catch(()=>{});failed=true;}
  if(!called)failed=true;
 }finally{enabled=false;}
 if(workError)throw workError;
 if(failed)throw unavailable();
 return value;
}

/** Incremental collection of flat, application-owned CAS objects only. */
export function createSourceObjectCollector({directory,graceMs=SOURCE_GC_LIMITS.graceMs,now=Date.now,signal,busy=()=>false,pinned=()=>false,prepare=()=>{}}){
 directory=path.resolve(directory);
 if(path.dirname(directory)===directory||!Number.isFinite(graceMs)||graceMs<=0)throw Error('Invalid snapshot collection storage or grace period.');
 let owner,cursor,pending,marking,marked,closed=false;
 const stopped=external=>closed||signal?.aborted||external?.aborted;
 function storage(){
  const stat=lstatSync(directory,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||!samePath(path.resolve(realpathSync(directory)),directory)||owner&&identity(stat)!==owner)throw Error('storage');
  owner??=identity(stat);return stat;
 }
 async function reset(){const previous=cursor;cursor=null;if(previous)await previous.close().catch(()=>{});}
 async function run(options){
  const result=stats(),external=options.signal;
  if(stopped(external)){result.skipped='cancelled';return result;}
  if(busy()){result.skipped='busy';return result;}
  const maxEntries=bounded(options.maxEntries,SOURCE_GC_LIMITS.maxEntries,4096),maxDeletes=bounded(options.maxDeletes,SOURCE_GC_LIMITS.maxDeletes,256),maxDurationMs=bounded(options.maxDurationMs,SOURCE_GC_LIMITS.maxDurationMs,1000),maxReferences=bounded(options.maxReferences,SOURCE_GC_LIMITS.maxReferences,SOURCE_GC_LIMITS.maxReferences),maxMarkEntries=bounded(options.maxMarkEntries,SOURCE_GC_LIMITS.maxMarkEntries,65536),deadline=performance.now()+maxDurationMs,limits={maxMarkEntries,maxReferences,deadline};
  let retained,revision;
  try{
   const inventory=readInventory(options.references);revision=inventory.revision;
   if(revision===undefined){marking=null;marked=null;retained=freshReferences(inventory,limits);}
   else{
    if(marked?.revision!==revision){
     marked=null;if(marking?.revision!==revision)marking=startMark(inventory);
     if(!advanceMark(marking,limits,result))return result;
     marked=marking;marking=null;
    }
    if(marked.retained.size>maxReferences)throw Error('references');retained=marked.retained;
   }
   result.phase='sweep';
  }catch(error){marking=null;marked=null;result.skipped=error.message==='budget'?'budget':'references';return result;}
  try{
   storage();const time=now();if(!Number.isFinite(time)){result.skipped='clock';return result;}prepare(time-graceMs,maxEntries);
   cursor??=await fs.opendir(directory,{bufferSize:Math.min(maxEntries,32)});
   while(result.scanned<maxEntries&&result.deleted<maxDeletes&&performance.now()<deadline){
    if(stopped(external)||busy()){result.skipped=stopped(external)?'cancelled':'busy';break;}
    storage();const entry=await cursor.read();
    if(!entry){result.done=true;await reset();break;}
    result.scanned++;
    if(stopped(external)||busy()){result.skipped=stopped(external)?'cancelled':'busy';break;}
    const isObject=objectName.test(entry.name);
    if(!isObject&&!captureName.test(entry.name))continue;
    const target=path.join(directory,entry.name);
    // The path cannot contain user-supplied segments. Never recurse or use rm.
    if(path.dirname(target)!==directory){result.unsafe++;continue;}
    storage();let before;
    try{before=lstatSync(target,{bigint:true});}catch(error){if(error.code==='ENOENT')continue;result.errors++;continue;}
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n){result.unsafe++;continue;}
    if(isObject&&(retained.has(entry.name)||pinned(entry.name,time))){result.retained++;continue;}
    const modified=Math.max(Number(before.birthtimeMs),Number(before.mtimeMs),Number(before.ctimeMs));
    if(!Number.isFinite(modified)||time-modified<graceMs){result.recent++;continue;}
    // Final revision validation and unlink share one synchronous lock grant.
    // The controller can lock external SQLite writers without holding that
    // transaction across an await or the incremental mark/directory scan.
    let proceed;
    try{
     proceed=withReferenceLock(options.withReferenceLock,()=>{
      try{
       const inventory=readInventory(options.references);
       if(revision===undefined)retained=freshReferences(inventory,limits);
       else if(inventory.revision!==revision){marked=null;marking=null;result.skipped='references-changed';return false;}
      }catch(error){marking=null;marked=null;result.skipped=error.message==='budget'?'budget':'references';return false;}
      if(performance.now()>deadline)return false;
      if(stopped(external)||busy()){result.skipped=stopped(external)?'cancelled':'busy';return false;}
      if(isObject&&(retained.has(entry.name)||pinned(entry.name,time))){result.retained++;return true;}
      storage();
      try{
       const current=lstatSync(target,{bigint:true});
       if(!current.isFile()||current.isSymbolicLink()||current.nlink!==1n||version(before)!==version(current)){result.unsafe++;return true;}
       unlinkSync(target);result.deleted++;result.bytesDeleted+=Number(current.size);
      }catch(error){if(error.code!=='ENOENT')result.errors++;}
      return true;
     });
    }catch(error){
     if(error.code!=='SOURCE_REFERENCE_LOCK')throw error;
     result.skipped='reference-lock';await reset();break;
    }
    if(!proceed)break;
   }
   return result;
  }catch(error){
   if(error.code==='ENOENT'&&!owner){result.done=true;}else result.skipped='storage';
   await reset();return result;
  }finally{if(stopped(external))await reset();}
 }
 return{
  get pending(){return pending;},
  collect(options={}){if(pending)return pending;pending=run(options).finally(()=>{pending=null;});return pending;},
  async close(){closed=true;await pending;marked=null;marking=null;await reset();}
 };
}
