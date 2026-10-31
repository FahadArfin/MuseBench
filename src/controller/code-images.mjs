import {createHash} from 'node:crypto';
import {mkdir,lstat,readFile,writeFile,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {imageReferences,MAX_IMAGE_BYTES} from '../shared/code-images.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
function decode(dataUrl){
 if(typeof dataUrl!=='string'||dataUrl.length>Math.ceil(MAX_IMAGE_BYTES/3)*4+100)throw Error('Each screenshot must be at most 8 MB.');
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
 if(!match)throw Error('Choose a PNG, JPEG or WebP image.');
 const bytes=Buffer.from(match[2],'base64'),mime=match[1];
 const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid||bytes.length>MAX_IMAGE_BYTES||bytes.toString('base64')!==match[2])throw Error('Invalid or oversized image.');
 return{bytes,mime};
}
export function createImageStore(dataDir){
 const root=path.resolve(dataDir,'code-images');
 async function directory(projectId){
  if(typeof projectId!=='string'||!projectId||projectId.length>200)throw Error('Invalid screenshot project.');
  await mkdir(root,{recursive:true});if((await lstat(root)).isSymbolicLink())throw Error('Screenshot storage changed.');
  const dir=path.join(root,hash(projectId));await mkdir(dir,{recursive:true});
  if((await lstat(dir)).isSymbolicLink()||path.dirname(await realpath(dir))!==await realpath(root))throw Error('Screenshot storage changed.');return dir;
 }
 async function fileFor(projectId,ref){
  const file=path.join(await directory(projectId),`${ref.id}.${extensions[ref.mime]}`);
  let info;try{info=await lstat(file);}catch{throw Error('Screenshot is unavailable. Attach it again.');}
  if(!info.isFile()||info.isSymbolicLink()||info.size!==ref.bytes)throw Error('Screenshot changed. Attach it again.');
  const bytes=await readFile(file);if(hash(bytes)!==ref.id)throw Error('Screenshot changed. Attach it again.');return{file,bytes};
 }
 return{
  async import(projectId,input){
   const {bytes,mime}=decode(input?.dataUrl),name=String(input?.name||'Screenshot').replace(/[\u0000-\u001f]/g,'').slice(0,160)||'Screenshot';
   const ref={id:hash(bytes),name,mime,bytes:bytes.length},file=path.join(await directory(projectId),`${ref.id}.${extensions[mime]}`);
   try{await writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;await fileFor(projectId,ref);}return ref;
  },
  async release(projectId,refs){for(const ref of imageReferences(refs)){const file=path.join(await directory(projectId),`${ref.id}.${extensions[ref.mime]}`);try{const info=await lstat(file);if(info.isFile()&&!info.isSymbolicLink())await unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}}},
  async resolve(projectId,refs){return Promise.all(imageReferences(refs).map(async ref=>(await fileFor(projectId,ref)).file));},
  async read(projectId,value){const [ref]=imageReferences([value]);const {bytes}=await fileFor(projectId,ref);return`data:${ref.mime};base64,${bytes.toString('base64')}`;}
 };
}
