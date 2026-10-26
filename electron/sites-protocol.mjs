import {validateBundle} from '../src/sites/files.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hashPattern=/^[a-f0-9]{64}$/;
function assetPath(value){if(typeof value!=='string'||value.length>1600||/[\\\u0000-\u001f]/.test(value)||/%(?:2f|5c)/i.test(value))return null;let decoded;try{decoded=decodeURIComponent(value);}catch{return null;}if(!decoded.startsWith('/')||/[\\:%?#<>"|*\u0000-\u001f\u007f]/.test(decoded))return null;const parts=decoded.slice(1).split('/');if(parts.some((part,index)=>part==='.'||part==='..'||(part===''&&index<parts.length-1)||part.startsWith('.')||/[. ]$/.test(part)))return null;return decoded.slice(1);}
function parsePreview(value){
 if(typeof value!=='string'||value.length>3000)return null;
 // Check the original pathname before URL parsing can normalize dot segments.
 const match=/^musebench-site:\/\/([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/.exec(value);if(!match)return null;const file=assetPath(match[2]||'/');if(file===null)return null;
 let url;try{url=new URL(value);}catch{return null;}if(url.protocol!=='musebench-site:'||url.username||url.password||url.port)return null;const labels=url.hostname.split('.');if(labels.length!==3||!uuid.test(labels[0])||!hashPattern.test(labels[1])||labels[2]!=='preview')return null;
 return {siteId:labels[0],hash:labels[1],file,origin:`musebench-site://${url.hostname}`};
}
export function sitePreviewUrl(siteId,hash,file='index.html'){if(!uuid.test(siteId)||!hashPattern.test(hash))throw new Error('Invalid site preview identity.');if(typeof file!=='string'||file.startsWith('/')||assetPath('/'+file)===null)throw new Error('Invalid site preview path.');return `musebench-site://${siteId}.${hash}.preview/${file.split('/').map(encodeURIComponent).join('/')}`;}
export function isSitePreviewUrl(value){return parsePreview(value)!==null;}
// null delegates unrelated or trusted host-driven loads to the app's ordinary
// navigation policy. Site-originated navigation must retain the response CSP.
export function sitePreviewNavigationDecision({url,frameUrl,initiatorUrl,hostInitiated=false}){
 if(hostInitiated)return null;
 const source=[initiatorUrl,frameUrl].find(value=>typeof value==='string'&&/^musebench-site:/i.test(value));
 if(source===undefined)return null;
 const from=parsePreview(source),to=parsePreview(url);
 return !!from&&!!to&&from.origin===to.origin;
}
function previewHeaders(route,mime='text/plain; charset=utf-8'){
 return {'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','access-control-allow-origin':'*','content-security-policy':`default-src 'none'; script-src ${route.origin} 'unsafe-inline'; style-src ${route.origin} 'unsafe-inline'; img-src ${route.origin} data:; font-src ${route.origin} data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri ${route.origin}; form-action 'none'; sandbox allow-scripts`};
}
export function createSitePreviewHandler({getBundle}){
 return async request=>{
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const route=parsePreview(request.url);if(!route)return new Response('Site preview not found',{status:404});
  try{const value=await getBundle(route.siteId,route.hash);if(!value)return new Response('Site preview not found',{status:404,headers:previewHeaders(route)});const bundle=validateBundle(value);if(bundle.hash!==route.hash)return new Response('Site preview not found',{status:404,headers:previewHeaders(route)});
   const file=route.file||'index.html';let entry=bundle.files.find(entry=>entry.path===file);if(!entry)entry=bundle.files.find(entry=>entry.path===`${file.endsWith('/')?file:file+'/'}index.html`);if(!entry)return new Response('Site file not found',{status:404,headers:previewHeaders(route)});
   return new Response(request.method==='HEAD'?null:Buffer.from(entry.data,'base64'),{headers:previewHeaders(route,entry.mime)});
  }catch{return new Response('This site preview could not be loaded.',{status:500,headers:previewHeaders(route)});}
 };
}
