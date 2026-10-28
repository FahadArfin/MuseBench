import {lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const exec=promisify(execFile);

/** List tracked and non-ignored source paths without entering generated trees. */
export async function workspaceSourcePaths(root,excludedPatterns=[]){
 // A plain project inside another repository's ignored output remains usable.
 // Apply repository rules only when this selected root owns a .git directory/file.
 try{await lstat(path.join(root,'.git'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
 const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.toUpperCase().startsWith('GIT_')));
 env.GIT_OPTIONAL_LOCKS='0';
 const flags=excludedPatterns.map(pattern=>'--exclude='+pattern.replace(/[a-z]/gi,letter=>`[${letter.toLowerCase()}${letter.toUpperCase()}]`));
 const pathspecs=excludedPatterns.flatMap(pattern=>[`:(exclude,icase,glob)**/${pattern}`,`:(exclude,icase,glob)**/${pattern}/**`]);
 const options={env,windowsHide:true,timeout:5000,maxBuffer:2*1024*1024};
 let stdout,caseInsensitive;
 try{
  const [listing,casing]=await Promise.all([
   exec('git',['-C',root,'-c','core.fsmonitor=false','ls-files','--cached','--others','--exclude-standard',...flags,'-z','--','.',...pathspecs],options),
   exec('git',['-C',root,'config','--type=bool','--get','core.ignorecase'],{...options,maxBuffer:4096}).catch(error=>{if(error.code===1&&!error.stderr?.trim())return{stdout:process.platform==='win32'?'true':'false'};throw error;}),
  ]);
  stdout=listing.stdout;caseInsensitive=casing.stdout.trim()==='true';
 }catch(error){throw new Error('Could not read Git source paths. Check Git availability and repository state before reopening this project.',{cause:error});}
 const files=new Set(),parents=new Set();
 for(const entry of stdout.split('\0')){
  if(!entry)continue;
  const name=entry.replace(/\/$/,'');
  if(!name||path.posix.isAbsolute(name)||path.win32.isAbsolute(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Git returned an invalid source path.');
  const key=caseInsensitive?name.toLowerCase():name;files.add(key);
  let parent=key;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));parents.add(parent);}
 }
 return {files,parents,caseInsensitive};
}
