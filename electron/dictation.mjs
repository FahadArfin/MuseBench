import {spawn,execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {StringDecoder} from 'node:string_decoder';
const run=promisify(execFile);
const errors={language:'Install a Windows speech recognition language to use dictation.',microphone:'Could not open the microphone. Check Windows microphone privacy settings and your default input device.',unavailable:'Local dictation is unavailable. You can continue typing.',protocol:'Dictation stopped unexpectedly. Please try again.'};
export function createDictation({helperPath,spawnHelper=spawn,probe=async()=>{
 const {stdout}=await run(helperPath,['--probe'],{windowsHide:true,shell:false,timeout:5000,maxBuffer:4096});return JSON.parse(stdout.trim());
},onState=()=>{}}) {
 let state={id:null,status:'idle',available:null,language:null,text:'',error:null},owner=null,closed=false,probePromise=null,generation=0,probeGeneration=0;
 const snapshot=()=>({...state});
 const update=patch=>{state={...state,...patch};onState(snapshot());};
 async function availability(refresh=false){
  if(refresh&&!owner)probePromise=null;
  if(!probePromise){
   const current=++probeGeneration;
   probePromise=Promise.resolve().then(probe).then(value=>{if(!closed&&current===probeGeneration)update({available:value.available===true,language:typeof value.language==='string'?value.language.slice(0,30):null,error:value.available===true?null:errors.language});}).catch(()=>{if(!closed&&current===probeGeneration)update({available:false,error:errors.unavailable});});
  }
  await probePromise;
 }
 async function stop(discard=false){
  generation++;
  const active=owner;
  if(!active){if(discard)update({status:'idle',text:'',error:null});return snapshot();}
  active.discard ||= discard;
  if(discard)update({status:'stopping',text:'',error:null});else if(state.status!=='error')update({status:'stopping'});
  if(active.stopping){await active.stopping;return snapshot();}
  try{active.child.stdin.write('stop\n');}catch{active.child.kill();}
  const killTimer=setTimeout(()=>{try{active.child.kill();}catch{}},3000);
  let timeout;
  active.stopping=Promise.race([active.done,new Promise((_,reject)=>{timeout=setTimeout(()=>{update({status:'error',error:'Microphone shutdown could not be confirmed. Close MuseBench before recording again.'});reject(Error('Dictation shutdown could not be confirmed.'));},5000);})]).finally(()=>{clearTimeout(killTimer);clearTimeout(timeout);});
  await active.stopping;return snapshot();
 }
 async function dispatch(command){
  if(!['status','refresh','start','stop','cancel'].includes(command))throw Error('Invalid dictation command.');
  if(closed)throw Error('Dictation is closed.');
  if(command==='stop'||command==='cancel')return stop(command==='cancel');
  const token=generation;await availability(command==='refresh');
  if(closed||token!==generation)return snapshot();
  if(command==='status'||command==='refresh')return snapshot();
  if(owner)throw Error('Dictation is already active.');
  if(!state.available)throw Error(state.error??errors.unavailable);
  update({id:randomUUID(),status:'starting',text:'',error:null});
  let child;try{child=spawnHelper(helperPath,['--parent',String(process.pid)],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}catch{update({status:'error',error:errors.unavailable});return snapshot();}
  let resolve;const active={child,discard:false,buffer:'',bytes:0,decoder:new StringDecoder('utf8'),done:new Promise(r=>resolve=r)};owner=active;
  const fail=code=>{if(owner!==active)return;active.discard=true;update({status:'error',error:errors[code]??errors.protocol});try{child.kill();}catch{}};
  child.stdout.on('data',chunk=>{
   if(owner!==active||active.discard)return;
   active.bytes+=chunk.length;if(active.bytes>128*1024){fail('protocol');return;}
   active.buffer+=active.decoder.write(Buffer.from(chunk));const lines=active.buffer.split('\n');active.buffer=lines.pop();
   for(const line of lines){if(!line.trim())continue;try{
    const value=JSON.parse(line);
    if(value.kind==='listening'&&state.status==='starting')update({status:'listening'});
    else if(value.kind==='text'&&typeof value.text==='string'&&value.text.trim())update({text:(state.text+(state.text?' ':'')+value.text.trim()).slice(0,16000)});
    else if(value.kind==='error'){fail(value.code);return;}
   }catch{fail('protocol');return;}}
  });
  child.stderr.on('data',()=>{});
  const timer=setTimeout(()=>void stop(false).catch(()=>{}),92000);
  const finished=code=>{clearTimeout(timer);if(owner!==active)return;owner=null;if(state.status!=='error')update({status:code===0||active.discard?'idle':'error',error:code===0||active.discard?null:errors.protocol,...(active.discard?{text:''}:{})});resolve();};
  child.once('error',()=>{update({status:'error',error:errors.unavailable});finished(1);});
  child.once('close',finished);
  return snapshot();
 }
 return {snapshot,dispatch,stop,async close(){closed=true;await stop(true);}};
}
