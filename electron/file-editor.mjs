import {readFile,writeFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const inside=(root,file)=>{const relative=path.relative(root,file);return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const launchEditor=(executable,args)=>new Promise((resolve,reject)=>{
 const child=spawn(executable,args,{shell:false,detached:true,stdio:'ignore'});
 child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
});

export function createFileEditor({dataDir,getState,choose,launch=launchEditor,candidates=[
 path.join(process.env.LOCALAPPDATA||'','Programs','Microsoft VS Code','Code.exe'),
 path.join(process.env.ProgramFiles||'','Microsoft VS Code','Code.exe'),
]}) {
 const preference=path.join(dataDir,'file-editor.json');
 return async input=>{
  if(!input||typeof input.taskId!=='string'||typeof input.path!=='string'||input.path.length>4096||/[\x00-\x1f:]/.test(input.path)||path.isAbsolute(input.path)||!['preferred','vscode','choose'].includes(input.editor??'preferred'))throw Error('Invalid editor request.');
  const state=getState(),file=state.task?.changes.find(file=>file.path===input.path);
  if(state.task?.id!==input.taskId||!state.activeProject||!file)throw Error('This file is no longer in the active task.');
  if(file.status==='deleted')throw Error('This file was deleted.');
  const root=await realpath(state.activeProject.root),target=path.resolve(root,input.path);
  if(!inside(root,target))throw Error('File is outside the project.');
  const resolved=await realpath(target);
  if(!inside(root,resolved))throw Error('File is outside the project.');
  if(!(await stat(resolved)).isFile())throw Error('Select a project file.');
  let executable;
  if((input.editor??'preferred')==='preferred'){
   try {const saved=JSON.parse(await readFile(preference,'utf8')).executable;if(typeof saved==='string'&&path.isAbsolute(saved)&&path.extname(saved).toLowerCase()==='.exe'&&(await stat(saved)).isFile())executable=saved;}catch{}
  }
  if(!executable&&input.editor!=='choose')for(const candidate of candidates){try{if((await stat(candidate)).isFile()){executable=candidate;break;}}catch{}}
  if(!executable)executable=await choose();
  if(!executable)return {opened:false};
  if(typeof executable!=='string'||!path.isAbsolute(executable)||path.extname(executable).toLowerCase()!=='.exe'||!(await stat(executable)).isFile())throw Error('Choose an editor application (.exe).');
  const current=getState();
  if(current.task?.id!==input.taskId||current.activeProject?.root!==state.activeProject.root||!current.task.changes.some(item=>item.path===input.path&&item.status!=='deleted'))throw Error('This file is no longer in the active task.');
  if(await realpath(target)!==resolved||!(await stat(resolved)).isFile())throw Error('The file moved. Reopen its changes and try again.');
  // The renderer never supplies an executable or shell command. Paths are separate arguments.
  await launch(executable,[resolved]);
  await writeFile(preference,JSON.stringify({executable}),'utf8');
  return {opened:true};
 };
}
