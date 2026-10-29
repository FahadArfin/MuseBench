import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {readBounded} from '../src/runtime/extension-review.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const unsupported=reason=>({supported:false,reason});
const events=new Set(['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','PostToolUseFailure','PreLLMCall','PostLLMCall','PreCompact','PostCompact','SubagentStart','SubagentStop','Stop','StopFailure','SessionEnd','Notification','PostToolBatch']);
const codexUnsupported=new Set(['Notification','PostToolUseFailure','StopFailure','PostToolBatch']);
const groupKeys=new Set(['matcher','description','hooks']);
const handlerKeys=new Set(['type','command','timeout','async','statusMessage','description','silent','if']);
const text=value=>typeof value==='string'&&value.length<=1000&&!/[\u0000-\u001f\u007f]/.test(value);
const relativePath=value=>{
 if(typeof value!=='string'||!value||value.length>1000||path.isAbsolute(value)||/^[a-zA-Z]:|[\u0000-\u001f\u007f]/.test(value)||value.split(/[\\/]/).some(part=>part==='..'))return null;
 return value.replaceAll('\\','/').replace(/^\.\//,'');
};

async function document(root,relative){
 const file=await realpath(path.resolve(root,relative)),distance=path.relative(root,file);
 if(!distance||distance==='..'||distance.startsWith('..'+path.sep)||path.isAbsolute(distance))throw Error('Outside package');
 return JSON.parse(await readBounded(file,131072));
}

/** Foreign inspection omits conditions and presentation fields. Match a single
 * installed source handler before allowing the exact native capability grant. */
export async function inspectImportedPluginHook(definition,{cacheRoot,pluginId,manifestFamily}){
 const family=manifestFamily==='claude-compatible'?'claude':manifestFamily==='codex-compatible'?'codex':null;
 if(!family)return unsupported('This imported hook format needs review in the official Muse CLI.');
 if(!events.has(definition.event)||family==='codex'&&codexUnsupported.has(definition.event))return unsupported('This imported hook event needs review in the official Muse CLI.');
 if(definition.source_path!=null||definition.compatibility_name!=null||typeof definition.shell_command!=='string'||!Array.isArray(definition.command)||definition.command.length!==1||definition.command[0]!==definition.shell_command)return unsupported('The imported shell command does not match native inspection.');
 const sourcePath=relativePath(definition.source_relative_path),marker=`.${family}-plugin/plugin.json`;
 if(!sourcePath)return unsupported('The imported hook source must stay inside the installed package.');
 let manifest,source;
 try{
  manifest=await document(cacheRoot,marker);
  if(!object(manifest)||manifest.name!==pluginId)return unsupported('The imported hook manifest could not be verified.');
  if(sourcePath===marker){
   if(!object(manifest.hooks))return unsupported('The inline hook definition could not be verified.');
   source=manifest.hooks;
  }else{
   const declared=typeof manifest.hooks==='string'?[manifest.hooks]:Array.isArray(manifest.hooks)?manifest.hooks:[];
   const conventional=sourcePath==='hooks/hooks.json'&&(family==='claude'||manifest.hooks===undefined);
   if(!conventional&&!declared.some(file=>relativePath(file)===sourcePath))return unsupported('The hook source is not selected by its installed manifest.');
   const file=await document(cacheRoot,sourcePath);
   if(!object(file)||Object.keys(file).some(key=>key!=='hooks')||!object(file.hooks))return unsupported('The imported hook file contains behavior MuseBench cannot fully review yet.');
   source=file.hooks;
  }
 }catch{return unsupported('The imported hook source could not be verified.');}
 if(Object.keys(source).length>100)return unsupported('The imported hook file is too large to review.');
 const matches=[];let count=0;
 for(const [event,groups] of Object.entries(source)){
  const normalizedEvent=family==='claude'&&event==='PreUserTurn'?'UserPromptSubmit':event;
  if(normalizedEvent!==definition.event)continue;
  if(!Array.isArray(groups)||groups.length>100)return unsupported('The imported hook groups could not be verified.');
  for(const group of groups){
   if(!object(group)||Object.keys(group).some(key=>!groupKeys.has(key))||group.description!==undefined&&!text(group.description)||!Array.isArray(group.hooks))return unsupported('The imported hook group contains behavior MuseBench cannot fully review yet.');
   const matcher=group.matcher??null;
   if(matcher!==null&&!text(matcher))return unsupported('The imported hook matcher could not be verified.');
   count+=group.hooks.length;if(count>100)return unsupported('The imported hook file is too large to review.');
   for(const handler of group.hooks){
    if(!object(handler))return unsupported('The imported hook handler could not be verified.');
    if(handler.command===definition.shell_command&&matcher===definition.matcher)matches.push({event,group,handler});
   }
  }
 }
 if(matches.length!==1)return unsupported('The inspected hook must match exactly one installed source handler.');
 const {event,group,handler}=matches[0];
 if(Object.keys(handler).some(key=>!handlerKeys.has(key))||handler.type!=='command')return unsupported('The imported hook contains behavior MuseBench cannot fully review yet.');
 if(Object.hasOwn(handler,'if'))return unsupported('Conditional imported hooks need review in the official Muse CLI; their execution conditions are not verified in MuseBench.');
 const timeout=handler.timeout??600,background=handler.async??false,silent=handler.silent??false;
 if(!Number.isSafeInteger(timeout)||timeout<1||timeout>600||typeof background!=='boolean'||typeof silent!=='boolean'||['statusMessage','description'].some(key=>handler[key]!==undefined&&!text(handler[key])))return unsupported('The imported hook timeout or behavior could not be verified.');
 if(timeout*1000!==definition.timeout_ms||background!==definition.async)return unsupported('The inspected hook does not match its installed source. Refresh and review the package.');
 return{supported:true,hook:{event:definition.event,timeoutMs:timeout*1000,async:background,matcher:definition.matcher,compatibilityName:null,execution:'shell',source:sourcePath,ignoredSilent:silent},source:{path:sourcePath,event,group,handler}};
}
