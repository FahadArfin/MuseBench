import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function target(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))throw Error('Invalid restore path.');
 const resolved=path.resolve(root,name),relative=path.relative(root,resolved);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Restore path escaped project.');
 let at=root;for(const segment of name.split('/')){at=path.join(at,segment);try{const stat=await fs.lstat(at);if(stat.isSymbolicLink())throw Error('Symbolic link restore path refused.');}catch(error){if(error.code!=='ENOENT')throw error;}}
 return resolved;
}
async function matches(root,name,expected){const destination=await target(root,name);try{const stat=await fs.lstat(destination);if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Unsupported restore file.');const bytes=await fs.readFile(destination);return !!expected&&hash(bytes)===expected.hash;}catch(error){if(error.code==='ENOENT')return !expected;throw error;}}
export async function restoreSelected({root,before,after,paths,record}){
 if(!Array.isArray(paths)||!paths.length||paths.length>100||new Set(paths).size!==paths.length)throw Error('Select 1–100 distinct files.');
 for(const name of paths){await target(root,name);if(before[name]?.binary||after[name]?.binary)throw Error('Uncaptured binary files cannot be restored.');for(const item of [before[name],after[name]])if(item&&(typeof item.text!=='string'||hash(item.text)!==item.hash))throw Error('Checkpoint capture is invalid.');if(!await matches(root,name,before[name]))throw Error(`File changed after review: ${name}`);}
 const operation={id:randomUUID(),status:'applying',paths,before:Object.fromEntries(paths.filter(p=>before[p]).map(p=>[p,before[p]])),after:Object.fromEntries(paths.filter(p=>after[p]).map(p=>[p,after[p]])),completed:[]};await record(operation);
 for(const name of paths){if(!await matches(root,name,before[name]))throw Error(`File changed during restore: ${name}`);const destination=await target(root,name);if(after[name]){await fs.mkdir(path.dirname(destination),{recursive:true});await target(root,name);const temporary=destination+'.muse-restore-'+randomUUID();await fs.writeFile(temporary,after[name].text,{flag:'wx'});try{if(!await matches(root,name,before[name]))throw Error(`File changed during restore: ${name}`);await fs.rename(temporary,destination);}finally{await fs.rm(temporary,{force:true});}}else await fs.unlink(destination);operation.completed.push(name);await record(operation);}
 operation.status='completed';await record(operation);return operation;
}
