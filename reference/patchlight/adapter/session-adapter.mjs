import {isAbsolute} from 'node:path';
import {compatibility} from './compatibility.mjs';
import {terminalReason} from './diagnostics.mjs';

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
 #epoch=0; #timeout; #listeners=new Set(); #maxEvents; #maxText; #allowContinuation; #durable; #queuedTurns=new Set(); #observeToolItem;
 constructor({connection,sdkVersion,initializeResult,fullAccess=false,allowContinuation=()=>false,observeToolItem=null,timeoutMs=10000,maxEvents=2000,maxText=524288}={}){
  this.#allowContinuation=allowContinuation;
  this.#observeToolItem=typeof observeToolItem==='function'?observeToolItem:null;
  this.#durable=initializeResult?.sessionDurability===undefined||initializeResult.sessionDurability==='durable';
  this.#connection=connection;this.#timeout=timeoutMs;this.#maxEvents=maxEvents;this.#maxText=maxText;
  const gate=compatibility({sdkVersion,initializeResult,fullAccess});
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
 #projectTool(item){
  if(item?.kind!=='toolCall'||!this.#observeToolItem||!this.#state.ownedTurnIds?.includes(item.turnId))return;
  try{this.#observeToolItem(structuredClone(item),{rootTurnId:this.#state.rootTurnId,ownedTurnIds:[...this.#state.ownedTurnIds]});}catch{/* Observation cannot change admission or native lifecycle. */}
 }
 #halt(status,reason){this.#epoch++;this.#state.status=status;this.#state.reason=reason;this.#state.outcome='unknown';this.#buffer=[];this.#emit();}
 disconnect(reason='connection-lost'){if(this.#state.status!=='closed')this.#halt('unavailable',reason);}
 async #bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Command timeout; outcome uncertain')),this.#timeout))]);}finally{clearTimeout(timer);}}
 async open(workspaceRoot,{sessionId=null}={}){
  if(this.#state.status!=='ready')throw Error('Runtime is not ready');
  if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('Absolute workspace path required');
  if(sessionId!==null&&(!str(sessionId)||sessionId.length>200))throw Error('Invalid native session identity');
  if(sessionId&&!this.#durable)throw Error('Native restoration requires a durable host');
  const epoch=++this.#epoch;this.#state.status='starting';this.#emit();
  if(this.#epoch!==epoch||this.#state.status!=='starting')throw Error('Session startup was interrupted before dispatch');
  try{
   const result=await this.#bounded(this.#connection.command(sessionId?'session/resume':'session/start',sessionId?{sessionId,excludeItems:false,history:'snapshot'}:{workspaceRoot},{maxAttempts:1}));
   if(this.#epoch!==epoch)throw Error('Session startup was interrupted');
   if(!str(result?.session?.sessionId)||typeof result.viewCursor!=='string'||!(sessionId?['idle','running']:['idle']).includes(result.session.status)||result.session.workspaceRoot!==workspaceRoot||sessionId&&result.session.sessionId!==sessionId)throw Error('Invalid session result or workspace mismatch');
   this.#state.sessionId=result.session.sessionId;this.#state.status='idle';this.#state.reason=null;this.#state.viewCursor=result.viewCursor;
   if(sessionId)this.#restore(result);
   const held=this.#buffer;this.#buffer=[];for(const f of held)this.#receive(f);this.#emit();
   return this.snapshot();
  }catch(error){if(this.#epoch===epoch)this.#halt('uncertain','session-start-outcome-unknown');throw error;}
 }
 #restore(result){
  const h=result.history,s=result.session;
  let items,queued=[];
  if(h?.mode==='inline'&&Array.isArray(h.items))items=h.items;
  else if(['snapshot','anchoredSnapshot'].includes(h?.mode)&&h.snapshot?.schemaVersion===1&&h.snapshot.viewCursor===result.viewCursor&&Array.isArray(h.snapshot.state?.items)&&Array.isArray(h.snapshot.state?.queuedTurns)){
   items=h.snapshot.state.items;queued=h.snapshot.state.queuedTurns;
   if((h.snapshot.state.activeTurn?.turnId??null)!==s.activeTurnId)throw Error('Restored active turn does not match snapshot');
  }else throw Error('Native restore history is unavailable or requires unsupported recovery. No turn was sent.');
  if(items.length>this.#maxEvents||queued.length>128||!Array.isArray(result.pendingRequests)||result.pendingRequests.length>32)throw Error('Native restore exceeds bounded history or request limits');
  if(s.status==='running'?!str(s.activeTurnId):s.activeTurnId!==null)throw Error('Invalid restored active turn');
  const pointers=result.pendingRequests.map(p=>{
   if(!['approval','userInput'].includes(p?.kind)||!str(p[p.kind==='approval'?'approvalId':'userInputId'])||typeof p.viewCursor!=='string')throw Error('Unsupported restored pending request');
   return structuredClone(p);
  });
  let textSize=0;const messages=[],children=[],tools=[],compactions=[];
  for(const item of items){
   if(!str(item?.itemId)||!str(item.kind)||!Number.isInteger(item.revision)||item.revision<1)throw Error('Invalid restored item');
   if(['workflow','subagent'].includes(item.kind)){children.push(structuredClone(item));continue;}
   if(item.kind==='toolCall'){tools.push(item);continue;}
   if(item.kind==='compaction'){compactions.push(structuredClone(item));continue;}
   if(!messageKinds.has(item.kind))continue;
   if(typeof item.text!=='string'||!str(item.turnId)||typeof item.status!=='string'||(textSize+=item.text.length)>this.#maxText)throw Error('Native restore text exceeds supported history');
   const message={id:item.itemId,kind:item.kind,turnId:item.turnId,text:item.text,revision:item.revision,status:item.status,phase:item.messagePhase??'finalAnswer'};
   messages.push(message);if(item.turnId===s.activeTurnId)this.#messages.set(item.itemId,message);
  }
  for(const turn of queued){if(!str(turn.turnId))throw Error('Invalid restored queued turn');this.#queuedTurns.add(turn.turnId);}
  this.#state.status=s.status;this.#state.turnId=s.activeTurnId;this.#state.rootTurnId=s.activeTurnId;this.#state.ownedTurnIds=s.activeTurnId?[s.activeTurnId]:[];
  this.#state.restoredMessages=messages;this.#state.restoredChildren=children;this.#state.restoredCompactions=compactions;
  this.#state.restoration={status:'restored',sessionId:s.sessionId,viewCursor:result.viewCursor,historyMode:h.mode,pendingRequests:pointers,activeTurnId:s.activeTurnId,queuedTurnIds:[...this.#queuedTurns],turnCount:s.turnCount};
  for(const item of tools)this.#projectTool(item);
 }
 async send({text,mode='chat',images=[]}={}){
  let dispatched=false;
  try{
  if(!usable.has(this.#state.status))throw Error('Session cannot accept a turn in its current state');
  if(this.#queuedTurns.size)throw Error('Restored native queued work is still pending');
  if(typeof text!=='string'||!text.trim()||text.length>64000||!['chat','plan'].includes(mode))throw Error('Invalid turn input');
  let imageBytes=0;
  if(!Array.isArray(images)||images.length>4)throw Error('Invalid image input');
  const pictures=images.map(i=>{
   if(i?.type!=='image'||!['image/png','image/jpeg','image/webp'].includes(i.mediaType)||typeof i.base64Data!=='string'||!i.base64Data||i.base64Data.length>9800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(i.base64Data))throw Error('Invalid image input');
   const bytes=Buffer.from(i.base64Data,'base64');imageBytes+=bytes.length;if(bytes.toString('base64')!==i.base64Data||imageBytes>7*1024*1024)throw Error('Image input exceeds 7 MiB native request limit');
   return {type:'image',mediaType:i.mediaType,base64Data:i.base64Data};
  });
  const epoch=++this.#epoch;
  this.#state.status='submitting';this.#state.mode=mode;this.#state.outcome=null;this.#state.turnId=null;this.#state.rootTurnId=null;this.#state.ownedTurnIds=[];this.#state.reason=null;
  this.#messages.clear();this.#seen.clear();this.#buffer=[];this.#emit();
  if(this.#epoch!==epoch||this.#state.status!=='submitting')throw Error('Turn submission was interrupted before dispatch');
  let commandId;
  try{commandId=this.#connection.mintCommandId();if(!str(commandId))throw Error('Missing command id');}
  catch(error){this.#halt('unavailable','command-id-unavailable');throw error;}
  const input=mode==='plan'?'Write a proposed plan only; do not make edits or run commands. This instruction is not an enforced permission boundary.\n\n'+text:text;
  try{
   dispatched=true;const ack=await this.#bounded(this.#connection.command('turn/start',{sessionId:this.#state.sessionId,input:[{type:'text',text:input},...pictures]},{commandId,maxAttempts:1}));
   if(this.#epoch!==epoch)throw Error('Turn submission was interrupted');
   if(ack?.commandId!==commandId||ack.status!=='accepted'||ack.disposition!=='started'||ack.startedNewTurn!==true||!str(ack.turnId))throw Error('Unsupported or unconfirmed turn disposition');
   this.#state.turnId=ack.turnId;this.#state.rootTurnId=ack.turnId;this.#state.ownedTurnIds=[ack.turnId];this.#state.status='running';
   const held=this.#buffer;this.#buffer=[];for(const f of held)this.#receive(f);this.#emit();
   return this.snapshot();
  }catch(error){if(this.#epoch===epoch)this.#halt('uncertain','turn-submit-outcome-unknown');throw error;}
  }catch(error){throw Object.assign(error instanceof Error?error:new Error(String(error)),{inputAdmission:dispatched?'unknown':'not-sent'});}
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
  const recognized=['turn/started','turn/completed','item/started','item/updated','item/delta','item/completed'];
  if(!recognized.includes(method))return;
  if(method==='item/updated'&&!messageKinds.has(p.item?.kind)&&!(this.#observeToolItem&&p.item?.kind==='toolCall'))return;
  if(!str(p.viewCursor)){this.disconnect('missing-event-cursor');return;}
  const payload=JSON.stringify(frame);
  if(this.#seen.has(p.viewCursor)){if(this.#seen.get(p.viewCursor)!==payload)this.disconnect('conflicting-event-cursor');return;}
  if(this.#seen.size>=this.#maxEvents){this.disconnect('event-limit');return;}
  this.#seen.set(p.viewCursor,payload);
  this.#state.viewCursor=p.viewCursor;
  if(method.startsWith('turn/')){
   if(p.turnId!==this.#state.turnId){
    // Only the owner of this exclusive session can opt into native child-reporting
    // turns. Never adopt an overlapping, unobserved or malformed foreground turn.
    const queued=method==='turn/started'&&this.#queuedTurns.has(p.turnId)&&usable.has(this.#state.status);
    if(!queued&&(method!=='turn/started'||!terminals.has(this.#state.status)||!str(p.turnId)||p.commandId!==p.turnId||!this.#allowContinuation(this.snapshot()))){this.disconnect('unexpected-turn');return;}
    if(queued){this.#queuedTurns.delete(p.turnId);this.#state.restoration.queuedTurnIds=[...this.#queuedTurns];this.#state.rootTurnId??=p.turnId;}
    if(this.#state.ownedTurnIds.length>=128){this.disconnect('continuation-limit');return;}
    this.#state.ownedTurnIds.push(p.turnId);this.#state.turnId=p.turnId;this.#state.status='running';this.#state.outcome=null;this.#state.reason=null;
   }
   if(method==='turn/completed'){
    if(!terminals.has(p.terminal)){this.disconnect('unsupported-terminal');return;}
    if(terminals.has(this.#state.outcome)&&this.#state.outcome!==p.terminal){this.disconnect('conflicting-terminal');return;}
    this.#state.status=p.terminal;this.#state.outcome=p.terminal;this.#state.reason=terminalReason(p);
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
   if(item.kind==='toolCall'&&this.#observeToolItem){this.#projectTool(item);this.#emit();return;}
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
