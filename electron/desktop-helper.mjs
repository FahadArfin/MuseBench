import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {existsSync} from 'node:fs';

const operations=new Set(['apps','windows','open','inspect','capture','click','type','key','scroll','drag']);
const inputs=new Set(['click','type','key','scroll','drag']);
const fault=(code,message,uncertain=false)=>Object.assign(Error(message),{code,uncertain});

// One process per request. There is deliberately no persistent desktop observer.
export function createDesktopHelper({helperPath,parentId=process.pid,timeoutMs=4500,spawnProcess=spawn}) {
 if(typeof helperPath!=='string'||!helperPath||!Number.isSafeInteger(parentId)||parentId<1)throw Error('Invalid desktop helper configuration.');
 let closed=false;const active=new Set();
 async function call(input) {
  if(closed)throw fault('desktop_closed','Desktop helper is closed.');
  let line;try{line=JSON.stringify(input);}catch{throw fault('desktop_request','Invalid desktop request.');}
  if(!input||typeof input!=='object'||!operations.has(input.op)||!line||Buffer.byteLength(line)>65536)throw fault('desktop_request','Invalid desktop request.');
  let child;try{child=spawnProcess(helperPath,['--parent',String(parentId)],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}
  catch{throw fault('desktop_unavailable','Desktop helper could not start.');}
  const uncertain=inputs.has(input.op)||input.op==='open';
  return new Promise((resolve,reject)=>{
   const decoder=new StringDecoder('utf8');let output='',size=0,problem=null,finished=false,reapTimer;
   let done;const entry={child,done:new Promise(r=>done=r),cancel:()=>abort(closed?'desktop_closed':'desktop_cancelled',closed?'Desktop helper is closed.':'Desktop action was cancelled; do not replay it automatically.')};active.add(entry);
   const finish=(code)=>{
    if(finished)return;finished=true;clearTimeout(timer);clearTimeout(reapTimer);active.delete(entry);done();
    if(problem){reject(problem);return;}
    try{
     output+=decoder.end();const value=JSON.parse(output.trim());
     if(!value||typeof value!=='object'||typeof value.ok!=='boolean'||(value.ok===false&&(!value.error||typeof value.error.code!=='string'))||code!==0)throw Error();
     resolve(value);
    }catch{reject(fault('desktop_protocol','Desktop helper returned an invalid response.',uncertain));}
   };
   function abort(code,message){
    if(finished||problem)return;problem=fault(code,message,uncertain);
    // kill() terminates this fixed helper only; it never targets the controlled app.
    reapTimer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}finish(1);},1000);
    try{child.kill();}catch{finish(1);}
   }
   const timer=setTimeout(()=>abort('desktop_timeout','Desktop helper timed out; the action must not be replayed automatically.'),Math.max(10,Math.min(timeoutMs,30000)));
   child.stdout.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>16*1024*1024){abort('desktop_protocol','Desktop helper response exceeded its limit.');return;}output+=decoder.write(Buffer.from(chunk));});
   child.stderr.on('data',()=>{});
   child.stdin.on?.('error',()=>abort('desktop_protocol','Desktop helper input was interrupted.'));
   child.once('error',()=>{problem??=fault('desktop_unavailable','Desktop helper could not start.',uncertain);finish(1);});
   child.once('close',finish);
   try{child.stdin.end(line+'\n');}catch{abort('desktop_protocol','Desktop helper input was interrupted.');}
  });
 }
 async function cancel(){const pending=[...active];for(const entry of pending)entry.cancel();await Promise.all(pending.map(entry=>entry.done));}
 async function close(){closed=true;await cancel();}
 return {call,cancel,close,get available(){return !closed&&existsSync(helperPath);}};
}
