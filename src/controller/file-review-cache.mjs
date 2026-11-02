import {promises as fs} from 'node:fs';
import path from 'node:path';

export const REVIEW_CACHE_NAME=/^comparison-([1-9]\d{0,9})-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const samePath=(left,right)=>process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;
const identity=stat=>`${stat.dev}:${stat.ino}`;
const stamp=stat=>`${identity(stat)}:${stat.mtimeMs}:${stat.ctimeMs}`;
export function reviewCacheOwnerState(pid){
 if(!Number.isSafeInteger(pid)||pid<1||pid>2147483647)return'unknown';
 try{process.kill(pid,0);return'alive';}catch(error){return error.code==='ESRCH'?'dead':'unknown';}
}

// Every recursive removal, including our live process's completed spools, goes
// through these absolute containment, realpath, symlink and identity checks.
export async function removeReviewDirectory(directory,target,expected){
 directory=path.resolve(directory);target=path.resolve(target);
 if(!samePath(path.dirname(target),directory)||!REVIEW_CACHE_NAME.test(path.basename(target)))return false;
 const root=await fs.lstat(directory),before=await fs.lstat(target);
 if(!root.isDirectory()||root.isSymbolicLink()||!before.isDirectory()||before.isSymbolicLink()||expected&&stamp(before)!==stamp(expected))return false;
 if(!samePath(path.resolve(await fs.realpath(directory)),directory)||!samePath(path.resolve(await fs.realpath(target)),target))return false;
 const current=await fs.lstat(target),currentRoot=await fs.lstat(directory);
 if(current.isSymbolicLink()||!current.isDirectory()||stamp(current)!==stamp(before)||currentRoot.isSymbolicLink()||!currentRoot.isDirectory()||identity(currentRoot)!==identity(root))return false;
 await fs.rm(target,{recursive:true,force:true,maxRetries:3});return true;
}

/** Only definitely dead, old, exact-format owners are eligible. A persistent
 * directory cursor bounds each slice without repeatedly scanning its prefix. */
export function createFileReviewCacheCollector({directory,now=Date.now,ownerState=reviewCacheOwnerState}){
 directory=path.resolve(directory);let cursor,rootIdentity,pending,closed=false;
 async function storage(){const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||!samePath(path.resolve(await fs.realpath(directory)),directory)||rootIdentity&&identity(stat)!==rootIdentity)throw Error('storage');rootIdentity??=identity(stat);}
 async function reset(){const prior=cursor;cursor=null;if(prior)await prior.close().catch(()=>{});}
 async function collect(){
  const result={scanned:0,deleted:0,errors:0,done:false};if(closed)return{...result,skipped:'closed'};
  try{await storage();cursor??=await fs.opendir(directory,{bufferSize:32});
   while(result.scanned<32&&!closed){await storage();const entry=await cursor.read();if(!entry){result.done=true;await reset();break;}result.scanned++;const match=REVIEW_CACHE_NAME.exec(entry.name);if(!match||!entry.isDirectory()||entry.isSymbolicLink())continue;
    const target=path.resolve(directory,entry.name);if(!samePath(path.dirname(target),directory))continue;
    try{const stat=await fs.lstat(target);if(!stat.isDirectory()||stat.isSymbolicLink())continue;const time=now(),age=time-Math.max(stat.birthtimeMs,stat.ctimeMs,stat.mtimeMs);if(!Number.isFinite(time)||age<=24*60*60*1000)continue;let state;try{state=ownerState(Number(match[1]));}catch{continue;}if(state!=='dead')continue;
     await storage();if(await removeReviewDirectory(directory,target,stat))result.deleted++;
    }catch(error){if(error.code!=='ENOENT')result.errors++;}
   }
  }catch(error){if(error.code==='ENOENT')result.done=true;else result.skipped='storage';await reset();}
  return result;
 }
 return{collect(){return pending??=(collect().finally(()=>{pending=null;}));},async close(){closed=true;await pending;await reset();}};
}
