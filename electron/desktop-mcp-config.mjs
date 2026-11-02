import {createServer} from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function createDesktopMcpConfig({getDesktop,nodePath=process.execPath,serverPath=fileURLToPath(new URL('../src/runtime/desktop-mcp.mjs',import.meta.url))}={}){
 if(typeof getDesktop!=='function'||!path.isAbsolute(nodePath)||!path.isAbsolute(serverPath))throw Error('Desktop tools require trusted host paths.');
 return async(root,{taskId,isCurrent=()=>true}={})=>{
  if(!path.isAbsolute(root)||typeof taskId!=='string'||!taskId||taskId.length>200)throw Error('Desktop tools require a chat and project.');
  const token=randomBytes(32).toString('base64url'),secret=Buffer.from('Bearer '+token),leaseId=randomUUID();let closed=false,active=false;
  const server=createServer(async(req,res)=>{
   const reply=(code,value)=>{if(!res.destroyed){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}};
   const auth=Buffer.from(req.headers.authorization??'');
   if(req.method!=='POST'||req.url!=='/call'||req.headers.origin||req.headers.host!==`127.0.0.1:${server.address()?.port}`||auth.length!==secret.length||!timingSafeEqual(auth,secret)){reply(403,{error:'Desktop capability rejected.'});req.resume();return;}
   if(closed||!isCurrent()){reply(409,{error:'The Desktop Assist connection changed.'});req.resume();return;}if(active){reply(429,{error:'Another desktop call is running.'});req.resume();return;}active=true;
   let live=true;res.once('close',()=>{live=false;if(!res.writableEnded)getDesktop()?.revokeLease?.(leaseId);});
   const binding={taskId,root,leaseId,isConnected:()=>!closed&&isCurrent(),isCurrent:()=>live&&!closed&&isCurrent()};
   try{let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){reply(413,{error:'Desktop request limit exceeded.'});req.destroy();return;}chunks.push(chunk);}let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reply(400,{error:'Invalid desktop request.'});return;}
    const service=getDesktop();if(!service)throw Error('Desktop Assist is unavailable on this host.');const result=await service.agentCommand(binding,input);
    if(!binding.isCurrent())throw Error('The desktop connection changed. The outcome may be unknown; inspect before retrying.');if(Buffer.byteLength(JSON.stringify(result))>13*1024*1024)throw Error('Desktop result limit exceeded.');reply(200,{result});
   }catch(error){reply(409,{error:String(error?.message??'Desktop operation failed.').slice(0,500)});}finally{active=false;}
  });
  server.requestTimeout=7000;server.headersTimeout=7000;server.maxConnections=4;server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();let closePromise;
  return{config:{command:nodePath,args:[serverPath],env:{ELECTRON_RUN_AS_NODE:'1',MUSEBENCH_DESKTOP_ENDPOINT:`http://127.0.0.1:${server.address().port}/call`,MUSEBENCH_DESKTOP_TOKEN:token},transport:'stdio',framing:'lineDelimitedJson',mode:'required'},close(){if(closePromise)return closePromise;closed=true;getDesktop()?.revokeLease?.(leaseId);closePromise=new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});return closePromise;}};
 };
}
