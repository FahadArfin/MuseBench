import path from 'node:path';
import {realpath,lstat,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {readMcpSource} from './project-mcp.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Bind ordinary executable lookup once, then re-resolve it on every positive
// operation. Windows command scripts need shell semantics and remain direct.
export async function resolveDiscoveryExecutable(command,{cwd,env,platform=process.platform}){
 if(typeof command!=='string'||!command||/[\x00-\x1f]/.test(command))throw Error('Invalid source executable.');
 const windows=platform==='win32',get=name=>env[Object.keys(env).find(k=>windows?k.toUpperCase()===name.toUpperCase():k===name)];
 let candidates;
 if(path.isAbsolute(command))candidates=[command];
 else{
  if(/[\\/]/.test(command))throw Error('Relative executable paths are unsupported; keep this source on its direct path.');
  const folders=(get('PATH')??'').split(windows?';':path.delimiter);
  if(folders.some(folder=>!folder||!path.isAbsolute(folder)))throw Error('Executable lookup needs an absolute, nonempty PATH.');
  const suffixes=windows?(path.extname(command)?['']:(get('PATHEXT')??'.COM;.EXE;.BAT;.CMD').split(';')):[''];
  if(suffixes.some(s=>!/^\.[A-Za-z0-9]{1,8}$/.test(s)&&s!==''))throw Error('Unsupported executable suffix lookup.');
  candidates=(windows?[cwd,...folders]:folders).flatMap(folder=>suffixes.map(suffix=>path.join(folder,command+suffix.toLowerCase())));
 }
 for(const candidate of candidates){let info;try{info=await lstat(candidate);}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))continue;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('Executable lookup found a link or unsupported file.');
  if(windows&&path.extname(candidate).toLowerCase()!=='.exe')throw Error('Windows shell scripts such as npx.cmd remain on their existing direct path. No command is rewritten.');
  if(!windows)await access(candidate,constants.X_OK);
  const resolved=await realpath(candidate),identity=await lstat(resolved,{bigint:true});return{command:resolved,executableIdentity:[String(identity.dev),String(identity.ino),String(identity.size),String(identity.mtimeNs),String(identity.birthtimeNs)]};
 }
 throw Error('The reviewed executable cannot be resolved on PATH. Keep this source on its existing direct path.');
}
export async function discoveryPluginNames(plugins,review){
 const names=new Set(),facts=[];let unknown=false;
 for(const [id,record] of Object.entries(plugins?.records??{})){
  if(record.enabled!==true)continue;
  try{
   if(typeof record.cache_path!=='string'||typeof review?.inventory!=='string')throw Error();const root=await realpath(path.resolve(path.dirname(path.dirname(review.inventory)),record.cache_path));
   const family=record.manifest_family??'muse';
   const add=name=>{if(typeof name!=='string'||!name||name.length>200)throw Error();names.add(name);facts.push({pluginId:id,name});};
   if(['muse','native'].includes(family)){
    const source=await readMcpSource(path.join(root,'.muse-plugin','plugin.json'));if(!source||!object(source.doc.capabilities??{}))throw Error();const value=source.doc.capabilities?.mcp_servers??[];
    if(!Array.isArray(value)||value.length>100||Object.hasOwn(source.doc,'mcpServers'))throw Error();for(const row of value){if(!object(row))throw Error();add(row.id);}
   }else if(['claude','codex','claude-compatible','codex-compatible'].includes(family)){
    const marker=family.startsWith('claude')?'.claude-plugin':'.codex-plugin',manifest=await readMcpSource(path.join(root,marker,'plugin.json'));if(!manifest)throw Error();
    const declarations=manifest.doc.mcpServers;
    const read=async relative=>{if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error();const source=await readMcpSource(path.join(root,relative));if(!source||!object(source.doc.mcpServers))throw Error();for(const name of Object.keys(source.doc.mcpServers))add(name);};
    if(declarations!==undefined){if(typeof declarations==='string')await read(declarations);else if(Array.isArray(declarations)&&declarations.length<=16)for(const relative of declarations)await read(relative);else if(object(declarations))for(const name of Object.keys(declarations))add(name);else throw Error();}
    const legacy=await readMcpSource(path.join(root,'.mcp.json'));if(legacy){if(!object(legacy.doc.mcpServers))throw Error();for(const name of Object.keys(legacy.doc.mcpServers))add(name);}
   }else throw Error();
  }catch{unknown=true;facts.push({pluginId:id,unknown:true});}
 }
 if(Object.keys(plugins?.entries??{}).some(id=>!Object.hasOwn(plugins?.records??{},id)))unknown=true;
 return{names,facts,unknown};
}
