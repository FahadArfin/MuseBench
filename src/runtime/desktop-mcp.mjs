import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {desktopSpecs,desktopInstructions,validateDesktopInput} from '../shared/desktop-assist.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const visionNames=new Set();
const tools=Object.entries(desktopSpecs).map(([type,s])=>({name:'desktop_'+type,description:s.description,inputSchema:{type:'object',properties:s.properties,required:s.required,additionalProperties:false},annotations:{readOnlyHint:s.read,destructiveHint:!s.read,idempotentHint:s.read,openWorldHint:true}}));
function valid(type,args){try{if(!object(args)||!Object.hasOwn(desktopSpecs,type)||Object.keys(args).some(k=>!Object.hasOwn(desktopSpecs[type].properties,k)))return false;validateDesktopInput({...args,type});return true;}catch{return false;}}
export function desktopExecConfig(config){
 if(!config||!path.isAbsolute(config.command)||!Array.isArray(config.args)||config.args.length!==1||!path.isAbsolute(config.args[0])||!/^http:\/\/127\.0\.0\.1:\d+\/call$/.test(config.env?.MUSEBENCH_DESKTOP_ENDPOINT??'')||!/^[A-Za-z0-9_-]{43}$/.test(config.env?.MUSEBENCH_DESKTOP_TOKEN??''))throw Error('Invalid trusted Desktop Assist configuration.');
 return{args:['-c','mcp_servers.musebench_desktop='+JSON.stringify({command:config.command,args:config.args,env:{ELECTRON_RUN_AS_NODE:'${MUSEBENCH_DESKTOP_NODE_MODE}',MUSEBENCH_DESKTOP_ENDPOINT:'${MUSEBENCH_DESKTOP_ENDPOINT}',MUSEBENCH_DESKTOP_TOKEN:'${MUSEBENCH_DESKTOP_TOKEN}'},enabled:true,mode:'required',framing:'line_delimited_json'})],environment:{MUSEBENCH_DESKTOP_NODE_MODE:'1',MUSEBENCH_DESKTOP_ENDPOINT:config.env.MUSEBENCH_DESKTOP_ENDPOINT,MUSEBENCH_DESKTOP_TOKEN:config.env.MUSEBENCH_DESKTOP_TOKEN}};
}
export function createDesktopMcpCaller({endpoint=process.env.MUSEBENCH_DESKTOP_ENDPOINT,token=process.env.MUSEBENCH_DESKTOP_TOKEN}={}){
 if(!/^http:\/\/127\.0\.0\.1:\d+\/call$/.test(endpoint??'')||!/^[A-Za-z0-9_-]{43}$/.test(token??''))throw Error('Desktop Assist connection unavailable.');
 return async(input,{signal}={})=>{const timeout=AbortSignal.timeout(125000),response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input),signal:signal?AbortSignal.any([signal,timeout]):timeout});let count=0,chunks=[];for await(const chunk of response.body){count+=chunk.length;if(count>13*1024*1024)throw Error('Desktop result limit exceeded.');chunks.push(chunk);}const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!response.ok)throw Error(value.error??'Desktop Assist failed.');return value.result;};
}
export function createDesktopMcpServer({input=process.stdin,output=process.stdout,call=createDesktopMcpCaller(),ownsTransport=false}={}){
 let initialized=false,closed=false,ended=false,running=false,pending=Buffer.alloc(0),queue=[],resolveDone,active;
 const done=new Promise(resolve=>resolveDone=resolve),requests=new Map();
 const close=()=>{if(closed)return done;closed=true;active?.controller.abort();queue=[];requests.clear();input.removeListener('data',onData);input.removeListener('end',onEnd);input.removeListener('error',onError);output.removeListener('error',onError);output.removeListener('close',onError);input.pause?.();if(ownsTransport){input.destroy();output.end();}resolveDone();return done;};
 const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
 const envelope=m=>exact(m,['jsonrpc','id','method','params'])&&m.jsonrpc==='2.0'&&typeof m.method==='string'&&(!Object.hasOwn(m,'id')||typeof m.id==='string'&&m.id.length<=128||Number.isSafeInteger(m.id));
 async function dispatch(m,signal){
  if(!envelope(m))return error(null,-32600,'Invalid request.');if(!Object.hasOwn(m,'id'))return null;const result=value=>({jsonrpc:'2.0',id:m.id,result:value});
  if(m.method==='initialize'){if(initialized||!object(m.params)||typeof m.params.protocolVersion!=='string')return error(m.id,-32602,'Invalid initialization.');initialized=true;return result({protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(m.params.protocolVersion)?m.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'musebench-desktop',version:'1.0.0'},instructions:desktopInstructions});}
  if(m.method==='ping')return result({});if(!initialized)return error(m.id,-32002,'Initialize first.');
  if(m.method==='tools/list'){if(m.params!==undefined&&!exact(m.params,['_meta']))return error(m.id,-32602,'Invalid tool list.');return result({tools});}
  if(m.method!=='tools/call')return error(m.id,-32601,'Method not found.');
  const p=m.params,type=typeof p?.name==='string'?p.name.replace(/^desktop_/,''):'';
  if(!exact(p,['name','arguments','_meta'])||p.name!==(visionNames.has(type)?type:'desktop_'+type)||!valid(type,p.arguments))return error(m.id,-32602,'Invalid desktop tool arguments.');
  try{
   const value=await call({type,...p.arguments},{signal}),image=value?.imageDataUrl,metadata=image?Object.fromEntries(Object.entries(value).filter(([key])=>!['imageDataUrl','thumbnailDataUrl'].includes(key))):value;
   const text=JSON.stringify({untrustedDesktopData:metadata});if(Buffer.byteLength(text)>131072)throw Error('Desktop metadata output limit exceeded.');
   const content=[{type:'text',text}];if(image){if(typeof image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>12*1024*1024)throw Error('Desktop image output limit exceeded.');content.push({type:'image',mimeType:'image/png',data:image.slice('data:image/png;base64,'.length)});}return result({content});
  }catch(cause){return result({isError:true,content:[{type:'text',text:String(cause?.message??'Desktop call failed. The outcome may be unknown; inspect before retrying.').slice(0,400)}]});}
 }
 async function pump(){if(running||closed)return;running=true;try{while(queue.length&&!closed){const job=queue.shift();active=job;try{const reply=await dispatch(job.message,job.controller.signal);if(reply&&!closed&&!job.cancelled){const line=JSON.stringify(reply)+'\n';if(!output.write(line))await Promise.race([new Promise(resolve=>output.once('drain',resolve)),done]);}}finally{if(job.registered)requests.delete(job.message.id);active=null;}}}catch{close();}finally{running=false;if(ended)close();}}
 function onData(chunk){if(closed)return;pending=Buffer.concat([pending,Buffer.from(chunk)]);if(pending.length>65536){close();return;}let end;while((end=pending.indexOf(10))!==-1){const frame=pending.subarray(0,end);pending=pending.subarray(end+1);if(frame.length>16384){close();return;}let m;try{m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frame));}catch{close();return;}
   // Cancellation bypasses the work queue so an earlier slow call cannot delay
   // revocation of an action that has not reached the desktop yet.
   if(envelope(m)&&!Object.hasOwn(m,'id')&&m.method==='notifications/cancelled'){
    const p=m.params;if(initialized&&exact(p,['requestId','reason','_meta'])&&(typeof p.requestId==='string'&&p.requestId.length<=128||Number.isSafeInteger(p.requestId))&&(p.reason===undefined||typeof p.reason==='string')&&(p._meta===undefined||object(p._meta))){
     const job=requests.get(p.requestId);if(job&&job.message.method!=='initialize'){job.cancelled=true;job.controller.abort();if(job!==active){queue=queue.filter(item=>item!==job);requests.delete(p.requestId);}}
    }continue;
   }
   if(queue.length>=4){close();return;}const registered=object(m)&&Object.hasOwn(m,'id');if(registered&&requests.has(m.id)){close();return;}
   const job={message:m,controller:new AbortController(),cancelled:false,registered};if(registered)requests.set(m.id,job);queue.push(job);
  }void pump();}
 function onEnd(){ended=true;if(pending.length){close();return;}if(!running)close();}function onError(){close();}
 input.on('data',onData);input.on('end',onEnd);input.on('error',onError);output.on('error',onError);output.on('close',onError);return {close,done};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await createDesktopMcpServer({ownsTransport:true}).done;}catch{process.stderr.write('Desktop connection unavailable.\n');process.exitCode=1;}}
