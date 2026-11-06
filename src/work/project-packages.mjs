import {createHash,randomUUID} from 'node:crypto';
import {validateWorkDocument} from '../shared/work-documents.mjs';

// No archive paths are interpreted or extracted. Assets are hash-addressed byte
// records; the trusted asset store chooses every destination on import.
export const WORK_PACKAGE_LIMITS=Object.freeze({maxPackageBytes:96*1024*1024,maxDecodedBytes:64*1024*1024,maxAssetBytes:32*1024*1024,maxAssets:256,maxHistory:50,maxDocumentBytes:4*1024*1024});
const FORMAT='musebench-work-project';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error(`Work project package: ${message}`);};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function keys(value,allowed,label){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(`${label} has unsupported fields.`);}
function documentOnly(input){return Object.fromEntries(['version','id','kind','title','revision','createdAt','updatedAt','assets','data'].map(key=>[key,input?.[key]]));}
function assetReferences(data){const ids=new Set();function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!plain(value))return;for(const [key,entry] of Object.entries(value)){if((key==='assetId'||key.endsWith('AssetId'))&&typeof entry==='string')ids.add(entry);else if(key.endsWith('AssetIds')&&Array.isArray(entry))entry.forEach(id=>ids.add(id));else visit(entry);}}visit(data);return ids;}
function portableDocument(input){
 const document=validateWorkDocument(documentOnly(input));
 if(Buffer.byteLength(JSON.stringify(document))>WORK_PACKAGE_LIMITS.maxDocumentBytes)fail('document exceeds the size limit.');
 const required=assetReferences(document.data),byId=new Map(document.assets.map(asset=>[asset.id,asset]));
 for(const id of required)if(!byId.has(id))fail(`missing referenced asset ${id}.`);
 document.assets=document.assets.filter(asset=>required.has(asset.id)).map(asset=>{
  if(typeof asset.name!=='string'||/[\\/:\x00-\x1f]/.test(asset.name)||asset.name==='.'||asset.name==='..')fail('unsafe asset name.');
  const copy=Object.fromEntries(['id','hash','name','mediaType','bytes','width','height','duration'].filter(key=>asset[key]!==undefined).map(key=>[key,asset[key]]));
  return {...copy,storageRef:`content/${asset.hash}`,origin:asset.origin};
 });
 return validateWorkDocument(document);
}
export async function createWorkProjectPackage({document:input,resolveAsset,includeHistory=false,history=[]}={}){
 const document=portableDocument(input),versions=includeHistory?history.map(portableDocument):[];
 if(versions.length>WORK_PACKAGE_LIMITS.maxHistory)fail('too many history revisions.');
 for(const version of versions)if(version.id!==document.id||version.kind!==document.kind||version.revision>=document.revision)fail('history must belong to the selected document and precede it.');
 const assets=[],byHash=new Map();let total=0;
 for(const version of [...versions,document])for(const asset of version.assets){
  if(byHash.has(asset.hash)){if(byHash.get(asset.hash)!==asset.bytes)fail('conflicting asset metadata.');continue;}
  if(typeof resolveAsset!=='function')fail('managed asset resolver required.');
  const bytes=Buffer.from(await resolveAsset(asset));
  if(bytes.length!==asset.bytes||digest(bytes)!==asset.hash)fail('asset size or hash mismatch.');
  total+=bytes.length;if(bytes.length>WORK_PACKAGE_LIMITS.maxAssetBytes||total>WORK_PACKAGE_LIMITS.maxDecodedBytes||assets.length>=WORK_PACKAGE_LIMITS.maxAssets)fail('asset size/count limit exceeded.');
  byHash.set(asset.hash,bytes.length);assets.push({hash:asset.hash,bytes:bytes.length,data:bytes.toString('base64')});
 }
 const result=Buffer.from(JSON.stringify({format:FORMAT,version:1,document,documentHash:digest(JSON.stringify(document)),history:versions.map(document=>({document,hash:digest(JSON.stringify(document))})),assets}));
 validateWorkProjectPackage(result);return result;
}
export function validateWorkProjectPackage(input){
 if(!(typeof input==='string'||Buffer.isBuffer(input)||input instanceof Uint8Array))fail('expected package bytes.');
 const bytes=Buffer.from(input);if(bytes.length>WORK_PACKAGE_LIMITS.maxPackageBytes)fail('package size limit exceeded.');
 let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{fail('invalid JSON.');}
 keys(value,['format','version','document','documentHash','history','assets'],'manifest');
 if(value.format!==FORMAT||value.version!==1)fail('unsupported format/version.');
 if(!Array.isArray(value.history)||value.history.length>WORK_PACKAGE_LIMITS.maxHistory||!Array.isArray(value.assets)||value.assets.length>WORK_PACKAGE_LIMITS.maxAssets)fail('history/assets count limit exceeded.');
 function verifiedDocument(raw,hash){
  keys(raw,['version','id','kind','title','revision','createdAt','updatedAt','assets','data'],'document');
  if(digest(JSON.stringify(raw))!==hash)fail('document hash mismatch.');
  const document=portableDocument(raw);
  // Canonical storage references and required-only assets also prevent hidden
  // unrelated payloads and filesystem references in a malicious manifest.
  if(JSON.stringify(document)!==JSON.stringify(raw))fail('non-portable document metadata.');
  return document;
 }
 const document=verifiedDocument(value.document,value.documentHash),seenRevision=new Set([document.revision]);
 const history=value.history.map(entry=>{keys(entry,['document','hash'],'history entry');const version=verifiedDocument(entry.document,entry.hash);if(version.id!==document.id||version.kind!==document.kind||version.revision>=document.revision||seenRevision.has(version.revision))fail('invalid history revision chain.');seenRevision.add(version.revision);return version;}).sort((a,b)=>a.revision-b.revision);
 const needed=new Map();for(const version of [...history,document])for(const asset of version.assets){if(needed.has(asset.hash)&&needed.get(asset.hash)!==asset.bytes)fail('conflicting asset sizes.');needed.set(asset.hash,asset.bytes);}
 let total=0;const seen=new Set(),assets=value.assets.map(entry=>{
  keys(entry,['hash','bytes','data'],'asset');
  if(!/^[a-f0-9]{64}$/.test(entry.hash)||seen.has(entry.hash)||!needed.has(entry.hash))fail('duplicate or unrelated asset.');seen.add(entry.hash);
  if(!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>WORK_PACKAGE_LIMITS.maxAssetBytes||entry.bytes!==needed.get(entry.hash))fail('asset size limit/mismatch.');
  if(typeof entry.data!=='string'||entry.data.length!==4*Math.ceil(entry.bytes/3)||/[^A-Za-z0-9+/=]/.test(entry.data))fail('invalid asset encoding.');
  total+=entry.bytes;if(total>WORK_PACKAGE_LIMITS.maxDecodedBytes)fail('decoded size limit exceeded.');
  const bytes=Buffer.from(entry.data,'base64');if(bytes.length!==entry.bytes||bytes.toString('base64')!==entry.data||digest(bytes)!==entry.hash)fail('asset hash mismatch.');return{hash:entry.hash,bytes};
 });
 if(seen.size!==needed.size)fail('missing required assets.');
 return {document,history,assets};
}
export async function importWorkProjectPackage({bytes,writeAsset,createId=randomUUID,now=new Date().toISOString()}={}){
 const validated=validateWorkProjectPackage(bytes),ids=new Map(),used=new Set();
 const newId=old=>{if(!ids.has(old)){const next=createId();if(typeof next!=='string'||!next||used.has(next)||next===old)fail('ID generator must produce new unique IDs.');ids.set(old,next);used.add(next);}return ids.get(old);};
 function collect(value){if(Array.isArray(value))value.forEach(collect);else if(plain(value)){if(typeof value.id==='string')newId(value.id);for(const [key,entry]of Object.entries(value)){if((key==='groupId'||key.endsWith('GroupId'))&&typeof entry==='string')newId(entry);collect(entry);}}}
 [...validated.history,validated.document].forEach(collect);
 function remap(value,key=''){if(Array.isArray(value))return value.map(entry=>remap(entry,key));if(plain(value))return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,remap(entry,key)]));return typeof value==='string'&&(key==='id'||key.endsWith('Id')||key.endsWith('Ids'))&&ids.has(value)?ids.get(value):value;}
 const byHash=new Map(validated.assets.map(asset=>[asset.hash,asset.bytes])),importedAssets=new Map();
 const assetKey=asset=>`${asset.id}:${asset.hash}`;
 for(const version of [...validated.history,validated.document])for(const asset of version.assets)if(!importedAssets.has(assetKey(asset))){
  if(typeof writeAsset!=='function')fail('managed asset writer required.');
  const copied={...remap(asset),id:newId(assetKey(asset))},result=await writeAsset({asset:copied,bytes:Buffer.from(byHash.get(asset.hash))});
  const deduplicated=plain(result)&&[...importedAssets.values()].some(previous=>previous.id===result.id&&previous.hash===asset.hash&&previous.bytes===asset.bytes);
  if(!plain(result)||typeof result.id!=='string'||!result.id||result.id===asset.id||(result.id!==copied.id&&used.has(result.id)&&!deduplicated)||result.hash!==asset.hash||result.bytes!==asset.bytes||typeof result.storageRef!=='string'||result.storageRef.startsWith('content/'))fail('asset writer returned inconsistent managed metadata.');
  used.add(result.id);importedAssets.set(assetKey(asset),result);
 }
 const versions=[...validated.history,validated.document].map((version,revision)=>{for(const asset of version.assets)ids.set(asset.id,importedAssets.get(assetKey(asset)).id);const assets=[...new Map(version.assets.map(asset=>{const imported=importedAssets.get(assetKey(asset));return[imported.id,imported];})).values()];return validateWorkDocument({...remap(version),revision,createdAt:now,updatedAt:now,assets});});
 return {document:versions.at(-1),history:versions.slice(0,-1)};
}
