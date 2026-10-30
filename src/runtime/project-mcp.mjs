import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {userProfile} from '../shared/platform.mjs';
import {projectTrustSnapshot} from './project-trust.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>hash(JSON.stringify(stable(value)));
const badKeys=new Set(['__proto__','constructor','prototype']);
const limit=1024*1024;
async function info(file){try{return await lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw Error('MCP configuration could not be inspected.');}}
export async function readMcpSource(file){
 const before=await info(file);if(!before)return null;
 if(before.isSymbolicLink())throw Error('MCP review does not follow symbolic links.');
 if(!before.isFile()||before.size>limit)throw Error('MCP configuration exceeds the regular-file review limit.');
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const opened=await handle.stat();if(!opened.isFile()||opened.ino!==before.ino||opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)throw Error('MCP configuration changed while reading.');
  const bytes=Buffer.alloc(limit+1);let size=0;
  while(size<bytes.length){const chunk=await handle.read(bytes,size,bytes.length-size,null);if(!chunk.bytesRead)break;size+=chunk.bytesRead;}
  const after=await info(file),end=await handle.stat();
  if(size>limit||!after||after.isSymbolicLink()||after.ino!==opened.ino||after.size!==size||after.mtimeMs!==opened.mtimeMs||end.mtimeMs!==opened.mtimeMs)throw Error('MCP configuration changed or exceeded its review limit.');
  const raw=bytes.subarray(0,size);let doc;try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw Error('MCP configuration must be valid UTF-8 JSON.');}
  if(!object(doc))throw Error('MCP configuration must be an object.');
  return{path:file,revision:hash(raw),bytes:size,doc};
 }finally{await handle.close();}
}
const source=readMcpSource;

export function mcpSettingsPath(environment=process.env,platform=process.platform){
 const xdg=environment.XDG_CONFIG_HOME;
 if(xdg!==undefined&&xdg!==''&&(typeof xdg!=='string'||!path.isAbsolute(xdg)||/[\x00-\x1f]/.test(xdg)))throw Error('Muse configuration directories must use absolute local paths.');
 return path.join(xdg||path.join(userProfile(environment,platform),'.config'),'muse','settings.json');
}

