// Main-only: bounded snapshots of registered Work sources, never arbitrary renderer paths.
import path from 'node:path';
import {promises as fs,constants} from 'node:fs';
const MAX_SOURCE_BYTES=2*1024*1024,MAX_CONTEXT_CHARACTERS=8000;
const fail=code=>Object.assign(Error(code==='SOURCE_NOT_FOUND'?'A selected source is no longer attached to this Work item.':'A Work source could not be read safely. Reattach a valid UTF-8 CSV, JSON, Markdown or TXT file.'),{code});
const inside=(root,candidate)=>{const relative=path.relative(root,candidate);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith(`..${path.sep}`));};
async function inspect(target,{directory=false}={}){
 if(typeof target!=='string'||!path.isAbsolute(target)||target.includes('\0')||target.split(/[\\/]/).includes('..'))throw fail('INVALID_SOURCE');
 const resolved=path.resolve(target);let current=path.parse(resolved).root;
 for(const part of path.relative(current,resolved).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const stat=await fs.lstat(current);if(stat.isSymbolicLink()||path.relative(current,await fs.realpath(current))!==''||(current!==resolved||directory)&&!stat.isDirectory())throw fail('INVALID_SOURCE');
 }return resolved;
}
async function readUtf8(file,expectedBytes){
 await inspect(file);const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size<0||stat.size>MAX_SOURCE_BYTES||stat.size!==expectedBytes)throw fail('INVALID_SOURCE');const buffer=Buffer.alloc(stat.size+1);let length=0;
  while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,null);if(!bytesRead)break;length+=bytesRead;}
  const after=await handle.stat();await inspect(file);const current=await fs.lstat(file);
  if(length!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||current.ino!==stat.ino||current.dev!==0&&stat.dev!==0&&current.dev!==stat.dev||current.size!==stat.size)throw fail('INVALID_SOURCE');
  const bytes=buffer.subarray(0,length),text=bytes.toString('utf8');if(bytes.includes(0)||!Buffer.from(text,'utf8').equals(bytes))throw fail('INVALID_SOURCE');return text.replace(/^\uFEFF/,'');
 }finally{await handle.close();}
}
function sliceText(text,length){let value=text.slice(0,length);if(/[\uD800-\uDBFF]$/.test(value))value=value.slice(0,-1);return value;}
function prefixWithinJsonBudget(text,budget){let low=0,high=Math.min(text.length,budget);while(low<high){const mid=Math.ceil((low+high)/2),encoded=JSON.stringify(sliceText(text,mid)).length-2;if(encoded<=budget)low=mid;else high=mid-1;}return sliceText(text,low);}
/** Omitted sourceIds reads all attached sources; [] explicitly supplies no sources.
 * Reading is local and never sends a prompt. Consumers must label excerpts untrusted data.
 * Names, refs and excerpts together fit an8000-character serialized context budget. */
export async function readStudioSourceContext({work,itemId,sourceIds}={}){
 if(!work||typeof work.getItem!=='function'||typeof work.getWorkspace!=='function'||typeof itemId!=='string'||!itemId||itemId.length>128)throw fail('INVALID_SOURCE');
 const item=await work.getItem(itemId);if(!item||item.id!==itemId||!Array.isArray(item.sources)||item.sources.length>8)throw fail('SOURCE_NOT_FOUND');
 if(sourceIds!==undefined&&(!Array.isArray(sourceIds)||sourceIds.length>8||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>typeof id!=='string'||!id||id.length>128)))throw fail('INVALID_SOURCE');
 const selected=sourceIds===undefined?item.sources:sourceIds.map(id=>{const source=item.sources.find(s=>s.id===id);if(!source)throw fail('SOURCE_NOT_FOUND');return source;});
 const result={trust:'untrusted-source-data',sources:[],totalCharacters:0,maxCharacters:MAX_CONTEXT_CHARACTERS};if(!selected.length)return result;
 try{
  const root=await inspect(await work.getWorkspace(itemId),{directory:true}),seen=new Set(),texts=[];
  for(const source of selected){
   if(!source||typeof source.id!=='string'||!source.id||source.id.length>128||seen.has(source.id)||typeof source.name!=='string'||!source.name.trim()||source.name.length>120||/[\u0000-\u001f\\/:]/.test(source.name)||typeof source.path!=='string'||!/^inputs\/[a-zA-Z0-9._-]+\.(csv|json|md|txt)$/.test(source.path)||!Number.isSafeInteger(source.bytes)||source.bytes<0||source.bytes>MAX_SOURCE_BYTES)throw fail('INVALID_SOURCE');seen.add(source.id);
   const file=path.resolve(root,source.path);if(!inside(root,file))throw fail('INVALID_SOURCE');texts.push(await readUtf8(file,source.bytes));result.sources.push({id:source.id,name:source.name,ref:source.path,excerpt:'',truncated:true});
  }
  for(let i=0;i<texts.length;i++){
   // Reserve the maximum digit count for totalCharacters to keep serialized output within budget.
   const budget=Math.max(0,MAX_CONTEXT_CHARACTERS-JSON.stringify({...result,totalCharacters:MAX_CONTEXT_CHARACTERS}).length),share=Math.floor(budget/(texts.length-i));
   const excerpt=prefixWithinJsonBudget(texts[i],share);result.sources[i].excerpt=excerpt;result.sources[i].truncated=excerpt.length<texts[i].length;result.totalCharacters+=excerpt.length;
  }
  if(JSON.stringify(result).length>MAX_CONTEXT_CHARACTERS)throw fail('INVALID_SOURCE');return result;
 }catch(error){if(error?.code==='SOURCE_NOT_FOUND')throw error;throw fail('INVALID_SOURCE');}
}
