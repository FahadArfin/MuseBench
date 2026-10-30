const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
export function discoveryIdentity(value){
 if(!exact(value,['sources'])||!Array.isArray(value.sources)||value.sources.length<1||value.sources.length>4)throw Error('Review between one and four on-demand sources.');
 const seen=new Set(),sources=value.sources.map(row=>{
  if(!exact(row,['id','revision'])||typeof row.id!=='string'||!/^global:[A-Za-z0-9_.-]{1,100}$/.test(row.id)||typeof row.revision!=='string'||! /^[a-f0-9]{64}$/.test(row.revision)||seen.has(row.id))throw Error('Invalid or duplicate on-demand source identity.');
  seen.add(row.id);return{id:row.id,revision:row.revision};
 });return{sources};
}
export function discoverySelection(value){
 if(!exact(value,['sources','reviewed'])||value.reviewed!==true)throw Error('Explicitly review the selected on-demand sources for this connection.');
 return{...discoveryIdentity({sources:value.sources}),reviewed:true};
}
export function sameDiscovery(a,b){
 try{const key=value=>JSON.stringify(discoveryIdentity({sources:value.sources}).sources.sort((a,b)=>a.id.localeCompare(b.id)));return key(a)===key(b);}catch{return false;}
}
