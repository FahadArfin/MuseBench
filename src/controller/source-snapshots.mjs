import {promises as fs,constants as FS} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {workspaceSourcePaths} from './workspace-sources.mjs';

export const SOURCE_LIMITS=Object.freeze({fileBytes:256*1024*1024,totalBytes:16*1024**3,files:100000,inlineFileBytes:128*1024,inlineTotalBytes:1024*1024});
const BLOCK=1024*1024,hash=value=>createHash('sha256').update(value).digest('hex');
const signature=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
// Windows path lstat can report dev=0 while fstat reports the volume serial.
const pathMatches=(handle,current)=>signature(handle).split(':').slice(1).join(':')===signature(current).split(':').slice(1).join(':')&&(handle.dev===current.dev||process.platform==='win32'&&current.dev===0n);
const cancelled=()=>new Error('Source inspection cancelled.');

export function createSourceSnapshots({directory,safeFile,excluded=()=>false,excludedPatterns=[],limits={}}){
 const budget={...SOURCE_LIMITS,...limits},caches=new Map(),shutdown=new AbortController(),active=new Set();let initialized;
 const stats={hashedFiles:0,reusedFiles:0,bytesRead:0};
 const check=signal=>{if(shutdown.signal.aborted||signal?.aborted)throw cancelled();};
 const init=()=>initialized??=(async()=>{await fs.mkdir(directory,{recursive:true});if((await fs.lstat(directory)).isSymbolicLink()||path.resolve(await fs.realpath(directory))!==path.resolve(directory))throw Error('Snapshot storage cannot use symbolic links.');})();
 const resolve=async(root,name)=>{
  if(safeFile)return safeFile(root,name);
  if(path.isAbsolute(name)||name.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))throw Error('Invalid source path.');
  let at=root;for(const segment of name.split('/')){at=path.join(at,segment);if((await fs.lstat(at)).isSymbolicLink())throw Error('Symbolic links are not allowed in source.');}return at;
 };
 async function objectPath(file){
  if(!file||!/^[a-f0-9]{64}$/.test(file.hash)||file.object!==file.hash)throw Error('Invalid snapshot content reference.');
  await init();const source=path.join(directory,file.object),stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid snapshot content object.');return source;
 }
 async function capture(root,name,previous,verify,signal,source,preliminary){
  check(signal);if(!verify&&previous?.pathStamp===signature(preliminary)){stats.reusedFiles++;return previous;}
  const handle=await fs.open(source,FS.O_RDONLY|(FS.O_NOFOLLOW??0));let temporary,output;
  try{
   const before=await handle.stat({bigint:true}),size=Number(before.size),stamp=signature(before);
   if(!before.isFile()||size>budget.fileBytes)throw Error(`Source file exceeds the ${budget.fileBytes/1048576} MiB file limit: ${name}`);
   const digest=createHash('sha256'),decoder=new TextDecoder('utf-8',{fatal:true}),buffer=Buffer.allocUnsafe(Math.max(1,Math.min(BLOCK,size))),small=size<=budget.inlineFileBytes?[]:null;let binary=false,received=0;
   temporary=path.join(directory,'.capture-'+randomUUID());output=await fs.open(temporary,'wx');
   for(;;){check(signal);const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;received+=bytesRead;if(received>budget.fileBytes||received>size)throw Error(`Source changed during inspection: ${name}`);stats.bytesRead+=bytesRead;const chunk=buffer.subarray(0,bytesRead);digest.update(chunk);
    if(!binary){try{if(chunk.includes(0))throw Error();decoder.decode(chunk,{stream:true});}catch{binary=true;}if(!binary){await output.writeFile(chunk);small?.push(Buffer.from(chunk));}}
   }
   if(!binary)try{decoder.decode();}catch{binary=true;}
   await resolve(root,name);const after=await handle.stat({bigint:true}),current=await fs.lstat(source,{bigint:true});
   if(received!==size||signature(after)!==stamp||!pathMatches(before,current))throw Error(`Source changed during inspection: ${name}`);
   check(signal);const id=digest.digest('hex'),file={hash:id,size,binary,...(!binary?{object:id}:{}),...(small&&!binary?{text:Buffer.concat(small).toString('utf8')}:binary?{text:''}:{})};
   await output.close();output=null;
   if(!binary){try{await fs.link(temporary,path.join(directory,id));}catch(error){if(error.code!=='EEXIST')throw error;await verifyContent(file);}}
   stats.hashedFiles++;return{stamp,pathStamp:signature(current),file};
  }finally{await output?.close();await handle.close();if(temporary)await fs.rm(temporary,{force:true});}
 }
 async function snapshot(root,{verify=false,signal:externalSignal}={}){
  const operation=new AbortController(),signal=AbortSignal.any([operation.signal,shutdown.signal,...(externalSignal?[externalSignal]:[])]);active.add(operation);
  try{
  check(signal);await init();stats.hashedFiles=0;stats.reusedFiles=0;stats.bytesRead=0;
  const inventory=await workspaceSourcePaths(root,excludedPatterns),files=Object.create(null),previous=caches.get(root),next=new Map();let bytes=0,count=0,inline=0;
  async function walk(relative='',all=!inventory){
   check(signal);const entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
   for(const entry of entries){check(signal);if(excluded(entry.name))continue;const name=relative?relative+'/'+entry.name:entry.name,key=inventory?.caseInsensitive?name.toLowerCase():name;
    if(!all&&!inventory.files.has(key)&&!inventory.parents.has(key))continue;
    if(entry.isSymbolicLink())throw Error(`Symbolic links are not allowed in source: ${name}`);
    const source=await resolve(root,name);
    if(entry.isDirectory()){await walk(name,all||inventory.files.has(key));continue;}
    if(!entry.isFile())throw Error(`Unsupported source type: ${name}`);
    if(++count>budget.files)throw Error(`Project exceeds the ${budget.files.toLocaleString('en-US')} source-file limit.`);
    const info=await fs.lstat(source,{bigint:true}),size=Number(info.size);if(!info.isFile())throw Error(`Unsupported source type: ${name}`);if(size>budget.fileBytes)throw Error(`Source file exceeds the ${budget.fileBytes/1048576} MiB file limit: ${name}`);bytes+=size;if(bytes>budget.totalBytes)throw Error(`Project source exceeds the ${budget.totalBytes/1024**3} GiB snapshot size limit.`);
    const captured=await capture(root,name,previous?.get(name),verify,signal,source,info),file={...captured.file};
    bytes+=file.size-size;if(bytes>budget.totalBytes)throw Error(`Project source exceeds the ${budget.totalBytes/1024**3} GiB snapshot size limit.`);
    if(!file.binary&&file.size<=budget.inlineFileBytes&&inline+file.size<=budget.inlineTotalBytes){file.text??=await text(file,budget.inlineFileBytes);inline+=file.size;}else if(!file.binary)delete file.text;
    next.set(name,{stamp:captured.stamp,pathStamp:captured.pathStamp,file:{...file}});
    files[name]=file;
   }
  }
  await walk();check(signal);const revision=hash(Object.keys(files).sort().map(name=>`${name}\0${files[name].hash}\0`).join(''));caches.set(root,next);
  // Bound metadata across many opened projects. Historical data is in manifests.
  while(caches.size>8)caches.delete(caches.keys().next().value);
  return{revision,files};
  }finally{active.delete(operation);}
 }
 async function text(file,maxBytes=2*1024*1024){
  if(!file||file.binary)throw Error('Captured text is unavailable.');
  if(typeof file.text==='string'&&!file.object){
   if(Buffer.byteLength(file.text)>maxBytes)throw Error('Captured text exceeds the read limit.');
   if(hash(file.text)!==file.hash)throw Error('Snapshot content integrity check failed.');return file.text;
  }
  if(file.size>maxBytes)throw Error('Captured text exceeds the read limit.');
  const handle=await fs.open(await objectPath(file),FS.O_RDONLY|(FS.O_NOFOLLOW??0));
  try{const stat=await handle.stat();if(stat.size>maxBytes||stat.size!==file.size)throw Error('Snapshot content integrity check failed.');const bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,null);if(!bytesRead)throw Error('Snapshot content integrity check failed.');offset+=bytesRead;}if(hash(bytes)!==file.hash)throw Error('Snapshot content integrity check failed.');return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}finally{await handle.close();}
 }
 async function copy(file,destination){
  if(typeof file?.text==='string'&&!file.object){await fs.writeFile(destination,await text(file,budget.fileBytes),{flag:'wx'});return;}
  const handle=await fs.open(await objectPath(file),FS.O_RDONLY|(FS.O_NOFOLLOW??0));let output;
  try{output=await fs.open(destination,'wx');const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(BLOCK);let bytes=0;for(;;){check();const result=await handle.read(buffer,0,BLOCK,null);if(!result.bytesRead)break;bytes+=result.bytesRead;if(bytes>budget.fileBytes||bytes>file.size)throw Error('Snapshot content integrity check failed.');const chunk=buffer.subarray(0,result.bytesRead);digest.update(chunk);await output.writeFile(chunk);}if(bytes!==file.size||digest.digest('hex')!==file.hash)throw Error('Snapshot content integrity check failed.');}catch(error){if(output){await output.close();output=null;await fs.rm(destination,{force:true});}throw error;}finally{await handle.close();await output?.close();}
 }
 async function verifyContent(file){
  if(!file?.object){await text(file,budget.fileBytes);return;}
  const handle=await fs.open(await objectPath(file),FS.O_RDONLY|(FS.O_NOFOLLOW??0));
  try{const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(BLOCK);let bytes=0;for(;;){check();const result=await handle.read(buffer,0,BLOCK,null);if(!result.bytesRead)break;bytes+=result.bytesRead;if(bytes>budget.fileBytes||bytes>file.size)throw Error('Snapshot content integrity check failed.');digest.update(buffer.subarray(0,result.bytesRead));}if(bytes!==file.size||digest.digest('hex')!==file.hash)throw Error('Snapshot content integrity check failed.');}finally{await handle.close();}
 }
 async function copySource(root,name,file,destination){
  const source=await resolve(root,name),handle=await fs.open(source,FS.O_RDONLY|(FS.O_NOFOLLOW??0));let output;
  try{const before=await handle.stat({bigint:true});if(!before.isFile()||Number(before.size)>budget.fileBytes)throw Error('Unsupported copy source.');output=await fs.open(destination,'wx');const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(BLOCK);let bytes=0;
   for(;;){check();const result=await handle.read(buffer,0,BLOCK,null);if(!result.bytesRead)break;bytes+=result.bytesRead;if(bytes>budget.fileBytes)throw Error('Source changed while copying.');const chunk=buffer.subarray(0,result.bytesRead);digest.update(chunk);await output.writeFile(chunk);}
   await resolve(root,name);if(digest.digest('hex')!==file.hash||bytes!==Number(before.size)||signature(await handle.stat({bigint:true}))!==signature(before)||!pathMatches(before,await fs.lstat(source,{bigint:true})))throw Error('The source changed while copying. Refresh and try again.');
  }catch(error){if(output){await output.close();output=null;await fs.rm(destination,{force:true});}throw error;}finally{await output?.close();await handle.close();}
 }
 return{snapshot,text,copy,copySource,verify:verifyContent,stats,cancel(){for(const operation of active)operation.abort();},close(){shutdown.abort();caches.clear();}};
}
