import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
/** Each native connection receives a revocable, random loopback capability.
 * Tokens stay in process environment; neither model arguments nor URLs carry them. */
export function createBrowserMcpConfig({getBrowser,getVisuals,normalizeImage,beginVisual,nodePath=process.execPath,serverPath=fileURLToPath(new URL('../src/runtime/browser-mcp.mjs',import.meta.url))}={}){
 if(typeof getBrowser!=='function'||!path.isAbsolute(nodePath)||!path.isAbsolute(serverPath))throw Error('Browser tools require trusted absolute host paths.');
 return async(root,{taskId,isCurrent=()=>true}={})=>{
  if(!path.isAbsolute(root)||typeof taskId!=='string'||!taskId||taskId.length>200)throw Error('Browser tools require an explicit chat and folder.');
  const token=randomBytes(32).toString('base64url'),secret=Buffer.from('Bearer '+token);let closed=false,active=false;
  const server=createServer(async(req,res)=>{
   const reply=(status,value)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}};
   const auth=Buffer.from(req.headers.authorization??'');
   if(req.method!=='POST'||req.url!=='/call'||req.headers.origin||req.headers.host!==`127.0.0.1:${server.address()?.port}`||auth.length!==secret.length||!timingSafeEqual(auth,secret)){reply(403,{error:'Browser capability rejected.'});req.resume();return;}
   if(closed||!isCurrent()){reply(409,{error:'The native browser connection changed.'});req.resume();return;}
   if(active){reply(429,{error:'Another browser tool is running.'});req.resume();return;}active=true;
   try{
    let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){reply(413,{error:'Browser request limit exceeded.'});req.destroy();return;}chunks.push(chunk);}
    if(closed||!isCurrent()){reply(409,{error:'The native browser connection changed.'});return;}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reply(400,{error:'Invalid browser request.'});return;}
    let requestLive=true;res.once('close',()=>{requestLive=false;});
    const binding={taskId,root,isCurrent:()=>requestLive&&!res.destroyed&&!closed&&isCurrent()};
    const visual=['view_image','list_chat_images','view_chat_image'].includes(input?.type);
    const record=input?.type==='capture'||['view_image','view_chat_image'].includes(input?.type)?beginVisual?.(binding):null;
    let result;
    if(visual){const service=getVisuals?.();if(!service)throw Error('Image tools are unavailable on this host.');result=await service.command(binding,{...input,type:input.type==='list_chat_images'?'list_images':'view_image'});}
    else{const browser=getBrowser();if(!browser||typeof browser.agentCommand!=='function'){reply(409,{error:'Open this chat browser first.'});return;}result=await browser.agentCommand(binding,input);}
    if(result?.imageDataUrl){
     if(!visual&&normalizeImage){const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(result.imageDataUrl);if(!match)throw Error('Invalid browser capture.');result={...result,...await normalizeImage(Buffer.from(match[1],'base64'),{width:result.width,height:result.height,mimeType:'image/png'})};}
     if(!binding.isCurrent())throw Error('The visual connection changed.');
     if(record)await record({...result,kind:input.type==='capture'?'capture':'view'});
    }
    if(closed||!isCurrent()){reply(409,{error:'The native browser connection changed. An action may already have completed; inspect before retrying.'});return;}
    if(Buffer.byteLength(JSON.stringify(result))>13*1024*1024){reply(413,{error:'Browser result limit exceeded.'});return;}reply(200,{result});
   }catch(error){reply(409,{error:String(error?.message??'Browser operation failed.').slice(0,400)});}finally{active=false;}
  });
  server.requestTimeout=7000;server.headersTimeout=7000;server.maxConnections=4;server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();
  let closePromise;return {config:{command:nodePath,args:[serverPath],env:{ELECTRON_RUN_AS_NODE:'1',MUSEBENCH_BROWSER_ENDPOINT:`http://127.0.0.1:${server.address().port}/call`,MUSEBENCH_BROWSER_TOKEN:token},transport:'stdio',framing:'lineDelimitedJson',mode:'required'},close(){if(closePromise)return closePromise;closed=true;closePromise=new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});return closePromise;}};
 };
}