export function settingsMcp(config){
 if(!object(config)||Object.hasOwn(config,'mcpServers')&&Object.hasOwn(config,'mcp_servers'))throw Error('Muse settings contain ambiguous MCP configuration.');
 const key=Object.hasOwn(config,'mcpServers')?'mcpServers':'mcp_servers';
 if(Object.hasOwn(config,key)&&!object(config[key]))throw Error('Muse settings use an unsupported MCP configuration.');
 return{key,servers:config[key]??{}};
}
export function mcpTransport(entry){return entry.type??(entry.transport==='streamable_http'?'streamable-http':entry.transport)??(entry.command?'stdio':'streamable-http');}
export function canonicalMcpEntry(entry){
 if(!object(entry))throw Error('MCP server configuration must be an object.');
 const copy={...entry};
 if(Object.hasOwn(copy,'transport')){if(Object.hasOwn(copy,'type'))throw Error('MCP transport configuration is ambiguous.');copy.type=copy.transport==='streamable_http'?'streamable-http':copy.transport;delete copy.transport;}
 if(Object.hasOwn(copy,'mode')){if(Object.hasOwn(copy,'required')||!['optional','required'].includes(copy.mode))throw Error('MCP requirement configuration is ambiguous.');copy.required=copy.mode==='required';delete copy.mode;}
 if(copy.type==='http')copy.type='streamable-http';return copy;
}
function validateTree(value,depth=0){
 if(depth>16||value===null)throw Error('MCP configuration contains null or excessively nested values.');
 if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(badKeys.has(key))throw Error('MCP configuration uses an unsupported key.');validateTree(item,depth+1);}
}
function merge(previous,next){
 if(!object(previous)||!object(next))return structuredClone(next);
 const result={...previous};for(const [key,value] of Object.entries(next))result[key]=Object.hasOwn(previous,key)?merge(previous[key],value):structuredClone(value);return result;
}
function serverPreview(name,entry){
 const allowed=['type','command','args','env','cwd','framing','url','headers','enabled','required','startup_timeout_sec','tool_timeout_sec','enabled_tools','disabled_tools'];
 if(!name||name.trim()!==name||name.length>200||!object(entry)||Object.keys(entry).some(key=>!allowed.includes(key)))throw Error('MCP configuration contains an unsupported server field.');
 const text=(value,max=4096)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
 const list=value=>Array.isArray(value)&&value.length<=100&&value.every(v=>text(v));
 const map=value=>object(value)&&Object.keys(value).length<=100&&Object.entries(value).every(([key,value])=>text(key,200)&&key.trim()&&text(value,16384));
 const transport=mcpTransport(entry);
 if(!['stdio','streamable-http'].includes(transport)||Boolean(entry.command)===Boolean(entry.url))throw Error('MCP server transport must identify one executable or URL.');
 for(const key of ['enabled','required'])if(entry[key]!==undefined&&typeof entry[key]!=='boolean')throw Error('Invalid MCP configuration flag.');
 for(const key of ['startup_timeout_sec','tool_timeout_sec'])if(entry[key]!==undefined&&(!Number.isFinite(entry[key])||entry[key]<=0))throw Error('Invalid MCP configuration timeout.');
 for(const key of ['args','enabled_tools','disabled_tools'])if(entry[key]!==undefined&&!list(entry[key]))throw Error('Invalid MCP argument or tool list.');
 for(const key of ['env','headers'])if(entry[key]!==undefined&&!map(entry[key]))throw Error('Invalid MCP environment or header map.');
 if(entry.framing!==undefined&&!['auto','line_delimited_json','content_length'].includes(entry.framing))throw Error('Invalid MCP framing.');
 let address;
 if(transport==='stdio'){
  if(!text(entry.command)||!entry.command.trim()||entry.url||entry.headers||entry.cwd!==undefined&&!text(entry.cwd))throw Error('Invalid local MCP configuration.');
  address=entry.command;
 }else{
  let url;try{url=new URL(entry.url);}catch{throw Error('Invalid MCP URL.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||url.search||entry.command||entry.args||entry.env||entry.cwd||entry.framing&&entry.framing!=='auto')throw Error('MCP URL configuration contains unsupported fields or credentials.');
  if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Remote MCP URLs require HTTPS.');
  address=url.origin+url.pathname;
 }
 return{name,transport:transport==='stdio'?'stdio':'streamable_http',address,args:entry.args??[],cwd:entry.cwd??null,environmentKeys:Object.keys(entry.env??{}).sort(),headerKeys:Object.keys(entry.headers??{}).sort(),enabled:entry.enabled!==false,required:entry.required===true,framing:entry.framing??'auto',startupTimeout:entry.startup_timeout_sec??30,toolTimeout:entry.tool_timeout_sec??300,toolFiltersPresent:!!(entry.enabled_tools?.length||entry.disabled_tools?.length)};
}
export async function projectMcpSnapshot(folder,{environment=process.env,platform=process.platform}={}){
 const root=await realpath(folder);if(!(await lstat(root)).isDirectory())throw Error('Choose a project folder.');
 let boundary=root,marker=null;const ancestors=[];
 for(let current=root,depth=0;;current=path.dirname(current),depth++){
  if(depth>=64)throw Error('MCP project hierarchy exceeds its review limit.');
  ancestors.push(current);const git=await info(path.join(current,'.git'));
  if(git){if(git.isSymbolicLink()||!git.isDirectory()&&!git.isFile())throw Error('MCP project boundary cannot be a symbolic link.');boundary=current;marker={kind:git.isDirectory()?'directory':'file',size:git.isFile()?git.size:0};break;}
  if(path.dirname(current)===current)break;
 }
 const directories=boundary===root?[root]:ancestors.slice(0,ancestors.indexOf(boundary)+1).reverse();
 const projectSources=[];for(const directory of directories){const value=await source(path.join(directory,'.mcp.json'));if(value)projectSources.push(value);}
 if(!projectSources.length)return{root,boundary,present:false,revision:'absent',sources:[],servers:[],instructions:[]};
 const personal=await source(mcpSettingsPath(environment,platform)),sources=[...(personal?[personal]:[]),...projectSources];
 if(sources.reduce((sum,s)=>sum+s.bytes,0)>2*limit)throw Error('MCP source files exceed the combined review limit.');
 let effective={};if(personal){const user=settingsMcp(personal.doc).servers;validateTree(user);effective=Object.fromEntries(Object.entries(user).map(([name,entry])=>[name,canonicalMcpEntry(entry)]));}
 for(const item of projectSources){
  validateTree(item.doc);
  if(Object.keys(item.doc).some(key=>!['mcpServers','$schema'].includes(key))||!object(item.doc.mcpServers)||item.doc.$schema!==undefined&&typeof item.doc.$schema!=='string')throw Error('This project MCP configuration must use canonical mcpServers.');
  for(const entry of Object.values(item.doc.mcpServers))if(!object(entry)||Object.hasOwn(entry,'transport')||Object.hasOwn(entry,'mode'))throw Error('Project MCP configuration must use canonical server fields.');
  effective=merge(effective,item.doc.mcpServers);
 }
 if(Object.keys(effective).length>250)throw Error('MCP configuration exceeds 250 servers.');
 const servers=Object.entries(effective).map(([name,entry])=>serverPreview(name,entry));
 // Bind environment-dependent execution without returning or persisting values.
 const envBinding={},normalize=key=>platform==='win32'?key.toUpperCase():key;
 const environmentValues=new Map();
 for(const [key,value] of Object.entries(environment)){
  const normalized=normalize(key);
  if(environmentValues.has(normalized)&&environmentValues.get(normalized)!==value)throw Error('Ambiguous Windows environment names cannot be reviewed.');
  environmentValues.set(normalized,value);
 }
 const bind=key=>{const normalized=normalize(key);envBinding[normalized]=environmentValues.get(normalized)??null;};
 for(const key of ['HOME','PATH','USER','LOGNAME','TMPDIR','TEMP','TMP','SHELL','LANG','LC_ALL','TERM','PROVENANCE_PROVIDER_SCOPE','COMSPEC','PATHEXT','SystemRoot','WINDIR'])bind(key);
 for(const entry of Object.values(effective))for(const value of Object.values(entry.env??{}))for(const match of value.matchAll(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g))if(match[1]){
  if(match[1].toUpperCase()==='META_API_KEY')throw Error('Project servers cannot reference the app billing credential. Configure separate server credentials in Customize.');
  bind(match[1]);
 }
 // Only Git-backed instruction scope has native acceptance evidence. Outside
 // Git, keep the existing ancestor rejection instead of implicitly trusting it.
 const instructions=(await projectTrustSnapshot(root,marker?{scopeDirectories:directories}:{})).files;
 const publicSources=sources.map(({path,revision,bytes})=>({path,revision,bytes}));
 const revision=digest({root,boundary,marker,sources:publicSources,effective,environment:envBinding,instructions});
 return{root,boundary,present:true,revision,sources:publicSources,servers,instructions};
}
