import {createHash} from 'node:crypto';
import {lstat,realpath,open} from 'node:fs/promises';
import path from 'node:path';
const safePath=p=>typeof p==='string'&&p.length<1000&&!p.includes('\\')&&!p.includes(':')&&!p.includes('\0')&&!path.posix.isAbsolute(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..')&&/\.(png|jpe?g|webp)$/i.test(p);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const mime=bytes=>bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
export function createSessionMedia({getState,readHistory,capturedImages,readUpload,thumbnail}){
 let manifest=null;
 const bind=taskId=>{const state=getState();if(!taskId||state.task?.id!==taskId||state.activeProject?.id!==state.task.projectId)throw Error('Open the original chat to view its images.');return state;};
 const unchanged=(taskId,root)=>{if(bind(taskId).activeProject.root!==root)throw Error('The image project changed.');};
 async function list(taskId){
  const state=bind(taskId),root=state.activeProject.root,items=[],seen=new Set();let before,omitted=0;
  for(let page=0;page<5;page++){
   const history=await readHistory({taskId,before,limit:150});unchanged(taskId,root);
   for(const message of history.messages??[])for(const image of message.images??[])if(!seen.has(image.id)){seen.add(image.id);if(items.length<100)items.push({id:'upload:'+image.id,kind:message.role==='assistant'?'created':'uploaded',name:image.name,image});else omitted++;}
   if(!history.before)break;before=history.before;
  }
  for(const image of [...(state.task.promptQueue??[]).flatMap(item=>item.images??[]),...(state.drafts?.[state.task.projectId+':'+taskId]?.images??[])])if(!seen.has(image.id)){seen.add(image.id);if(items.length<100)items.push({id:'upload:'+image.id,kind:'uploaded',name:image.name,image});else omitted++;}
  for(const file of await capturedImages(taskId))if(safePath(file.path)&&/^[a-f0-9]{64}$/.test(file.afterHash??'')&&!seen.has(file.path)){
   seen.add(file.path);if(items.length<100)items.push({id:'file:'+sha(file.path+':'+file.afterHash),kind:file.status==='added'?'created':'modified',name:path.posix.basename(file.path),path:file.path,hash:file.afterHash,runId:file.runId});else omitted++;
  }
  unchanged(taskId,root);manifest={taskId,root,items,omitted};return{items,omitted};
 }
 return{async command(input){
  if(!input||!['list','read'].includes(input.type)||Object.keys(input).some(k=>!['type','taskId','id','thumbnail'].includes(k)))throw Error('Invalid chat image command.');
  const state=bind(input.taskId),root=state.activeProject.root,result=input.type==='list'||manifest?.taskId!==input.taskId||manifest.root!==root?await list(input.taskId):manifest;if(input.type==='list')return result;
  const item=result.items.find(item=>item.id===input.id);if(!item)throw Error('The image is no longer part of this chat.');let bytes;
  if(item.image){const dataUrl=await readUpload({projectId:state.task.projectId,image:item.image});const match=/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);if(!match)throw Error('The uploaded image is unavailable.');bytes=Buffer.from(match[1],'base64');}
  else{
   const base=await realpath(root);let current=base;
   for(const segment of item.path.split('/')){current=path.join(current,segment);if((await lstat(current)).isSymbolicLink())throw Error('The image path changed.');}
   const resolved=await realpath(current);if(!resolved.startsWith(base+path.sep))throw Error('The image path changed.');
   const handle=await open(resolved,'r');try{const info=await handle.stat();if(!info.isFile()||info.size<8||info.size>8*1024*1024)throw Error('Choose a captured image up to 8 MiB.');const buffer=Buffer.alloc(info.size+1),read=await handle.read(buffer,0,buffer.length,0);bytes=buffer.subarray(0,read.bytesRead);if(bytes.length!==info.size||sha(bytes)!==item.hash)throw Error('The captured image changed on disk.');}finally{await handle.close();}
  }
  unchanged(input.taskId,root);const type=mime(bytes);if(!type||bytes.length>8*1024*1024)throw Error('The image is invalid or too large.');
  return{dataUrl:input.thumbnail===false?`data:${type};base64,${bytes.toString('base64')}`:await thumbnail(bytes)};
 }};
}
