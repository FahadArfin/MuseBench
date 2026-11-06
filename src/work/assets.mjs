import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {WORK_ASSET_LIMITS} from '../shared/work-limits.mjs';
import {validateWorkAssetOrigin} from '../shared/work-documents.mjs';
import {renameWorkFile} from './work-fs.mjs';
export {WORK_ASSET_LIMITS} from '../shared/work-limits.mjs';

// Header limits apply before the native decoder sees any bytes. SVG is deliberately absent.
const RASTERS={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
const MEDIA={mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg',aac:'audio/aac'};
const OFFICE={pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',zip:'application/zip'};
const TYPES={...RASTERS,...MEDIA,...OFFICE};
const MAX_MEDIA_BYTES=2*1024**3;
async function fileHash(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
function validMediaHeader(head,ext){if(['mp4','mov','m4a'].includes(ext))return ['ftyp','wide','mdat','moov'].includes(head.toString('ascii',4,8));if(['webm','mkv'].includes(ext))return head.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));if(ext==='wav')return head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WAVE';if(ext==='ogg')return head.toString('ascii',0,4)==='OggS';if(ext==='mp3')return head.toString('ascii',0,3)==='ID3'||head[0]===255&&(head[1]&0xe0)===0xe0;return ext==='aac'&&head[0]===255&&(head[1]&0xf6)===0xf0;}
const clone=value=>structuredClone(value);
const safeId=(value,label='item')=>{if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(value))throw Error(`Invalid ${label} ID`);return value;};
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function jpegOrientation(buffer){
 let offset=2;while(offset+4<=buffer.length){if(buffer[offset++]!==255)return 1;while(buffer[offset]===255)offset++;const marker=buffer[offset++];if(marker===0xda||marker===0xd9)return 1;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;if(offset+2>buffer.length)return 1;const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)return 1;
  if(marker===0xe1&&length>=16&&buffer.toString('ascii',offset+2,offset+8)==='Exif\0\0'){
   const start=offset+8,end=offset+length,little=buffer.toString('ascii',start,start+2)==='II';if(!little&&buffer.toString('ascii',start,start+2)!=='MM')return 1;const u16=at=>at+2<=end?(little?buffer.readUInt16LE(at):buffer.readUInt16BE(at)):NaN,u32=at=>at+4<=end?(little?buffer.readUInt32LE(at):buffer.readUInt32BE(at)):NaN;
   if(u16(start+2)!==42)return 1;const ifd=start+u32(start+4),count=u16(ifd);if(!Number.isInteger(count)||count>256)return 1;for(let i=0;i<count;i++){const entry=ifd+2+i*12;if(entry+12>end)return 1;if(u16(entry)===0x112&&u16(entry+2)===3&&u32(entry+4)===1){const orientation=u16(entry+8);return orientation>=1&&orientation<=8?orientation:1;}}
  }offset+=length;
 }return 1;
}
function dimensions(buffer,ext){
 let width,height,mediaType;
 if(buffer.length>=33&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.toString('ascii',12,16)==='IHDR'){
  mediaType='image/png';width=buffer.readUInt32BE(16);height=buffer.readUInt32BE(20);
 }else if(buffer.length>=12&&buffer[0]===255&&buffer[1]===216){
  mediaType='image/jpeg';let offset=2;
  while(offset+4<=buffer.length){if(buffer[offset++]!==255)throw Error('Malformed JPEG marker');while(buffer[offset]===255)offset++;const marker=buffer[offset++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;if(offset+2>buffer.length)break;const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)throw Error('Malformed JPEG segment');if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)throw Error('Malformed JPEG dimensions');height=buffer.readUInt16BE(offset+3);width=buffer.readUInt16BE(offset+5);break;}offset+=length;}
 }else if(buffer.length>=30&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'){
  mediaType='image/webp';if(buffer.readUInt32LE(4)+8!==buffer.length)throw Error('Malformed WebP length');const chunk=buffer.toString('ascii',12,16);
  if(chunk==='VP8X'){width=1+buffer.readUIntLE(24,3);height=1+buffer.readUIntLE(27,3);}else if(chunk==='VP8 '&&buffer[23]===157&&buffer[24]===1&&buffer[25]===42){width=buffer.readUInt16LE(26)&0x3fff;height=buffer.readUInt16LE(28)&0x3fff;}else if(chunk==='VP8L'&&buffer[20]===47){const bits=buffer.readUInt32LE(21);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
 }
 if(!mediaType||!width||!height)throw Error('Unsupported or malformed raster image');
 if(TYPES[ext]!==mediaType)throw Error('Image extension does not match its content');
 if(width>WORK_ASSET_LIMITS.maxDimension||height>WORK_ASSET_LIMITS.maxDimension||width*height>WORK_ASSET_LIMITS.maxPixels)throw Error('Image exceeds the 24 megapixel / 12000 pixel import limit');
 if(mediaType==='image/jpeg'){const orientation=jpegOrientation(buffer),encodedWidth=width,encodedHeight=height;if(orientation>=5)[width,height]=[height,width];return{width,height,mediaType,orientation,encodedWidth,encodedHeight};}
 return{width,height,mediaType};
}
async function noLinks(target,allowMissing=false){
 const absolute=path.resolve(target),parsed=path.parse(absolute);let current=parsed.root;
 for(const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);let stat;try{stat=await fs.lstat(current);}catch(error){if(allowMissing&&error.code==='ENOENT')return absolute;throw error;}if(stat.isSymbolicLink())throw Error('Symbolic links and junctions are not allowed for managed images');}
 return absolute;
}
async function ensureDirectory(dir){await noLinks(dir,true);await fs.mkdir(dir,{recursive:true});await noLinks(dir);return dir;}
async function atomicJson(file,value){const temp=`${file}.${randomUUID()}.tmp`;try{await fs.writeFile(temp,JSON.stringify(value),{flag:'wx'});await renameWorkFile(temp,file);}finally{await fs.rm(temp,{force:true});}}
async function immutableWrite(file,buffer){
 try{await noLinks(file);if(hash(await fs.readFile(file))!==hash(buffer))throw Error('Managed asset integrity mismatch');return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const staged=`${file}.${randomUUID()}.tmp`;try{await fs.writeFile(staged,buffer,{flag:'wx'});await renameWorkFile(staged,file);}finally{await fs.rm(staged,{force:true});}
}
async function immutableCopy(source,file,digest){
 try{await noLinks(file);if(await fileHash(file)!==digest)throw Error('Managed asset integrity mismatch');return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const staged=`${file}.${randomUUID()}.tmp`;try{await fs.copyFile(source,staged,constants.COPYFILE_EXCL);await renameWorkFile(staged,file);}finally{await fs.rm(staged,{force:true});}
}
function references(document){const counts=new Map();const visit=(value,depth=0)=>{if(depth>64||value===null||typeof value!=='object')return;if(typeof value.assetId==='string')counts.set(value.assetId,(counts.get(value.assetId)||0)+1);for(const child of Object.values(value))visit(child,depth+1);};visit(document?.data??document);return counts;}
export function createWorkAssetStore({rootDir,decodeImage,probeMedia,createMediaThumbnail,getDocument}={}){
 if(!rootDir)throw Error('Managed asset storage root is required');
 const root=path.resolve(rootDir),tokens=new Map(),locks=new Map();
 const itemDir=async itemId=>ensureDirectory(path.join(root,safeId(itemId),'assets'));
 const locked=async(itemId,work)=>{const previous=locks.get(itemId)||Promise.resolve();const next=previous.catch(()=>{}).then(work);locks.set(itemId,next);try{return await next;}finally{if(locks.get(itemId)===next)locks.delete(itemId);}};
 async function catalog(itemId){
  const dir=await itemDir(itemId),file=path.join(dir,'catalog.json');try{await noLinks(file);const info=await fs.stat(file);if(info.size>8*1024*1024)throw Error('Managed asset catalog exceeds the recovery limit');const value=JSON.parse(await fs.readFile(file,'utf8'));value.history??=[];value.library??={};
   if(value.version!==1||!Array.isArray(value.assets)||value.assets.length>4096||!Array.isArray(value.history)||value.history.length>4096)throw Error('Invalid managed asset catalog');
   for(const asset of [...value.assets,...value.history]){safeId(asset.id,'asset');if(!/^[a-f0-9]{64}$/.test(asset.hash)||!/^originals\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/.test(asset.storageRef)||!asset.storageRef.startsWith(`originals/${asset.hash}.`)||!Object.values(TYPES).includes(asset.mediaType)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>MAX_MEDIA_BYTES)throw Error('Invalid managed asset catalog');}
   return value;
  }catch(error){if(error.code==='ENOENT')return{version:1,assets:[],history:[],library:{}};throw error;}
 }
 async function resolveRecord(itemId,asset,thumbnail=false){const dir=await itemDir(itemId),relative=thumbnail?`thumbnails/${asset.hash}.png`:asset.storageRef,file=path.resolve(dir,relative);if(!file.startsWith(dir+path.sep))throw Error('Invalid managed asset reference');await noLinks(file);const stat=await fs.stat(file);if(!stat.isFile()||stat.size>(thumbnail?2*1024*1024:MAX_MEDIA_BYTES)||!thumbnail&&stat.size!==asset.bytes)throw Error('Invalid managed asset file');return file;}
 async function find(itemId,assetId,expectedHash){safeId(assetId,'asset');if(expectedHash!==undefined&&!/^[a-f0-9]{64}$/.test(expectedHash))throw Error('Invalid asset hash');const value=await catalog(itemId),asset=[...value.assets,...value.history].find(asset=>asset.id===assetId&&(!expectedHash||asset.hash===expectedHash));if(!asset)throw Error('Managed asset not found');return asset;}
 async function addRecord(itemId,value,record,replaceAssetId){value.library[record.id]??={addedAt:new Date().toISOString(),favorite:false};const index=value.assets.findIndex(asset=>asset.id===record.id);if(index<0)value.assets.push(record);else{const previous=value.assets[index];if(previous.hash!==record.hash&&!value.history.some(asset=>asset.id===previous.id&&asset.hash===previous.hash)){if(value.history.length>=4096)throw Error('Asset history is full. Create another Work item to keep all original revisions.');value.history.push(previous);}value.assets[index]=record;}await atomicJson(path.join(await itemDir(itemId),'catalog.json'),value);return record;}
 async function importMediaFile(itemId,source,name,ext,value,replaceAssetId,origin){
  if(typeof probeMedia!=='function')throw Error('Verified FFmpeg / FFprobe media import is unavailable');const dir=await itemDir(itemId),staging=await ensureDirectory(path.join(dir,'.staging')),temporary=path.join(staging,`${randomUUID()}.${ext}`);
  try{await fs.copyFile(source,temporary,constants.COPYFILE_EXCL);await noLinks(source);const stat=await fs.stat(temporary);if(stat.size<1||stat.size>MAX_MEDIA_BYTES)throw Error('Media exceeds the 2 GiB file limit');const handle=await fs.open(temporary,'r');const head=Buffer.alloc(32);try{await handle.read(head,0,32,0);}finally{await handle.close();}if(!validMediaHeader(head,ext))throw Error('Media extension does not match its container');
   const metadata=await probeMedia({filePath:temporary});if(!metadata?.decodable||!Number.isFinite(metadata.duration)||metadata.duration<=0||metadata.duration>7200||metadata.width>8192||metadata.height>8192)throw Error('Media is not decodable or exceeds the 2 hour / 8192 pixel limit');
   const digest=await fileHash(temporary),duplicate=value.assets.find(asset=>asset.hash===digest&&!asset.deletedAt&&JSON.stringify(asset.origin)===JSON.stringify(origin));if(duplicate&&!replaceAssetId)return clone(duplicate);const storageRef=`originals/${digest}.${ext}`;await ensureDirectory(path.join(dir,'originals'));await immutableCopy(temporary,path.join(dir,storageRef),digest);
   if(createMediaThumbnail&&metadata.width){const thumbnail=await createMediaThumbnail({filePath:temporary,metadata,maxThumbnailSize:WORK_ASSET_LIMITS.thumbnailSize});if(!Buffer.isBuffer(thumbnail)||thumbnail.length>2*1024*1024)throw Error('Media thumbnail could not be generated');dimensions(thumbnail,'png');await ensureDirectory(path.join(dir,'thumbnails'));await immutableWrite(path.join(dir,'thumbnails',`${digest}.png`),thumbnail);}
   const record={id:replaceAssetId||randomUUID(),hash:digest,name,mediaType:TYPES[ext],bytes:stat.size,storageRef,...(metadata.width?{width:metadata.width,height:metadata.height}:{}),duration:metadata.duration,origin};await addRecord(itemId,value,record,replaceAssetId);return clone(record);
  }finally{await fs.rm(temporary,{force:true});}
 }
 const store={
  async initialize(){await ensureDirectory(root);},
  issueImportToken({itemId,ownerId,paths=[],expiresInMs=60_000}){safeId(itemId);if(typeof ownerId!=='string'||!ownerId)throw Error('Import owner is required');if(!Array.isArray(paths)||paths.length>WORK_ASSET_LIMITS.maxFilesPerImport||paths.some(file=>typeof file!=='string'||!path.isAbsolute(file)))throw Error('Native picker returned invalid files');const token=randomUUID();const now=Date.now();for(const[key,value]of tokens)if(value.expiresAt<now)tokens.delete(key);tokens.set(token,{itemId,ownerId,paths:[...paths],expiresAt:now+Math.min(60_000,expiresInMs)});return token;},
  async import({itemId,ownerId,importToken,replaceAssetId,origin='import'}){
   safeId(itemId);origin=validateWorkAssetOrigin(origin);const token=tokens.get(importToken);if(!token)throw Error('Invalid or consumed import token');if(token.itemId!==itemId||token.ownerId!==ownerId)throw Error('Import token belongs to another item or owner');tokens.delete(importToken);if(token.expiresAt<Date.now())throw Error('Import token expired');if(replaceAssetId&&token.paths.length!==1)throw Error('Relink requires exactly one file');
   return locked(itemId,async()=>{const assets=[],errors=[],value=await catalog(itemId),dir=await itemDir(itemId);let importBytes=0;if(replaceAssetId&&!value.assets.some(asset=>asset.id===replaceAssetId))throw Error('Managed asset not found');
    for(const source of token.paths){const name=path.basename(source).slice(0,200);try{
     const ext=path.extname(name).slice(1).toLowerCase();if(!RASTERS[ext]&&!MEDIA[ext])throw Error('Unsupported image, audio or video format');await noLinks(source);const stat=await fs.stat(source);if(!stat.isFile()||stat.size<1||stat.size>(MEDIA[ext]?MAX_MEDIA_BYTES:WORK_ASSET_LIMITS.maxFileBytes))throw Error(MEDIA[ext]?'Media exceeds the 2 GiB file limit':'Image exceeds the 25 MiB file limit');importBytes+=stat.size;if(importBytes>(MEDIA[ext]?MAX_MEDIA_BYTES*2:WORK_ASSET_LIMITS.maxImportBytes))throw Error('Import exceeds the batch byte limit');if(value.assets.filter(asset=>!asset.deletedAt).length>=WORK_ASSET_LIMITS.maxAssetsPerItem&&!replaceAssetId)throw Error('This item has reached the 256 asset limit');if(MEDIA[ext]){const record=await importMediaFile(itemId,source,name,ext,value,replaceAssetId,origin);if(!assets.some(asset=>asset.id===record.id))assets.push(record);continue;}
     const handle=await fs.open(source,'r');let buffer;try{const opened=await handle.stat();if((stat.dev!==0&&opened.dev!==stat.dev)||opened.ino!==stat.ino||opened.size!==stat.size)throw Error('Image changed during import');buffer=await handle.readFile();}finally{await handle.close();}await noLinks(source);if(buffer.length!==stat.size)throw Error('Image changed during import');const header=dimensions(buffer,ext),digest=hash(buffer);
     const duplicate=value.assets.find(asset=>asset.hash===digest&&!asset.deletedAt&&JSON.stringify(asset.origin)===JSON.stringify(origin));if(duplicate&&!replaceAssetId){if(!assets.some(asset=>asset.id===duplicate.id))assets.push(clone(duplicate));continue;}
     if(value.assets.filter(asset=>!asset.deletedAt).length>=WORK_ASSET_LIMITS.maxAssetsPerItem&&!replaceAssetId)throw Error('This item has reached the 256 asset limit');if(typeof decodeImage!=='function')throw Error('Native image decoder is unavailable');const decoded=await decodeImage({buffer,...header,maxThumbnailSize:WORK_ASSET_LIMITS.thumbnailSize});if(decoded?.width!==header.width||decoded?.height!==header.height||!Buffer.isBuffer(decoded.thumbnail)||decoded.thumbnail.length>2*1024*1024)throw Error('Image decoder failed to validate the raster');dimensions(decoded.thumbnail,'png');
     const normalizedExt=ext==='jpeg'?'jpg':ext,storageRef=`originals/${digest}.${normalizedExt}`;await ensureDirectory(path.join(dir,'originals'));await ensureDirectory(path.join(dir,'thumbnails'));await immutableWrite(path.join(dir,storageRef),buffer);await immutableWrite(path.join(dir,'thumbnails',`${digest}.png`),decoded.thumbnail);
     const record={id:replaceAssetId||randomUUID(),hash:digest,name,mediaType:header.mediaType,bytes:buffer.length,storageRef,width:header.width,height:header.height,origin};await addRecord(itemId,value,record,replaceAssetId);assets.push(clone(record));
    }catch(error){errors.push({name,error:error.message||'Image import failed'});}}
    return{assets,errors,cancelled:token.paths.length===0};});
  },
  async importBytes({itemId,asset,buffer,name=asset?.name,mediaType=asset?.mediaType,origin=asset?.origin||'import',validated=false}){
   safeId(itemId);if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_MEDIA_BYTES)throw Error('Invalid or oversized asset bytes');origin=validateWorkAssetOrigin(origin);const ext=Object.keys(TYPES).find(key=>TYPES[key]===mediaType);if(!ext)throw Error('Unsupported asset media type');if(asset?.hash&&hash(buffer)!==asset.hash)throw Error('Imported asset hash does not match package metadata');
   const displayName=typeof name==='string'&&name.trim()?path.basename(name).slice(0,200):`Imported asset.${ext}`;
   if(OFFICE[ext]){if(!validated)throw Error('Office/package originals require a trusted validated importer');if(buffer.length>64*1024*1024||buffer[0]!==80||buffer[1]!==75||buffer[2]!==3||buffer[3]!==4)throw Error('Invalid or oversized Office/package original');return locked(itemId,async()=>{const value=await catalog(itemId);if(value.assets.filter(asset=>!asset.deletedAt).length>=WORK_ASSET_LIMITS.maxAssetsPerItem)throw Error('This item has reached the 256 asset limit');const digest=hash(buffer),duplicate=value.assets.find(asset=>asset.hash===digest&&!asset.deletedAt&&JSON.stringify(asset.origin)===JSON.stringify(origin));if(duplicate)return clone(duplicate);const dir=await itemDir(itemId),storageRef=`originals/${digest}.${ext}`;await ensureDirectory(path.join(dir,'originals'));await immutableWrite(path.join(dir,storageRef),buffer);const record={id:randomUUID(),hash:digest,name:displayName,mediaType,bytes:buffer.length,storageRef,origin};await addRecord(itemId,value,record);return clone(record);});}
   const staging=await ensureDirectory(path.join(root,'.imports')),temporary=path.join(staging,`${randomUUID()}.${ext}`),ownerId=randomUUID();try{await fs.writeFile(temporary,buffer,{flag:'wx'});const importToken=store.issueImportToken({itemId,ownerId,paths:[temporary]});const result=await store.import({itemId,ownerId,importToken,origin});if(result.errors.length)throw Error(result.errors[0].error);return store.rename({itemId,assetId:result.assets[0].id,name:displayName});}finally{await fs.rm(temporary,{force:true});}
  },
  async copy({sourceItemId,itemId,assetId,hash:expectedHash}){const asset=await find(sourceItemId,assetId,expectedHash),file=await store.resolve({itemId:sourceItemId,assetId,hash:asset.hash});if(OFFICE[path.extname(file).slice(1)])return store.importBytes({itemId,asset,buffer:await fs.readFile(file),origin:'converted',validated:true});const ownerId=randomUUID(),importToken=store.issueImportToken({itemId,ownerId,paths:[file]});const result=await store.import({itemId,ownerId,importToken,origin:'converted'});if(result.errors.length)throw Error(result.errors[0].error);return store.rename({itemId,assetId:result.assets[0].id,name:asset.name});},
  async list({itemId,document}={}){const value=await catalog(itemId),counts=references(document||(getDocument?await getDocument(itemId):null));return Promise.all(value.assets.filter(asset=>!asset.deletedAt).map(async asset=>{let missing=false;try{await resolveRecord(itemId,asset);}catch{missing=true;}return{...clone(asset),...clone(value.library[asset.id]||{}),missing,usageCount:counts.get(asset.id)||0};}));},
  async describe({itemId,assetId,hash:expectedHash}){return clone(await find(itemId,assetId,expectedHash));},
  async resolve({itemId,assetId,hash:expectedHash,thumbnail=false}){const asset=await find(itemId,assetId,expectedHash),file=await resolveRecord(itemId,asset,thumbnail);if(!thumbnail&&await fileHash(file)!==asset.hash)throw Error('Managed asset integrity mismatch');return file;},
  async read({itemId,assetId,hash:expectedHash,thumbnail=false}){const asset=await find(itemId,assetId,expectedHash),file=await resolveRecord(itemId,asset,thumbnail),buffer=await fs.readFile(file);if(!thumbnail&&hash(buffer)!==asset.hash)throw Error('Managed asset integrity mismatch');return{buffer,mediaType:thumbnail?'image/png':asset.mediaType,asset:clone(asset)};},
  async rename({itemId,assetId,name}){if(typeof name!=='string'||!name.trim()||name.length>200||/[\u0000-\u001f]/.test(name))throw Error('Asset name must be between 1 and 200 characters');return locked(itemId,async()=>{const value=await catalog(itemId),asset=value.assets.find(asset=>asset.id===assetId);if(!asset)throw Error('Managed asset not found');asset.name=name.trim();await atomicJson(path.join(await itemDir(itemId),'catalog.json'),value);return clone(asset);});},
  async setFavorite({itemId,assetId,favorite}){if(typeof favorite!=='boolean')throw Error('Favorite must be true or false');return locked(itemId,async()=>{const value=await catalog(itemId);if(!value.assets.some(asset=>asset.id===assetId&&!asset.deletedAt))throw Error('Managed asset not found');value.library[assetId]={...value.library[assetId],favorite};await atomicJson(path.join(await itemDir(itemId),'catalog.json'),value);return{assetId,favorite};});},
  async markUsed({itemId,assetId}){return locked(itemId,async()=>{const value=await catalog(itemId);if(!value.assets.some(asset=>asset.id===assetId))throw Error('Managed asset not found');value.library[assetId]={...value.library[assetId],lastUsedAt:new Date().toISOString()};await atomicJson(path.join(await itemDir(itemId),'catalog.json'),value);return{assetId,lastUsedAt:value.library[assetId].lastUsedAt};});},
  async remove({itemId,assetId}){return locked(itemId,async()=>{const value=await catalog(itemId),asset=value.assets.find(asset=>asset.id===assetId);if(!asset)throw Error('Managed asset not found');asset.deletedAt=new Date().toISOString();await atomicJson(path.join(await itemDir(itemId),'catalog.json'),value);return{removed:true,preservedForHistory:true};});},
  async close(){tokens.clear();await Promise.allSettled([...locks.values()]);},
 };
 return store;
}

