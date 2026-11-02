import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstat,readFile,readdir,readlink,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const schemaVersion=1;
const defaultRuntime=()=>({
 node:process.version,executable:process.execPath,platform:process.platform,arch:process.arch,os:os.release(),
 environment:Object.fromEntries(['CI','GITHUB_ACTIONS','NODE_ENV','NODE_OPTIONS','ELECTRON_RUN_AS_NODE','TZ','LANG'].map(key=>[key,process.env[key]??null])),
});
const documentation=name=>(name.startsWith('docs/')||!name.includes('/'))&&/\.(?:md|txt)$/i.test(name)&&!name.endsWith('AGENTS.md');

// Deliberately conservative: all non-documentation Git inputs, including new
// files, plus generated app output and installed dependency metadata. No import
// graph guesses, commit-only shortcuts, profiles, credentials or ignored logs.
export async function fingerprintInputs(root,{runtime=defaultRuntime()}={}){
 root=path.resolve(root);
 const git=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
 if(git.status!==0)throw Error('Cannot fingerprint this Git checkout.');
 const names=new Set(git.stdout.split('\0').filter(name=>name&&!documentation(name)));
 const visit=async name=>{
  let stat;try{stat=await lstat(path.join(root,name));}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(stat.isSymbolicLink())throw Error(`Cannot reuse evidence for a generated symbolic link: ${name}`);
  if(stat.isDirectory())for(const child of await readdir(path.join(root,name)))await visit(`${name}/${child}`);
  else if(stat.isFile())names.add(name);
 };
 for(const name of ['dist','mobile-dist','native/bin'])await visit(name);
 for(const name of ['node_modules/.package-lock.json','node_modules/electron/package.json','node_modules/playwright/package.json','node_modules/playwright-core/package.json'])names.add(name);
 const hash=createHash('sha256');hash.update(JSON.stringify({schemaVersion,runtime}));
 for(const name of [...names].sort()){
  hash.update(`\0${name}\0`);
  try{
   const stat=await lstat(path.join(root,name));
   if(stat.isSymbolicLink()){hash.update(`link:${await readlink(path.join(root,name))}\0`);}
   if(!stat.isFile()&&!stat.isSymbolicLink())throw Error(`Unsupported check input: ${name}`);
   const data=await readFile(path.join(root,name));hash.update(`${data.length}\0`);hash.update(data);
  }catch(error){if(error.code==='ENOENT')hash.update('missing');else throw error;}
 }
 return hash.digest('hex');
}

export async function checkEvidence(root,fingerprint,{directory=path.join(root,'artifacts/check-evidence'),maxAgeMs=24*60*60*1000}={}){
 const file=path.join(directory,`${fingerprint}.json`),now=Date.now();let entries={};
 try{
  const value=JSON.parse(await readFile(file,'utf8'));
  if(value.schemaVersion===schemaVersion&&value.fingerprint===fingerprint&&value.entries&&typeof value.entries==='object')entries=value.entries;
 }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
 const key=command=>createHash('sha256').update(JSON.stringify(command)).digest('hex');
 return {
  file,
  lookup(command){const entry=entries[key(command)];return entry?.exitCode===0&&Number.isFinite(entry.completedAt)&&now-entry.completedAt>=0&&now-entry.completedAt<maxAgeMs?entry:null;},
  invalidate(command){delete entries[key(command)];},
  record(command){entries[key(command)]={command,exitCode:0,completedAt:Date.now()};},
  async save(){
   await mkdir(directory,{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;
   await writeFile(temporary,JSON.stringify({schemaVersion,fingerprint,entries},null,2)+'\n');await rename(temporary,file);
  },
 };
}
