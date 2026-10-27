import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rename,rm,lstat,realpath,readdir} from 'node:fs/promises';
import path from 'node:path';
import {treeDigest} from '../src/runtime/extension-review.mjs';

export const STAGING_LIMITS=Object.freeze({files:500,entries:6000,fileBytes:4*1024*1024,totalBytes:32*1024*1024,jsonBytes:6*1024*1024,requests:650,requestMs:20000,totalMs:120000,depth:16});
export const STAGING_RETENTION=Object.freeze({ageMs:24*60*60*1000,folders:10,bytes:128*1024*1024});
const stageName=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pendingName=/^\.pending-[a-z0-9]{6}$/i;
async function stagingRoot(dataDir){
 if(typeof dataDir!=='string'||!path.isAbsolute(dataDir))return null;
 const root=path.resolve(dataDir,'catalog-staging'),info=await lstat(root);
 if(!info.isDirectory()||info.isSymbolicLink())return null;
 return realpath(root);
}
async function stageSize(folder){
 let bytes=0,count=0;
 async function walk(file,depth){
  if(depth>32||++count>22000)throw Error('Unsafe cleanup tree bounds.');
  const info=await lstat(file);if(info.isSymbolicLink())throw Error('Unsafe cleanup symbolic link.');
  if(info.isFile())bytes+=info.size;
  else if(info.isDirectory())for(const name of await readdir(file))await walk(path.join(file,name),depth+1);
  else throw Error('Unsafe cleanup file.');
 }
 await walk(folder,0);return bytes;
}
async function removeOwnedStage(folder,dataDir,allowPending=false){
 try{
  if(typeof folder!=='string'||!path.isAbsolute(folder))return false;
  const root=await stagingRoot(dataDir),candidate=path.resolve(folder),name=path.basename(candidate);
  if(!root||path.dirname(candidate)!==root||!(stageName.test(name)||(allowPending&&pendingName.test(name))))return false;
  const info=await lstat(candidate);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(candidate)!==candidate)return false;
  await stageSize(candidate);
  // Resolve and check the absolute direct child again immediately before recursive removal.
  if(await stagingRoot(dataDir)!==root||await realpath(candidate)!==candidate||(await lstat(candidate)).isSymbolicLink())return false;
  await rm(candidate,{recursive:true,force:false});return true;
 }catch{return false;}
}
export async function removeCatalogStage(folder,{dataDir}={}){return removeOwnedStage(folder,dataDir);}
export async function pruneCatalogStages({dataDir,protectedFolders=[]}={}){
 const result={removed:0,retained:0,bytes:0};
 try{
  const root=await stagingRoot(dataDir);if(!root)return result;
  const protectedPaths=new Set(protectedFolders.filter(value=>typeof value==='string'&&path.isAbsolute(value)).map(value=>path.resolve(value)));
  const records=[];
  for(const name of await readdir(root)){
   if(!stageName.test(name)&&!pendingName.test(name))continue;
   const folder=path.resolve(root,name);
   try{
    const info=await lstat(folder);if(!info.isDirectory()||info.isSymbolicLink())continue;
    records.push({folder,mtime:info.mtimeMs,bytes:await stageSize(folder),pending:pendingName.test(name),protected:protectedPaths.has(folder)});
   }catch{ /* Never traverse or delete an unsafe or concurrently changed tree. */ }
  }
  result.retained=records.length;result.bytes=records.reduce((sum,item)=>sum+item.bytes,0);
  for(const item of records.sort((a,b)=>a.mtime-b.mtime)){
   const expired=Date.now()-item.mtime>STAGING_RETENTION.ageMs;
   // Recent pending folders may belong to an in-flight download; only expire them.
   if(item.protected||(!expired&&(item.pending||(result.retained<=STAGING_RETENTION.folders&&result.bytes<=STAGING_RETENTION.bytes))))continue;
   if(await removeOwnedStage(item.folder,dataDir,item.pending)){result.removed++;result.retained--;result.bytes-=item.bytes;}
  }
 }catch{ /* Cleanup must not turn a recoverable download into a configuration failure. */ }
 return result;
}
const shaPattern=/^[a-f0-9]{40}$/;
const licensePattern=/^(licen[cs]e|copying|copyright|notice)([._-].*)?$/i;
function safeName(name){
 if(typeof name!=='string'||!name||name.length>180||name!==name.normalize('NFC')||/[<>:"/\\|?*~\u0000-\u001f\u007f]/.test(name)||/[. ]$/.test(name)||name==='.'||name==='..'||/^\s/.test(name)||/^(con|conin\$|conout\$|clock\$|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name)||/^\.git$/i.test(name))throw Error('Unsafe package path name.');
 return name;
}
function safePath(value){if(typeof value!=='string'||value.length>1600)throw Error('Invalid package path.');return value===''?'':value.split('/').map(safeName).join('/');}
const key=value=>value.normalize('NFC').toLowerCase();
const sha=value=>{if(typeof value!=='string'||!shaPattern.test(value))throw Error('Invalid Git object hash.');return value;};

/** Only main-process catalog descriptors may reach this API. No script is executed. */
export async function stageCatalogPackage(descriptor,{dataDir,fetch:fetchImpl=globalThis.fetch,protectedFolders=[]}={}){
 const {repo,ref='HEAD',path:subpath='',kind}=descriptor??{};
 if(typeof repo!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/).test(repo)||repo.split('/').some(p=>p==='.'||p==='..'))throw Error('Invalid public GitHub repository descriptor.');
 if(typeof ref!=='string'||!ref||ref.length>200||!(/^[A-Za-z0-9_./-]+$/).test(ref)||ref.includes('..')||ref.startsWith('/'))throw Error('Invalid Git ref.');
 if(!['skill','plugin'].includes(kind))throw Error('Invalid package kind.');
 safePath(subpath);if(subpath.split('/').length>STAGING_LIMITS.depth)throw Error('Package path depth limit exceeded.');
 if(typeof dataDir!=='string'||!path.isAbsolute(dataDir))throw Error('App data directory must be absolute.');
 await pruneCatalogStages({dataDir,protectedFolders});
 const base=`https://api.github.com/repos/${repo}`,deadline=Date.now()+STAGING_LIMITS.totalMs;let requests=0,entryCount=0,totalBytes=0;
 async function json(suffix){
  if(++requests>STAGING_LIMITS.requests||Date.now()>=deadline)throw Error('Package download request/time limit exceeded.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(STAGING_LIMITS.requestMs,deadline-Date.now()));
  try{
   const response=await fetchImpl(base+suffix,{redirect:'error',credentials:'omit',signal:controller.signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
   if(!response.ok)throw Error(`Public GitHub download failed (${response.status}).`);
   if(Number(response.headers.get('content-length'))>STAGING_LIMITS.jsonBytes)throw Error('GitHub response size limit exceeded.');
   const chunks=[];let bytes=0;
   if(!response.body)throw Error('Missing GitHub response body.');
   for await(const chunk of response.body){bytes+=chunk.length;if(bytes>STAGING_LIMITS.jsonBytes){controller.abort();throw Error('GitHub response size limit exceeded.');}chunks.push(Buffer.from(chunk));}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{clearTimeout(timer);}
 }
 async function tree(id){
  const value=await json(`/git/trees/${sha(id)}`);if(value.truncated)throw Error('Truncated Git tree cannot be staged.');
  if(!Array.isArray(value.tree)||(entryCount+=value.tree.length)>STAGING_LIMITS.entries)throw Error('Git tree entry limit exceeded.');
  const names=new Set();for(const entry of value.tree){safeName(entry.path);const name=key(entry.path);if(names.has(name))throw Error('Windows path collision.');names.add(name);}
  return value.tree;
 }
 const resolved=await json(`/commits/${encodeURIComponent(ref)}`),commit=sha(resolved.sha);let entries=await tree(resolved.commit?.tree?.sha);
 const selected=[],licenses=[];
 function add(entry,destination,license=false){
  if(entry.type!=='blob'||!['100644','100755'].includes(entry.mode))throw Error('Unsupported symbolic link or submodule in package.');
  sha(entry.sha);safePath(destination);
  if(!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>STAGING_LIMITS.fileBytes)throw Error('Package file too large or invalid size.');
  totalBytes+=entry.size;if(totalBytes>STAGING_LIMITS.totalBytes||selected.length>=STAGING_LIMITS.files)throw Error('Package size/file limit exceeded.');
  selected.push({...entry,destination});if(license)licenses.push(destination);
 }
 const segments=subpath?subpath.split('/'):[];
 for(let i=0;i<segments.length;i++){
  for(const entry of entries.filter(e=>licensePattern.test(e.path)))add(entry,`.catalog-licenses/${i}/${entry.path}`,true);
  const next=entries.find(e=>e.path===segments[i]);if(!next||next.type!=='tree'||next.mode!=='040000')throw Error('Selected package path is not a Git directory.');
  entries=await tree(next.sha);
 }
 async function collect(items,prefix='',depth=0){
  if(depth>STAGING_LIMITS.depth)throw Error('Package directory depth limit exceeded.');
  for(const entry of items){
   if(!prefix&&key(entry.path)==='.catalog-licenses')throw Error('Reserved license path collision.');
   const destination=prefix+entry.path;
   if(entry.type==='tree'&&entry.mode==='040000')await collect(await tree(entry.sha),destination+'/',depth+1);
   else add(entry,destination,licensePattern.test(entry.path));
  }
 }
 await collect(entries);if(!selected.length)throw Error('Selected package contains no files.');
 const parent=path.join(dataDir,'catalog-staging');await mkdir(parent,{recursive:true});
 if((await lstat(parent)).isSymbolicLink())throw Error('Staging directory must not be a symbolic link.');
 const canonical=await realpath(parent),temporary=await mkdtemp(path.join(canonical,'.pending-')),folder=path.join(canonical,randomUUID());
 try{
  const files=[];
  for(const entry of selected){
   const blob=await json(`/git/blobs/${entry.sha}`);
   if(blob.encoding!=='base64'||typeof blob.content!=='string'||!/^[A-Za-z0-9+/=\r\n]*$/.test(blob.content))throw Error('Invalid Git blob encoding.');
   const content=Buffer.from(blob.content,'base64');
   if(content.length!==entry.size||createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')!==entry.sha)throw Error('Git blob integrity/size mismatch.');
   const target=path.join(temporary,...entry.destination.split('/'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content,{flag:'wx',mode:0o600});
   files.push({path:entry.destination,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
  }
  const revision=await treeDigest(temporary);await rename(temporary,folder);
  await pruneCatalogStages({dataDir,protectedFolders:[...protectedFolders,folder]});
  return{folder,revision,source:{repo,ref,path:subpath,kind,commit,url:`https://github.com/${repo}/tree/${commit}${subpath?'/'+subpath.split('/').map(encodeURIComponent).join('/'):''}`},files,licenses,bytes:totalBytes};
 }catch(error){await removeOwnedStage(temporary,dataDir,true);throw error;}
}
