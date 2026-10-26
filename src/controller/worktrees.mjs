import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rename,realpath,lstat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
const exec=promisify(execFile),contains=(parent,child)=>{const rel=path.relative(parent,child);return !rel||!rel.startsWith('..')&&!path.isAbsolute(rel);};
export function createWorktreeService(dataDir,{storageDir}={}){
 const storage=path.resolve(storageDir??path.join(dataDir,'worktrees')),hooks=path.resolve(dataDir,'empty-git-hooks');
 async function git(root,args){
  const env={...process.env};for(const key of Object.keys(env))if(/^GIT_/i.test(key))delete env[key];env.GIT_TERMINAL_PROMPT='0';
  return (await exec('git',['-c',`core.hooksPath=${hooks}`,'-c','core.fsmonitor=false','-c','submodule.recurse=false','-C',root,...args],{env,windowsHide:true,shell:false,timeout:60000,maxBuffer:2*1024*1024})).stdout.trim();
 }
 async function repository(root){
  await mkdir(hooks,{recursive:true});
  let repo;try{repo=await realpath(await git(root,['rev-parse','--show-toplevel']));}catch{throw Error('Open a Git repository with at least one commit to use worktrees.');}
  const common=await realpath(path.resolve(repo,await git(repo,['rev-parse','--git-common-dir'])));
  return{repo,common,key:createHash('sha256').update(common).digest('hex')};
 }
 async function folder(repo,key){
  if(contains(repo,storage))throw Error('Worktree storage must be outside the source project.');
  await mkdir(storage,{recursive:true});if((await lstat(storage)).isSymbolicLink())throw Error('Worktree storage changed.');
  const dir=path.join(storage,key);await mkdir(dir,{recursive:true});if((await lstat(dir)).isSymbolicLink()||path.dirname(await realpath(dir))!==await realpath(storage))throw Error('Worktree storage changed.');return dir;
 }
 async function records(dir){const items=[];const {readdir}=await import('node:fs/promises');for(const name of await readdir(dir).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;try{const item=JSON.parse(await readFile(path.join(dir,name),'utf8'));if(item.id+'.json'===name&&item.path===path.join(dir,item.id))items.push(item);}catch{}}return items;}
 async function save(dir,item){const file=path.join(dir,`${item.id}.json`),tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(item,null,2));await rename(tmp,file);}
 async function listed(repo){const text=await git(repo,['worktree','list','--porcelain','-z']);return text.split('\0\0').filter(Boolean).map(block=>Object.fromEntries(block.split('\0').filter(Boolean).map(row=>{const at=row.indexOf(' ');return at<0?[row,true]:[row.slice(0,at),row.slice(at+1)];})));}
 async function inspect(root){
  const {repo,key}=await repository(root),dir=await folder(repo,key),native=await listed(repo),legacy=path.resolve(dataDir,'worktrees',key),items=[...await records(dir),...(legacy===dir?[]:await records(legacy))];
  const branch=await git(repo,['branch','--show-current']),head=await git(repo,['rev-parse','HEAD']),dirty=Boolean(await git(repo,['status','--porcelain']));
  return{root:repo,branch,head,dirty,items:items.map(item=>{const live=native.find(n=>typeof n.worktree==='string'&&path.resolve(n.worktree)===item.path);return{...item,available:!!live&&!live.prunable,locked:!!live?.locked,status:live?'ready':item.status};})};
 }
 async function create(root,{branch,base='HEAD'}={}){
  if(typeof branch!=='string'||branch.length>100||!branch||branch.startsWith('-')||/[\r\n]/.test(branch))throw Error('Choose a valid new branch name.');
  if(typeof base!=='string'||base.length>200||!base||base.startsWith('-')||/[\r\n\s]/.test(base))throw Error('Choose a valid base branch or commit.');
  const {repo,key}=await repository(root),dir=await folder(repo,key);
  try{await git(repo,['check-ref-format','--branch',branch]);}catch{throw Error('Choose a valid new branch name.');}
  let commit;try{commit=await git(repo,['rev-parse','--verify',`${base}^{commit}`]);}catch{throw Error('The base branch or commit does not exist.');}
  let exists=false;try{await git(repo,['show-ref','--verify',`refs/heads/${branch}`]);exists=true;}catch{}if(exists)throw Error('That branch already exists. Choose a new branch name.');
  const id=randomUUID(),item={id,branch,base,commit,path:path.join(dir,id),sourceRoot:repo,createdAt:new Date().toISOString(),status:'creating'};
  await save(dir,item);
  try{await git(repo,['worktree','add','-b',branch,'--',item.path,commit]);item.status='ready';await save(dir,item);return item;}
  catch{item.status='needs-attention';await save(dir,item);throw Error('Worktree creation did not finish. Any partial worktree and branch were retained; inspect them before retrying.');}
 }
 async function open(root,id){const info=await inspect(root),item=info.items.find(item=>item.id===id);if(!item?.available)throw Error('This worktree is unavailable. Inspect its retained folder.');if((await lstat(item.path)).isSymbolicLink()||await realpath(item.path)!==item.path)throw Error('Worktree folder changed.');const {common}=await repository(item.path),original=await repository(root);if(common!==original.common)throw Error('Worktree repository changed.');return item;}
 return{inspect,create,open};
}
