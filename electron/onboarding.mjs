import {spawn} from 'node:child_process';
import {curateEnvironment} from '../src/runtime/index.mjs';
import {isNativeExecutable} from '../src/shared/platform.mjs';

// Credentials stay in the official CLI store. Never echo subprocess output or keys.
export function createOnboarding({getBinary,getRuntime=()=>({}),personal,spawnProcess=spawn,platform=process.platform,signInTimeoutMs=180000,cleanupTimeoutMs=4000}) {
 let code={status:'required',message:'Sign in with the official Muse CLI.'},child=null,generation=0,authFaultSeen=false,closing=false;
 const state=async()=>{
  if(getRuntime().failureCode==='auth'){if(!authFaultSeen&&!child)code={status:'required',message:'Your Muse sign-in needs attention.'};authFaultSeen=true;}else authFaultSeen=false;
  return {code:{...code},personal:await personal.checkLogin()};
 };
 const cleanupError=()=>Object.assign(Error('Muse sign-in process cleanup is unconfirmed. Wait for it to shut down before retrying.'),{code:'SIGNIN_CLEANUP'});
 function stop(entry,message){
  if(entry!==child||entry.stopping)return entry.cleanupResult??Promise.resolve();
  entry.stopping=true;entry.stopMessage=message;generation++;clearTimeout(entry.timeout);entry.output='';
  code={status:'pending',cleanup:'pending',message:'Stopping Muse sign-in…'};
  entry.cleanupResult=new Promise((resolve,reject)=>{
   entry.confirmCleanup=resolve;
   entry.cleanupTimer=setTimeout(()=>{
    if(entry!==child)return;
    code={status:'pending',cleanup:'unconfirmed',message:cleanupError().message};reject(cleanupError());
   },cleanupTimeoutMs);
  });
  // Cancellation is requested by an IPC action that returns immediately; close
  // awaits the same bounded result. Keep failed cleanup handled and owned.
  entry.cleanupResult.catch(()=>{});
  try{entry.process.kill();}catch{/* Only close can confirm terminal ownership. */}
  return entry.cleanupResult;
 }
 function run(args,key){
  if(closing)throw Error('Muse sign-in is closed.');
  if(child)throw Error('A sign-in is already running.');
  const binary=getBinary();
  if(!isNativeExecutable(binary,platform))throw Error('Install the official Muse CLI, then restart MuseBench.');
  const epoch=++generation;code={status:'pending',message:key?'Saving your API key in Muse…':'Approve the Muse sign-in in your browser.'};
  let process;
  try{process=spawnProcess(binary,args,{env:curateEnvironment(),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});}catch{code={status:'required',message:'Muse could not start sign-in.'};throw Error(code.message);}
  const entry=child={process,output:'',failed:false,stopping:false,timeout:null,cleanupTimer:null};
  process.stdout.on('data',chunk=>{
   if(key||entry!==child||epoch!==generation||entry.stopping)return;
   entry.output=(entry.output+chunk.toString()).slice(-12000).replace(/\x1b\[[0-9;]*m/g,'');
   const urls=entry.output.match(/https:\/\/[^\s<>"']+/g)??[];
   for(const raw of urls){try{const url=new URL(raw);if(url.protocol==='https:'&&['auth.meta.com','auth.meta.ai'].includes(url.hostname)&&!url.username&&!url.password)code.loginUrl=url.href;}catch{}}
   const match=entry.output.match(/(?:user code|enter (?:the )?code|code:)\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);if(match)code.userCode=match[1];
  });
  process.stderr.on('data',()=>{});
  process.on('error',()=>{if(entry!==child)return;entry.failed=true;stop(entry,'Sign-in did not complete. Please try again.');});
  process.once('close',value=>{
   clearTimeout(entry.timeout);clearTimeout(entry.cleanupTimer);entry.output='';entry.confirmCleanup?.();
   if(entry!==child)return;child=null;
   code=!entry.failed&&!entry.stopping&&value===0?{status:'ready',method:key?'api':'subscription',message:key?'API key configured. Meta checks access and billing when you run a request.':'Signed in through Muse. Meta checks plan access when you run a request.'}:{status:'required',message:entry.stopMessage??'Sign-in did not complete. Please try again.'};
  });
  entry.timeout=setTimeout(()=>{if(entry===child&&epoch===generation)stop(entry,'Sign-in timed out. Please try again.');},signInTimeoutMs);entry.timeout.unref?.();
  process.stdin.on('error',()=>{});process.stdin.end(key?key+'\n':undefined);
 }
 async function command(input){
  if(!input||!['status','loginCode','loginPersonal','apiKey','cancel'].includes(input.type))throw Error('Unknown setup action.');
  if(closing&&!['status','cancel'].includes(input.type))throw Error('Muse sign-in is closed.');
  if(input.type==='loginCode')run(['login']);
  if(input.type==='apiKey'){
   if(typeof input.key!=='string'||input.key.length<10||input.key.length>8192||/[\s\x00-\x1f]/.test(input.key))throw Error('Enter a valid API key.');
   run(['auth','set','--api-key-stdin'],input.key);
  }
  if(input.type==='loginPersonal')await personal.openLogin();
  if(input.type==='cancel'){if(child)stop(child,'Sign-in cancelled.');else code={status:'required',message:'Sign-in cancelled.'};}
  return state();
 }
 return {command,isBusy:()=>!!child||!!personal.isAuthenticating?.(),close(){closing=true;return child?stop(child,'Sign-in cancelled.'):Promise.resolve();}};
}
