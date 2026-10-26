import {isAbsolute} from 'node:path';
import {compatibility} from './compatibility.mjs';

const usable = new Set(['idle','completed','failed','cancelled']);
const halted = new Set(['unavailable','uncertain','closed','blocked']);
const messageKinds = new Set(['agentMessage','userMessage']);
const terminals = new Set(['completed','failed','cancelled']);
const str = v => typeof v==='string' && v.length>0;

/** Product boundary over an exclusively owned official SDK Connection.
 * No CLI spawning, credentials, model endpoint, retries, or approval decisions here.
 * The controller must render strings as text, not trusted HTML.
 */
export class MuseSessionAdapter {
 #connection; #state; #messages=new Map(); #seen=new Map(); #buffer=[];
 #epoch=0; #timeout; #listeners=new Set(); #maxEvents; #maxText;
 constructor({connection,sdkVersion,initializeResult,timeoutMs=10000,maxEvents=2000,maxText=524288}={}){
  this.#connection=connection;this.#timeout=timeoutMs;this.#maxEvents=maxEvents;this.#maxText=maxText;
  const gate=compatibility({sdkVersion,initializeResult});
  this.#state={status:gate.available&&connection?'ready':'unavailable',reason:connection?gate.reason:'runtime-unavailable',sessionId:null,turnId:null,mode:null,planReadOnlyEnforced:false,tests:'not-run',outcome:null,liveVerified:false};
  if(this.#state.status==='unavailable')return;
  if(!['command','mintCommandId','onNotification','onServerRequest','onProtocolError'].every(k=>typeof connection[k]==='function')){this.disconnect('invalid-sdk-connection');return;}
  connection.onNotification(frame=>this.#receive(frame));
  connection.onProtocolError(()=>this.disconnect('protocol-error'));
  connection.onServerRequest(request=>{
   if(request.params?.sessionId!==this.#state.sessionId){this.disconnect('unsupported-server-request');throw Error('Unsupported server request');}
   const approval=request.method==='approval/request';
   if(!approval&&request.method!=='userInput/request'){this.disconnect('unsupported-server-request');throw Error('Unsupported server request');}
   this.#state.pending={kind:approval?'approval':'input',...structuredClone(request.params)};
   this.#halt('blocked',approval?'approval-ui-unavailable':'input-ui-unavailable');
   // MSP receipt only. It neither approves execution nor answers a question.
   return {};
  });
 }
 snapshot(){return structuredClone({...this.#state,messages:[...this.#messages.values()]});}
 subscribe(listener){this.#listeners.add(listener);return ()=>this.#listeners.delete(listener);}
 #emit(){for(const listener of this.#listeners){try{listener(this.snapshot());}catch{/* UI observers cannot alter protocol state. */}}}
 #halt(status,reason){this.#epoch++;this.#state.status=status;this.#state.reason=reason;this.#state.outcome='unknown';this.#buffer=[];this.#emit();}
 disconnect(reason='connection-lost'){if(this.#state.status!=='closed')this.#halt('unavailable',reason);}
 async #bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Command timeout; outcome uncertain')),this.#timeout))]);}finally{clearTimeout(timer);}}
 async open(workspaceRoot){
  if(this.#state.status!=='ready')throw Error('Runtime is not ready');
  if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('Absolute workspace path required');
  const epoch=++this.#epoch;this.#state.status='starting';this.#emit();
  if(this.#epoch!==epoch||this.#state.status!=='starting')throw Error('Session startup was interrupted before dispatch');
  try{
   const result=await this.#bounded(this.#connection.command('session/start',{workspaceRoot},{maxAttempts:1}));
   if(this.#epoch!==epoch)throw Error('Session startup was interrupted');
   if(!str(result?.session?.sessionId)||!str(result.viewCursor)||result.session.status!=='idle'||result.session.workspaceRoot!==workspaceRoot)throw Error('Invalid session result or workspace mismatch');
   this.#state.sessionId=result.session.sessionId;this.#state.status='idle';this.#state.reason=null;
   const held=this.#buffer;this.#buffer=[];for(const f of held)this.#receive(f);this.#emit();
   return this.snapshot();
  }catch(error){if(this.#epoch===epoch)this.#halt('uncertain','session-start-outcome-unknown');throw error;}
 }
 async send({text,mode='chat'}={}){
  if(!usable.has(this.#state.status))throw Error('Session cannot accept a turn in its current state');
  if(typeof text!=='string'||!text.trim()||text.length>20000||!['chat','plan'].includes(mode))throw Error('Invalid turn input');
  const epoch=++this.#epoch;
  this.#state.status='submitting';this.#state.mode=mode;this.#state.outcome=null;this.#state.turnId=null;this.#state.reason=null;
  this.#messages.clear();this.#seen.clear();this.#buffer=[];this.#emit();
  if(this.#epoch!==epoch||this.#state.status!=='submitting')throw Error('Turn submission was interrupted before dispatch');
  let commandId;
  try{commandId=this.#connection.mintCommandId();if(!str(commandId))throw Error('Missing command id');}
  catch(error){this.#halt('unavailable','command-id-unavailable');throw error;}
  const input=mode==='plan'?'Write a proposed plan only; do not make edits or run commands. This instruction is not an enforced permission boundary.\n\n'+text:text;
  try{
   const ack=await this.#bounded(this.#connection.command('turn/start',{sessionId:this.#state.sessionId,input:[{type:'text',text:input}]},{commandId,maxAttempts:1}));
   if(this.#epoch!==epoch)throw Error('Turn submission was interrupted');
   if(ack?.commandId!==commandId||ack.status!=='accepted'||ack.disposition!=='started'||ack.startedNewTurn!==true||!str(ack.turnId))throw Error('Unsupported or unconfirmed turn disposition');
   this.#state.turnId=ack.turnId;this.#state.status='running';
   const held=this.#buffer;this.#buffer=[];for(const f of held)this.#receive(f);this.#emit();
   return this.snapshot();
  }catch(error){if(this.#epoch===epoch)this.#halt('uncertain','turn-submit-outcome-unknown');throw error;}
 }
 #receive(frame){
  if(halted.has(this.#state.status))return;
  if(!frame||typeof frame.method!=='string'||!frame.params||typeof frame.params!=='object'){this.disconnect('malformed-notification');return;}
  if(this.#state.status==='starting'||this.#state.status==='submitting'){
   if(this.#buffer.length>=100){this.disconnect('event-buffer-limit');return;}
   this.#buffer.push(structuredClone(frame));return;
  }
  const p=frame.params;
  if(p.sessionId!==this.#state.sessionId)return;
  const method=frame.method;
  if(method==='session/closed'){this.disconnect('session-closed');return;}
  if(method==='view/gap'){this.disconnect('transcript-gap-reconciliation-required');return;}
  if(method==='approval/requested'||method==='userInput/requested'){
   this.#state.pending=structuredClone(p);this.#halt('blocked',method==='approval/requested'?'approval-ui-unavailable':'input-ui-unavailable');return;
  }
  const recognized=['turn/started','turn/completed','item/started','item/delta','item/completed'];
  if(!recognized.includes(method))return;
  if(!str(p.viewCursor)){this.disconnect('missing-event-cursor');return;}
  const payload=JSON.stringify(frame);
  if(this.#seen.has(p.viewCursor)){if(this.#seen.get(p.viewCursor)!==payload)this.disconnect('conflicting-event-cursor');return;}
  if(this.#seen.size>=this.#maxEvents){this.disconnect('event-limit');return;}
  this.#seen.set(p.viewCursor,payload);
  if(method.startsWith('turn/')){
   if(p.turnId!==this.#state.turnId){this.disconnect('unexpected-turn');return;}
   if(method==='turn/completed'){
    if(!terminals.has(p.terminal)){this.disconnect('unsupported-terminal');return;}
    if(terminals.has(this.#state.outcome)&&this.#state.outcome!==p.terminal){this.disconnect('conflicting-terminal');return;}
    this.#state.status=p.terminal;this.#state.outcome=p.terminal;this.#state.reason=null;
   }
  }else if(method==='item/delta'){
   if(p.field!==undefined&&p.field!=='text')return;
   const item=this.#messages.get(p.itemId);
   if(!item||item.status!=='inProgress'||typeof p.delta!=='string'){this.disconnect('unusable-text-delta');return;}
   if(item.text.length+p.delta.length>this.#maxText){this.disconnect('text-limit');return;}
   item.text+=p.delta;
  }else{
   const item=p.item;
   if(!item||!str(item.kind)){this.disconnect('malformed-item');return;}
   if(!messageKinds.has(item.kind))return;
   if(!str(item.itemId)||typeof item.text!=='string'||item.text.length>this.#maxText||!Number.isInteger(item.revision)||item.revision<1||item.turnId!==this.#state.turnId){this.disconnect('malformed-message');return;}
   const old=this.#messages.get(item.itemId);
   if(old&&old.revision>=item.revision)return;
   if(method==='item/completed'&&item.status!=='completed'){this.disconnect('unsupported-message-status');return;}
   this.#messages.set(item.itemId,{id:item.itemId,kind:item.kind,text:item.text,revision:item.revision,status:item.status,phase:item.messagePhase??'finalAnswer'});
  }
  this.#emit();
 }
 async close(){this.#halt('closed','closed-by-controller');if(this.#connection?.close)await this.#bounded(this.#connection.close());}
}
