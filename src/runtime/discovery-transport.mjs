import {spawn} from 'node:child_process';
import {createJobSpawner} from './windows-job.mjs';
// SDK-compatible owned transport. Only JSONL is supported; inbound effects such
// as sampling/elicitation/tasks never have a registered handler on the client.
export class DiscoveryTransport {
 constructor(source,{helperPath,sessionId}={}){this.source=source;this.helperPath=helperPath;this.nativeSessionId=sessionId;this.closed=false;this.pending=Buffer.alloc(0);this.stderrBytes=0;}
 async start(){
  if(this.child||this.closed)throw Error('Source is closed; reconnect and review again.');
  const s=this.source,env={...s.env,MUSE_SESSION_ID:this.nativeSessionId};
  const launch=process.platform==='win32'?createJobSpawner({helperPath:this.helperPath,duplex:true}):spawn;
  this.child=launch(s.command,s.args,{cwd:s.cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,...(process.platform!=='win32'?{detached:true}:{})});
  this.child.stdin.on('error',()=>{void this.fail();});
  this.child.on('error',()=>{void this.fail();});this.child.on('close',()=>{this.closed=true;this.onclose?.();});
  this.child.stderr.on('data',chunk=>{this.stderrBytes+=chunk.length;if(this.stderrBytes>65536)void this.fail();});
  this.child.stdout.on('data',chunk=>{
   try{let start=0;while(start<chunk.length&&!this.closed){const end=chunk.indexOf(10,start),stop=end<0?chunk.length:end,piece=chunk.subarray(start,stop);if(this.pending.length+piece.length>2097152)throw Error();this.pending=Buffer.concat([this.pending,piece]);if(end<0)break;const frame=this.pending;this.pending=Buffer.alloc(0);start=end+1;if(!frame.length)continue;const message=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(frame));if(message.jsonrpc!=='2.0')throw Error();this.onmessage?.(message);}}
   catch{void this.fail();}
  });
 }
 async fail(){this.onerror?.(Error('Source transport failed or exceeded its output limit.'));await this.close();}
 async send(message){
  const frame=JSON.stringify(message)+'\n';if(Buffer.byteLength(frame)>131072||this.closed||!this.child)throw Error('Source request limit or closed transport.');
  if(['initialize','tools/list','tools/call'].includes(message.method)){this.stderrBytes=0;this.child.beginOperation?.();}
  await new Promise((resolve,reject)=>this.child.stdin.write(frame,error=>error?reject(Error('Source input failed.')):resolve()));
 }
 async close(){
  if(this.closing)return this.closing;this.closed=true;this.pending=Buffer.alloc(0);
  this.closing=(async()=>{const child=this.child;if(!child)return;if(process.platform==='win32'){if(!await child.stop())throw Error('Source process cleanup is unconfirmed.');}else{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('close',resolve);});}this.onclose?.();})();return this.closing;
 }
}
