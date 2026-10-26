import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function checkPath(target,{missing=false}={}){
 if(typeof target!=='string'||!path.isAbsolute(target)||target.includes('\0'))throw Error('Sites needs an absolute local storage path.');
 let current=path.parse(target).root;
 for(const piece of path.relative(current,path.resolve(target)).split(path.sep).filter(Boolean)){
  current=path.join(current,piece);let info;try{info=await fs.lstat(current);}catch(error){if(missing&&error.code==='ENOENT')return;throw error;}
  if(info.isSymbolicLink()||path.relative(current,await fs.realpath(current))!=='')throw Error('Sites storage cannot use symbolic links or junctions.');
 }
}
export async function directory(target){await checkPath(target,{missing:true});await fs.mkdir(target,{recursive:true});await checkPath(target);return target;}
export async function readBytes(target,limit){
 await checkPath(target);const handle=await fs.open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const opened=await handle.stat();if(!opened.isFile()||opened.size>limit)throw Error('Saved Sites data exceeds its size limit.');
  const buffer=Buffer.alloc(Math.min(opened.size+1,limit+1));let count=0;
  while(count<buffer.length){const result=await handle.read(buffer,count,buffer.length-count,null);if(!result.bytesRead)break;count+=result.bytesRead;}
  if(count>limit||count!==opened.size)throw Error('Sites data changed while being read.');
  await checkPath(target);const after=await fs.lstat(target);if(after.ino!==opened.ino||after.size!==opened.size)throw Error('Sites data changed while being read.');
  return buffer.subarray(0,count);
 }finally{await handle.close();}
}
export async function atomicWrite(target,value){
 await checkPath(path.dirname(target));await checkPath(target,{missing:true});
 const temporary=path.join(path.dirname(target),`.sites-${randomUUID()}.tmp`);let exists=false;
 try{const handle=await fs.open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);exists=true;try{await handle.writeFile(value);await handle.sync();}finally{await handle.close();}await checkPath(target,{missing:true});await fs.rename(temporary,target);exists=false;}
 finally{if(exists)try{await checkPath(temporary);await fs.unlink(temporary);}catch{}}
}
