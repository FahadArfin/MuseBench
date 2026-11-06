import {constants} from 'node:fs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const WORK_CONVERSION_REPORT_LIMITS=Object.freeze({maxBytes:1024*1024,maxEntries:1000,maxTextLength:100000});
const LIMITS=WORK_CONVERSION_REPORT_LIMITS;
const fail=message=>{throw Object.assign(Error('Conversion report: '+message),{code:'CONVERSION_REPORT_INVALID'});};
function plain(v,allowed){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail('expected plain data');for(const key of Object.keys(v)){if(!allowed.includes(key))fail('unsupported field');if(!('value'in Object.getOwnPropertyDescriptor(v,key)))fail('accessors are not data');}}
function text(v,max=LIMITS.maxTextLength){if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail('invalid or oversized text');return v;}
function id(v){text(v,128);if(!/^[A-Za-z0-9_-]{1,128}$/.test(v))fail('invalid item identity');return v;}
function list(v){if(!Array.isArray(v)||v.length>LIMITS.maxEntries||Object.keys(v).length!==v.length)fail('invalid or oversized collection');return v;}
/** Retain visible authored facts; omit internal asset maps and source file paths.
 * This metadata is intentionally outside document/package serialization. */
export function validateWorkConversionReport(value){
 plain(value,['sourceItemId','sourceRevision','conversion','attributions','losses','notes','assetCopies','ai','retainedLegacyContent','chartReferences']);
 const result={sourceItemId:id(value.sourceItemId),sourceRevision:value.sourceRevision,conversion:text(value.conversion,160),attributions:[],losses:[],notes:[]};
 if(!Number.isSafeInteger(result.sourceRevision)||result.sourceRevision<0||!result.conversion.trim())fail('invalid source revision or conversion');
 let bytes=0;const add=(collection,value)=>{text(value);bytes+=Buffer.byteLength(value);if(bytes>LIMITS.maxBytes||collection.length>=LIMITS.maxEntries)fail('text/entry limit exceeded');collection.push(value);};
 for(const key of ['attributions','losses','notes'])if(value[key]!==undefined)for(const entry of list(value[key]))add(result[key],entry);
 if(value.retainedLegacyContent!==undefined){
  const c=value.retainedLegacyContent;plain(c,['summary','metrics','sections','table']);
  if(c.summary!==undefined)add(result.notes,'Legacy summary: '+text(c.summary));
  for(const metric of list(c.metrics??[])){plain(metric,['label','value','change','detail']);add(result.notes,'Legacy metric: '+['label','value','change','detail'].filter(key=>metric[key]!==undefined).map(key=>`${key}: ${text(metric[key])}`).join(' · '));}
  for(const section of list(c.sections??[])){plain(section,['heading','body']);add(result.notes,`${text(section.heading)}\n${text(section.body)}`);}
  if(c.table!==undefined){plain(c.table,['columns','rows']);const columns=list(c.table.columns).map(v=>text(v));const rows=list(c.table.rows).map(row=>list(row).map(cell=>typeof cell==='number'&&Number.isFinite(cell)?String(cell):text(cell)));add(result.notes,'Legacy table:\n'+[columns,...rows].map(row=>row.join('\t')).join('\n'));}
 }
 for(const chart of list(value.chartReferences??[])){plain(chart,['title','unit','source','calculation']);add(result.notes,'Chart attribution: '+['title','unit','source','calculation'].filter(key=>chart[key]!==undefined).map(key=>`${key}: ${text(chart[key])}`).join(' · '));}
 for(const key of ['attributions','losses','notes'])result[key]=[...new Set(result[key])];
 if(Buffer.byteLength(JSON.stringify(result))>LIMITS.maxBytes)fail('serialized report exceeds size limit');
 return result;
}
async function inspect(file,{missing=false}={}){
 const absolute=path.resolve(file),parsed=path.parse(absolute);let cursor=parsed.root;
 for(const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);try{const info=await fs.lstat(cursor);if(info.isSymbolicLink())fail('symbolic links and junctions are not allowed');if(cursor!==absolute&&!info.isDirectory())fail('invalid managed directory');}catch(e){if(missing&&e.code==='ENOENT')continue;throw e;}}
 return absolute;
}
export function createWorkConversionReportStore({rootDir,now=()=>new Date().toISOString(),beforePublish=async()=>{}}={}){
 if(typeof rootDir!=='string'||!rootDir)fail('managed storage root required');const root=path.resolve(rootDir),queues=new Map();
 const fileFor=itemId=>path.join(root,createHash('sha256').update(id(itemId)).digest('hex')+'.json');
 const initialize=async()=>{await inspect(root,{missing:true});await fs.mkdir(root,{recursive:true});await inspect(root);};
 async function readRecord(itemId){
  const file=fileFor(itemId);let handle;
  try{
   await inspect(file);handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const info=await handle.stat();if(!info.isFile()||info.size<1||info.size>LIMITS.maxBytes+1024)fail('file size limit exceeded');
   const buffer=Buffer.alloc(info.size+1);let length=0;while(length<buffer.length){const read=await handle.read(buffer,length,buffer.length-length,null);if(!read.bytesRead)break;length+=read.bytesRead;}
   await inspect(file);const current=await fs.lstat(file),after=await handle.stat();if(length!==info.size||current.ino!==info.ino||current.dev!==0&&info.dev!==0&&current.dev!==info.dev||after.size!==info.size||after.mtimeMs!==info.mtimeMs)fail('file changed during read');
   let value;try{value=JSON.parse(buffer.subarray(0,length).toString('utf8'));}catch{fail('invalid JSON; original bytes preserved');}
   plain(value,['version','itemId','createdAt','report']);if(value.version!==1||value.itemId!==itemId)fail('unsupported format or item identity; original bytes preserved');text(value.createdAt,40);if(!Number.isFinite(Date.parse(value.createdAt)))fail('invalid creation time');
   return{version:1,itemId,createdAt:value.createdAt,report:validateWorkConversionReport(value.report)};
  }catch(e){if(e.code==='ENOENT')return null;throw e;}finally{await handle?.close();}
 }
 const serial=(itemId,action)=>{id(itemId);const promise=(queues.get(itemId)??Promise.resolve()).catch(()=>{}).then(action);queues.set(itemId,promise);promise.finally(()=>{if(queues.get(itemId)===promise)queues.delete(itemId);}).catch(()=>{});return promise;};
 return{
  initialize,
  async read(itemId){await queues.get(itemId);return readRecord(itemId);},
  write({itemId,report}){const normalized=validateWorkConversionReport(report);return serial(itemId,async()=>{await initialize();await readRecord(itemId);const value={version:1,itemId,createdAt:now(),report:normalized};text(value.createdAt,40);if(!Number.isFinite(Date.parse(value.createdAt)))fail('invalid creation time');const file=fileFor(itemId),temporary=file+'.'+randomUUID()+'.tmp';try{const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}await beforePublish({itemId});await inspect(file,{missing:true});await fs.rename(temporary,file);return structuredClone(value);}finally{await fs.rm(temporary,{force:true});}});},
  remove(itemId){return serial(itemId,async()=>{await inspect(fileFor(itemId),{missing:true});await fs.rm(fileFor(itemId),{force:true});return{removed:true};});},
  async close(){await Promise.allSettled([...queues.values()]);},
 };
}
