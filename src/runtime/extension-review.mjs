import {validateHooks,nativeHooks} from '../shared/native-hooks.mjs';
import {projectTrustSnapshot} from './project-trust.mjs';
import {projectMcpSnapshot} from './project-mcp.mjs';
import {nativePluginDecision,pluginCapabilityId,pluginDecisions} from './plugin-capabilities.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,rename,stat,lstat,readdir,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
const digest=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const configurationDigest=value=>digest(JSON.stringify(stable(value)));
export async function readBounded(file,max=1024*1024){
 const info=await stat(file);if(!info.isFile()||info.size>max)throw Error('Configuration file is too large or is not a regular file.');
 const bytes=await readFile(file);if(bytes.length>max)throw Error('Configuration file is too large.');return bytes.toString('utf8');
}
export async function optionalText(file){try{return await readBounded(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function atomicJson(file,value,beforeReplace){
 await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
 try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await beforeReplace?.();await rename(temp,file);}
 finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
export async function treeDigest(root){
 const hash=createHash('sha256');let count=0,bytes=0;
 async function walk(dir,rel=''){
  if((await lstat(dir)).isSymbolicLink())throw Error('Review requires a folder without symbolic links.');
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(++count>22000)throw Error('Plugin contains too many files.');
   const file=path.join(dir,entry.name),name=rel+'/'+entry.name;
   if(entry.isSymbolicLink())throw Error('Review requires a folder without symbolic links.');
   if(entry.isDirectory()){hash.update(JSON.stringify(['directory',name])+'\n');await walk(file,name);}
   else if(entry.isFile()){
    const content=createHash('sha256');let size=0;
    for await(const chunk of createReadStream(file)){bytes+=chunk.length;size+=chunk.length;if(bytes>128*1024*1024)throw Error('Plugin is too large to review.');content.update(chunk);}
    hash.update(JSON.stringify(['file',name,size,content.digest('hex')])+'\n');
   }
   else throw Error('Unsupported plugin file.');
  }
 }
 await walk(root);return hash.digest('hex');
}

/** Explicit extension consent, independent of Muse's native project shell sandbox.
 * Project skills and app-owned hooks use separate project-bound grants; never grants native saved trust, hooks in settings, managed config or unrelated settings. */
export function createExtensionReview({dataDir,profile,platform=process.platform,environment={...process.env,HOME:profile,USERPROFILE:profile}}){
 const file=path.join(dataDir,'extension-reviews.json'),data=path.join(profile,'.local','share','muse');
 const inventory=path.join(data,'plugins','installed.json');
 async function load(){const raw=await optionalText(file);if(raw===null)return{version:1,mcp:{},plugins:null};const value=JSON.parse(raw);if(value.version!==1||!value.mcp||typeof value.mcp!=='object')throw Error('Invalid extension review state.');return value;}
 async function pluginState(){
  const raw=await optionalText(inventory);if(raw===null)return{revision:'absent',entries:{},records:{},packages:{}};
  const doc=JSON.parse(raw);if(!doc.plugins||Array.isArray(doc.plugins)||Object.keys(doc.plugins).length>250)throw Error('Invalid plugin inventory.');
  const packages={};const base=Object.keys(doc.plugins).length?await realpath(path.join(data,'plugins','cache')):path.join(data,'plugins','cache');
  for(const [id,record] of Object.entries(doc.plugins)){
   if(typeof record.cache_path!=='string')throw Error('Invalid plugin cache path.');
   const root=await realpath(path.resolve(data,record.cache_path)),rel=path.relative(base,root);
   if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Plugin path is outside its cache.');
   packages[id]=await treeDigest(root);
  }
  return{revision:configurationDigest({inventory:doc,packages}),entries:Object.fromEntries(Object.entries(doc.plugins).map(([id,record])=>[id,configurationDigest({record,package:packages[id]})])),records:doc.plugins,packages};
 }
 const grantKey=kind=>kind==='mcp_server'?'pluginMcp':'pluginHooks';
 async function approveCapability(kind,stableId,decision,expected,{settingsPath,beforeCommit}={}){
   if(!nativePluginDecision(stableId,decision)||pluginCapabilityId(stableId).kind!==kind||decision.enabled!==true||typeof settingsPath!=='string'||!path.isAbsolute(settingsPath))throw Error('Invalid native plugin capability approval.');
   const current=await pluginState(),value=await load(),{pluginId}=pluginCapabilityId(stableId);
   if(current.revision!==expected||value.plugins!==expected||!Object.hasOwn(current.entries,pluginId))throw Error('Plugins changed after review. Refresh and review them again.');
   const recordHash=configurationDigest(decision),source=await optionalText(settingsPath);
   if(source===null||configurationDigest(pluginDecisions(JSON.parse(source))[stableId]??null)!==recordHash)throw Error('Native plugin approval changed. Inspect it again.');
   const key=grantKey(kind);value[key]={...value[key],[stableId]:{entry:current.entries[pluginId],record:recordHash,settingsPath:path.resolve(settingsPath)}};
   await atomicJson(file,value,async()=>{
    await beforeCommit?.();
    if(await optionalText(settingsPath)!==source||(await pluginState()).revision!==expected)throw Error('Plugin configuration changed during approval. Inspect it again.');
   });
 }
 async function revokeCapability(kind,stableId){
  if(pluginCapabilityId(stableId)?.kind!==kind)throw Error('Invalid native plugin capability identifier.');
  const value=await load(),key=grantKey(kind);if(value[key])delete value[key][stableId];await atomicJson(file,value);
 }
 async function reviewedCapabilities(records,{settingsPath,inventoryPath=inventory}={},onlyKind){
   const current=await pluginState(),value=await load(),sameInventory=path.resolve(inventoryPath)===path.resolve(inventory);
   return Object.fromEntries(Object.entries(records).map(([id,record])=>{
    const identity=pluginCapabilityId(id);
    if(!nativePluginDecision(id,record)||onlyKind&&identity.kind!==onlyKind)return[id,false];
    // An explicit native rejection grants no execution, even after uninstall.
    if(record.enabled===false)return[id,true];
    const grant=value[grantKey(identity.kind)]?.[id],pluginId=identity.pluginId;
    return[id,!!(sameInventory&&value.plugins===current.revision&&Object.hasOwn(current.entries,pluginId)&&grant?.entry===current.entries[pluginId]&&grant.record===configurationDigest(record)&&grant.settingsPath===path.resolve(settingsPath))];
   }));
 }
 return {
  async approveMcp(name,config){const value=await load();value.mcp[name]=configurationDigest(config);await atomicJson(file,value);},
  async allowMcp(name,config){try{return(await load()).mcp[name]===configurationDigest(config);}catch{return false;}},
  async projectMcpState(root,options={}){const snapshot=await projectMcpSnapshot(root,{environment,platform,...options});return{...snapshot,reviewed:snapshot.present&&(await load()).projectMcp?.[snapshot.root]===snapshot.revision};},
  async approveProjectMcp(root,revision,options={}){const snapshot=await this.projectMcpState(root,options);if(snapshot.revision!==revision)throw Error('Project MCP configuration changed after review. Refresh and review again.');if(!snapshot.present)throw Error('No project MCP configuration found.');const value=await load();value.projectMcp={...value.projectMcp,[snapshot.root]:revision};await atomicJson(file,value,options.beforeCommit);},
  async revokeProjectMcp(root){const actual=await realpath(root),value=await load();if(value.projectMcp)delete value.projectMcp[actual];await atomicJson(file,value);},
  pluginState,
  approvePluginMcp:(...args)=>approveCapability('mcp_server',...args),
  approvePluginHook:(...args)=>approveCapability('hook',...args),
  revokePluginMcp:stableId=>revokeCapability('mcp_server',stableId),
  revokePluginHook:stableId=>revokeCapability('hook',stableId),
  reviewedPluginMcp:(records,options)=>reviewedCapabilities(records,options,'mcp_server'),
  reviewedPluginCapabilities:reviewedCapabilities,
  async approvePlugins(expected){const value=await load(),actual=(await pluginState()).revision;if(expected!==undefined&&actual!==expected)throw Error('Plugins changed after review. Refresh and review them again.');value.plugins=actual;await atomicJson(file,value);},
  async allowFile(candidate){if(path.resolve(candidate)!==path.resolve(inventory))return false;try{const actual=(await pluginState()).revision;return actual!=='absent'&&actual===(await load()).plugins;}catch{return false;}},
  async pluginsReviewed(){if(await optionalText(inventory)===null)return true;return this.allowFile(inventory);},
  async hookState(root){const actual=await realpath(root),items=validateHooks((await load()).hooks?.[actual]??[]);return{root:actual,items,revision:configurationDigest({root:actual,items})};},
  async saveHooks(root,revision,items){const current=await this.hookState(root);if(current.revision!==revision)throw Error('Project hooks changed. Refresh and review them again.');const checked=validateHooks(items),value=await load();value.hooks={...value.hooks,[current.root]:checked};await atomicJson(file,value);},
  async nativeHooks(root){return nativeHooks((await this.hookState(root)).items,platform);},
  async projectState(root){const snapshot=await projectTrustSnapshot(root);return{...snapshot,reviewed:(await load()).projects?.[snapshot.root]===snapshot.fingerprint};},
  async approveProject(root,fingerprint){const snapshot=await projectTrustSnapshot(root);if(snapshot.fingerprint!==fingerprint)throw Error('Project instructions changed after review.');if(!snapshot.files.length)throw Error('No project instructions to trust.');const value=await load();value.projects={...value.projects,[snapshot.root]:fingerprint};await atomicJson(file,value);},
  async revokeProject(root){const actual=await realpath(root),value=await load();if(value.projects)delete value.projects[actual];if(value.projectMcp)delete value.projectMcp[actual];await atomicJson(file,value);},
  async allowProject(root,options={}){try{const mcp=await this.projectMcpState(root,options);if(mcp.present)return mcp.reviewed;return(await this.projectState(root)).reviewed;}catch{return false;}},
  inventory,
 };
}
