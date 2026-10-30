// Owned Node HTTP boundary. Does not use ambient fetch/proxy agents or TLS overrides.
import http from 'node:http';
import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import {Transform} from 'node:stream';
import {discoverySetupError} from './discovery-errors.mjs';
export const REMOTE_LIMITS=Object.freeze({headers:16384,body:2097152,frame:1048576,operation:4194304,wire:4194304});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=message=>Error(message);
const hostOf=url=>url.hostname.replace(/^\[|\]$/g,'');
async function abortable(promise,signal){
 signal.throwIfAborted();let abort;const cancelled=new Promise((_,reject)=>{abort=()=>reject(fail('Remote request cancelled.'));signal.addEventListener('abort',abort,{once:true});});
 try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener('abort',abort);}
}
export function remoteConfiguration(entry){
 if(typeof entry.url!=='string'||entry.url.length>16384||/[\x00-\x20\x7f]/.test(entry.url))throw fail('Invalid remote MCP endpoint.');
 let url;try{url=new URL(entry.url);}catch{throw fail('Invalid remote MCP endpoint.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw fail('Remote endpoint must have no credentials, query or fragment.');
 if(url.protocol==='http:'&&!['localhost','127.0.0.1','::1'].includes(hostOf(url)))throw fail('Remote endpoints require HTTPS or explicit loopback HTTP.');
 if(entry.headers!==undefined&&(!object(entry.headers)||Object.keys(entry.headers).length>32))throw fail('Remote header map exceeds its limit.');
 const headers={},seen=new Set();for(const [key,value] of Object.entries(entry.headers??{})){
  if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(key)||seen.has(key.toLowerCase())||/^(host|connection|keep-alive|proxy-.*|transfer-encoding|content-length|content-type|accept|accept-encoding|te|trailer|upgrade|cookie|set-cookie|origin|referer|last-event-id|mcp-.*|__proto__|constructor|prototype)$/i.test(key)||typeof value!=='string'||value.length>4096||/[^\x20-\x7e]/.test(value))throw fail('Invalid, duplicate or transport-owned remote header.');
  seen.add(key.toLowerCase());headers[key]=value;
 }
 if(Buffer.byteLength(JSON.stringify(headers))>8192)throw fail('Remote headers exceed the encoded 8 KiB limit.');
 return{url:url.href,headers};
}
// Return public / private / loopback / prohibited. IPv4-mapped IPv6 is classified
// through its actual IPv4 address, never through its textual spelling.
export function remoteAddressKind(address){
 if(isIP(address)===4){
  const value=address.split('.').reduce((n,octet)=>n*256+Number(octet),0),prefix=(base,bits)=>Math.floor(value/2**(32-bits))===Math.floor(base/2**(32-bits));
  if(prefix(0x7f000000,8))return'loopback';
  if(prefix(0x0a000000,8)||prefix(0xac100000,12)||prefix(0xc0a80000,16))return'private';
  // Exact IANA protocol/documentation/benchmark prefixes, plus existing shared,
  // link-local, multicast/reserved policy. Public neighboring ranges stay public.
  // https://www.iana.org/assignments/iana-ipv4-special-registry
  if([[0,8],[0x64400000,10],[0xa9fe0000,16],[0xc0000000,24],[0xc0000200,24],[0xc6120000,15],[0xc6336400,24],[0xcb007100,24],[0xe0000000,3]].some(([base,bits])=>prefix(base,bits)))return'prohibited';
  return'public';
 }
 if(isIP(address)!==6||address.includes('%'))return'prohibited';
 let text=address.toLowerCase();if(text.includes('.')){const at=text.lastIndexOf(':'),p=text.slice(at+1).split('.').map(Number);text=text.slice(0,at)+':'+((p[0]<<8)|p[1]).toString(16)+':'+((p[2]<<8)|p[3]).toString(16);}
 const sides=text.split('::'),left=sides[0]?sides[0].split(':'):[],right=sides[1]?sides[1].split(':'):[],words=[...left,...Array(sides.length===2?8-left.length-right.length:0).fill('0'),...right].map(v=>parseInt(v,16));
 if(words.slice(0,5).every(v=>v===0)&&words[5]===65535)return remoteAddressKind(`${words[6]>>8}.${words[6]&255}.${words[7]>>8}.${words[7]&255}`);
 if(words.slice(0,7).every(v=>v===0)&&words[7]===1)return'loopback';
 if((words[0]&0xfe00)===0xfc00)return'private';
 if((words[0]&0xe000)!==0x2000||words[0]===0x2001&&[0,2,0xdb8,0x10,0x20].includes(words[1])||words[0]===0x2002)return'prohibited';return'public';
}
export async function resolveRemoteDestination(url,{lookup=dnsLookup}={}){
 const host=hostOf(url),literal=isIP(host),explicitLoopback=['localhost','127.0.0.1','::1'].includes(host);
 const records=literal?[{address:host,family:literal}]:await lookup(host,{all:true,verbatim:true});
 if(!Array.isArray(records)||!records.length||records.length>32||records.some(row=>{const kind=remoteAddressKind(row.address);return explicitLoopback?kind!=='loopback':literal?kind==='prohibited'||kind==='loopback':kind!=='public';}))throw fail('Remote destination is outside the reviewed network scope.');
 return records[0];
}
export function createRemoteNetwork(source,{lookup=dnsLookup,onFailure=()=>{},limits=REMOTE_LIMITS}={}){
 const configured=new URL(source.url),owner=new AbortController(),requests=new Set();let operation=null,backgroundBytes=0;
 const fatal=(message,setupKind)=>{const error=setupKind?discoverySetupError(setupKind):fail(message);onFailure(error);return error;};
 const account=count=>{if(operation){operation.bytes+=count;if(operation.bytes>limits.operation)throw fatal('Remote operation exceeds its network byte limit.');}else{backgroundBytes+=count;if(backgroundBytes>limits.operation*4)throw fatal('Remote background stream exceeds its lifetime limit.');}};
 const api={
  begin(signal){if(operation)throw fail('Remote operation already active.');operation={bytes:0,signal};},
  end(){operation=null;},
  close(){owner.abort();for(const req of requests)req.destroy();requests.clear();},
  get activeRequests(){return requests.size;},
  async fetch(input,init={}){
   const url=new URL(String(input));if(owner.signal.aborted)throw fail('Remote connection closed.');
   if(url.origin!==configured.origin||url.username||url.password||url.hash||url.search&&url.href===configured.href)throw fatal('Remote transport destination changed.');
   const signal=AbortSignal.any([owner.signal,...[operation?.signal,init.signal].filter(Boolean)]);signal.throwIfAborted();
   let destination;try{destination=await abortable(resolveRemoteDestination(url,{lookup}),signal);}catch{throw fatal('Remote destination is outside the reviewed network scope or was cancelled.');}signal.throwIfAborted();
   const headers=Object.fromEntries(new Headers(init.headers));if(Buffer.byteLength(JSON.stringify(headers))>limits.headers)throw fatal('Remote request headers exceed their limit.');
   const body=init.body??'';if(typeof body!=='string'||Buffer.byteLength(body)>262144)throw fatal('Remote request body exceeds its limit.');account(Buffer.byteLength(body));
   return new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?https:http).request(url,{method:init.method??'GET',headers,agent:false,rejectUnauthorized:true,maxHeaderSize:limits.headers,signal,lookup:(_hostname,options,callback)=>callback(null,options.all?[destination]:destination.address,destination.family)},res=>{
     const finishError=(message,setupKind)=>{const error=fatal(message,setupKind);res.destroy(error);req.destroy(error);reject(error);};
     const headerBytes=res.rawHeaders.reduce((n,v)=>n+Buffer.byteLength(v)+4,0);try{account(headerBytes);}catch(error){res.destroy(error);reject(error);return;}
     if(headerBytes>limits.headers){finishError('Remote response headers exceed their limit.');return;}
     if(res.statusCode>=300&&res.statusCode<400){finishError(null,'redirect');return;}
     const responseHeaders=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)responseHeaders.append(res.rawHeaders[i],res.rawHeaders[i+1]);
     let stream=res;const encoding=res.headers['content-encoding'];if(encoding){const decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;if(!decoder){finishError('Unsupported remote content encoding.');return;}const counter=new Transform({transform(chunk,_encoding,callback){compressed+=chunk.length;callback(compressed>limits.wire?fatal('Remote wire response exceeds its limit.'):null,chunk);}});res.on('error',error=>decoder.destroy(error));counter.on('error',error=>decoder.destroy(error));stream=res.pipe(counter).pipe(decoder);}
     let compressed=0,bytes=0,frame=0,line=0,cr=false;const sse=/^text\/event-stream\b/i.test(res.headers['content-type']??'');
     const iterator=stream[Symbol.asyncIterator]();let ended=false;
     const bodyStream=new ReadableStream({async pull(controller){try{const item=await iterator.next();if(item.done){ended=true;controller.close();return;}const chunk=item.value;bytes+=chunk.length;account(chunk.length);if(bytes>limits.body)throw fatal('Remote decompressed response exceeds its limit.');
       if(sse)for(const char of chunk){if(char===10&&cr){cr=false;continue;}cr=char===13;frame++;if(char===10||char===13){if(!line)frame=0;line=0;}else line++;if(frame>limits.frame)throw fatal('Remote SSE frame exceeds its limit.');}
       controller.enqueue(new Uint8Array(chunk));
      }catch{controller.error(fatal('Remote response failed or exceeded its bounds.'));req.destroy();stream.destroy();}},async cancel(){if(!ended){req.destroy();stream.destroy();}await iterator.return?.().catch(()=>{});}});
     // No remote error body or status text is ever forwarded to the UI/logs.
     resolve(new Response([204,205,304].includes(res.statusCode)?null:bodyStream,{status:res.statusCode,headers:responseHeaders}));
    });
    requests.add(req);req.once('close',()=>requests.delete(req));req.once('error',()=>reject(fail('Remote connection failed.')));req.end(body);
   });
  },
 };return api;
}
