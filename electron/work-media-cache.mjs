import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createWorkMediaDerivative } from './work-media-worker.mjs';

const RECIPE=1, KINDS=['thumbnail','waveform','proxy'];
const fileNames={thumbnail:'thumbnail.jpg',waveform:'waveform.f32',proxy:'proxy.mp4'};
const mediaTypes={thumbnail:'image/jpeg',waveform:'application/octet-stream',proxy:'video/mp4'};
function id(value){if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(value))throw Error('Invalid media cache item or asset ID.');return value;}
function hash(value){if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value))throw Error('Invalid media cache source hash.');return value;}
function kind(value){if(!KINDS.includes(value))throw Error('Invalid media derivative kind.');return value;}
async function noLinks(file){const absolute=path.resolve(file);let cursor=path.parse(absolute).root;for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);try{if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Media cache paths cannot contain symbolic links or junctions.');}catch(error){if(error.code!=='ENOENT')throw error;}}return absolute;}
async function digest(file,signal){const sha=createHash('sha256');for await(const chunk of createReadStream(file,{signal}))sha.update(chunk);return sha.digest('hex');}
function check(signal){if(signal?.aborted)throw Error('Media derivative cancelled.');}

/** Main-owned cache. One shared heavy-job queue invokes runner; no second queue. */
export function createWorkMediaCache({rootDir,assets,readDocument,capabilities,derive=createWorkMediaDerivative,maxBytes=256*1024**2}={}){
  if(typeof rootDir!=='string'||!path.isAbsolute(rootDir)||!assets?.resolve||!assets?.describe||typeof readDocument!=='function')throw Error('Managed media cache, asset store and document reader are required.');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>256*1024**2)throw Error('Invalid media cache byte limit.');
  const root=path.resolve(rootDir),requestLocks=new Map();let closed=false;
  const directory=(itemId,sourceHash,k)=>path.join(root,id(itemId),hash(sourceHash),`${kind(k)}-v${RECIPE}`);
  const publicReceipt=(manifest,assetId)=>({assetId,hash:manifest.hash,kind:manifest.kind,recipe:RECIPE,bytes:manifest.bytes,mediaType:mediaTypes[manifest.kind],original:false,createdAt:manifest.createdAt,...(manifest.waveform?{waveform:manifest.waveform,waveformDuration:manifest.waveformDuration}:{})});
  async function load(itemId,sourceHash,k,{verify=true}={}){
    const dir=directory(itemId,sourceHash,k),manifestPath=path.join(dir,'recipe.json');await noLinks(manifestPath);let data;
    try{const info=await fs.stat(manifestPath);if(!info.isFile()||info.size>65536)throw Error('Invalid media cache recipe size.');data=JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
    if(data.version!==RECIPE||data.itemId!==itemId||data.hash!==sourceHash||data.kind!==k||data.fileName!==fileNames[k]||!Number.isSafeInteger(data.bytes)||data.bytes<1||data.bytes>maxBytes||! /^[a-f0-9]{64}$/.test(data.outputHash))throw Error('Invalid media cache recipe identity.');
    if(data.waveform&&(!Array.isArray(data.waveform)||data.waveform.length>1000||data.waveform.some(v=>!Number.isFinite(v)||v<0||v>1)||!Number.isFinite(data.waveformDuration)||data.waveformDuration<=0||data.waveformDuration>600))throw Error('Invalid media cache waveform.');
    const filePath=path.join(dir,data.fileName);await noLinks(filePath);const info=await fs.stat(filePath);if(!info.isFile()||info.size!==data.bytes||verify&&await digest(filePath)!==data.outputHash)throw Error('Media cache integrity mismatch. Regenerate the preview.');return {manifest:data,filePath};
  }
  async function cacheBytes(){let used=0,count=0;for(const item of await fs.readdir(root)){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(item))continue;const itemPath=path.join(root,item);await noLinks(itemPath);if(!(await fs.stat(itemPath)).isDirectory())continue;for(const source of await fs.readdir(itemPath)){if(!/^[a-f0-9]{64}$/.test(source))continue;const sourcePath=path.join(itemPath,source);await noLinks(sourcePath);if(!(await fs.stat(sourcePath)).isDirectory())continue;for(const k of KINDS){const loaded=await load(item,source,k,{verify:false});if(loaded){used+=loaded.manifest.bytes+(await fs.stat(path.join(directory(item,source,k),'recipe.json'))).size;if(++count>2048)throw Error('Media cache recipe limit reached.');}}}}return used;}
  async function source(itemId,assetId,expectedHash){id(itemId);id(assetId);const asset=await assets.describe({itemId,assetId,...(expectedHash?{hash:hash(expectedHash)}:{})});hash(asset.hash);if(!/^(?:video|audio|image)\//.test(asset.mediaType))throw Error('This asset has no media preview.');return asset;}
  const cache={
    async initialize(){await noLinks(root);await fs.mkdir(root,{recursive:true});await noLinks(root);let inspected=0;
      for(const item of await fs.readdir(root)){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(item))continue;const itemPath=path.join(root,item);await noLinks(itemPath);if(!(await fs.stat(itemPath)).isDirectory())continue;
        for(const sourceHash of await fs.readdir(itemPath)){if(!/^[a-f0-9]{64}$/.test(sourceHash))continue;const parent=path.join(itemPath,sourceHash);await noLinks(parent);if(!(await fs.stat(parent)).isDirectory())continue;
          for(const name of await fs.readdir(parent)){if(++inspected>10000)throw Error('Media cache recovery entry limit exceeded.');if(!/^\.build-[A-Za-z0-9_-]{6}$/.test(name))continue;const target=path.resolve(parent,name);if(path.dirname(target)!==parent||!target.startsWith(root+path.sep))throw Error('Invalid abandoned media staging path.');await noLinks(target);await fs.rm(target,{recursive:true,force:true});}
        }
      }
    },
    async runner({document,settings,signal,progress}){
      if(closed)throw Error('Media cache is closed.');const {assetId,sourceHash,derivativeKind}=settings;kind(derivativeKind);const frozen=document.assets.find(a=>a.id===assetId&&a.hash===sourceHash);if(!frozen)throw Error('Media derivative source is not part of the frozen revision.');
      const asset=await source(document.id,assetId,sourceHash),existing=await load(document.id,sourceHash,derivativeKind);if(existing)return {toolVersion:'MuseBench media cache v1 reused'};
      const original=await assets.resolve({itemId:document.id,assetId,hash:asset.hash});check(signal);const final=directory(document.id,asset.hash,derivativeKind),parent=path.dirname(final);await noLinks(parent);await fs.mkdir(parent,{recursive:true});await noLinks(parent);const staging=await fs.mkdtemp(path.join(parent,'.build-'));await noLinks(staging);
      try{const result=await derive({filePath:original,cacheDir:staging,kind:derivativeKind,capabilities,signal,onProgress:value=>progress?.({fraction:value.progress,message:value.phase})});check(signal);
        if(typeof result?.filePath!=='string'||path.dirname(path.resolve(result.filePath))!==staging)throw Error('Derivative worker returned a file outside managed staging.');await noLinks(result.filePath);const info=await fs.stat(result.filePath);if(!info.isFile()||info.size<1||info.size>maxBytes)throw Error('Media derivative exceeds the cache byte limit.');
        const fileName=fileNames[derivativeKind],target=path.join(staging,fileName);if(result.filePath!==target)await fs.rename(result.filePath,target);
        const manifest={version:RECIPE,itemId:document.id,hash:asset.hash,kind:derivativeKind,fileName,bytes:info.size,outputHash:await digest(target,signal),createdAt:new Date().toISOString(),...(derivativeKind==='waveform'?{waveform:result.waveform,waveformDuration:result.waveformDuration}:{})};
        if(derivativeKind==='waveform'&&(!Array.isArray(manifest.waveform)||manifest.waveform.length>1000||manifest.waveform.some(n=>!Number.isFinite(n)||n<0||n>1)||!(manifest.waveformDuration>0)||manifest.waveformDuration>600))throw Error('Worker produced invalid waveform peaks.');
        const json=JSON.stringify(manifest);if((await cacheBytes())+info.size+Buffer.byteLength(json)>maxBytes)throw Error('Media preview cache is full. Remove old cached previews before generating more.');await fs.writeFile(path.join(staging,'recipe.json'),json,{flag:'wx'});check(signal);await noLinks(final);await fs.rename(staging,final);return {toolVersion:'MuseBench verified media derivative v1'};
      }finally{await fs.rm(staging,{recursive:true,force:true});}
    },
    async request({itemId,assetId,kind:k,queue}){
      if(closed)throw Error('Media cache is closed.');kind(k);id(itemId);id(assetId);if(!queue?.create||!queue?.list)throw Error('Shared studio job queue is unavailable.');
      const key=`${itemId}/${assetId}/${k}`,previous=requestLocks.get(key)||Promise.resolve();const pending=previous.catch(()=>{}).then(async()=>{
        const document=await readDocument(itemId);if(document.id!==itemId)throw Error('Media item identity changed.');const asset=await source(itemId,assetId);if(!document.assets.some(a=>a.id===assetId&&a.hash===asset.hash))throw Error('Save the imported media before generating previews.');
        const cached=await load(itemId,asset.hash,k);if(cached)return {derivative:publicReceipt(cached.manifest,assetId)};
        const active=(await queue.list({itemId})).find(j=>j.kind==='mediaDerivative'&&['queued','running','cancelling'].includes(j.state)&&j.settings.assetId===assetId&&j.settings.sourceHash===asset.hash&&j.settings.derivativeKind===k);if(active)return {job:active};
        const job=await queue.create({itemId,revision:document.revision,document,kind:'mediaDerivative',format:'json',settings:{assetId,sourceHash:asset.hash,derivativeKind:k}});return {job};
      });requestLocks.set(key,pending);try{return await pending;}finally{if(requestLocks.get(key)===pending)requestLocks.delete(key);}
    },
    async list({itemId,assetId}){const asset=await source(itemId,assetId),derivatives=[];for(const k of KINDS){const cached=await load(itemId,asset.hash,k);if(cached)derivatives.push(publicReceipt(cached.manifest,assetId));}return {derivatives};},
    async resolve({itemId,assetId,hash:sourceHash,kind:k}){kind(k);hash(sourceHash);await source(itemId,assetId,sourceHash);const result=await load(itemId,sourceHash,k);if(!result)throw Error('Cached media preview is unavailable. Generate it again.');return {filePath:result.filePath,mediaType:mediaTypes[k]};},
    async close(){closed=true;await Promise.allSettled([...requestLocks.values()]);},
  };return cache;
}
