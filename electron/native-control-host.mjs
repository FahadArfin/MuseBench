import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm,chmod,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateNativeCall} from '../src/shared/native-control.mjs';
const exec=promisify(execFile);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
async function privateDirectory(directory){
 await mkdir(directory,{recursive:true,mode:0o700});
 if((await lstat(directory)).isSymbolicLink())throw Error('App control requires a private local directory.');
 if(process.platform==='win32'){
  const {stdout}=await exec('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,timeout:5000});
  const sid=stdout.match(/S-1-5-\d+(?:-\d+)+/)?.[0];if(!sid)throw Error('Could not protect app control for this Windows account.');
  // Drop explicit grants too. This only runs while the listener is off, before
  // a live token is created, so the temporary inherited ACL contains no secret.
  await exec('icacls.exe',[directory,'/reset'],{windowsHide:true,timeout:5000});
  await exec('icacls.exe',[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{windowsHide:true,timeout:5000});
 }else await chmod(directory,0o700);
}
export async function createNativeControlHost({dataDir,service,connectionConfig=null}){
 const directory=path.join(await realpath(dataDir),'native-control'),descriptor=path.join(directory,'connection.json'),settings=path.join(directory,'settings.json');
 let server=null,token='',running=false,enabled=false,active=0,closed=false,transition=Promise.resolve(),configuration=null;
 const atomic=async(file,value)=>{const tmp=file+'.'+randomBytes(8).toString('hex');try{await writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(tmp,file);}finally{await rm(tmp,{force:true});}};
 const state=async()=>{
  let config=null,connectionError=null;
  if(running&&!closed)try{configuration??=Promise.resolve().then(()=>typeof connectionConfig==='function'?connectionConfig():connectionConfig);config=await configuration;}catch{configuration=null;connectionError='Could not prepare the app-control connection. Close MCP clients and refresh App control to try again.';}
  return{enabled,running,transport:'stdio',scope:'This desktop account',connectionConfig:running&&!closed?config:null,connectionError:running&&!closed?connectionError:null};
 };
 const send=(res,status,body)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','connection':'close'});res.end(JSON.stringify(body));};
 async function handle(req,res){
  if(!running||closed)return send(res,503,{error:'App control is off.'});
  if(req.headers.origin||req.headers['sec-fetch-site']||req.headers.host!==`127.0.0.1:${server.address().port}`)return send(res,403,{error:'Local clients only.'});
  const supplied=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${token}`);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(res,401,{error:'App control authentication failed.'});
  if(req.method!=='POST'||req.url!=='/call'||req.headers['content-type']!=='application/json')return send(res,400,{error:'Unsupported app control request.'});
  if(active>=4)return send(res,429,{error:'App control is busy.'});
  active++;const abort=new AbortController(),timer=setTimeout(()=>{abort.abort();send(res,504,{error:'App request timed out. Inspect the current state before continuing.'});},12000);
  req.once('aborted',()=>abort.abort());res.once('close',()=>abort.abort());
  try{
   let body=Buffer.alloc(0);for await(const chunk of req){if(body.length+chunk.length>8192){send(res,413,{error:'Request too large.'});return;}body=Buffer.concat([body,chunk]);}
   if(abort.signal.aborted)return;
   let input;try{input=JSON.parse(body.toString('utf8'));if(!exact(input,['name','arguments']))throw Error();validateNativeCall(input.name,input.arguments);}catch{return send(res,400,{error:'Invalid native tool request.'});}
   const result=await Promise.race([service.call(input.name,input.arguments,{signal:abort.signal}),new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(Error('App request expired.')),{once:true}))]);
   if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw Error('Native result too large.');
   if(!abort.signal.aborted)send(res,200,result);
  }catch(error){send(res,500,{error:typeof error?.message==='string'?error.message.slice(0,300):'App request failed.'});}
  finally{clearTimeout(timer);active--;}
 }
 async function stop(){running=false;token='';await rm(descriptor,{force:true});const old=server;server=null;if(old){old.closeAllConnections();await new Promise(resolve=>old.close(resolve));}}
 async function start(){
  if(running)return;await privateDirectory(directory);token=randomBytes(32).toString('hex');
  const next=http.createServer((req,res)=>void handle(req,res));next.maxConnections=8;next.requestTimeout=10000;next.headersTimeout=10000;next.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{next.once('error',reject);next.listen(0,'127.0.0.1',resolve);});server=next;
  try{await atomic(descriptor,{version:1,port:next.address().port,token,pid:process.pid});running=true;}catch(error){await stop();throw error;}
 }
 try{enabled=JSON.parse(await readFile(settings,'utf8')).enabled===true;}catch{}
 if(enabled)await start();
 return{isBusy:()=>active>0,command(command){
  if(!exact(command,['type'])||!['status','enable','disable'].includes(command.type))return Promise.reject(Error('Invalid app control setting.'));
  if(command.type==='status')return Promise.resolve(state());
  const operation=transition.then(async()=>{if(closed)throw Error('MuseBench is closing.');if(command.type==='enable'){await start();enabled=true;}else{await stop();enabled=false;await privateDirectory(directory);}await atomic(settings,{enabled});return state();});transition=operation.catch(()=>{});return operation;
 },async close(){closed=true;await transition;await stop();}};
}
