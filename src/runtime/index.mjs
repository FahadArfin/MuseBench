import {validateRunOptions} from '../shared/run-options.mjs';
import {execFile} from 'node:child_process';
import {readFile, realpath, stat} from 'node:fs/promises';
import {realpathSync, statSync, openSync, fstatSync, readSync, closeSync} from 'node:fs';
import {createRequire} from 'node:module';
import {delimiter, dirname, isAbsolute, join} from 'node:path';
import {promisify} from 'node:util';
import {TARGET, compatibility} from '../../reference/patchlight/adapter/compatibility.mjs';
import {MuseSessionAdapter} from '../../reference/patchlight/adapter/session-adapter.mjs';

export const SETUP_URL='https://dev.meta.ai/docs/muse-code';
const require=createRequire(import.meta.url);
const execFileAsync=promisify(execFile);
const environmentNames=['PATH','PATHEXT','SystemRoot','COMSPEC','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA'];
const usable=new Set(['idle','completed','failed','cancelled']);
const permissionReason='Muse permissions could not be verified. This app needs the built-in Ask me profile with a sandbox and human approvals. Update the official Muse installation or disconnect; no turn was sent.';

function sandboxFailureReason(handshake,platform) {
 const availability=handshake?.sandboxAvailability==='unavailable'?'unavailable':'unknown';
 // The protocol explicitly forbids inferring a missing unavailability reason.
 const supplied=availability==='unavailable'&&typeof handshake.sandboxUnavailableReason==='string'
  ?handshake.sandboxUnavailableReason.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240):'';
 const reason=supplied?`Host reason: ${supplied}.`:'The host supplied no reason.';
 const guidance=platform==='win32'
  ?'Run "muse sandbox windows check"; run "muse sandbox windows setup" only if the check says setup is needed. If that check is already ready, the native "serve" host can still report unavailable.'
  :'Check sandbox support for your platform in the official Muse setup instructions.';
 return `Muse's native host sandbox is ${availability}. ${reason} No session was started and no turn was sent. ${guidance} Consult the official Muse docs: ${SETUP_URL}`;
}

/** Pass only OS essentials. Native Muse owns its own stored credentials;
 * unrelated API keys, Node hooks and tool-specific overrides never cross here. */
export function curateEnvironment(source=process.env) {
 const result={};
 for(const name of environmentNames){
  const key=Object.keys(source).find(key=>key.toLowerCase()===name.toLowerCase());
  if(key&&typeof source[key]==='string')result[name]=source[key];
 }
 return result;
}

/** Discovery is a filesystem-only check, not proof of binary authenticity. */
export function discoverMuseBinaries({environment=process.env,platform=process.platform}={}) {
 const env=curateEnvironment(environment);
 const folders=(env.PATH??'').split(platform==='win32'?';':delimiter).filter(Boolean);
 if(platform==='win32'&&env.LOCALAPPDATA&&isAbsolute(env.LOCALAPPDATA))folders.push(join(env.LOCALAPPDATA,'Programs','muse'));
 const found=[],seenFolders=new Set(),seenFiles=new Set();
 const key=path=>platform==='win32'?path.toLowerCase():path;
 const addNative=(path,expectedFolder)=>{
  try{
   const file=realpathSync(path);
   if(expectedFolder&&key(dirname(file))!==key(expectedFolder))return;
   if(statSync(file).isFile()&&!seenFiles.has(key(file))){seenFiles.add(key(file));found.push(file);}
  }catch{/* Missing native targets are normal while an install is incomplete. */}
 };
 for(const folder of folders){
  if(!isAbsolute(folder))continue;
  try{
   const root=realpathSync(folder);
   if(!statSync(root).isDirectory()||seenFolders.has(key(root)))continue;
   seenFolders.add(key(root));
   if(platform==='win32'){
    let descriptor;
    try{
     descriptor=openSync(join(root,'.muse-version'),'r');
     const info=fstatSync(descriptor);
     if(info.isFile()&&info.size>0&&info.size<=128){
      // Read a bounded buffer even if the marker changes after the stat.
      const buffer=Buffer.alloc(129),length=readSync(descriptor,buffer,0,buffer.length,0);
      const version=length<=128?buffer.subarray(0,length).toString('utf8').trim():'';
      if(/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-R\d{1,10}\.\d{1,6})?$/.test(version))addNative(join(root,`muse-bin-${version}.exe`),root);
     }
    }catch{/* The official version marker may not exist for another layout. */}
    finally{if(descriptor!==undefined)closeSync(descriptor);}
   }
   addNative(join(root,platform==='win32'?'muse.exe':'muse'));
  }catch{/* Missing PATH entries are normal. */}
 }
 return found;
}

