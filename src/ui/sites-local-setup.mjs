// Presentation switch only. Provider permissions remain the backend's responsibility.
export const SITES_PUBLISHING_ENABLED=false;
const defaults=()=>({audience:'private',domain:'',discoverable:false,versionId:''});
const key=id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,128}$/.test(id))throw Error('Choose a site first.');return `musebench.sites.setup.v1:${id}`;};
function normalize(value){
 if(!value||!['public','unlisted','private'].includes(value.audience))throw Error('Choose a planned audience.');
 const domain=typeof value.domain==='string'?value.domain.trim().toLowerCase():'';
 if(domain&&(domain.length>253||!domain.includes('.')||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))))throw Error('Enter a domain such as www.example.com, without https:// or a path.');
 const versionId=typeof value.versionId==='string'&&/^[a-zA-Z0-9-]{0,128}$/.test(value.versionId)?value.versionId:'';
 return{audience:value.audience,domain,discoverable:value.audience==='public'&&value.discoverable===true,versionId};
}
export function readSiteSetup(storage,id){
 try{const raw=storage.getItem(key(id));if(!raw)return{value:defaults(),warning:''};if(raw.length>4096)throw Error('Oversize setup');return{value:normalize(JSON.parse(raw)),warning:''};}
 catch{return{value:defaults(),warning:'Saved publishing preferences could not be loaded. You can save a new local setup.'};}
}
export function saveSiteSetup(storage,id,value){const normalized=normalize(value);storage.setItem(key(id),JSON.stringify(normalized));return normalized;}
