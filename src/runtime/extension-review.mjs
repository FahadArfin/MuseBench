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
 * Never grants project trust, hooks in settings, managed config or unrelated settings. */
export function createExtensionReview({dataDir,profile}){
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
 return {
  async approveMcp(name,config){const value=await load();value.mcp[name]=configurationDigest(config);await atomicJson(file,value);},
  async allowMcp(name,config){try{return(await load()).mcp[name]===configurationDigest(config);}catch{return false;}},
  pluginState,
  async approvePlugins(expected){const value=await load(),actual=(await pluginState()).revision;if(expected!==undefined&&actual!==expected)throw Error('Plugins changed after review. Refresh and review them again.');value.plugins=actual;await atomicJson(file,value);},
  async allowFile(candidate){if(path.resolve(candidate)!==path.resolve(inventory))return false;try{const actual=(await pluginState()).revision;return actual!=='absent'&&actual===(await load()).plugins;}catch{return false;}},
  async pluginsReviewed(){if(await optionalText(inventory)===null)return true;return this.allowFile(inventory);},
  inventory,
 };
}
