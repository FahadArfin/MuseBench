import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);

// Only return a canonical repository URL, never credentials or query parameters.
export function githubRepository(remote){
  if(typeof remote!=='string')return null;
  const value=remote.trim();
  const scp=/^(?:[^@\s]+@)?github\.com:([^\s]+)$/.exec(value);
  let pathname;
  if(scp)pathname=scp[1];
  else{try{const url=new URL(value);if(url.hostname!=='github.com'||!['https:','ssh:','git:'].includes(url.protocol)||url.port)return null;pathname=url.pathname.replace(/^\//,'');}catch{return null;}}
  const match=/^([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(pathname);
  return match&&match[2]!=='.'&&match[2]!=='..'?`https://github.com/${match[1]}/${match[2]}`:null;
}

export async function projectGit(root){
  const read=async args=>{try{return (await exec('git',['-C',root,...args],{windowsHide:true,timeout:2000,maxBuffer:16384})).stdout.trim();}catch{return '';}};
  const [remote,branch]=await Promise.all([read(['config','--get','remote.origin.url']),read(['symbolic-ref','--quiet','--short','HEAD'])]);
  return {repositoryUrl:githubRepository(remote),branch:branch||null};
}
