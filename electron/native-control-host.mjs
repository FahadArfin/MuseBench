import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm,chmod,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {validateNativeCall} from '../src/shared/native-control.mjs';
import {createNativeMcpServer} from './native-mcp-tools.mjs';

const exec=promisify(execFile),REQUEST_LIMIT=8192,RESULT_LIMIT=4*1024*1024,MAX_CALLS=4,EXPIRED=Symbol('request-deadline');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const secret=()=>randomBytes(32).toString('hex');
const validGrant=value=>exact(value,['version','port','token'])&&value.version===1&&Number.isInteger(value.port)&&value.port>=1&&value.port<=65535&&/^[a-f0-9]{64}$/.test(value.token);
const invalidGrant=()=>Object.assign(Error('The saved app-control grant is invalid. Turn App control off and on to reset it.'),{code:'CONTROL_GRANT_INVALID'});
const startupMessage=error=>error?.code==='EADDRINUSE'?'The saved app-control port is in use. Close the other local listener and turn App control on again. Its configuration has not changed.':error?.code==='CONTROL_GRANT_INVALID'?invalidGrant().message:'App control could not start. Check the local app-control directory and try again.';
const authenticated=(header,token)=>{
 const supplied=Buffer.from(typeof header==='string'?header:''),expected=Buffer.from(`Bearer ${token}`);
 return token.length>0&&supplied.length===expected.length&&timingSafeEqual(supplied,expected);
};
async function privateDirectory(directory){
 await mkdir(directory,{recursive:true,mode:0o700});
 if((await lstat(directory)).isSymbolicLink())throw Error('App control requires a private local directory.');
 if(process.platform==='win32'){
  // Replacing the DACL in one operation avoids briefly exposing the durable
  // grant to inherited permissions while the app is restarting.
  const script=`$ErrorActionPreference = 'Stop'; $directory = '${directory.replaceAll("'","''")}'; $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl = New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true, $false); $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')); $system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'); $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')); [System.IO.Directory]::SetAccessControl($directory, $acl)`;
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000});
 }else await chmod(directory,0o700);
}
async function readJson(file){
 const info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>2048)throw Error('Invalid private app control file.');
 return JSON.parse(await readFile(file,'utf8'));
}
const atomic=async(file,value)=>{
 const tmp=file+'.'+randomBytes(8).toString('hex');
 try{await writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(tmp,file);}finally{await rm(tmp,{force:true});}
};

