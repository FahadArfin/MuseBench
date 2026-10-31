import {realpath,stat,writeFile} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chatLink,chatMarkdown} from '../src/shared/chat-menu-tools.mjs';
const run=promisify(execFile);
const exists=async file=>{try{return(await stat(file)).isFile();}catch{return false;}};
const launch=(executable,args,options)=>new Promise((resolve,reject)=>{const child=spawn(executable,args,{...options,shell:false,detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
export async function detectChatApps(){
 const local=process.env.LOCALAPPDATA??'',program=process.env.ProgramFiles??'C:\\Program Files',program86=process.env['ProgramFiles(x86)']??'C:\\Program Files (x86)',system=path.join(process.env.SystemRoot??'C:\\Windows','System32');
 const first=async paths=>{for(const file of paths)if(await exists(file))return file;return null;};
 const code=await first([path.join(local,'Programs/Microsoft VS Code/Code.exe'),path.join(program,'Microsoft VS Code/Code.exe')]);
 let studio=null;const vswhere=path.join(program86,'Microsoft Visual Studio/Installer/vswhere.exe');
 if(await exists(vswhere))try{const {stdout}=await run(vswhere,['-latest','-products','*','-property','productPath'],{timeout:2500,windowsHide:true,maxBuffer:32000});const candidate=stdout.trim();if(candidate&&await exists(candidate))studio=candidate;}catch{}
 const terminal=await first([path.join(local,'Microsoft/WindowsApps/wt.exe'),path.join(system,'cmd.exe')]),git=await first([path.join(program,'Git/git-bash.exe'),path.join(local,'Programs/Git/git-bash.exe')]);
 const wsl=path.join(system,'wsl.exe');let linux=false;if(await exists(wsl))try{const {stdout}=await run(wsl,['--list','--quiet'],{encoding:'buffer',timeout:2500,windowsHide:true,maxBuffer:32000});linux=!!stdout.toString('utf16le').replace(/\0/g,'').trim();}catch{}
 return[{id:'vscode',label:'VS Code',executable:code},{id:'visualstudio',label:'Visual Studio',executable:studio},{id:'explorer',label:'File Explorer',available:true},{id:'terminal',label:'Terminal',executable:terminal},{id:'gitbash',label:'Git Bash',executable:git},{id:'wsl',label:'WSL',executable:linux?wsl:null}].map(row=>({...row,available:row.available??!!row.executable}));
}
export function createChatMenuTools({getState,readHistory,clipboard,save,openPath,detect=detectChatApps,launch:launchApp=launch}){
 let snapshot=null;
 const bind=taskId=>{const state=getState();if(!state.task||state.task.id!==taskId||!state.activeProject)throw Error('The chat changed. Open its menu again.');return{task:state.task,root:state.activeProject.root};};
 const same=(taskId,root)=>{if(bind(taskId).root!==root)throw Error('The chat changed. Open its menu again.');};
 const transcript=async taskId=>{
  const {task,root}=bind(taskId);let before,messages=[],characters=0;
  do{const page=await readHistory({taskId,before,limit:50}),batch=[];for(const message of page.messages){let text=message.text;while(text.length<message.textLength){const more=await readHistory({taskId,messageId:message.id,offset:text.length,limit:1});const chunk=more.messages[0]?.text;if(!chunk||more.messages[0].textLength!==message.textLength)throw Error('The saved transcript changed. Try again.');text+=chunk;if(text.length>2000000)throw Error('This transcript is too large to copy or share in one file.');}characters+=text.length;if(characters>2000000||messages.length>=2000)throw Error('This transcript is too large to copy or share in one file.');batch.push({...message,text});}messages=[...batch,...messages];if(page.before&&page.before===before)throw Error('The saved transcript changed. Try again.');before=page.before;}while(before);
  same(taskId,root);const markdown=chatMarkdown(task,messages);if(markdown.length>2000000)throw Error('This transcript is too large to copy or share in one file.');return{task,root,markdown};
 };
 return async input=>{
  if(!input||typeof input.taskId!=='string'||!['apps','preview','copy','share','open'].includes(input.type)||Object.keys(input).some(key=>!['taskId','type','format','app','token'].includes(key)))throw Error('Invalid chat menu request.');
  const {root}=bind(input.taskId);
  if(input.type==='apps')return{status:'ready',apps:(await detect()).map(({id,label,available})=>({id,label,available}))};
  if(input.type==='preview'){const value=await transcript(input.taskId);snapshot={...value,taskId:input.taskId,token:randomUUID()};return{status:'ready',markdown:value.markdown,token:snapshot.token};}
  if(input.type==='copy'){
   let text;if(input.format==='link')text=chatLink(input.taskId);else if(input.format==='directory')text=root;else if(input.format==='markdown'){if(input.token){if(snapshot?.token!==input.token||snapshot.taskId!==input.taskId)throw Error('Reopen the share preview.');text=snapshot.markdown;}else text=(await transcript(input.taskId)).markdown;}else throw Error('Invalid copy format.');same(input.taskId,root);await clipboard.writeText(text);return{status:'copied'};
  }
  if(input.type==='share'){
   const reviewed=snapshot;if(!reviewed||!input.token||reviewed.token!==input.token||reviewed.taskId!==input.taskId)throw Error('Reopen the share preview.');
   const file=await save(reviewed.task.title.replace(/[^\w .-]/g,'').slice(0,80)||'MuseBench-chat');if(!file)return{status:'cancelled'};same(input.taskId,reviewed.root);await writeFile(file,reviewed.markdown,'utf8');return{status:'saved'};
  }
  const rows=await detect(),selected=rows.find(row=>row.id===input.app);if(!selected?.available)throw Error('That application is not installed or available.');
  const resolved=await realpath(root);if(/[\x00\r\n"]/.test(resolved))throw Error('The project folder path is unsupported.');if(!(await stat(resolved)).isDirectory())throw Error('The project folder is unavailable.');same(input.taskId,root);
  if(input.app==='explorer'){const error=await openPath(resolved);if(error)throw Error(error);}
  else{const args=input.app==='terminal'?(path.basename(selected.executable).toLowerCase()==='wt.exe'?['-d',resolved]:['/d','/k']):input.app==='gitbash'?['--cd='+resolved]:input.app==='wsl'?[]:input.app==='visualstudio'?['/Command',`File.OpenFolder "${resolved}"`]:[resolved];await launchApp(selected.executable,args,{cwd:resolved});}
  return{status:'opened'};
 };
}
