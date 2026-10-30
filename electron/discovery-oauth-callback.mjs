import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {oauthFailure} from './discovery-oauth-flow.mjs';
const page='<!doctype html><meta charset="utf-8"><title>Device sign-in</title><p>You can return to MuseBench.</p>';
export async function createDiscoveryOAuthCallback({port=0,now=Date.now,isCurrent,onCode,onDenied}){
 if(!Number.isInteger(port)||port!==0&&(port<1024||port>65535))throw oauthFailure('callback-unavailable');let armed=null,closed=false,lastNow=now(),actualPort;const sockets=new Set();
 const server=http.createServer({maxHeaderSize:16384,requestTimeout:30000,headersTimeout:10000},async(req,res)=>{
  const respond=status=>{res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",connection:'close'});res.end(page);};
  if(req.rawHeaders.reduce((n,v)=>n+Buffer.byteLength(v)+4,0)>16384||req.headers.host!==`127.0.0.1:${actualPort}`||req.rawHeaders.filter(v=>v.toLowerCase()==='host').length!==1||Buffer.byteLength(req.url)>16384||!req.url.startsWith('/'))return respond(400);
  let url;try{url=new URL(req.url,`http://127.0.0.1:${actualPort}`);}catch{return respond(400);}if(url.hash||url.origin!==`http://127.0.0.1:${actualPort}`)return respond(400);if(url.pathname!=='/oauth/mcp/callback')return respond(404);if(req.method!=='GET')return respond(405);if(!armed||closed)return respond(409);
  const candidate=armed;lastNow=Math.max(lastNow,now());if(lastNow>=candidate.expiresAt)return respond(409);
  const allowed=['code','state','iss','error','error_description','error_uri'];const keys=[...url.searchParams.keys()];if(keys.some(k=>!allowed.includes(k))||new Set(keys).size!==keys.length||keys.some(k=>Buffer.byteLength(url.searchParams.get(k))>8192||/[\x00-\x1f\x7f]/.test(url.searchParams.get(k)))||url.searchParams.has('code')===url.searchParams.has('error')||!(url.searchParams.get('code')||url.searchParams.get('error')))return respond(400);
  const state=url.searchParams.get('state')??'',expected=Buffer.from(candidate.state),received=Buffer.from(state);if(expected.length!==received.length||!timingSafeEqual(expected,received))return respond(400);
  const iss=url.searchParams.get('iss');if(candidate.issRequired&&!iss||iss!==null&&iss!==candidate.issuer)return respond(400);
  let valid=false;try{valid=await isCurrent(candidate.attemptId);}catch{}if(!valid||armed!==candidate||closed)return respond(409);lastNow=Math.max(lastNow,now());if(lastNow>=candidate.expiresAt)return respond(409);
  armed=null;respond(200);const operation=url.searchParams.has('error')?onDenied({attemptId:candidate.attemptId}):onCode({attemptId:candidate.attemptId,code:url.searchParams.get('code'),...(iss!==null?{iss}:{})});Promise.resolve(operation).catch(()=>{});
 });server.maxHeadersCount=100;server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});server.on('clientError',(_error,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});actualPort=server.address().port;}catch{throw oauthFailure('callback-unavailable');}
 return{uri:`http://127.0.0.1:${actualPort}/oauth/mcp/callback`,arm(value){if(closed||armed||typeof value.state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.state)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now())throw oauthFailure();armed={...value};},async close(){if(closed)return;closed=true;armed=null;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