async function loadInstalledSdk() {
 const manifest=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8'));
 return {sdk:await import('@muse-code/sdk'),sdkVersion:manifest.version};
}

export function parseMuseVersion(output) {
 const match=String(output).trim().match(/^(?:muse(?:[- ]code)?(?:\s+cli)?\s+)?v?(\d+\.\d+\.\d+)(?:\s+\([^\r\n]*\))?$/i);
 if(!match)throw Error('The selected binary did not return a recognized Muse version. Select the native executable from your trusted official installation.');
 return match[1];
}

async function probeInstalledVersion(binary,{environment,timeoutMs}) {
 const result=await execFileAsync(binary,['--version'],{env:environment,windowsHide:true,shell:false,timeout:Math.min(timeoutMs,5000),maxBuffer:16384,encoding:'utf8'});
 return parseMuseVersion(result.stdout);
}

async function bounded(work,timeoutMs) {
 let timer;
 try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Muse operation timed out; its outcome is unknown.')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}

function provesAskMe(session,workspaceRoot,sessionId) {
 const p=session?.permissionState;
 return session?.sessionId===sessionId&&session.workspaceRoot===workspaceRoot&&
  p?.profileId===':ask-me'&&p.reviewerAuthority==='human'&&typeof p.reviewerAttached==='boolean'&&
  p.axes?.filesystem==='sandboxed'&&['off','restricted'].includes(p.axes.network)&&
  p.axes.approval==='onRequest'&&p.axes.reviewer==='human'&&session.approvalMode?.mode==='onRequest';
}

function displayPending(value,revision) {
 if(!value)return null;
 const p=structuredClone(value);
 if(p.kind!=='approval'||!Array.isArray(p.availableChoices))return p;
 p.availableChoices=p.availableChoices.map(choice=>{
  const {decisionToken:discarded,...clean}=choice;
  const supported=clean.scope==='once'&&['approved','denied','abort'].includes(clean.decision)&&typeof clean.choiceId==='string';
  if(!supported)return clean;
  return {...clean,decisionToken:JSON.stringify({sessionId:p.sessionId,approvalId:p.approvalId,sourceIndex:p.currentRequirementId?.sourceIndex,choiceId:clean.choiceId,revision})};
 });
 return p;
}

/** One process/session owner. Startup and model submission are separate explicit
 * actions. Injection replaces the external process boundary for contract tests. */
export function createRuntime({environment=process.env,platform=process.platform,loadSdk=loadInstalledSdk,probeVersion=probeInstalledVersion,timeoutMs=10000}={}) {
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid runtime timeout.');
 const candidates=discoverMuseBinaries({environment,platform});
 const childEnvironment=curateEnvironment(environment);
 let state={transport:'msp',status:'unavailable',reason:candidates.length?'Select Connect to verify your trusted official Muse executable.':'Install Muse from the official setup page, then select its native executable to connect.',binary:candidates[0]??null,sdkVersion:TARGET.sdkVersion,sessionId:null,liveVerified:false,messages:[],pending:null,setupUrl:SETUP_URL,permissionVerified:false,permissionProfile:null,planReadOnlyEnforced:false};
 let owner=null,adapter=null,unsubscribe=null,epoch=0,connecting=false,sending=false,deciding=false,closing=null,blockedReason=null,pending=null,pendingRevision=0,workspace=null;
 const listeners=new Set();
 const snapshot=()=>structuredClone(state);
 const emit=()=>{for(const fn of listeners){try{fn(snapshot());}catch{/* A renderer observer is never a protocol authority. */}}};
 const update=patch=>{state={...state,...patch};emit();};
 const block=(reason,invalidatePermissions=true)=>{blockedReason=reason;update({status:'blocked',reason,...(invalidatePermissions?{permissionVerified:false}:{}),pending:displayPending(pending,pendingRevision)});};
 const assertCurrent=token=>{if(token!==epoch)throw Error('Muse connection was interrupted or disconnected.');};
 const syncAdapter=s=>{
  const terminalUnavailable=['unavailable','uncertain','closed'].includes(s.status);
  if(terminalUnavailable){pending=null;blockedReason=null;}
  if(s.pending&&!pending){pending={kind:s.pending.approvalId?'approval':'input',...s.pending};pendingRevision++;}
  const status=terminalUnavailable?s.status:blockedReason?'blocked':connecting&&s.status==='idle'?'checking-permissions':s.status;
  update({status,reason:terminalUnavailable?s.reason:blockedReason??s.reason,sessionId:s.sessionId,messages:s.messages,pending:displayPending(pending,pendingRevision),permissionVerified:terminalUnavailable?false:state.permissionVerified});
 };
 const release=async()=>{
  const old=owner;owner=null;
  if(!old)return 'not-started';
  try{await bounded(old.close(),timeoutMs+2500);return 'confirmed';}
  catch{return 'unconfirmed';}
 };
 const disconnect=async(reason='Disconnected. Connect again to start a new Muse session.')=>{
  if(closing){await closing;return snapshot();}
  if(!owner&&!connecting&&state.cleanup==='unconfirmed')return snapshot();
  const token=++epoch;connecting=false;sending=false;deciding=false;blockedReason=null;pending=null;
  unsubscribe?.();unsubscribe=null;adapter?.disconnect('disconnected');adapter=null;
  closing=Promise.resolve().then(release);
  update({status:'unavailable',reason,sessionId:null,pending:null,permissionVerified:false,permissionProfile:null,cleanup:'pending'});
  const cleanup=await closing;closing=null;
  if(token===epoch)update({cleanup,...(cleanup==='unconfirmed'?{reason:'Muse shutdown could not be confirmed. Check the native process before reconnecting.'}:{})});
  return snapshot();
 };

 const closePermissionGate=async()=>{
  const token=epoch;blockedReason=permissionReason;pending=null;
  unsubscribe?.();unsubscribe=null;adapter?.disconnect('permissions-unverified');adapter=null;
  closing=Promise.resolve().then(release);
  update({status:'blocked',reason:permissionReason,permissionVerified:false,sessionId:null,pending:null,cleanup:'pending'});
  const cleanup=await closing;closing=null;
  if(token===epoch)update({cleanup,...(cleanup==='unconfirmed'?{reason:permissionReason+' Host shutdown could not be confirmed; check the native process before reconnecting.'}:{})});
  return snapshot();
 };

 function receivePending(value) {
  if(!state.permissionVerified||!['running','submitting'].includes(adapter?.snapshot().status)){
   void disconnect('An approval or input request arrived after the turn became inactive or uncertain. The session was stopped; inspect partial changes before reconnecting.');
   return false;
  }
  const same=pending?.kind===value.kind&&(value.kind==='approval'?pending.approvalId===value.approvalId:pending.userInputId===value.userInputId);
  if(pending&&!same){
   void disconnect('Muse sent overlapping approval or input requests. This version cannot reconcile them; the session was stopped without deciding either request.');
   return false;
  }
  pending=structuredClone(value);pendingRevision++;return true;
 }

 function observe(frame) {
  if(!frame?.params||frame.params.sessionId!==state.sessionId)return;
  const p=frame.params;
  if(['session/permissionProfileChanged','session/approvalModeChanged'].includes(frame.method)){
   block('Muse permissions changed. Disconnect and reconnect to verify the selected profile before continuing.');
   // A blocked approval can still belong to an active turn. Stop on every
   // post-start permission change, including while its action is suspended.
   void disconnect('Muse permissions changed. The session was stopped; inspect workspace changes before reconnecting.');
  }
  if(frame.method==='approval/requested'){
   if(!receivePending({kind:'approval',...p}))return;
   block('Muse is waiting for your decision. Review the requested action and choose a one-time response.',false);
  }else if(frame.method==='approval/updated'&&pending?.approvalId===p.approvalId){
   pending={...pending,...structuredClone(p)};pendingRevision++;update({pending:displayPending(pending,pendingRevision)});
  }else if(frame.method==='approval/resolved'&&pending?.approvalId===p.approvalId){
   pending=null;blockedReason=null;syncAdapter(adapter.snapshot());
  }else if(frame.method==='userInput/requested'){
   if(!receivePending({kind:'input',...p}))return;
   block('Muse requested input that this version cannot answer. Disconnect to close the session.',false);
  }
 }

 async function connect({binary=state.binary,workspaceRoot}={}) {
  if(owner||connecting)throw Error('Disconnect the current Muse session before connecting again.');
  if(closing||state.cleanup==='pending')throw Error('Wait for Muse shutdown to finish before reconnecting.');
  if(state.cleanup==='unconfirmed')throw Error('Muse shutdown is unconfirmed. Restart MuseBench after checking the native process.');
  if(typeof binary!=='string'||!isAbsolute(binary))throw Error('Select an absolute path to a trusted official Muse native binary.');
  if(platform==='win32'&&!binary.toLowerCase().endsWith('.exe'))throw Error('Select the native muse.exe, not a .cmd or PowerShell installer/launcher.');
  if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('Select an absolute project workspace first.');
  const token=++epoch;connecting=true;blockedReason=null;pending=null;
  update({status:'connecting',reason:'Checking the selected Muse installation.',binary,sessionId:null,messages:[],pending:null,permissionVerified:false,permissionProfile:null,cleanup:undefined});
  let openedSession;
  try{
   binary=await realpath(binary);workspace=await realpath(workspaceRoot);assertCurrent(token);
   if(!(await stat(binary)).isFile()||!(await stat(workspace)).isDirectory())throw Error('The selected native binary or workspace is unavailable.');
   const {sdk,sdkVersion}=await loadSdk();assertCurrent(token);
   if(sdkVersion!==TARGET.sdkVersion||sdk?.EXPECTED_SCHEMA_FINGERPRINT!==TARGET.fingerprint||typeof sdk.spawnMspConnection!=='function')throw Error('The installed SDK version or fingerprint does not match MuseBench’s pinned compatibility contract.');
   const version=await bounded(probeVersion(binary,{environment:childEnvironment,timeoutMs}),timeoutMs);assertCurrent(token);
   if(version!==TARGET.hostVersion)throw Error(`Muse version mismatch: this app requires ${TARGET.hostVersion}.`);
   update({binary,hostVersion:version});assertCurrent(token);
   const handshake=sdk.spawnMspConnection({command:binary,args:['serve'],cwd:workspace,env:{...childEnvironment},shutdownTimeoutMs:timeoutMs});
   owner=handshake;
   const host=await bounded(handshake.initialize({clientInfo:{name:'musebench',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:false}}),timeoutMs);assertCurrent(token);
   owner=host;
   const gate=compatibility({sdkVersion,initializeResult:host.initializeResult});
   if(!gate.available)throw Error(gate.reason==='sandbox-unverified'?sandboxFailureReason(host.initializeResult,platform):`Muse compatibility check failed: ${gate.reason}.`);
   const raw=host.connection;
   if(!raw||!['request','command','mintCommandId','onNotification','onServerRequest','onProtocolError'].every(name=>typeof raw[name]==='function'))throw Error('The Muse SDK connection is incomplete.');
   const connection={
    mintCommandId:()=>raw.mintCommandId(),
    command:async(method,params,options)=>{
     const actual=method==='session/start'?{...params,permissionProfile:':ask-me',approvalMode:'onRequest'}:params;
     const result=await raw.command(method,actual,options);
     if(method==='session/start')openedSession=result?.session;
     return result;
    },
    onNotification:fn=>raw.onNotification(frame=>{
     observe(frame);
     // Runtime owns interactive approval state. Keep the preserved message
     // adapter running so it can fold the continuation after explicit consent.
     if(!['approval/requested','approval/updated','approval/resolved','userInput/requested'].includes(frame.method))fn(frame);
    }),
    onProtocolError:fn=>raw.onProtocolError(fn),
    onServerRequest:fn=>raw.onServerRequest(async request=>{
     if(request.params?.sessionId===state.sessionId&&['approval/request','userInput/request'].includes(request.method)){
      if(!receivePending({kind:request.method==='approval/request'?'approval':'input',...request.params}))return {};
      block(pending.kind==='approval'?'Muse is waiting for your decision. Review the requested action and choose a one-time response.':'Muse requested input that this version cannot answer. Disconnect to close the session.',false);
      return {}; // Protocol receipt only; the user decides in a separate action.
     }
     return await fn(request);
    }),
   };
   adapter=new MuseSessionAdapter({connection,sdkVersion,initializeResult:host.initializeResult,timeoutMs});
   unsubscribe=adapter.subscribe(syncAdapter);
   Promise.resolve(host.exited).then(()=>{if(token===epoch&&owner===host)void disconnect('Muse exited. Inspect any partial workspace changes, then reconnect.');},()=>{if(token===epoch&&owner===host)void disconnect('Muse host state is unknown. Inspect workspace changes before reconnecting.');});
   if(host.initializeResult.experimentalApi!==true)return await closePermissionGate();
   let catalog;
   try{catalog=await bounded(raw.request('permissionProfile/list',{}),timeoutMs);}
   catch{assertCurrent(token);return await closePermissionGate();}
   assertCurrent(token);
   const profile=catalog?.profiles?.find(p=>p?.profileId===':ask-me'&&p.available===true&&p.reviewerAuthority==='human');
   if(!profile)return await closePermissionGate();
   await adapter.open(workspace);assertCurrent(token);
   if(!provesAskMe(openedSession,workspace,adapter.snapshot().sessionId)){
    try{openedSession=(await bounded(raw.request('session/read',{sessionId:adapter.snapshot().sessionId}),timeoutMs))?.session;}
    catch{assertCurrent(token);return await closePermissionGate();}
   }
   assertCurrent(token);
   if(!provesAskMe(openedSession,workspace,adapter.snapshot().sessionId))return await closePermissionGate();
   connecting=false;
   update({status:'idle',reason:null,permissionVerified:true,permissionProfile:':ask-me',permissionDescription:'Ask me: workspace and temporary-file writes in the OS sandbox; human review of actions that require approval. Planning instructions are not a read-only boundary.'});
   return snapshot();
  }catch(error){
   if(token===epoch){
    unsubscribe?.();unsubscribe=null;adapter?.disconnect('connection-failed');adapter=null;
    closing=Promise.resolve().then(release);update({cleanup:'pending'});const cleanup=await closing;closing=null;
    if(token===epoch)update({status:'unavailable',reason:error.message,permissionVerified:false,pending:null,cleanup});
   }
   throw error;
  }finally{if(token===epoch)connecting=false;}
 }

 async function send({text,mode='chat',runOptions}={}) {
  const options=validateRunOptions(runOptions);
  if(options.reasoning!=='high'||options.approval!=='ask'||options.budget&&options.budget!=='standard')throw Error('These run options require the Windows native exec connection.');
  if(typeof text!=='string'||!text.trim()||text.length>20000||!['chat','plan'].includes(mode))throw Error('Enter a message up to 20,000 characters and a supported chat or plan mode.');
  if(!owner||!adapter||connecting||sending||blockedReason||!state.permissionVerified||!usable.has(state.status))throw Error('Muse is blocked or its permissions have not been verified. Connect a compatible session first.');
  const token=epoch;sending=true;
  update({status:'checking-permissions',reason:null});
  try{
   assertCurrent(token);
   let session;
   try{session=(await bounded(owner.connection.request('session/read',{sessionId:state.sessionId}),timeoutMs))?.session;}
   catch{assertCurrent(token);block(permissionReason);throw Error(permissionReason);}
   assertCurrent(token);
   if(blockedReason||!provesAskMe(session,workspace,state.sessionId)){block(permissionReason);throw Error(permissionReason);}
   await adapter.send({text:text.trim(),mode});assertCurrent(token);
   return snapshot();
  }finally{if(token===epoch)sending=false;}
 }

 async function decide(decision) {
  if(deciding)throw Error('An approval decision is already in progress.');
  if(!state.permissionVerified||!['running','submitting'].includes(adapter?.snapshot().status))throw Error('The approval is no longer active or its permission state is uncertain. Disconnect before continuing.');
  if(!owner||pending?.kind!=='approval'||pending.sessionId!==state.sessionId)throw Error('There is no current approval request to deny.');
  const requirement=pending.currentRequirementId;
  let choice;
  if(decision==='deny')choice=pending.availableChoices?.find(c=>c.decision==='denied'&&c.scope==='once')??pending.availableChoices?.find(c=>c.decision==='abort'&&c.scope==='once');
  else{
   let selected;
   try{selected=JSON.parse(decision);}catch{throw Error('Unsupported decision. Choose a currently offered one-time response.');}
   if(selected?.sessionId!==pending.sessionId||selected.approvalId!==pending.approvalId||selected.sourceIndex!==requirement?.sourceIndex||selected.revision!==pendingRevision)throw Error('This approval choice is stale because the request changed. Review its current details.');
   choice=pending.availableChoices?.find(c=>c.choiceId===selected.choiceId&&c.scope==='once'&&['approved','denied','abort'].includes(c.decision));
  }
  if(!choice||typeof choice.choiceId!=='string'||requirement?.approvalId!==pending.approvalId||!Number.isInteger(requirement.sourceIndex)||requirement.sourceIndex<0)throw Error('Muse did not offer a supported one-time choice. Disconnect to stop this session.');
  const token=epoch;deciding=true;
  try{
   await bounded(owner.connection.command('approval/decide',{sessionId:state.sessionId,approvalId:pending.approvalId,choiceId:choice.choiceId,requirementId:structuredClone(requirement)},{maxAttempts:1}),timeoutMs);
   assertCurrent(token);
   if(choice.decision==='approved')return snapshot(); // Still blocked until approval/resolved.
   return await disconnect('Denial sent and the session closed. Inspect partial changes before reconnecting.');
  }catch(error){
   if(token===epoch)await disconnect('The approval outcome is unknown. The session was closed; inspect partial changes before reconnecting.');
   throw error;
  }finally{if(token===epoch)deciding=false;}
 }

 return {snapshot,subscribe:fn=>{if(typeof fn!=='function')throw Error('A listener function is required.');listeners.add(fn);return()=>listeners.delete(fn);},connect,disconnect:()=>disconnect(),send,decide,close:()=>disconnect()};
}