export async function createNativeControlHost({dataDir,service,connectionConfig=null}){
 const directory=path.join(await realpath(dataDir),'native-control'),descriptor=path.join(directory,'connection.json'),settings=path.join(directory,'settings.json'),grantFile=path.join(directory,'http-grant.json');
 let server=null,token='',httpToken='',grant=null,running=false,enabled=false,closed=false,transition=Promise.resolve(),configuration=null,startupError=null,closing=null,publishedToken='';
 const requests=new Set(),invocations=new Set();
 const state=async({transport}={})=>{
  let config=null,connectionError=null;
  if(running&&!closed&&transport!=='http')try{configuration??=Promise.resolve().then(()=>typeof connectionConfig==='function'?connectionConfig():connectionConfig);config=await configuration;}catch{configuration=null;connectionError='Could not prepare the compatibility connection. Close MCP clients and refresh App control to try again.';}
  const live=running&&!closed;
  return{enabled,running:live,transport:'streamable-http',scope:'This desktop account',connectionConfig:live?config:null,httpConnectionConfig:live?{url:`http://127.0.0.1:${grant.port}/mcp`,headers:{Authorization:`Bearer ${httpToken}`}}:null,connectionError:live?connectionError:null,startupError};
 };
 const send=(res,status,body)=>{
  if(res.destroyed||res.writableEnded)return;
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','connection':'close'});res.end(JSON.stringify(body));
 };
 const expired=()=>Error('App request timed out. Inspect the current state before continuing.');
 const cancelled=signal=>signal.reason===EXPIRED?expired():Error('Native request cancelled. Inspect the app state before continuing.');
 async function invoke(name,args,signal,deadline){
  validateNativeCall(name,args);
  const current=()=>{if(Date.now()>=deadline)throw expired();if(signal.aborted||!running||closed)throw cancelled(signal);};
  current();
  if(invocations.size>=MAX_CALLS)throw Error('App control is busy.');
  const invocation={signal};invocations.add(invocation);
  // Network cancellation releases a response, but native capacity remains
  // owned until the service is actually terminal, even if it ignores abort.
  const work=Promise.resolve().then(()=>{current();return service.call(name,args,{signal});});
  const terminal=work.finally(()=>invocations.delete(invocation));
  let onAbort;
  try{
   const result=await Promise.race([terminal,new Promise((_,reject)=>{onAbort=()=>reject(cancelled(signal));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();})]);
   current();
   if(Buffer.byteLength(JSON.stringify(result))>RESULT_LIMIT)throw Error('Native result too large.');
   current();
   return result;
  }finally{signal.removeEventListener('abort',onAbort);}
 }
 async function body(req,abort,res){
  if(Number(req.headers['content-length'])>REQUEST_LIMIT){send(res,413,{error:'Request too large.'});return;}
  let length=0;const chunks=[];
  for await(const chunk of req){
   length+=chunk.length;if(length>REQUEST_LIMIT){send(res,413,{error:'Request too large.'});return;}
   chunks.push(chunk);if(abort.signal.aborted)return;
  }
  if(abort.signal.aborted)return;
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(res,400,{error:'Invalid app control JSON.'});}
 }
 async function handle(req,res){
  if(!running||closed)return send(res,503,{error:'App control is off.'});
  if(Object.hasOwn(req.headers,'origin')||Object.hasOwn(req.headers,'sec-fetch-site')||req.headers.host!==`127.0.0.1:${grant.port}`)return send(res,403,{error:'Local clients only.'});
  const mcp=req.url==='/mcp',relay=req.url==='/call';
  if(!authenticated(req.headers.authorization,mcp?httpToken:token))return send(res,401,{error:'App control authentication failed.'});
  if(mcp&&req.method!=='POST'){res.setHeader('allow','POST');return send(res,405,{error:'Use MCP HTTP POST.'});}
  if(req.method!=='POST'||(!mcp&&!relay)||(relay?req.headers['content-type']!=='application/json':!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')))return send(res,400,{error:'Unsupported app control request.'});
  if(requests.size>=8)return send(res,429,{error:'App control is busy.'});
  const abort=new AbortController(),context={abort,res,deadline:Date.now()+12000};requests.add(context);
  const timer=setTimeout(()=>{
   abort.abort(EXPIRED);
   // Once the SDK owns an MCP response, aborting invoke produces its bounded
   // isError result. Writing here too would race the SDK's JSON response.
   if(!context.mcpAccepted)send(res,504,{error:'App request timed out. Inspect the current state before continuing.'});
  },12000);
  const disconnected=()=>abort.abort();req.once('aborted',disconnected);res.once('close',disconnected);
  let mcpServer=null;
  try{
   const input=await body(req,abort,res);if(input===undefined||abort.signal.aborted)return;
   if(mcp){
    if(!input||typeof input!=='object'||Array.isArray(input))return send(res,400,{error:'One MCP message is required.'});
    if(Object.hasOwn(input,'id')&&(invocations.size>=MAX_CALLS||[...requests].filter(item=>item.rpc).length>=MAX_CALLS))return send(res,429,{error:'App control is busy.'});
    context.rpc=Object.hasOwn(input,'id');
    res.setHeader('cache-control','no-store');res.setHeader('connection','close');
    // A stateless cancellation notification cannot identify its original
    // client: IDs can collide with another client's later request. A fresh
    // SDK instance safely acknowledges it without affecting other requests.
    // Disconnects, deadlines and revocation retain request-bound cancellation.
    mcpServer=createNativeMcpServer((name,args,{signal})=>invoke(name,args,AbortSignal.any([abort.signal,signal]),context.deadline));
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:REQUEST_LIMIT});
    await mcpServer.connect(transport);context.mcpAccepted=true;await transport.handleRequest(req,res,input);
   }else{
    if(invocations.size>=MAX_CALLS||[...requests].filter(item=>item.rpc).length>=MAX_CALLS)return send(res,429,{error:'App control is busy.'});
    context.rpc=true;
    try{if(!exact(input,['name','arguments']))throw Error();validateNativeCall(input.name,input.arguments);}catch{return send(res,400,{error:'Invalid native tool request.'});}
    send(res,200,await invoke(input.name,input.arguments,abort.signal,context.deadline));
   }
  }catch(error){if(!abort.signal.aborted)send(res,500,{error:typeof error?.message==='string'?error.message.slice(0,300):'App request failed.'});}
  finally{
   clearTimeout(timer);req.off('aborted',disconnected);res.off('close',disconnected);
   requests.delete(context);await mcpServer?.close();
  }
 }
 async function stop({revoke=false}={}){
  running=false;token='';httpToken='';for(const request of requests)request.abort.abort();
  const old=server;server=null;const ownedToken=publishedToken;publishedToken='';
  // Close sockets even when a subsequent filesystem operation fails.
  const stopped=old?new Promise(resolve=>{old.close(resolve);old.closeAllConnections();}):Promise.resolve();
  try{
   if(ownedToken){let saved;try{saved=await readJson(descriptor);}catch{}if(saved?.token===ownedToken)await rm(descriptor,{force:true});}
   if(revoke&&grant){grant={...grant,token:secret()};await atomic(grantFile,grant);}
  }finally{await stopped;}
 }
 async function start({renewGrant=false}={}){
  if(running)return;
  await privateDirectory(directory);
  let saved;
  try{saved=await readJson(grantFile);}catch(error){if(error.code!=='ENOENT')throw invalidGrant();}
  if(saved&&!validGrant(saved))throw invalidGrant();
  const nextGrant=saved?{...saved,token:renewGrant?secret():saved.token}:null;
  const next=http.createServer((req,res)=>{void handle(req,res).catch(()=>send(res,500,{error:'App request failed.'}));});
  next.maxConnections=12;next.requestTimeout=10000;next.headersTimeout=10000;next.keepAliveTimeout=1000;next.maxRequestsPerSocket=1;
  try{await new Promise((resolve,reject)=>{const failed=error=>{next.off('listening',listening);reject(error);};const listening=()=>{next.off('error',failed);resolve();};next.once('error',failed);next.once('listening',listening);next.listen(nextGrant?.port??0,'127.0.0.1');});}
  catch(error){throw Object.assign(Error(startupMessage(error)),{code:error.code});}
  server=next;grant=nextGrant??{version:1,port:next.address().port,token:secret()};httpToken=grant.token;token=secret();
  try{await atomic(grantFile,grant);await atomic(descriptor,{version:1,port:grant.port,token,pid:process.pid});publishedToken=token;running=true;startupError=null;}
  catch(error){await stop();throw error;}
 }
 try{enabled=(await readJson(settings)).enabled===true;}catch{}
 if(enabled)try{await start();}catch(error){startupError=startupMessage(error);}
 return{isBusy:()=>requests.size>0||invocations.size>0,command(command){
  if(!exact(command,['type','transport'])||!['status','enable','disable'].includes(command.type)||(Object.hasOwn(command,'transport')&&(command.type!=='status'||!['http','stdio'].includes(command.transport))))return Promise.reject(Error('Invalid app control setting.'));
  if(command.type==='status')return Promise.resolve(state(command));
  const operation=transition.then(async()=>{
   if(closed)throw Error('MuseBench is closing.');
   if(command.type==='enable'){
    try{await start({renewGrant:!enabled});await atomic(settings,{enabled:true});enabled=true;}
    catch(error){await stop();startupError=startupMessage(error);throw Error(startupError);}
   }else{
    await stop({revoke:true});await privateDirectory(directory);
    // Reset a corrupt/linked grant only after an explicit user disable. A
    // startup failure by itself never changes the saved endpoint or grant.
    try{if(!validGrant(await readJson(grantFile)))await rm(grantFile,{force:true});}catch(error){if(error.code!=='ENOENT')await rm(grantFile,{force:true});}
    await atomic(settings,{enabled:false});enabled=false;startupError=null;
   }
  });transition=operation.catch(()=>{});return operation.then(()=>state());
 },close(){if(!closing){closed=true;closing=transition.then(()=>stop());}return closing;}};
}
