import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {configurationDigest} from '../src/runtime/extension-review.mjs';
import {pluginPart,nativeHash,pluginDecisions,nativePluginDecision} from '../src/runtime/plugin-capabilities.mjs';
import {diagnosticText} from '../reference/patchlight/adapter/diagnostics.mjs';
import {settingsMcp} from '../src/runtime/project-mcp.mjs';
import {displayPluginCommand} from './plugin-command-review.mjs';
import {inspectPluginHook} from './plugin-hook-definition.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=()=>{throw Error('Native plugin capabilities could not be fully verified. Inspect the package in the official Muse CLI.');};
// The CLI writes the canonical top-level key even for a legacy settings file.
// Server values and every unrelated setting must remain exactly the same.
const settingsIdentity=config=>{const {key,servers}=settingsMcp(config),copy={...config};delete copy[key];return configurationDigest({...copy,mcpServers:servers});};

/** The official CLI supplies normalized definitions; no plugin command runs during inspection. */
export function createPluginCapabilities({cli,review,settings,settingsPath,inventoryPath}){
 async function inspect(id){
  if(!pluginPart(id))throw Error('Invalid plugin identifier.');
  if(path.resolve(inventoryPath)!==path.resolve(review.inventory))throw Error('Plugin tool review currently requires the default Muse plugin store.');
  const inventory=await review.pluginState(),record=inventory.records[id];
  if(!Object.hasOwn(inventory.records,id)||!record)throw Error('Plugin is no longer installed.');
  const before=await settings(),native=await cli(['plugins','inspect',id,'--json']);
  if((await review.pluginState()).revision!==inventory.revision||(await settings()).source!==before.source)throw Error('Plugin configuration changed during inspection. Refresh and inspect it again.');
  if(native.valid!==true||native.active_scope!=='installed-plugin'||native.plugin?.id!==id||!object(native.record)||!nativeHash(record.package_sha256))fail();
  const cacheRoot=await realpath(path.resolve(path.dirname(path.dirname(review.inventory)),record.cache_path));
  // Muse 1.4.14 prints an absolute cache path and the public family name; its
  // persisted inventory also contains internal agent-parser metadata. Keep all
  // persisted fields in the grant fingerprint, but compare this documented view.
  const projected={...record,cache_path:cacheRoot};if(projected.manifest_family==='muse')projected.manifest_family='native';delete projected.agent_definition_inventory;
  if(typeof native.record.cache_path!=='string'||configurationDigest({...native.record,cache_path:await realpath(native.record.cache_path)})!==configurationDigest(projected))fail();
  if(!Array.isArray(native.runtime_capabilities)||native.runtime_capabilities.length>100)fail();
  const definitionsById=new Map();
  for(const [kind,key] of [['mcp_server','mcp_servers'],['hook','hooks']]){
   const definitions=native.plugin?.capabilities?.[key]??[];if(!Array.isArray(definitions)||definitions.length>100)fail();
   for(const definition of definitions){const key=kind+':'+definition?.id;if(!object(definition)||!pluginPart(definition.id)||definitionsById.has(key))fail();definitionsById.set(key,definition);}
  }
  const decisions=pluginDecisions(before.config),reviewed=await review.reviewedPluginCapabilities(decisions,{settingsPath}),seen=new Set(),servers=[],identities={};
  for(const row of native.runtime_capabilities){
   const c=row?.candidate;
   if(!object(c)||c.plugin_id!==id||!pluginPart(c.capability_id)||typeof c.kind!=='string'||!/^[a-z_]{1,40}$/.test(c.kind)||c.stable_id!==`plugin:${id}:${c.kind}:${c.capability_id}`||seen.has(c.stable_id)||!nativeHash(c.definition_hash)||c.source_digest!==record.package_sha256)fail();
   seen.add(c.stable_id);
   if(!['mcp_server','hook'].includes(c.kind)){servers.push({stableId:c.stable_id,title:c.capability_id,kind:c.kind,supported:false,enabled:false,reviewed:false,reason:'This capability needs setup in the official Muse CLI.'});continue;}
   const definition=definitionsById.get(c.kind+':'+c.capability_id);if(!definition)fail();definitionsById.delete(c.kind+':'+c.capability_id);
   identities[c.stable_id]={candidate:c,definition};
   let hook;
   if(c.kind==='hook'){
    const result=await inspectPluginHook(definition,{cacheRoot,pluginId:id,manifestFamily:native.plugin.manifest_family});
    if(!result.supported){servers.push({stableId:c.stable_id,title:c.capability_id,kind:c.kind,supported:false,enabled:false,reviewed:false,reason:result.reason});continue;}
    hook=result.hook;identities[c.stable_id].source=result.source;
   }else{
    if(Object.keys(definition).some(key=>!['id','transport','command','url','source_path','source_relative_path'].includes(key)))fail();
    if(definition.transport!=='stdio'){servers.push({stableId:c.stable_id,title:c.capability_id,kind:c.kind,supported:false,enabled:false,reviewed:false,reason:'This plugin transport needs setup in the official Muse CLI.'});continue;}
   }
   if(definition.url!==null&&definition.url!==undefined||!Array.isArray(definition.command)||!definition.command.length||definition.command.length>64||definition.command.some(arg=>typeof arg!=='string'||arg.length>1000||/[\u0000-\u001f\u007f]/.test(arg))||!definition.command[0].trim()||definition.command.join('').length>16000)fail();
   if(definition.source_relative_path!=null||definition.source_path!=null){
    const relative=definition.source_relative_path;
    if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||/^[a-zA-Z]:|[\u0000-\u001f]/.test(relative)||relative.split(/[\\/]/).some(part=>part==='..')||typeof definition.source_path!=='string')fail();
    const root=cacheRoot,source=await realpath(path.resolve(root,relative)),distance=path.relative(root,source);
    if(!distance||distance.startsWith('..'+path.sep)||distance==='..'||path.isAbsolute(distance)||await realpath(definition.source_path)!==source)fail();
   }
   const decision=decisions[c.stable_id],enabled=decision?.enabled===true;
   const matching=nativePluginDecision(c.stable_id,decision)&&decision.trusted_definition_hash===c.definition_hash;
   servers.push({stableId:c.stable_id,title:c.capability_id,kind:c.kind,supported:true,...(hook?{hook}:{}),command:displayPluginCommand(definition.command),definitionHash:c.definition_hash,enabled,reviewed:enabled&&matching&&reviewed[c.stable_id]===true,status:diagnosticText(row.status),...(decision&&!matching?{reason:'The native approval does not match this definition. Review it again.'}:{})});
  }
  if(definitionsById.size)fail();
  // No app grant or UI result may describe a mix of different observations.
  if((await review.pluginState()).revision!==inventory.revision||(await settings()).source!==before.source)throw Error('Plugin configuration changed during inspection. Refresh and inspect it again.');
  const revision=configurationDigest({inventory:inventory.revision,settings:before.source,identities,nativeStatus:native.runtime_capabilities});
  return{inventory,before,identities,view:{id,revision,enabled:record.enabled===true,inventoryReviewed:await review.pluginsReviewed(),servers}};
 }
 async function decide(command){
  if(command.reviewed!==true)throw Error('Review plugin tool access before continuing.');
  if(!['approve','reject'].includes(command.action))throw Error('Invalid plugin tool action.');
  const before=await inspect(command.id),row=before.view.servers.find(item=>item.stableId===command.stableId&&item.supported);
  if(!row||before.view.revision!==command.revision)throw Error('Plugin capabilities changed after review. Refresh and review them again.');
  if(command.action==='approve'&&(!before.view.inventoryReviewed||!before.view.enabled))throw Error('Review and enable the installed plugin before approving its tools.');
  const record={enabled:command.action==='approve',trusted_definition_hash:row.definitionHash};
  // A failed/ambiguous CLI write must never inherit an earlier app grant.
  await (row.kind==='hook'?review.revokePluginHook:review.revokePluginMcp)(row.stableId);
  const result=await cli(['plugins',command.action,row.stableId,'--json']);
  if(result.decision!==command.action||!Array.isArray(result.runtime_capabilities)||result.runtime_capabilities.length!==1||configurationDigest(result.runtime_capabilities[0])!==configurationDigest({stable_id:row.stableId,...record}))throw Error('Native plugin approval outcome could not be verified. Inspect it again before retrying.');
  const after=await inspect(command.id),expected={schema_version:1,...before.before.config,runtime_capabilities:{...pluginDecisions(before.before.config),[row.stableId]:record}};
  if(after.inventory.revision!==before.inventory.revision||configurationDigest(after.identities)!==configurationDigest(before.identities)||settingsIdentity(after.before.config)!==settingsIdentity(expected))throw Error('Plugin configuration changed during approval. Inspect it again before retrying.');
  const nativeRow=after.view.servers.find(item=>item.stableId===row.stableId);
  if(nativeRow?.status!==(record.enabled?'trusted_enabled':'trusted_disabled'))throw Error('Native plugin approval outcome could not be verified. Inspect it again before retrying.');
  if(record.enabled)await (row.kind==='hook'?review.approvePluginHook:review.approvePluginMcp)(row.stableId,record,after.inventory.revision,{settingsPath});
  return(await inspect(command.id)).view;
 }
 return{inspect:async id=>(await inspect(id)).view,decide};
}
