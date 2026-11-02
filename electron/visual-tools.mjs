import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, open, realpath} from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES=20*1024*1024,MAX_DIMENSION=16384,MAX_PIXELS=40_000_000;
const PNG=Buffer.from('89504e470d0a1a0a','hex');
const fail=()=>{throw Error('The image is invalid, unsupported, or exceeds the image limits.');};
const changed=()=>{throw Error('The image or its project changed. Retry from the current chat.');};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const crcTable=Array.from({length:256},(_,value)=>{for(let n=0;n<8;n++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
function crc(bytes){let value=0xffffffff;for(const byte of bytes)value=(value>>>8)^crcTable[(value^byte)&255];return(value^0xffffffff)>>>0;}
function dimensions(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_DIMENSION||height>MAX_DIMENSION||width*height>MAX_PIXELS)fail();return{width,height};}

// Inspect container structure and dimensions before handing any bytes to a decoder.
// Actual pixel decoding remains the injected native decoder's responsibility.
function pngInfo(bytes){
 let offset=8,size=null,idat=false,ended=false,palette=false;
 while(offset+12<=bytes.length){
  const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),end=offset+12+length;
  if(end>bytes.length||!/^[A-Za-z]{4}$/.test(type)||crc(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))fail();
  const data=bytes.subarray(offset+8,end-4);
  if(!size&&type!=='IHDR')fail();
  if(type==='IHDR'){
   if(size||length!==13)fail();size=dimensions(data.readUInt32BE(0),data.readUInt32BE(4));
   const validDepths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!validDepths[data[9]]?.includes(data[8])||data[10]!==0||data[11]!==0||data[12]>1)fail();
   size.paletteRequired=data[9]===3;
  }else if(type==='PLTE'){if(idat||palette||!length||length%3||length>768)fail();palette=true;}
  else if(type==='IDAT'){if(ended||size.paletteRequired&&!palette)fail();idat=true;}
  else if(type==='IEND'){if(length||!idat||end!==bytes.length)fail();return{...dimensions(size.width,size.height),mimeType:'image/png'};}
  else{
   if(idat)ended=true;
   if(['acTL','fcTL','fdAT'].includes(type)||type[0]===type[0].toUpperCase())fail();
  }
  offset=end;
 }
 fail();
}
function jpegInfo(bytes){
 let offset=2,size=null,scan=false;
 while(offset<bytes.length){
  if(bytes[offset++]!==255)fail();while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];
  if(marker===0xd9){if(!size||!scan||offset!==bytes.length)fail();return{...size,mimeType:'image/jpeg'};}
  if(marker===0||marker===0xd8||marker===0x01||marker>=0xd0&&marker<=0xd7||offset+2>bytes.length)fail();
  const length=bytes.readUInt16BE(offset),end=offset+length;if(length<2||end>bytes.length)fail();
  if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)){
   if(size||![0xc0,0xc1,0xc2].includes(marker)||length<8||bytes[offset+2]!==8)fail();
   const components=bytes[offset+7];if(![1,3,4].includes(components)||length!==8+3*components)fail();
   size=dimensions(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3));
  }
  if(marker===0xdc)fail(); // A late height definition cannot bypass the allocation limit.
  if(marker===0xda){
   if(!size||length<6||length!==6+2*bytes[offset+2])fail();scan=true;offset=end;
   // Skip entropy-coded bytes, escaped 0xff, and restart markers to the next segment.
   while(offset<bytes.length){if(bytes[offset]!==255){offset++;continue;}const start=offset;while(bytes[offset]===255)offset++;const code=bytes[offset];if(code===0||code>=0xd0&&code<=0xd7){offset++;continue;}offset=start;break;}
  }else offset=end;
 }
 fail();
}
function webpInfo(bytes){
 if(bytes.length<20||bytes.readUInt32LE(4)+8!==bytes.length)fail();
 let offset=12,canvas=null,image=null;
 while(offset+8<=bytes.length){
  const type=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),end=offset+8+length;
  if(end+(length&1)>bytes.length)fail();const data=bytes.subarray(offset+8,end);
  if(type==='VP8X'){
   if(offset!==12||canvas||length!==10||data[0]&0xc3||data[1]||data[2]||data[3])fail();canvas=dimensions(1+data.readUIntLE(4,3),1+data.readUIntLE(7,3));
  }else if(type==='VP8 '){
   if(image||length<10||data[0]&1||!data.subarray(3,6).equals(Buffer.from('9d012a','hex')))fail();image=dimensions(data.readUInt16LE(6)&0x3fff,data.readUInt16LE(8)&0x3fff);
  }else if(type==='VP8L'){
   if(image||length<5||data[0]!==0x2f||data[4]&0xe0)fail();const bits=data.readUInt32LE(1);image=dimensions(1+(bits&0x3fff),1+((bits>>>14)&0x3fff));
  }else if(type==='ANIM'||type==='ANMF')fail();
  offset=end+(length&1);
 }
 if(offset!==bytes.length||!image||canvas&&(canvas.width!==image.width||canvas.height!==image.height))fail();return{...image,mimeType:'image/webp'};
}
function imageInfo(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>MAX_BYTES)fail();
 if(bytes.subarray(0,8).equals(PNG))return pngInfo(bytes);
 if(bytes[0]===255&&bytes[1]===216)return jpegInfo(bytes);
 if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return webpInfo(bytes);
 fail();
}
function dataBytes(value,expectedMime){
 if(typeof value!=='string'||value.length>Math.ceil(MAX_BYTES/3)*4+100)fail();
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||expectedMime&&match[1]!==expectedMime||match[2].length%4)fail();
 const bytes=Buffer.from(match[2],'base64');if(bytes.toString('base64')!==match[2])fail();const info=imageInfo(bytes);if(info.mimeType!==match[1])fail();return{bytes,info};
}
const contained=(base,target)=>{const relative=path.relative(base,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
// Windows lstat reports dev=0 while fstat reports the volume serial number.
// File IDs and creation times still have to agree across both observations.
const sameIdentity=(a,b)=>a.ino!==0n&&a.ino===b.ino&&a.birthtimeNs===b.birthtimeNs&&(a.dev===b.dev||process.platform==='win32'&&(a.dev===0n||b.dev===0n));
const sameFile=(a,b)=>sameIdentity(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
function projectPath(root,value){
 if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f\x7f]/.test(value)||/^(?:\\\\|\/\/)/.test(value))throw Error('Choose an image inside the current project.');
 const absolute=path.isAbsolute(value);if(!absolute&&value.includes('\\'))throw Error('Use a project-relative path with forward slashes.');
 const rest=absolute&&process.platform==='win32'?value.replace(/^[A-Za-z]:/,''):value;
 if(rest.includes(':')||rest.split(/[\\/]/).some(part=>part==='.'||part==='..'||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw Error('Choose a regular image inside the current project.');
 const resolved=absolute?path.resolve(value):path.resolve(root,value);if(!contained(path.resolve(root),resolved))throw Error('Choose an image inside the current project.');
 const relative=path.relative(path.resolve(root),resolved).split(path.sep).join('/');if(!/\.(png|jpe?g|webp)$/i.test(relative))fail();return relative;
}
const publicName=value=>typeof value==='string'?value.split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'').slice(0,255):'image';
function extensionMatches(name,mimeType){return mimeType==='image/png'?/\.png$/i.test(name):mimeType==='image/jpeg'?/\.jpe?g$/i.test(name):/\.webp$/i.test(name);}

/** Read-only image access for one live native turn, bound to its current chat/project. */
export function createVisualTools({getState,getMedia,normalizeImage}){
 function check(owner){
  const state=getState();
  if(!owner||typeof owner.taskId!=='string'||typeof owner.root!=='string'||typeof owner.isCurrent!=='function'||owner.isCurrent()!==true||state.task?.id!==owner.taskId||state.activeProject?.root!==owner.root||state.activeProject?.id!==state.task?.projectId)throw Error('Open the original active chat to view its images.');
 }
 async function list(owner){
  check(owner);const media=getMedia();if(!media?.command)throw Error('Chat images are unavailable.');
  const result=await media.command({type:'list',taskId:owner.taskId});check(owner);
  const items=[],capturedHashes=new Map();const seen=new Set();
  for(const item of (result.items??[]).slice(0,100)){
   if(typeof item.id!=='string'||!/^(?:upload:[A-Za-z0-9._-]{1,200}|file:[a-f0-9]{64})$/.test(item.id)||seen.has(item.id)||!['uploaded','created','modified'].includes(item.kind))continue;
   const clean={id:item.id,name:publicName(item.name),kind:item.kind};
   if(item.path!==undefined){try{clean.path=projectPath(owner.root,item.path);}catch{continue;}}
   if(item.id.startsWith('file:')){
    if(!clean.path||!/^[a-f0-9]{64}$/.test(item.hash??'')||item.id!=='file:'+sha(clean.path+':'+item.hash))continue;
    capturedHashes.set(item.id,item.hash);
   }else if(clean.path)continue;
   seen.add(item.id);items.push(clean);
  }
  return{media,items,capturedHashes,omitted:Number.isSafeInteger(result.omitted)&&result.omitted>0?result.omitted:0};
 }
 async function file(owner,relative){
  check(owner);const rootInfo=await lstat(owner.root,{bigint:true});check(owner);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())changed();
  const base=await realpath(owner.root);check(owner);
  async function verifyRoot(){
   check(owner);const current=await lstat(owner.root,{bigint:true});check(owner);if(!current.isDirectory()||current.isSymbolicLink()||!sameIdentity(rootInfo,current))changed();
   const canonical=await realpath(owner.root);check(owner);if(canonical!==base)changed();
  }
  async function verifyPath(){
   await verifyRoot();check(owner);let current=base;
   for(const segment of relative.split('/')){current=path.join(current,segment);const info=await lstat(current,{bigint:true});check(owner);if(info.isSymbolicLink())changed();}
   const canonical=await realpath(current);check(owner);if(!contained(base,canonical)||path.relative(current,canonical)!=='')changed();return current;
  }
  const filename=await verifyPath();check(owner);const before=await lstat(filename,{bigint:true});check(owner);
  if(!before.isFile()||before.size<12n||before.size>BigInt(MAX_BYTES))fail();
  const handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let closed=false;
  const close=async()=>{if(!closed){closed=true;await handle.close();}};
  try{
   check(owner);const initial=await handle.stat({bigint:true});check(owner);if(!initial.isFile()||!sameFile(before,initial))changed();
   async function verify(){await verifyPath();check(owner);const named=await lstat(filename,{bigint:true});check(owner);const held=await handle.stat({bigint:true});check(owner);if(named.isSymbolicLink()||!sameFile(before,named)||!sameFile(before,held))changed();}
   await verify();check(owner);
   const bytes=Buffer.alloc(Number(initial.size)+1);let offset=0;
   while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,offset);check(owner);if(!read.bytesRead)break;offset+=read.bytesRead;}
   if(offset!==Number(initial.size))changed();await verify();check(owner);
   return{bytes:bytes.subarray(0,offset),verify,close};
  }catch(error){await close();throw error;}
 }
 return{async command(owner,input){
  check(owner);
  const originalOwner=owner,{taskId,root}=owner;
  owner={taskId,root,isCurrent:()=>originalOwner.taskId===taskId&&originalOwner.root===root&&originalOwner.isCurrent()===true};
  if(!input||typeof input!=='object'||Array.isArray(input)||!['list_images','view_image'].includes(input.type)||Object.keys(input).some(key=>!['type','path','id'].includes(key)))throw Error('Invalid image command.');
  if(input.type==='list_images'){
   if(Object.keys(input).length!==1)throw Error('Invalid image list command.');const {items,omitted}=await list(owner);check(owner);return{items,omitted};
  }
  if((typeof input.path==='string')===(typeof input.id==='string')||Object.keys(input).length!==2)throw Error('Specify exactly one project image path or current-chat image ID.');
  let source,metadata,reader;
  try{
   if(typeof input.path==='string'){
    const relative=projectPath(owner.root,input.path);reader=await file(owner,relative);check(owner);source=reader.bytes;metadata={path:relative,name:path.posix.basename(relative)};
   }else{
    if(!input.id||input.id.length>300)throw Error('Invalid chat image ID.');
    const {media,items,capturedHashes}=await list(owner);check(owner);const item=items.find(item=>item.id===input.id);if(!item)throw Error('The image is no longer part of this chat.');
    if(item.id.startsWith('file:')){
     reader=await file(owner,item.path);check(owner);source=reader.bytes;if(sha(source)!==capturedHashes.get(item.id))changed();
    }else{
     const result=await media.command({type:'read',taskId:owner.taskId,id:input.id,thumbnail:false});check(owner);source=dataBytes(result.dataUrl).bytes;
    }
    metadata={...item};
   }
   const info=imageInfo(source);if(reader&&!extensionMatches(metadata.name,info.mimeType))fail();const sourceHash=sha(source);check(owner);
   if(reader){await reader.verify();check(owner);}
   const normalized=await normalizeImage(source,{...metadata,...info});check(owner);
   if(reader){await reader.verify();check(owner);}
   if(!normalized||normalized.originalWidth!==info.width||normalized.originalHeight!==info.height)fail();
   const output=dataBytes(normalized.imageDataUrl,'image/png');dimensions(normalized.width,normalized.height);
   if(output.info.width!==normalized.width||output.info.height!==normalized.height||normalized.width>info.width||normalized.height>info.height)fail();
   if(normalized.thumbnailDataUrl!==undefined)dataBytes(normalized.thumbnailDataUrl,'image/png');
   check(owner);return{...metadata,mimeType:info.mimeType,sha256:sourceHash,imageDataUrl:normalized.imageDataUrl,width:normalized.width,height:normalized.height,originalWidth:info.width,originalHeight:info.height,resized:normalized.width!==info.width||normalized.height!==info.height,...(normalized.thumbnailDataUrl===undefined?{}:{thumbnailDataUrl:normalized.thumbnailDataUrl})};
  }finally{if(reader){await reader.close();check(owner);}}
 }};
}
