import {createHash} from 'node:crypto';
import path from 'node:path';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=16384)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const digest=v=>createHash('sha256').update(JSON.stringify(sorted(v))).digest('hex');
function sorted(value){return Array.isArray(value)?value.map(sorted):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;}
function canonicalPath(value){
 if(!text(value))throw Error('Invalid authentication provenance.');
 if(path.win32.isAbsolute(value)&&(/^[A-Za-z]:[\\/]/.test(value)||value.startsWith('\\\\')))return path.win32.normalize(value).replace(/[\\/]+$/,'').toLowerCase();
 if(!path.isAbsolute(value))throw Error('Invalid authentication provenance.');return path.normalize(value);
}
function headers(value){
 if(!object(value))throw Error('Invalid authentication headers.');const result={};
 for(const [key,v] of Object.entries(value)){const name=key.toLowerCase();if(!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)||Object.hasOwn(result,name)||typeof v!=='string'||v.length>16384||/[\r\n\x00]/.test(v))throw Error('Invalid authentication headers.');Object.defineProperty(result,name,{value:v,enumerable:true});}
 return result;
}
function endpoint(value){if(!text(value))throw Error('Invalid authentication endpoint.');try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw 0;return u.href;}catch{throw Error('Invalid authentication endpoint.');}}
export function authSourceIdentity(input){
 if(!object(input)||!/^global:[A-Za-z0-9_.-]{1,100}$/.test(input.sourceId)||!['http','streamable-http','streamable_http','streamableHttp'].includes(input.transport)||!text(input.urlTemplate)||!object(input.authPolicy)||!Number.isSafeInteger(input.authPolicy.version)||!text(input.authPolicy.mode,200)||Object.keys(input.authPolicy).some(k=>!['version','mode'].includes(k)))throw Error('Invalid authentication source.');
 return digest({version:1,sourceId:input.sourceId,transport:'streamable-http',provenance:{settingsPath:canonicalPath(input.globalSettingsPath),profilePath:canonicalPath(input.nativeProfilePath)},endpoint:{template:input.urlTemplate,resolved:endpoint(input.resolvedUrl)},headers:{template:headers(input.headerTemplates),resolved:headers(input.resolvedHeaders)},authPolicy:{version:input.authPolicy.version,mode:input.authPolicy.mode}});
}
export function normalizeAuthBinding(value){
 if(!object(value)||!text(value.grantId,200)||!/^global:[A-Za-z0-9_.-]{1,100}$/.test(value.sourceId)||! /^[a-f0-9]{64}$/.test(value.authSourceIdentity)||!text(value.registrationId,200)||!Array.isArray(value.scopes)||value.scopes.length>256||value.scopes.some(s=>!text(s,200)||/\s/.test(s))||new Set(value.scopes).size!==value.scopes.length)throw Error('Invalid authentication binding.');
 // Issuer and audience strings are validated without rewriting comparison semantics.
 endpoint(value.endpoint);endpoint(value.issuer);endpoint(value.resource);
 const binding={grantId:value.grantId,sourceId:value.sourceId,authSourceIdentity:value.authSourceIdentity,endpoint:value.endpoint,issuer:value.issuer,resource:value.resource,registrationId:value.registrationId,scopes:[...value.scopes].sort()};
 const revision=digest(binding);if(value.bindingRevision!==undefined&&value.bindingRevision!==revision)throw Error('Invalid authentication binding revision.');return{...binding,bindingRevision:revision};
}
export function authBindingRevision(value){return normalizeAuthBinding(value).bindingRevision;}
