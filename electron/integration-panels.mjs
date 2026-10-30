import {randomUUID} from 'node:crypto';
import {configurationDigest} from '../src/runtime/extension-review.mjs';
import {canonicalMcpEntry,mcpTransport} from '../src/runtime/project-mcp.mjs';
import {customizeBlocked} from '../src/shared/customize-policy.mjs';
import {RUN_SETTING_FIELDS,validateRunSettings,runSettingsChanges} from '../src/shared/integration-panel.mjs';

const validName=name=>typeof name==='string'&&/^[a-zA-Z0-9][\w:./-]{0,199}$/.test(name)&&!name.includes('..')&&!['constructor','prototype','__proto__'].includes(name);
function valuesOf(entry){
 const canonical=canonicalMcpEntry(entry);
 if(!['stdio','streamable-http'].includes(mcpTransport(canonical))||Boolean(canonical.command)===Boolean(canonical.url))throw Error('Unsupported MCP configuration.');
 const value=(key,fallback)=>Object.hasOwn(canonical,key)?canonical[key]:fallback;
 return validateRunSettings({required:value('required',false),startupTimeout:value('startup_timeout_sec',30),toolTimeout:value('tool_timeout_sec',300)});
}
function updateEntry(entry,changes){
 const next=structuredClone(entry);
 for(const change of changes){
  if(change.key==='required'){if(Object.hasOwn(next,'mode'))next.mode=change.after?'required':'optional';else next.required=change.after;}
  else next[change.key==='startupTimeout'?'startup_timeout_sec':'tool_timeout_sec']=change.after;
 }
 return next;
}
export function createIntegrationPanels({settings,writeSettings,review,getState,isActive=()=>false,isClosed=()=>false,now=Date.now}){
 const pending=new Map();let closed=false;
 const owner=()=>JSON.stringify([getState().activeProject?.id??null,getState().activeProject?.root??null,getState().task?.id??null]);
 function current(expected,{idle=false}={}){
  if(closed||isClosed())throw Error('Integration settings are closed.');
  if(owner()!==expected)throw Error('The selected project or chat changed. Review the settings again.');
  if(idle&&(customizeBlocked(getState())||isActive()))throw Error('Let running work finish before changing integration settings.');
 }
 async function load({name,revision}){
  if(!validName(name)||typeof revision!=='string')throw Error('Invalid integration settings owner.');
  const configured=await settings(),entry=Object.hasOwn(configured.servers,name)?configured.servers[name]:null;
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Integration no longer configured. Refresh its details.');
  if(configurationDigest(entry)!==revision)throw Error('Integration settings changed. Refresh and review again.');
  return{...configured,entry};
 }
 async function panelFor(name,revision,entry){
  const panel={schemaVersion:1,kind:'mcp-run-settings',name,revision,fields:structuredClone(RUN_SETTING_FIELDS),editable:false};
  try{panel.values=valuesOf(entry);}catch{panel.reason='These settings are unsupported or ambiguous. Correct them in the official Muse configuration, then refresh.';return panel;}
  panel.editable=await review.allowMcp(name,entry);if(!panel.editable)panel.reason='Review access for this integration before editing its run settings.';
  return panel;
 }
 return{
  async inspect(command){const expected=owner();current(expected);const {entry}=await load(command),panel=await panelFor(command.name,command.revision,entry);current(expected);return panel;},
  async prepare(command){
   const expected=owner();current(expected,{idle:true});const configured=await load(command),panel=await panelFor(command.name,command.revision,configured.entry);current(expected,{idle:true});
   if(!panel.editable)throw Error(panel.reason);
   const values=validateRunSettings(command.values),changes=runSettingsChanges(panel.values,values);if(!changes.length)throw Error('No changes to review.');
   // Exactly one immutable draft is admitted at a time. Nothing from a caller's
   // proposed schema or executable configuration reaches a write.
   const token=randomUUID(),created=now();pending.clear();pending.set(token,{name:command.name,revision:command.revision,owner:expected,source:configured.source,entry:configured.entry,changes,created});
   return{schemaVersion:1,kind:'mcp-run-settings',name:command.name,revision:command.revision,token,changes:structuredClone(changes),expiresAt:new Date(created+600000).toISOString()};
  },
  async apply(command){
   if(command.reviewed!==true)throw Error('Review these changes before applying.');
   const prepared=pending.get(command.token);pending.delete(command.token);
   if(!prepared||now()-prepared.created>=600000||now()<prepared.created)throw Error('This review expired. Review the changes again.');
   const check=()=>current(prepared.owner,{idle:true});check();
   const configured=await load(prepared);if(configured.source!==prepared.source)throw Error('Muse settings changed elsewhere. Review the changes again.');
   if(!await review.allowMcp(prepared.name,configured.entry))throw Error('Integration access changed. Review it again.');check();
   const next=updateEntry(configured.entry,prepared.changes);configured.config[configured.key]={...configured.servers,[prepared.name]:next};
   await writeSettings(prepared.source,configured.config,check);
   try{
    check();const saved=await settings();
    const expectedConfig={schema_version:1,...configured.config};
    if(configurationDigest(saved.config)!==configurationDigest(expectedConfig))throw Error('Settings changed during save.');
    const beforeCommit=async()=>{check();if((await settings()).source!==saved.source||!await review.allowMcp(prepared.name,prepared.entry))throw Error('Settings or access changed before approval.');check();};
    await beforeCommit();await review.approveMcp(prepared.name,next,{beforeCommit});
   }catch{throw Error('Settings were saved, but access still needs review. Refresh the integration and review access before reconnecting Muse.');}
   return{message:'Run settings saved. Reconnect Muse to use them; existing connections keep their previous settings.'};
  },
  close(){closed=true;pending.clear();},
 };
}
