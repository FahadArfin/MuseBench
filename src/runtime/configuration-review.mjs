import {open,lstat} from 'node:fs/promises';
import {dirname,isAbsolute,join} from 'node:path';
import {userProfile} from '../shared/platform.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function root(environment,name,fallback){
 const value=environment[name];
 if(value===undefined||value==='')return fallback;
 if(typeof value!=='string'||!isAbsolute(value)||/[\u0000-\u001f]/.test(value))throw Error('Muse configuration directories must use absolute local paths.');
 return value;
}

/** Read only non-credential configuration. Never return settings values. */
export async function checkConfiguration({environment=process.env,platform=process.platform,workspaceRoot,extensionReview}){
 const profile=userProfile(environment,platform);
 if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('An absolute workspace is required to review Muse configuration.');
 const configRoot=join(root(environment,'XDG_CONFIG_HOME',join(profile,'.config')),'muse');
 const dataRoot=join(root(environment,'XDG_DATA_HOME',join(profile,'.local','share')),'muse');
 const userSettings=join(configRoot,'settings.json'),paths=[userSettings];
 const forbidden=[{path:join(configRoot,'trust.json'),label:'saved workspace trust'},...['installed.json','marketplaces.json','default-installs.json'].map(file=>({path:join(dataRoot,'plugins',file),label:'plugin inventory'}))];
 for(let directory=workspaceRoot;;directory=dirname(directory)){
  paths.push(join(directory,'.muse','settings.json'));
  forbidden.push({path:join(directory,'.mcp.json'),label:'project MCP configuration'},{path:join(directory,'.muse','hooks.json'),label:'project hooks'});
  if(dirname(directory)===directory)break;
 }
 for(const {path,label} of forbidden){
  try{await lstat(path);}catch(error){if(error.code==='ENOENT')continue;throw Error('Restricted Muse configuration could not be checked.');}
  if(label==='plugin inventory'&&await extensionReview?.allowFile(path))continue;
  throw Error(`This restricted mode cannot verify ${label}. Review that configuration in the official Muse CLI before using this connection; MuseBench has not changed it.`);
 }
 for(const path of paths){
  let source,handle;
  try{
   handle=await open(path,'r');const info=await handle.stat();
   if(!info.isFile()||info.size>1024*1024)throw Error('Unsupported Muse settings file.');
   const buffer=Buffer.alloc(1024*1024+1),{bytesRead}=await handle.read(buffer,0,buffer.length,0);
   if(bytesRead>1024*1024)throw Error('Unsupported Muse settings file.');
   source=buffer.subarray(0,bytesRead).toString('utf8');
  }catch(error){if(error.code==='ENOENT')continue;throw Error('Muse settings could not be safely checked. Resolve the settings file before connecting.');}
  finally{await handle?.close();}
  let config;
  try{config=JSON.parse(source);}catch{throw Error('Muse settings are invalid. Correct them in the official CLI before connecting.');}
  if(!object(config)||config.mcp_servers!=null&&!object(config.mcp_servers))throw Error('Muse settings use an unsupported configuration shape.');
  // Only individually reviewed user entries may cross this boundary. Project
  // instruction review does not grant MCP/plugin authority or saved trust.
  if(path===userSettings&&config.mcp_servers&&extensionReview){
   for(const [name,entry] of Object.entries(config.mcp_servers))if(!await extensionReview.allowMcp(name,entry))throw Error('MCP configuration needs review in Customize before running Muse.');
   delete config.mcp_servers;
  }
  const hasValue=value=>value!==null&&value!==false&&value!==''&&(typeof value!=='object'||Object.keys(value).length>0);
  function inspect(value){
   if(!value||typeof value!=='object')return false;
   return Object.entries(value).some(([key,item])=>((/mcp|plugin|extension|runtime_capabilities|managed_skills_path/i.test(key)&&hasValue(item))||inspect(item)));
  }
  if(inspect(config))throw Error('Configured MCP servers, plugins or managed capabilities may run outside the Muse sandbox. This restricted mode cannot safely exclude them; review their configuration in the official CLI before connecting. MuseBench has not changed it.');
 }
}
