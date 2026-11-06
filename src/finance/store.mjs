import {mkdir,lstat,realpath,open,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const MAX=40*1024*1024;
const problem=()=>Error('Protected finance storage could not be read or saved. Existing data was preserved.');
const digest=bytes=>bytes?createHash('sha256').update(bytes).digest('hex'):null;
export async function createFinanceStore({dir,protection}){
 if(!path.isAbsolute(dir))throw problem();const file=path.join(dir,'finance.bin');let record=null,expected=null,tail=Promise.resolve();
 const available=!!(await protection?.available?.());
 async function directory(){const info=await lstat(dir),resolved=await realpath(dir),key=v=>process.platform==='win32'?v.toLowerCase():v;if(!info.isDirectory()||info.isSymbolicLink()||key(resolved)!==key(path.resolve(dir)))throw problem();}
 async function bytes(){
  try{await directory();const before=await lstat(file);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>MAX||before.size<1)throw problem();
   const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const start=await handle.stat();if(start.ino!==before.ino||!start.isFile()||start.nlink!==1||start.size!==before.size)throw problem();const buffer=Buffer.alloc(before.size+1);let length=0;while(length<buffer.length){const part=await handle.read(buffer,length,buffer.length-length,null);if(!part.bytesRead)break;length+=part.bytesRead;}const end=await handle.stat(),after=await lstat(file);if(length!==before.size||end.size!==start.size||end.mtimeMs!==start.mtimeMs||after.ino!==start.ino||after.isSymbolicLink())throw problem();return buffer.subarray(0,length);}finally{await handle.close();}
  }catch(error){if(error.code==='ENOENT')return null;throw problem();}
 }
 const existing=await bytes();if(existing){try{if(!available)throw problem();record=JSON.parse(await protection.decrypt(existing));if(record?.version!==1)throw problem();expected=digest(existing);}catch{throw problem();}}
 return{available,read:()=>structuredClone(record),write(value){const task=tail.then(async()=>{
  if(!available||!(await protection.available()))throw problem();let tmp,handle;try{
   const text=JSON.stringify(value);if(value?.version!==1||Buffer.byteLength(text)>MAX/2)throw problem();
   if(digest(await bytes())!==expected)throw problem();const encrypted=await protection.encrypt(text);if(!Buffer.isBuffer(encrypted)||!encrypted.length||encrypted.length>MAX)throw problem();
   await mkdir(dir,{recursive:true,mode:0o700});await directory();tmp=path.join(dir,'.finance-'+randomUUID()+'.tmp');handle=await open(tmp,'wx',0o600);await handle.writeFile(encrypted);await handle.sync();await handle.close();handle=null;
   if(digest(await bytes())!==expected)throw problem();await rename(tmp,file);tmp=null;expected=digest(encrypted);record=structuredClone(value);
  }catch{throw problem();}finally{await handle?.close().catch(()=>{});if(tmp)await unlink(tmp).catch(()=>{});}
 });tail=task.catch(()=>{});return task;}};
}
