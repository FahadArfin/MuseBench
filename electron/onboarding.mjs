import {spawn} from 'node:child_process';
import path from 'node:path';
import {curateEnvironment} from '../src/runtime/index.mjs';

// Credentials stay in the official CLI store. Never echo subprocess output or keys.
export function createOnboarding({getBinary,getRuntime=()=>({}),personal,spawnProcess=spawn}) {
 let code={status:'required',message:'Sign in with the official Muse CLI.'},child=null,generation=0,authFaultSeen=false;
 const state=async()=>{
  if(getRuntime().failureCode==='auth'){if(!authFaultSeen)code={status:'required',message:'Your Muse sign-in needs attention.'};authFaultSeen=true;}else authFaultSeen=false;
  return {code:{...code},personal:await personal.checkLogin()};
 };
 function run(args,key){
  if(child)throw Error('A sign-in is already running.');
  const binary=getBinary();
  if(typeof binary!=='string'||!path.isAbsolute(binary)||!binary.endsWith('.exe'))throw Error('Install the official Muse CLI, then restart MuseBench.');
  const epoch=++generation;code={status:'pending',message:key?'Saving your API key in Muse…':'Approve the Muse sign-in in your browser.'};
  let process;
  try{process=spawnProcess(binary,args,{env:curateEnvironment(),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});child=process;}catch{code={status:'required',message:'Muse could not start sign-in.'};throw Error(code.message);}
  const timeout=setTimeout(()=>{if(epoch!==generation)return;generation++;process.kill();child=null;code={status:'required',message:'Sign-in timed out. Please try again.'};},180000);timeout.unref?.();
  let output='',settled=false;
  process.stdout.on('data',chunk=>{
   if(key||epoch!==generation)return;
   output=(output+chunk.toString()).slice(-12000).replace(/\x1b\[[0-9;]*m/g,'');
   const urls=output.match(/https:\/\/[^\s<>"']+/g)??[];
   for(const raw of urls){try{const url=new URL(raw);if(url.protocol==='https:'&&['auth.meta.com','auth.meta.ai'].includes(url.hostname)&&!url.username&&!url.password)code.loginUrl=url.href;}catch{}}
   const match=output.match(/(?:user code|enter (?:the )?code|code:)\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);if(match)code.userCode=match[1];
  });
  process.stderr.on('data',()=>{});
  const done=(ok)=>{clearTimeout(timeout);if(epoch!==generation||settled)return;settled=true;child=null;output='';code=ok?{status:'ready',method:key?'api':'subscription',message:key?'API key configured. Meta checks access and billing when you run a request.':'Signed in through Muse. Meta checks plan access when you run a request.'}:{status:'required',message:'Sign-in did not complete. Please try again.'};};
  process.once('error',()=>done(false));process.once('close',value=>done(value===0));
  process.stdin.on('error',()=>{});process.stdin.end(key?key+'\n':undefined);
 }
 async function command(input){
  if(!input||!['status','loginCode','loginPersonal','apiKey','cancel'].includes(input.type))throw Error('Unknown setup action.');
  if(input.type==='loginCode')run(['login']);
  if(input.type==='apiKey'){
   if(typeof input.key!=='string'||input.key.length<10||input.key.length>8192||/[\s\x00-\x1f]/.test(input.key))throw Error('Enter a valid API key.');
   run(['auth','set','--api-key-stdin'],input.key);
  }
  if(input.type==='loginPersonal')await personal.openLogin();
  if(input.type==='cancel'){generation++;child?.kill();child=null;code={status:'required',message:'Sign-in cancelled.'};}
  return state();
 }
 return {command,isBusy:()=>!!child,close(){generation++;child?.kill();child=null;}};
}
