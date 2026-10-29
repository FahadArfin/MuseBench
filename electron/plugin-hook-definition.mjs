import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {readBounded,configurationDigest} from '../src/runtime/extension-review.mjs';
import {inspectImportedPluginHook} from './imported-plugin-hook.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const events=new Set(['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','PostToolUseFailure','PreLLMCall','PostLLMCall','PreCompact','PostCompact','SubagentStart','SubagentStop','Stop','StopFailure','SessionEnd','Notification','PostToolBatch','SessionFork','ToolUseStart']);
const toolEvents=new Set(['PreToolUse','PermissionRequest','PostToolUse','PostToolUseFailure']);
const normalizedKeys=new Set(['id','event','matcher','command','shell_command','source_path','source_relative_path','timeout_ms','async','compatibility_name']);
const manifestKeys=new Set(['id','event','command','timeoutMs','async','statusMessage','compatibilityName','outputCapabilities']);
const unsupported=reason=>({supported:false,reason});

/** Native inspect omits outputCapabilities. Bind and compare the installed source
 * as well; never approve a smaller projection of the executable definition. */
export async function inspectPluginHook(definition,{cacheRoot,pluginId,manifestFamily}){
 if(!object(definition)||Object.keys(definition).some(key=>!normalizedKeys.has(key)))return unsupported('This hook contains behavior MuseBench cannot fully review yet.');
 if(manifestFamily!=='native')return inspectImportedPluginHook(definition,{cacheRoot,pluginId,manifestFamily});
 if(!events.has(definition.event)||definition.shell_command!=null||definition.matcher!=null)return unsupported('This hook event, shell command or matcher needs review in the official Muse CLI.');
 let manifest;
 try{
  const file=await realpath(path.join(cacheRoot,'.muse-plugin','plugin.json')),relative=path.relative(cacheRoot,file);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return unsupported('The hook manifest is outside the installed package.');
  manifest=JSON.parse(await readBounded(file,131072));
 }catch{return unsupported('The native hook manifest could not be verified.');}
 const hooks=manifest?.capabilities?.hooks;
 if(manifest.schemaVersion!==1||manifest.name!==pluginId||!Array.isArray(hooks)||hooks.length>100||hooks.some(h=>!object(h)))return unsupported('The native hook manifest could not be verified.');
 const matches=hooks.filter(h=>h.id===definition.id),source=matches[0];
 if(matches.length!==1||Object.keys(source).some(key=>!manifestKeys.has(key)))return unsupported('The hook manifest contains behavior MuseBench cannot fully review yet.');
 if(source.outputCapabilities!==undefined&&(!Array.isArray(source.outputCapabilities)||source.outputCapabilities.length))return unsupported('Hooks that select additional skills need review in the official Muse CLI.');
 const timeout=source.timeoutMs??600000,background=source.async??false,compatibility=source.compatibilityName??null;
 if(!Number.isSafeInteger(timeout)||timeout<0||timeout>600000||typeof background!=='boolean'||source.statusMessage!==undefined&&(typeof source.statusMessage!=='string'||source.statusMessage.length>1000)||compatibility!==null&&(!toolEvents.has(source.event)||typeof compatibility!=='string'||!/^[A-Za-z0-9_]{1,80}$/.test(compatibility)))return unsupported('The hook timeout or matching behavior needs review in the official Muse CLI.');
 const hook={event:source.event,timeoutMs:Math.max(1000,timeout),async:background,matcher:null,compatibilityName:compatibility};
 if(source.event!==definition.event||configurationDigest(source.command??null)!==configurationDigest(definition.command??null)||hook.timeoutMs!==definition.timeout_ms||hook.async!==definition.async||hook.compatibilityName!==definition.compatibility_name)return unsupported('The inspected hook does not match its installed manifest. Refresh and review the package.');
 return {supported:true,hook,source};
}
