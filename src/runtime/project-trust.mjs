import {createHash} from 'node:crypto';import {lstat,readdir,readFile,realpath} from 'node:fs/promises';import path from 'node:path';
const roots=['.agents','.muse','.codex','.claude','AGENTS.md','CLAUDE.md','MUSE.md','CODEX.md'];
async function exists(file){try{return await lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function projectTrustSnapshot(folder){
 const root=await realpath(folder),files=[];let bytes=0,entries=0;
 // Broader ancestor trust is deliberately unsupported until its native scope is qualified.
 for(let parent=path.dirname(root);;parent=path.dirname(parent)){for(const name of roots)if(await exists(path.join(parent,name)))throw Error('Ancestor instructions require broader trust support. Review a standalone workspace instead.');if(parent===path.dirname(parent))break;}
 async function walk(file,name){const info=await exists(file);if(!info)return;if(++entries>500)throw Error('Project instructions exceed the review limit.');if(info.isSymbolicLink())throw Error('Project instruction review does not follow symbolic links.');if(info.isDirectory()){for(const item of (await readdir(file)).sort())await walk(path.join(file,item),name+'/'+item);return;}if(!info.isFile()||info.size>100000||files.length>=200)throw Error('Project instructions exceed the review limit.');const content=await readFile(file);bytes+=content.length;if(content.length>100000||bytes>500000||content.includes(0))throw Error('Project instructions contain binary or oversized content.');files.push({path:name,text:content.toString('utf8')});}
 for(const name of roots)await walk(path.join(root,name),name);
 const fingerprint=createHash('sha256').update(JSON.stringify(files)).digest('hex');return{root,files,fingerprint};
}
