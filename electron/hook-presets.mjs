import {randomUUID} from 'node:crypto';
import {mkdir,open,unlink,lstat} from 'node:fs/promises';
import path from 'node:path';
import {validateHooks} from '../src/shared/native-hooks.mjs';
import {atomicJson,optionalText,configurationDigest} from '../src/runtime/extension-review.mjs';

const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function presetName(value){if(typeof value!=='string'||!value.trim()||value.length>80||/[\u0000-\u001f\u007f]/.test(value))throw Error('Use a preset name with 1–80 characters on one line.');return value.trim();}
function rows(value){
 if(!value||value.version!==1||!Array.isArray(value.items)||value.items.length>20)throw Error('Hook preset storage is invalid.');
 const ids=new Set(),names=new Set();return value.items.map(item=>{if(!item||!idPattern.test(item.id)||ids.has(item.id))throw Error('Hook preset identity is invalid.');const name=presetName(item.name),key=name.toLocaleLowerCase();if(names.has(key))throw Error('Hook preset names must be unique.');ids.add(item.id);names.add(key);return{id:item.id,name,hooks:validateHooks(item.hooks)};});
}
const view=items=>({revision:configurationDigest(items),items:items.map(item=>({...item,revision:configurationDigest(item)}))});
export function createHookPresetStore(dataDir){
 const file=path.join(dataDir,'hook-presets.json'),lock=file+'.lock';
 const read=async()=>{try{if((await lstat(file)).isSymbolicLink())throw Error('Hook preset storage cannot be a symbolic link.');}catch(error){if(error.code!=='ENOENT')throw error;}const source=await optionalText(file);if(source===null)return[];try{return rows(JSON.parse(source));}catch(error){throw Error('Hook preset storage could not be read: '+error.message);}};
 async function mutate(revision,change){
  await mkdir(dataDir,{recursive:true});let handle;try{handle=await open(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error(`Hook presets are being saved elsewhere. Refresh and try again. If a previous save was interrupted by an app crash, close every MuseBench window before removing this lock file: ${lock}`);throw error;}
  try{const before=await read();if(typeof revision!=='string'||view(before).revision!==revision)throw Error('Hook presets changed. Refresh before saving.');const next=change(before);await atomicJson(file,{version:1,items:next},async()=>{if(view(await read()).revision!==revision)throw Error('Hook presets changed. Refresh before saving.');});return view(next);}
  finally{await handle.close();await unlink(lock);}
 }
 return{
  async snapshot(){return view(await read());},
  async save({revision,id,name,hooks}={}){const checkedName=presetName(name),checkedHooks=validateHooks(hooks);return mutate(revision,items=>{if(id!==undefined&&(!idPattern.test(id)||!items.some(item=>item.id===id)))throw Error('This hook preset no longer exists. Refresh the list.');if(items.some(item=>item.id!==id&&item.name.toLocaleLowerCase()===checkedName.toLocaleLowerCase()))throw Error('A hook preset already has this name.');if(id===undefined&&items.length>=20)throw Error('Keep at most 20 hook presets.');const next={id:id??randomUUID(),name:checkedName,hooks:checkedHooks};return id===undefined?[...items,next]:items.map(item=>item.id===id?next:item);});},
  remove({revision,id}={}){return mutate(revision,items=>{if(!idPattern.test(id)||!items.some(item=>item.id===id))throw Error('This hook preset no longer exists. Refresh the list.');return items.filter(item=>item.id!==id);});},
 };
}

