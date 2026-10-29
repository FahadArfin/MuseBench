import {lstat,open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

// Documented Muse selection, not the broader inventory used to grant project trust.
const candidates=['AGENTS.md','CLAUDE.md','.agents/AGENTS.md','.claude/CLAUDE.md'];
const fileLimit=100000,totalLimit=500000,levelLimit=32;
const decoder=new TextDecoder('utf-8',{fatal:true});
async function info(file){try{return await lstat(file);}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return null;throw error;}}
async function candidateInfo(root,name){
 const parts=name.split('/');let file=root;
 for(let i=0;i<parts.length;i++){
  file=path.join(file,parts[i]);const found=await info(file);if(!found)return null;
  if(found.isSymbolicLink())throw Error('Symbolic links and directory junctions are not inspected.');
  if(i<parts.length-1&&!found.isDirectory())return null;
  if(i===parts.length-1)return found;
 }
}
// Windows lstat may report dev=0 while the opened handle reports its volume ID.
const sameFile=(a,b)=>(a.dev===b.dev||process.platform==='win32'&&(!a.dev||!b.dev))&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs;
async function readCandidate(root,name,before,budget){
 if(!before.isFile())throw Error('Not a regular file.');
 if(before.size>fileLimit)throw Error('File exceeds the 100,000-byte inspection limit.');
 if(before.size>budget.left)throw Error('The 500,000-byte inspection budget was reached.');
 const file=path.join(root,name),handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const opened=await handle.stat();
  if(!opened.isFile()||!sameFile(before,opened))throw Error('File changed while inspecting. Refresh to try again.');
  // Read one extra byte so growth cannot be mistaken for a complete preview.
  const buffer=Buffer.alloc(Math.min(fileLimit,budget.left)+1);let size=0;
  while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
  if(size>fileLimit||size>budget.left)throw Error('File grew beyond the inspection limit.');
  budget.left-=size;
  const after=await candidateInfo(root,name);
  if(!after||!sameFile(opened,after)||!sameFile(opened,await handle.stat()))throw Error('File changed while inspecting. Refresh to try again.');
  const bytes=buffer.subarray(0,size);if(bytes.includes(0))throw Error('Binary content is not previewed.');
  let text;try{text=decoder.decode(bytes);}catch{throw Error('Content is not valid UTF-8.');}
  return{bytes:size,text};
 }finally{await handle.close();}
}
function problem(error){return ['EACCES','EPERM'].includes(error.code)?'Permission denied while inspecting this path.':error.code?'Could not read this path.':error.message;}

/** A trust label must refer to the same candidate inventory the person can read. */
export function matchesProjectInstructionReview(observation,review){
 if(!observation.complete||observation.root!==review.root||!Array.isArray(review.files))return false;
 if(review.boundary){
  if(observation.boundary.kind==='git'&&observation.boundary.root!==review.boundary)return false;
  if(observation.boundary.kind!=='git'&&review.boundary!==review.root)return false;
  return observation.levels.every(level=>candidates.every(name=>{
   const relative=path.relative(review.root,path.join(level.root,name)).split(path.sep).join('/');
   const displayed=level.files.find(file=>file.path===name),reviewed=review.files.find(file=>file.path===relative);
   return !displayed&&!reviewed||!!displayed&&!!reviewed&&typeof displayed.text==='string'&&displayed.text===reviewed.text;
  }));
 }
 const own=observation.levels.find(level=>level.root===observation.root);
 if(!own||observation.levels.some(level=>level!==own&&level.files.length))return false;
 return candidates.every(name=>{
  const displayed=own.files.find(file=>file.path===name),reviewed=review.files.find(file=>file.path===name);
  return !displayed&&!reviewed||!!displayed&&!!reviewed&&typeof displayed.text==='string'&&displayed.text===reviewed.text;
 });
}

/** Bounded, read-only filesystem observation. It never grants trust or calls Muse. */
export async function inspectProjectInstructions(folder){
 const root=await realpath(folder);if(!(await lstat(root)).isDirectory())throw Error('Choose a project folder.');
 const levels=[],budget={left:totalLimit};let current=root,boundary;
 for(let depth=0;depth<levelLimit;depth++){
  const files=[];let winner;
  for(const name of candidates){
   let found,issue;try{found=await candidateInfo(current,name);if(!found)continue;}catch(error){issue=problem(error);}
   const selected=!winner;winner??=name;
   const entry={path:name,selected,...(!selected?{shadowedBy:winner}:{})};
   if(issue)entry.issue=issue;
   else try{Object.assign(entry,await readCandidate(current,name,found,budget));}catch(error){entry.issue=problem(error);}
   files.push(entry);
  }
  const level={root:current,files};levels.push(level);
  try{if(await info(path.join(current,'.git'))){boundary={kind:'git',root:current};break;}}
  catch{level.issue='Could not determine the Git boundary.';boundary={kind:'unknown',root:current};break;}
  const parent=path.dirname(current);if(parent===current){boundary={kind:'filesystem',root:current};break;}
  if(depth===levelLimit-1){boundary={kind:'limit',root:current};break;}
  current=parent;
 }
 const selected=levels.flatMap(level=>level.files.filter(file=>file.selected));
 const chainComplete=['git','filesystem'].includes(boundary.kind),measuredBytes=selected.reduce((sum,file)=>sum+(file.bytes??0),0);
 return{root,checkedAt:new Date().toISOString(),boundary,levels:levels.reverse(),selectedCount:selected.length,measuredBytes,
  selectedBytes:chainComplete&&selected.every(file=>typeof file.bytes==='number')?measuredBytes:null,
  complete:chainComplete&&levels.every(level=>!level.issue&&level.files.every(file=>!file.issue))};
}
