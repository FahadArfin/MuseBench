import {promises as fs,constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateProjectAction} from '../shared/project-actions.mjs';

const maximum=65536,fileName='.musebench/actions.json';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function projectRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Choose an absolute project folder.');
 const real=await fs.realpath(root);if(real!==path.resolve(root)||!(await fs.stat(real)).isDirectory())throw Error('Project folder changed. Reopen the project.');return real;
}
async function safePath(root,relative,{missing=false}={}){
 const target=path.resolve(root,relative),rel=path.relative(root,target);
 if(path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw Error('Action folder is outside this project.');
 let part=root;
 for(const segment of rel.split(path.sep).filter(Boolean)){
  part=path.join(part,segment);let stat;
  try{stat=await fs.lstat(part);}catch(error){if(missing&&error.code==='ENOENT')return target;throw error;}
  if(stat.isSymbolicLink())throw Error('Project actions cannot use symbolic links.');
  if(await fs.realpath(part)!==part)throw Error('Project action path changed. Review it again.');
 }
 return target;
}
async function readManifest(root){
 let handle;try{
  const file=await safePath(root,fileName);handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const stat=await handle.stat();
  if(!stat.isFile()||stat.size>maximum)throw Error('Project actions must be a JSON file up to 64 KiB.');
  const bytes=await handle.readFile();if(bytes.length>maximum)throw Error('Project actions exceed 64 KiB.');await safePath(root,fileName);return bytes.toString('utf8');
 }catch(error){if(error.code==='ENOENT')return null;throw error;}finally{await handle?.close();}
}
function parse(text){
 let value;try{value=text===null?{version:1,actions:[]}:JSON.parse(text);}catch{throw Error('Project actions JSON is invalid. Fix .musebench/actions.json before editing.');}
 if(!value||Array.isArray(value)||value.version!==1||Object.keys(value).some(key=>!['version','actions'].includes(key))||!Array.isArray(value.actions)||value.actions.length>50)throw Error('Use project actions version 1 with up to 50 actions.');
 const actions=value.actions.map(validateProjectAction);if(new Set(actions.map(action=>action.id)).size!==actions.length)throw Error('Project action IDs must be unique.');return actions;
}
async function row(root,definition,platform){
 const folder=await safePath(root,definition.cwd);if(!(await fs.stat(folder)).isDirectory())throw Error('An action working folder must be a directory.');
 return{...definition,folder,command:definition.commands[platform]??null,shell:platform==='win32'?'Windows PowerShell':'/bin/sh',supported:Boolean(definition.commands[platform])};
}
export async function inspectProjectActions(input,{platform=process.platform}={}){
 if(!['win32','darwin','linux'].includes(platform))throw Error('Project actions are unavailable on this platform.');
 const root=await projectRoot(input),text=await readManifest(root),definitions=parse(text),actions=[];
 for(const definition of definitions)actions.push(await row(root,definition,platform));
 return{root,platform,revision:digest([root,platform,text,actions.map(action=>action.folder)]),actions};
}
export async function resolveProjectAction(root,{revision,actionId},{platform=process.platform}={}){
 const view=await inspectProjectActions(root,{platform});if(view.revision!==revision)throw Error('Project actions changed. Review the current command again.');
 const action=view.actions.find(item=>item.id===actionId);if(!action)throw Error('Project action no longer exists. Refresh the list.');if(!action.supported)throw Error('This action has no command for the current platform.');
 return{...action,platform,revision};
}
export async function saveProjectAction(root,{revision,definition},{platform=process.platform}={}){
 const action=validateProjectAction(definition),before=await inspectProjectActions(root,{platform});if(before.revision!==revision)throw Error('Project actions changed. Refresh before saving.');
 await row(before.root,action,platform);
 const definitions=before.actions.map(({id,name,cwd,commands,timeoutSeconds})=>({id,name,cwd,commands,timeoutSeconds})),index=definitions.findIndex(item=>item.id===action.id);
 if(index<0)definitions.push(action);else definitions[index]=action;
 if(definitions.length>50)throw Error('A project can save up to 50 actions.');
 const text=JSON.stringify({version:1,actions:definitions},null,2)+'\n';if(Buffer.byteLength(text)>maximum)throw Error('Project actions exceed 64 KiB.');
 const directory=await safePath(before.root,'.musebench',{missing:true});await fs.mkdir(directory).catch(error=>{if(error.code!=='EEXIST')throw error;});await safePath(before.root,'.musebench');
 const temporary=path.join(directory,`.actions-${randomUUID()}.tmp`);let created=false;
 try{
  await fs.writeFile(temporary,text,{flag:'wx',mode:0o600});created=true;
  if((await inspectProjectActions(before.root,{platform})).revision!==revision)throw Error('Project actions changed. Refresh before saving.');
  const destination=await safePath(before.root,fileName,{missing:true});await fs.rename(temporary,destination);created=false;
 }finally{if(created)await fs.unlink(temporary).catch(()=>{});}
 return inspectProjectActions(before.root,{platform});
}
