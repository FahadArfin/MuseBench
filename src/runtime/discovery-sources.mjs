// Main-only filesystem inspection. Never starts a server or returns private values
// through rows; private definitions are consumed only by the trusted factory.
import path from 'node:path';
import {realpath,lstat} from 'node:fs/promises';
import {configurationDigest} from './extension-review.mjs';
import {readMcpSource,mcpSettingsPath,settingsMcp,canonicalMcpEntry,mcpTransport} from './project-mcp.mjs';
import {discoverySelection} from '../shared/tool-discovery.mjs';
import {resolveDiscoveryExecutable,discoveryPluginNames} from './discovery-resolution.mjs';
import {remoteConfiguration} from './discovery-remote-network.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=16384)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
// These values would affect the app-owned Node wrapper or the Windows .NET Job
// owner before the reviewed source is contained. Never silently drop them.
const protectedKey=key=>/^(NODE_|ELECTRON_|MUSEBENCH_|COR_|CORECLR_|COMPLUS_|DOTNET_|APPDOMAIN_|DEVPATH$|__COMPAT_LAYER$|MUSE_SESSION_ID$|META_API_KEY$)/i.test(key);
const nativeEnvironment=['HOME','PATH','USER','LOGNAME','TMPDIR','TEMP','TMP','SHELL','LANG','LC_ALL','TERM','PROVENANCE_PROVIDER_SCOPE','COMSPEC','PATHEXT','SystemRoot','WINDIR','APPDATA','LOCALAPPDATA','USERPROFILE','HOMEDRIVE','HOMEPATH'];
async function canonical(value,kind){
 if(!text(value)||!path.isAbsolute(value))throw Error('Use a canonical absolute executable and working directory.');
 const actual=await realpath(value),info=await lstat(value);const key=v=>process.platform==='win32'?v.toLowerCase():v;
 if(key(actual)!==key(path.resolve(value))||info.isSymbolicLink()||!(kind==='file'?info.isFile():info.isDirectory()))throw Error('Symbolic links and noncanonical execution paths are unsupported.');return actual;
}
function expand(value,environment){let expandedLength=value.length;return value.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,(all,key,fallback)=>{if(all==='$$')return '$';if(protectedKey(key))throw Error('Wrapper or billing environment references are unsupported.');const found=Object.keys(environment).find(k=>process.platform==='win32'?k.toUpperCase()===key.toUpperCase():k===key);const result=found?environment[found]:fallback;if(typeof result!=='string')throw Error('A referenced environment variable is unavailable.');expandedLength+=result.length-all.length;if(expandedLength>16384)throw Error('Expanded source setting exceeds its 16 KiB limit.');return result;});}
// Parse only the input template. Escaped dollars and substituted environment
// values are literal output and must never be reinterpreted as expressions.
function expandRemoteTemplate(template,environment,names){
 let output='';const append=value=>{if(output.length+value.length>16384)throw Error('Expanded source setting exceeds its 16 KiB limit.');output+=value;};
 for(let i=0;i<template.length;){
  if(template[i]!=='$'){const end=template.indexOf('$',i);append(template.slice(i,end<0?template.length:end));i=end<0?template.length:end;continue;}
  if(template[i+1]==='$'){append('$');i+=2;continue;}
  if(template[i+1]!=='{'){append('$');i++;continue;}
  const end=template.indexOf('}',i+2),expression=end<0?null:/^([A-Za-z_][A-Za-z0-9_]*)(?::-([^{}]*))?$/.exec(template.slice(i+2,end));
  if(!expression)throw Error('Remote source template contains malformed or unsupported interpolation.');
  const [,key,fallback]=expression;if(protectedKey(key))throw Error('Wrapper or billing environment references are unsupported.');names.add(key);
  const found=Object.keys(environment).find(k=>process.platform==='win32'?k.toUpperCase()===key.toUpperCase():k===key),resolved=found?environment[found]:undefined,value=resolved===undefined||resolved===''&&fallback!==undefined?fallback?.replace(/\$\$/g,'$'):resolved;
  if(typeof value!=='string')throw Error('A referenced environment variable is unavailable.');append(value);i=end+1;
 }return output;
}
export async function inspectDiscoverySources({workspaceRoot,environment=process.env,extensionReview,platform=process.platform}={}){
 const root=await canonical(workspaceRoot,'directory'),file=await readMcpSource(mcpSettingsPath(environment,platform));
 const directoryIdentity=async directory=>{const value=await lstat(directory,{bigint:true});return[String(value.dev),String(value.ino),String(value.birthtimeNs)];},rootIdentity=await directoryIdentity(root);
 const servers=file?settingsMcp(file.doc).servers:{};if(Object.keys(servers).length>250)throw Error('Too many MCP definitions to inspect.');
 const overlays=[];for(let current=root;;current=path.dirname(current)){
  for(const relative of ['.mcp.json',path.join('.muse','settings.json')]){const value=await readMcpSource(path.join(current,relative));if(value){const map=relative==='.mcp.json'?value.doc.mcpServers:settingsMcp(value.doc).servers;if(object(map))overlays.push(...Object.keys(map));else throw Error('Project MCP overlay cannot be inspected.');}}
  if(path.dirname(current)===current)break;
 }
 const plugins=await extensionReview?.pluginState?.(),pluginNames=await discoveryPluginNames(plugins,extensionReview);
 const base={};for(const name of nativeEnvironment){const matches=Object.keys(environment).filter(key=>platform==='win32'?key.toUpperCase()===name.toUpperCase():key===name);if(matches.length>1)throw Error('Ambiguous environment names cannot be reviewed.');if(matches.length&&typeof environment[matches[0]]==='string')base[name]=environment[matches[0]];}
 const rows=[],definitions=new Map();
 for(const [name,raw] of Object.entries(servers)){
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name))continue;
  let entry={},definition,reason='';const remoteNames=new Set();
  try{
   entry=canonicalMcpEntry(raw);
   if(overlays.includes(name))throw Error('A project overlay uses this name. Use Customize to review the direct source.');
   if(Object.hasOwn(servers,'musebench_discovery')||overlays.includes('musebench_discovery')||pluginNames.names.has('musebench_discovery'))throw Error('The required on-demand gateway name collides with an existing definition. Keep the source on its direct path.');
   if(pluginNames.names.has(name))throw Error('An installed plugin source collides with this source name. Plugin sources retain their direct path.');
   if(pluginNames.unknown)throw Error('A plugin MCP declaration has unknown source names and cannot be inspected safely. Keep this source on its direct path.');
   const transport=mcpTransport(entry);if(!['stdio','streamable-http'].includes(transport))throw Error('Unsupported source transport.');
   if(entry.enabled!==false)throw Error('Direct sources must be explicitly disabled in Customize before on-demand use.');
   if(!await extensionReview?.allowMcp?.(name,raw))throw Error('Review this exact definition in Customize first.');
   const common=['type','enabled','required','enabled_tools','disabled_tools','startup_timeout_sec','tool_timeout_sec','framing'],allowed=[...common,...(transport==='stdio'?['command','args','cwd','env']:['url','headers'])];
   if(Object.keys(entry).some(key=>!allowed.includes(key))||entry.framing!==undefined&&!(transport==='stdio'?['auto','line_delimited_json']:['auto']).includes(entry.framing))throw Error('Unsupported or contradictory source transport fields. Only JSONL stdio and remote HTTP are supported.');
   if(entry.required!==undefined&&typeof entry.required!=='boolean')throw Error('Invalid source requirement setting.');
   for(const key of ['args','enabled_tools','disabled_tools'])if(entry[key]!==undefined&&(!Array.isArray(entry[key])||entry[key].length>200||entry[key].some(value=>!text(value))))throw Error('Unsupported argument or tool filter.');
   if(entry.env!==undefined&&(!object(entry.env)||Object.keys(entry.env).length>100))throw Error('Unsupported environment map.');
   const env={...base},seen=new Set();for(const [key,value] of Object.entries(entry.env??{})){
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)||protectedKey(key)||seen.has(key.toUpperCase())||!text(value))throw Error('Wrapper environment conflicts or invalid environment names are unsupported.');
    seen.add(key.toUpperCase());for(const old of Object.keys(env))if(platform==='win32'&&old.toUpperCase()===key.toUpperCase())delete env[old];env[key]=expand(value,environment);
   }
   for(const [key,max] of [['startup_timeout_sec',30],['tool_timeout_sec',300]])if(entry[key]!==undefined&&(!Number.isFinite(entry[key])||entry[key]<=0||entry[key]>max))throw Error('Source timeouts must be finite: startup at most 30s and calls at most 300s.');
   const commonDefinition={id:'global:'+name,name,transport,enabledTools:entry.enabled_tools??null,disabledTools:entry.disabled_tools??[],startupMs:(entry.startup_timeout_sec??30)*1000,callMs:(entry.tool_timeout_sec??300)*1000};
   if(transport==='streamable-http'){
    if(!text(entry.url,16384)||entry.headers!==undefined&&(!object(entry.headers)||Object.keys(entry.headers).length>32))throw Error('Invalid remote source configuration.');
    const headers=Object.fromEntries(Object.entries(entry.headers??{}).map(([key,value])=>{if(!text(value))throw Error('Invalid remote header value.');return[key,expandRemoteTemplate(value,environment,remoteNames)];}));
    definition={...commonDefinition,...remoteConfiguration({...entry,url:expandRemoteTemplate(entry.url,environment,remoteNames),headers})};
   }
   else{const cwd=await canonical(entry.cwd??root,'directory'),executable=await resolveDiscoveryExecutable(entry.command,{cwd,env,platform});definition={...commonDefinition,...executable,args:entry.args??[],cwd,cwdIdentity:await directoryIdentity(cwd),env};}
   if(Buffer.byteLength(JSON.stringify(definition))>65536)throw Error('Source execution settings exceed the review limit.');
  }catch(error){reason=error?.code?'Execution paths are unavailable.':error.message;}
  const revision=configurationDigest({root,rootIdentity,name,raw,definition:definition??null,overlays,plugins:plugins?.revision??null,pluginFacts:pluginNames.facts,reason});
  const row={id:'global:'+name,name,revision,transport:mcpTransport(entry)==='stdio'?'stdio':'streamable-http',headerKeys:object(entry.headers)?Object.keys(entry.headers).filter(key=>text(key,100)).sort():[],address:definition?.url??definition?.command??(text(entry.command,4096)?entry.command:mcpTransport(entry)==='stdio'?'Unavailable executable':'Unavailable remote endpoint'),cwd:text(entry.cwd,4096)?entry.cwd:root,environmentKeys:object(entry.env)?Object.keys(entry.env).filter(key=>text(key,200)).sort():[],eligible:!reason,reason:reason||'Reviewed disabled source. Startup ≤30s; calls ≤300s; stops with this connection.'};
  if(row.transport==='streamable-http'){
   row.environmentKeys=[...remoteNames].sort();
   if(definition&&/\$\$|\$\{/.test(entry.url)){row.address=entry.url;row.resolvedOrigin=new URL(definition.url).origin;}
  }
  rows.push(row);if(!reason)definitions.set(row.id,{...definition,revision});
 }
 for(const fact of pluginNames.facts.slice(0,250))rows.push({id:'plugin:'+fact.pluginId+':'+(fact.name??'unknown'),name:fact.pluginId+' / '+(fact.name??'Unknown MCP declaration'),revision:configurationDigest({plugins:plugins?.revision??null,fact}),address:'Installed plugin source',cwd:root,environmentKeys:[],eligible:false,reason:fact.unknown?'Plugin source names could not be safely inspected.':'Plugin source execution remains on its existing direct native path.'});
 if(plugins&&(await extensionReview.pluginState()).revision!==plugins.revision)throw Error('Plugin source configuration changed during inspection. Refresh and review again.');
 return{root,rows,definitions};
}
export async function resolveDiscoverySelection({selection,...options}){
 const selected=discoverySelection(selection),snapshot=await inspectDiscoverySources(options);
 return selected.sources.map(row=>{const definition=snapshot.definitions.get(row.id);if(!definition||definition.revision!==row.revision)throw Error('On-demand source changed or review was revoked. Refresh and explicitly review it again.');return definition;});
}
