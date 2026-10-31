import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {normalizeMetaChatRows} from './meta-chat-history.mjs';

const account=value=>typeof value==='string'&&/^meta:[a-f0-9]{64}$/.test(value);
export function mergeMetaChatPins(rows,pins){
 const local=new Set(pins.map(row=>row.id)),known=new Set(rows.map(row=>row.id));
 return [...rows,...pins.filter(row=>!known.has(row.id)).map(row=>({...row,recent:false,pinned:false}))].map(row=>({...row,providerPinned:row.pinned===true,localPinned:local.has(row.id),pinned:row.pinned===true||local.has(row.id)}));
}
// Only display titles and validated conversation targets are persisted. The
// renderer never supplies a path or account key, and writes are serialized.
export function createMetaChatPinStore(file){
 let pending=Promise.resolve();
 async function load(){
  let bytes;try{bytes=await readFile(file);}catch(error){if(error.code==='ENOENT')return{version:1,accounts:{}};throw error;}
  if(bytes.length>2000000)throw Error('Saved Meta chat pins are too large.');
  const value=JSON.parse(bytes.toString('utf8'));
  if(value?.version!==1||!value.accounts||typeof value.accounts!=='object'||Array.isArray(value.accounts)||Object.keys(value.accounts).length>100)throw Error('Saved Meta chat pins could not be read.');
  for(const [owner,rows] of Object.entries(value.accounts))if(!account(owner)||!Array.isArray(rows)||rows.length>100)throw Error('Saved Meta chat pins could not be read.');
  return value;
 }
 return {
  async read(owner){if(!account(owner))return[];await pending.catch(()=>{});const data=await load();return normalizeMetaChatRows(data.accounts[owner]??[],owner);},
  write(owner,rows){
   if(!account(owner)||!Array.isArray(rows)||rows.length>100)return Promise.reject(Error('Invalid Meta chat pins.'));
   const normalized=normalizeMetaChatRows(rows,owner);
   if(normalized.length!==rows.length)return Promise.reject(Error('Invalid Meta chat pins.'));
   const job=pending.catch(()=>{}).then(async()=>{
    const data=await load();data.accounts[owner]=normalized.map(({title,label,path})=>({title,label,path}));
    if(Object.keys(data.accounts).length>100)throw Error('Too many accounts with saved Meta chat pins.');
    const serialized=JSON.stringify(data);if(Buffer.byteLength(serialized)>2000000)throw Error('Saved Meta chat pins are too large.');
    await mkdir(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
    try{await writeFile(temporary,serialized,{mode:0o600});await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
   });pending=job;return job;
  },
 };
}
