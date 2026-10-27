import {validateHooks} from '../shared/native-hooks.mjs';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,'0')).join('');
export function createPreviewHookPresets(){
 let items=[];
 const snapshot=async()=>({revision:await hash(items),items:await Promise.all(items.map(async item=>({...structuredClone(item),revision:await hash(item)})))});
 return{snapshot,async dispatch(command){
  if(!['saveHookPreset','deleteHookPreset'].includes(command.type))return null;
  if(command.revision!==(await snapshot()).revision)throw Error('Hook presets changed. Refresh before saving.');
  if(command.type==='deleteHookPreset'){if(!items.some(item=>item.id===command.id))throw Error('This hook preset no longer exists. Refresh the list.');items=items.filter(item=>item.id!==command.id);}
  else{
   if(typeof command.name!=='string'||!command.name.trim()||command.name.length>80||/[\u0000-\u001f\u007f]/.test(command.name))throw Error('Use a preset name with 1–80 characters on one line.');
   const name=command.name.trim(),hooks=validateHooks(command.hooks);
   if(command.id!==undefined&&!items.some(item=>item.id===command.id))throw Error('This hook preset no longer exists. Refresh the list.');
   if(items.some(item=>item.id!==command.id&&item.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('A hook preset already has this name.');
   if(command.id===undefined&&items.length>=20)throw Error('Keep at most 20 hook presets.');
   const item={id:command.id??crypto.randomUUID(),name,hooks};items=command.id===undefined?[...items,item]:items.map(row=>row.id===command.id?item:row);
  }
  return snapshot();
 }};
}
