import {inputPrompt,validateInputAnswers} from '../shared/user-input.mjs';
import {childWorking} from '../shared/child-actions.mjs';
import {createChildTracker} from './children.mjs';
import {projectChildRead} from './child-inspection.mjs';
import {projectMcpInventory} from './mcp-inventory.mjs';
import {createCompactionTracker} from './compaction.mjs';
import {checkConfiguration} from './configuration-review.mjs';
import {validateRunOptions} from '../shared/run-options.mjs';
import {normalizeModels,modelForOptions} from '../shared/models.mjs';
import {execFile} from 'node:child_process';
import {readFile, realpath, stat, open, lstat} from 'node:fs/promises';
import {realpathSync, statSync, openSync, fstatSync, readSync, closeSync} from 'node:fs';
import {createRequire} from 'node:module';
import {delimiter, dirname, isAbsolute, join} from 'node:path';
import {promisify} from 'node:util';
import {TARGET, compatibility} from '../../reference/patchlight/adapter/compatibility.mjs';
import {MuseSessionAdapter} from '../../reference/patchlight/adapter/session-adapter.mjs';

export const SETUP_URL='https://dev.meta.ai/docs/muse-code';
const require=createRequire(import.meta.url);
const execFileAsync=promisify(execFile);
const environmentNames=['PATH','PATHEXT','PSModulePath','SystemRoot','SystemDrive','windir','COMSPEC','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramW6432','CommonProgramFiles','CommonProgramFiles(x86)','CommonProgramW6432','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','USERNAME','USERDOMAIN','HOME','TMPDIR','LANG','LC_ALL','LC_CTYPE','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'];
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

/** Pass OS essentials and the host's command/module lookup paths. Native Muse
 * owns its stored credentials; unrelated API keys, Node startup hooks and
 * execution-policy overrides never cross here. */
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
 if(platform!=='win32'){
  if(env.HOME&&isAbsolute(env.HOME))folders.push(join(env.HOME,'.local','bin'));
  folders.push('/usr/local/bin',...(platform==='darwin'?['/opt/homebrew/bin']:[]));
 }
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
 const p={...structuredClone(value),revision};
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
export function createRuntime({credentials,environment=process.env,platform=process.platform,loadSdk=loadInstalledSdk,probeVersion=probeInstalledVersion,workspaceMcp,extensionReview,verifyConfiguration=checkConfiguration,timeoutMs=10000}={}) {
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid runtime timeout.');
 const candidates=discoverMuseBinaries({environment,platform});
 const childEnvironment=curateEnvironment(environment);let credentialContext=null;
 let state={transport:'msp',status:'unavailable',reason:candidates.length?'Select Connect to verify your trusted official Muse executable.':'Install Muse from the official setup page, then select its native executable to connect.',binary:candidates[0]??null,sdkVersion:TARGET.sdkVersion,sessionId:null,liveVerified:false,messages:[],pending:null,setupUrl:SETUP_URL,permissionVerified:false,permissionProfile:null,planReadOnlyEnforced:false};
 let owner=null,adapter=null,unsubscribe=null,epoch=0,connecting=false,sending=false,steering=false,deciding=false,closing=null,blockedReason=null,pending=null,pendingRevision=0,workspace=null;
 const deferredInputs=new Map(),settledInputs=new Set(),settledApprovals=new Set();
 const requests=new Map(),inputResponses=new Map(),approvalAttempts=new Set();
 const restoreAwaiting=new Set();let openingEvents=[],nativeCatalog=null,modelReading=false;
 const requestKey=p=>p.kind+':'+(p.kind==='approval'?p.approvalId:p.userInputId);
 const pendingView=()=>[...requests.values()].map(({value,revision})=>displayPending(value,revision));
 const refreshPending=()=>{const first=requests.values().next().value;pending=first?.value??null;pendingRevision=first?.revision??pendingRevision;};
 const clearPending=()=>{requests.clear();pending=null;};
 const putPending=value=>{const key=requestKey(value),old=requests.get(key);if(!old||JSON.stringify(old.value)!==JSON.stringify(value))requests.set(key,{value:structuredClone(value),revision:++revisionCounter});refreshPending();};
 const removePending=key=>{requests.delete(key);restoreAwaiting.delete(key);refreshPending();blockedReason=pending?'Muse is waiting for your decision or answer.':restoreAwaiting.size?'Restoring pending native requests.':null;};
 const publishInput=receipt=>{inputResponses.set(receipt.userInputId,receipt);while(inputResponses.size>128){const old=[...inputResponses.keys()].find(id=>!requests.has('input:'+id));if(!old)break;inputResponses.delete(old);}update({inputResponse:receipt,inputResponses:[...inputResponses.values()]});};
 let revisionCounter=0;
 let awaitingChildReport=false,lastTerminal=null;
 const children=createChildTracker(),childCommands=new Set(),uncertainChildren=new Set(),childWork=new Map();
 const childReads=new Set();
 let mcpReadEpoch=null;
 const compaction=createCompactionTracker();let compactionTimer;
 const listeners=new Set();
 const snapshot=()=>structuredClone({...state,connectionEpoch:epoch});
 const emit=()=>{for(const fn of listeners){try{fn(snapshot());}catch{/* A renderer observer is never a protocol authority. */}}};
 const update=patch=>{state={...state,...patch,pendingRequests:pendingView()};emit();};
 const syncChildren=()=>{const view=children.snapshot();if(usable.has(adapter?.snapshot().status)&&view.items.some(childWorking))awaitingChildReport=true;for(const [key,target] of childWork){const i=view.items.find(i=>i.itemId===target.itemId);if(i&&i.revision>target.revision&&childWorking(i))childWork.delete(key);}update({children:view,childrenBusy:view.items.some(childWorking)||childWork.size>0||awaitingChildReport,childWorkPending:childWork.size});if(adapter)syncAdapter(adapter.snapshot());};
 const interruptChildCommands=()=>update({childReceipts:(state.childReceipts??[]).map(r=>r.status==='submitting'?{...r,status:'unknown',reason:'Connection lost before command admission was confirmed.'}:r)});
 const syncCompaction=()=>{const receipt=compaction.snapshot();if(!compaction.pending())clearTimeout(compactionTimer);update({compaction:receipt,operationBusy:compaction.pending()});};
 const block=(reason,invalidatePermissions=true)=>{blockedReason=reason;update({status:'blocked',reason,...(invalidatePermissions?{permissionVerified:false}:{}),pending:displayPending(pending,pendingRevision)});};
 const assertCurrent=token=>{if(token!==epoch)throw Error('Muse connection was interrupted or disconnected.');};
 const syncAdapter=s=>{
  const terminalUnavailable=['unavailable','uncertain','closed'].includes(s.status);
  if(terminalUnavailable){childReads.clear();state={...state,childInspections:[]};clearPending();blockedReason=null;interruptChildCommands();clearTimeout(compactionTimer);compaction.interrupt('Connection lost before compaction was confirmed.');syncCompaction();}
  if(s.pending&&!pending){putPending({kind:s.pending.approvalId?'approval':'input',...s.pending});}
  const terminal=['completed','failed','cancelled'].includes(s.status)?`${s.turnId}:${s.status}`:null;
  if(terminal&&terminal!==lastTerminal){for(const [key,target] of childWork){const i=children.snapshot().items.find(i=>i.itemId===target.itemId);if(i&&i.revision>target.revision&&!childWorking(i))childWork.delete(key);}lastTerminal=terminal;awaitingChildReport=children.snapshot().items.some(childWorking)||childWork.size>0;}
  const childrenActive=children.snapshot().items.some(childWorking)||childWork.size>0;
  const childrenBusy=childrenActive||awaitingChildReport;
  const status=terminalUnavailable?s.status:blockedReason?'blocked':connecting&&s.status==='idle'?'checking-permissions':terminal&&childrenBusy?'running':s.status;
  update({status,childrenBusy,childWorkPending:childWork.size,foregroundActive:s.status==='running',rootTurnId:s.rootTurnId,ownedTurnIds:s.ownedTurnIds,ownedRunIds:s.ownedTurnIds,reason:terminalUnavailable?s.reason:blockedReason??s.reason,sessionId:s.sessionId,turnId:s.turnId,runId:s.turnId,nativeSessionId:s.sessionId,inputAccepted:!!s.turnId,sessionSeeded:state.sessionSeeded||!!s.turnId||s.restoration?.status==='restored',restoration:s.restoration??null,restoringRequests:restoreAwaiting.size,restoredMessages:s.restoredMessages??[],viewCursor:s.viewCursor,cleanup:['completed','failed','cancelled'].includes(status)?'confirmed':undefined,liveVerified:state.liveVerified||status==='completed',messages:s.messages,pending:displayPending(pending,pendingRevision),permissionVerified:terminalUnavailable?false:state.permissionVerified});
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
  interruptChildCommands();clearTimeout(compactionTimer);compaction.interrupt('Disconnected before compaction was confirmed.');syncCompaction();
  const token=++epoch;connecting=false;sending=false;deciding=false;blockedReason=null;clearPending();
  unsubscribe?.();unsubscribe=null;adapter?.disconnect('disconnected');adapter=null;
  closing=Promise.resolve().then(release);
  childReads.clear();
  update({status:'unavailable',reason,fullAccess:false,sessionSeeded:false,sessionId:null,pending:null,permissionVerified:false,permissionProfile:null,cleanup:'pending',childInspections:[]});
  const cleanup=await closing;closing=null;
  if(token===epoch)update({cleanup,childrenBusy:cleanup==='unconfirmed',...(cleanup==='unconfirmed'?{reason:'Muse shutdown could not be confirmed. Check the native process before reconnecting.'}:{})});
  return snapshot();
 };

 const closePermissionGate=async()=>{
  const token=epoch;blockedReason=permissionReason;clearPending();
  unsubscribe?.();unsubscribe=null;adapter?.disconnect('permissions-unverified');adapter=null;
  closing=Promise.resolve().then(release);
  childReads.clear();
  update({status:'blocked',reason:permissionReason,permissionVerified:false,sessionId:null,pending:null,cleanup:'pending',childInspections:[]});
  const cleanup=await closing;closing=null;
  if(token===epoch)update({cleanup,...(cleanup==='unconfirmed'?{reason:permissionReason+' Host shutdown could not be confirmed; check the native process before reconnecting.'}:{})});
  return snapshot();
 };

 function receivePending(value) {
  if(value.kind==='input'&&settledInputs.has(value.userInputId)||value.kind==='approval'&&settledApprovals.has(value.approvalId))return false;
  if(value.kind==='input'&&state.permissionVerified&&adapter?.snapshot().status==='submitting'){
   if(!inputPrompt(value)||deferredInputs.size>=32){void disconnect('Unsupported native question sequence.');return false;}
   deferredInputs.set(value.userInputId,structuredClone(value));return false;
  }
  if(!state.permissionVerified||!['running','submitting'].includes(adapter?.snapshot().status)){
   void disconnect('An approval or input request arrived after the turn became inactive or uncertain. The session was stopped; inspect partial changes before reconnecting.');
   return false;
  }
  if(value.kind==='input'&&(!inputPrompt(value)||value.turnId!==adapter.snapshot().turnId)){void disconnect('Unsupported or stale native question. No answer was sent.');return false;}
  if(!['approval','input'].includes(value.kind)||typeof (value.approvalId??value.userInputId)!=='string'||(value.approvalId??value.userInputId).length>200||JSON.stringify(value).length>262144||!requests.has(requestKey(value))&&requests.size>=32){void disconnect('Native request limit or invalid identity. No decision was sent.');return false;}
  const previous=requests.get(requestKey(value))?.value;if(value.kind==='approval'&&Number.isInteger(previous?.currentRequirementId?.sourceIndex)&&value.currentRequirementId?.sourceIndex<previous.currentRequirementId.sourceIndex)return false;
  restoreAwaiting.delete(requestKey(value));putPending(value);return true;
 }

 function observe(frame) {
  if(!frame?.params||frame.params.sessionId!==state.sessionId)return;
  const p=frame.params;
  if(['item/started','item/updated','item/completed'].includes(frame.method)&&['subagent','workflow'].includes(p.item?.kind)){children.observe(p.item);syncChildren();}
  if(['item/started','item/updated','item/completed'].includes(frame.method)&&p.item?.kind==='compaction'){compaction.observe(p.item);syncCompaction();}
  if(['session/permissionProfileChanged','session/approvalModeChanged'].includes(frame.method)){
   block('Muse permissions changed. Disconnect and reconnect to verify the selected profile before continuing.');
   // A blocked approval can still belong to an active turn. Stop on every
   // post-start permission change, including while its action is suspended.
   void disconnect('Muse permissions changed. The session was stopped; inspect workspace changes before reconnecting.');
  }
  if(frame.method==='approval/requested'){
   if(!receivePending({kind:'approval',...p}))return;
   block('Muse is waiting for your decision. Review the requested action and choose a one-time response.',false);
  }else if(frame.method==='approval/updated'&&requests.has('approval:'+p.approvalId)){
   const current=requests.get('approval:'+p.approvalId).value;
   if(receivePending({...current,...structuredClone(p),kind:'approval'}))update({pending:displayPending(pending,pendingRevision)});
  }else if(frame.method==='approval/resolved'){
   if(typeof p.approvalId!=='string'||p.approvalId.length>200)return;
   if(settledApprovals.size>=4096){void disconnect('Native approval history limit reached.');return;}
   settledApprovals.add(p.approvalId);removePending('approval:'+p.approvalId);syncAdapter(adapter.snapshot());  }else if(frame.method==='userInput/requested'){
   if(!receivePending({kind:'input',...p}))return;
   block('Muse is waiting for your answer.',false);
  }else if(frame.method==='userInput/settled'){
   if(typeof p.userInputId!=='string'||p.userInputId.length>200)return;
   if(settledInputs.size>=4096&&!settledInputs.has(p.userInputId)){void disconnect('Native question history limit reached. Reconnect before continuing.');return;}
   settledInputs.add(p.userInputId);
   const request=requests.get('input:'+p.userInputId)?.value??deferredInputs.get(p.userInputId);
   deferredInputs.delete(p.userInputId);
   // A restored pointer may settle before its full request is reissued.
   removePending('input:'+p.userInputId);
   if(request){
    const previous=inputResponses.get(p.userInputId)??{};
    const receipt={...previous,sessionId:request.sessionId,userInputId:request.userInputId,turnId:request.turnId,prompt:structuredClone(request),status:'settled',outcome:p.outcome};
    if(p.outcome==='answered')try{validateInputAnswers(request,{...request,revision:1,operation:'answer',answers:p.answers});receipt.confirmedAnswers=structuredClone(p.answers);}catch{/* Invalid settlement is never replayed as a confirmed answer. */}
    publishInput(receipt);
   }
   syncAdapter(adapter.snapshot());
  }
 }

 async function connect({binary=state.binary,workspaceRoot,fullAccess=false,sessionId=null,workspaceTools=false}={}) {
  if(typeof fullAccess!=='boolean')throw Error('Full access must be explicitly selected.');
  if(typeof workspaceTools!=='boolean'||workspaceTools&&typeof workspaceMcp!=='function')throw Error('Reviewed workspace tools are unavailable.');
  if(sessionId!==null&&(typeof sessionId!=='string'||!sessionId||sessionId.length>200))throw Error('Invalid native session identity.');
  if(owner||connecting)throw Error('Disconnect the current Muse session before connecting again.');
  if(closing||state.cleanup==='pending')throw Error('Wait for Muse shutdown to finish before reconnecting.');
  if(state.cleanup==='unconfirmed')throw Error('Muse shutdown is unconfirmed. Restart MuseBench after checking the native process.');
  if(typeof binary!=='string'||!isAbsolute(binary))throw Error('Select an absolute path to a trusted official Muse native binary.');
  if(platform==='win32'&&!binary.toLowerCase().endsWith('.exe'))throw Error('Select the native muse.exe, not a .cmd or PowerShell installer/launcher.');
  if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('Select an absolute project workspace first.');
  const preserveReceipts=sessionId&&state.nativeSessionId===sessionId;
  const token=++epoch;connecting=true;blockedReason=null;clearPending();restoreAwaiting.clear();openingEvents=[];nativeCatalog=null;deferredInputs.clear();if(!preserveReceipts){settledInputs.clear();settledApprovals.clear();inputResponses.clear();approvalAttempts.clear();uncertainChildren.clear();update({inputResponse:null,inputResponses:[],childReceipts:[],steering:null});}childReads.clear();update({childInspections:[]});compaction.reset();children.reset();awaitingChildReport=false;lastTerminal=null;childCommands.clear();childWork.clear();update({children:children.snapshot(),childrenBusy:false,childWorkPending:0});syncCompaction();
  update({status:'connecting',reason:'Checking the selected Muse installation.',binary,fullAccess,workspaceTools,sessionSeeded:false,sessionId:null,messages:[],restoredMessages:[],restoration:null,modelCatalog:undefined,modelId:null,pending:null,permissionVerified:false,permissionProfile:null,cleanup:undefined});
  let openedSession;
  try{
   binary=await realpath(binary);workspace=await realpath(workspaceRoot);assertCurrent(token);
   if(!(await stat(binary)).isFile()||!(await stat(workspace)).isDirectory())throw Error('The selected native binary or workspace is unavailable.');
   const {sdk,sdkVersion}=await loadSdk();assertCurrent(token);
   if(sdkVersion!==TARGET.sdkVersion||sdk?.EXPECTED_SCHEMA_FINGERPRINT!==TARGET.fingerprint||typeof sdk.spawnMspConnection!=='function')throw Error('The installed SDK version or fingerprint does not match MuseBench’s pinned compatibility contract.');
   const version=await bounded(probeVersion(binary,{environment:childEnvironment,timeoutMs}),timeoutMs);assertCurrent(token);
   if(version!==TARGET.hostVersion)throw Error(`Muse version mismatch: this app requires ${TARGET.hostVersion}.`);
   update({binary,hostVersion:version});assertCurrent(token);
   credentialContext=await credentials?.({binary,environment:childEnvironment});assertCurrent(token);update({billingSource:credentialContext?.source??'cli'});
   await verifyConfiguration({environment:credentialContext?.environment??childEnvironment,platform,workspaceRoot:workspace,extensionReview});assertCurrent(token);
   const trustProject=await extensionReview?.allowProject(workspace)===true;assertCurrent(token);
   const hooks=await extensionReview?.nativeHooks(workspace)??{};assertCurrent(token);
   const handshake=sdk.spawnMspConnection({command:binary,args:['serve',...(fullAccess?['--disable-sandbox']:[]),...(trustProject?['--trust-workspace']:[]),'-c','hooks='+JSON.stringify(hooks),'-c','managed_hooks_path=null'],cwd:workspace,env:{...(credentialContext?.environment??childEnvironment)},shutdownTimeoutMs:timeoutMs});
   owner=handshake;
   const host=await bounded(handshake.initialize({clientInfo:{name:'musebench',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:true,...(workspaceTools?{requestedCapabilities:['sessionMcp']}:{})}}),timeoutMs);assertCurrent(token);
   owner=host;
   const gate=compatibility({sdkVersion,initializeResult:host.initializeResult,fullAccess});
   if(!gate.available)throw Error(gate.reason==='sandbox-unverified'?sandboxFailureReason(host.initializeResult,platform):`Muse compatibility check failed: ${gate.reason}.`);
   const raw=host.connection;
   if(!raw||!['request','command','mintCommandId','onNotification','onServerRequest','onProtocolError'].every(name=>typeof raw[name]==='function'))throw Error('The Muse SDK connection is incomplete.');
   let sessionConfig,openingCommandId;
   if(workspaceTools){
    if(!host.initializeResult.grantedCapabilities?.includes('sessionMcp'))throw Error('Native host did not grant the sessionMcp capability.');
    const server=await workspaceMcp(workspace);assertCurrent(token);
    if(server?.transport!=='stdio'||typeof server.command!=='string'||!server.command||!Array.isArray(server.args)||server.args.some(a=>typeof a!=='string')||JSON.stringify(server).length>16384)throw Error('Invalid trusted workspace MCP configuration.');
    sessionConfig={mcpServers:{musebench_workspace:structuredClone(server)}};
   }
   const holdOpening=entry=>{if(openingEvents.length>=128)throw Error('Native startup event limit reached.');openingEvents.push(structuredClone(entry));};
   let notificationHandler;
   const routeNotification=frame=>{if(openingCommandId&&frame.params?.commandId===openingCommandId&&['session/approvalModeChanged','session/permissionProfileChanged'].includes(frame.method))return;observe(frame);if(!['approval/requested','approval/updated','approval/resolved','userInput/requested','userInput/settled'].includes(frame.method))notificationHandler(frame);};
   const routeRequest=request=>{
    if(request.params?.sessionId!==state.sessionId)throw Error('Foreign request during native restoration.');
    if(!receivePending({kind:request.method==='approval/request'?'approval':'input',...request.params}))return {};
    block(pending.kind==='approval'?'Muse is waiting for your decision. Review the requested action and choose a one-time response.':'Muse is waiting for your answer.',false);return {};
   };
   const connection={
    mintCommandId:()=>raw.mintCommandId(),
    command:async(method,params,options)=>{
     const actual=method==='session/start'?{...params,permissionProfile:':ask-me',approvalMode:'onRequest',...(sessionConfig?{config:sessionConfig}:{})}:method==='session/resume'?{...params,...(sessionConfig?{config:sessionConfig}:{})}:method==='turn/start'?{...params,reasoningEffort:state.runOptions?.reasoning??'high'}:params;
     if(['session/start','session/resume'].includes(method)){openingCommandId=options?.commandId??raw.mintCommandId();options={...options,commandId:openingCommandId};}
     const result=await raw.command(method,actual,options);
     if(['session/start','session/resume'].includes(method))openedSession=result?.session;
     return result;
    },
    onNotification:fn=>{notificationHandler=fn;raw.onNotification(frame=>{if(connecting){try{holdOpening({kind:'notification',frame});}catch(error){void disconnect(error.message);}return;}routeNotification(frame);});},
    onProtocolError:fn=>raw.onProtocolError(fn),
    onServerRequest:fn=>raw.onServerRequest(async request=>{
     if(connecting&&['approval/request','userInput/request'].includes(request.method)){holdOpening({kind:'request',frame:request});return {};}
     if(request.params?.sessionId===state.sessionId&&['approval/request','userInput/request'].includes(request.method)){
      return routeRequest(request); // Protocol receipt only; the user decides separately.
     }
     return await fn(request);
    }),
   };
   adapter=new MuseSessionAdapter({connection,sdkVersion,initializeResult:host.initializeResult,fullAccess,allowContinuation:s=>children.snapshot().items.some(i=>s.ownedTurnIds?.includes(i.turnId)),timeoutMs});
   unsubscribe=adapter.subscribe(syncAdapter);
   Promise.resolve(host.exited).then(()=>{if(token===epoch&&owner===host)void disconnect('Muse exited. Inspect any partial workspace changes, then reconnect.');},()=>{if(token===epoch&&owner===host)void disconnect('Muse host state is unknown. Inspect workspace changes before reconnecting.');});
   if(host.initializeResult.experimentalApi!==true)return await closePermissionGate();
   let catalog;
   try{catalog=await bounded(raw.request('permissionProfile/list',{}),timeoutMs);}
   catch{assertCurrent(token);return await closePermissionGate();}
   assertCurrent(token);
   const profile=catalog?.profiles?.find(p=>p?.profileId===':ask-me'&&p.available===true&&p.reviewerAuthority==='human');
   if(!profile)return await closePermissionGate();
   await adapter.open(workspace,{sessionId});assertCurrent(token);
   if(sessionId&&(openedSession?.providerId!=='meta'||typeof openedSession.modelId!=='string'||!openedSession.modelId))throw Error('Restored native session has no supported Meta model route. No turn was sent.');
   try{const current=(await bounded(raw.request('session/read',{sessionId:adapter.snapshot().sessionId}),timeoutMs))?.session;if(sessionId&&(current?.modelId!==openedSession.modelId||current?.providerId!==openedSession.providerId))throw Error('Restored model routing changed during verification.');openedSession=current;}
   catch{assertCurrent(token);return await closePermissionGate();}
   assertCurrent(token);
   if(!provesAskMe(openedSession,workspace,adapter.snapshot().sessionId))return await closePermissionGate();
   for(const p of adapter.snapshot().restoration?.pendingRequests??[])restoreAwaiting.add((p.kind==='approval'?'approval:':'input:')+(p.approvalId??p.userInputId));
   if(restoreAwaiting.size)blockedReason='Restoring pending native requests.';
   for(const item of adapter.snapshot().restoredChildren??[])children.observe(item);
   connecting=false;
   update({questionsSupported:true,steeringSupported:true,compactionSupported:true,childControlsSupported:true,imagesSupported:true,modelsSupported:true,hooksSupported:true,durableSessions:host.initializeResult.sessionDurability===undefined||host.initializeResult.sessionDurability==='durable',modelId:openedSession?.modelId??null,permissionVerified:true,permissionProfile:':ask-me',permissionDescription:fullAccess?'Interactive Full access: shell filesystem/network sandbox disabled. Ask me human approval remains separate.':'Ask me: workspace and temporary-file writes in the OS sandbox; human review of actions that require approval. Planning instructions are not a read-only boundary.'});
   const held=openingEvents;openingEvents=[];for(const entry of held){assertCurrent(token);if(entry.kind==='request')routeRequest(entry.frame);else routeNotification(entry.frame);}assertCurrent(token);syncChildren();syncAdapter(adapter.snapshot());assertCurrent(token);
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

 async function refreshModels(){
  if(!owner||connecting||sending||modelReading||!usable.has(state.status)||!state.permissionVerified)throw Error('Connect an idle runtime before refreshing models.');
  const token=epoch;modelReading=true;
  try{const value=await bounded(owner.connection.request('model/list',{sessionId:state.sessionId}),timeoutMs);assertCurrent(token);const catalog=normalizeModels(value);nativeCatalog=value;update({modelCatalog:catalog});return catalog;}finally{if(token===epoch)modelReading=false;}
 }
 async function readImages(paths){
  if(!Array.isArray(paths)||paths.length>4)throw Error('Attach up to four screenshots.');let total=0;const images=[];
  for(const path of paths){
   if(typeof path!=='string'||!isAbsolute(path)||(await lstat(path)).isSymbolicLink())throw Error('Screenshot file is unavailable.');
   const handle=await open(path,'r');try{
    const info=await handle.stat();if(!info.isFile()||info.size<8||info.size>7*1024*1024||total+info.size>7*1024*1024)throw Error('Interactive screenshots must total at most 7 MiB.');
    const buffer=Buffer.alloc(info.size+1);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead!==info.size)throw Error('Screenshot changed while reading.');const bytes=buffer.subarray(0,bytesRead);total+=bytesRead;
    const mediaType=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
    if(!mediaType)throw Error('Invalid screenshot image. Choose PNG, JPEG or WebP.');images.push({type:'image',mediaType,base64Data:bytes.toString('base64')});
   }finally{await handle.close();}
  }return images;
 }
 async function send({text,mode='chat',runOptions,imagePaths=[]}={}) {
  const options=validateRunOptions(runOptions);
  if(options.approval!=='ask'||options.budget)throw Error('Interactive mode requires Ask for approval and no exec budget preset.');
  if(typeof text!=='string'||!text.trim()||text.length>64000||!['chat','plan'].includes(mode))throw Error('Enter a prepared request up to 64,000 characters and a supported chat or plan mode.');
  if(!owner||!adapter||connecting||sending||state.childrenBusy||compaction.pending()||blockedReason||!state.permissionVerified||!usable.has(state.status))throw Error('Muse is blocked or its permissions have not been verified. Connect a compatible session first.');
  const credentialEpoch=epoch;if(credentialContext)await credentialContext.verify();assertCurrent(credentialEpoch);
  if(modelReading)throw Error('Wait for the native model catalog.');
  const token=epoch;const images=await readImages(imagePaths);assertCurrent(token);
  await refreshModels();assertCurrent(token);
  const selectedModel=modelForOptions(state.modelCatalog,options);
  if(sending||blockedReason||!usable.has(state.status))throw Error('The session changed before submission.');sending=true;
  update({status:'checking-permissions',reason:null,runOptions:options,steering:null});
  try{
   assertCurrent(token);
   try{await verifyConfiguration({environment:credentialContext?.environment??childEnvironment,platform,workspaceRoot:workspace,extensionReview});assertCurrent(token);}
   catch(error){assertCurrent(token);block(error.message);throw error;}
   let session;
   try{session=(await bounded(owner.connection.request('session/read',{sessionId:state.sessionId}),timeoutMs))?.session;}
   catch{assertCurrent(token);block(permissionReason);throw Error(permissionReason);}
   assertCurrent(token);
   if(blockedReason||!provesAskMe(session,workspace,state.sessionId)){block(permissionReason);throw Error(permissionReason);}
   if(selectedModel){
    const row=nativeCatalog?.models?.find(r=>r.modelId===selectedModel.id&&r.providerId==='meta'&&r.profileId===nativeCatalog.profileId);if(!row)throw Error('Chosen model is unavailable.');
    if(session.modelId!==row.modelId||session.providerId!==row.providerId){
     const commandId=owner.connection.mintCommandId();
     try{const result=await bounded(owner.connection.command('session/setModel',{sessionId:state.sessionId,model:{modelId:row.modelId,providerId:row.providerId,...(row.profileId?{profileId:row.profileId}:{})}},{commandId,maxAttempts:1}),timeoutMs);assertCurrent(token);if(result?.commandId!==commandId||result.status!=='accepted')throw Error('Native model change was not confirmed.');session=(await bounded(owner.connection.request('session/read',{sessionId:state.sessionId}),timeoutMs))?.session;assertCurrent(token);if(session?.modelId!==row.modelId||session?.providerId!==row.providerId||!provesAskMe(session,workspace,state.sessionId))throw Error('Native model selection did not match its read-back.');}
     catch(error){if(token===epoch)block('Native model selection is uncertain. Reconnect and verify it before sending.',false);throw error;}
    }update({modelId:row.modelId});
   }
   await adapter.send({text:text.trim(),mode,images});assertCurrent(token);
   for(const [id,request] of deferredInputs){deferredInputs.delete(id);if(receivePending(request))block('Muse is waiting for your answer.',false);}
   return snapshot();
  }finally{if(token===epoch)sending=false;}
 }

 async function decide(decision) {
  let selected;if(decision!=='deny')try{selected=JSON.parse(decision);}catch{throw Error('Unsupported decision. Choose a current one-time response.');}
  const entry=decision==='deny'?requests.values().next().value:requests.get('approval:'+selected?.approvalId);
  const pending=entry?.value,pendingRevision=entry?.revision;
  if(deciding)throw Error('An approval decision is already in progress.');
  if(!state.permissionVerified||!['running','submitting'].includes(adapter?.snapshot().status))throw Error('The approval is no longer active or its permission state is uncertain. Disconnect before continuing.');
  if(!owner||pending?.kind!=='approval'||pending.sessionId!==state.sessionId)throw Error('There is no current approval request to deny.');
  const requirement=pending.currentRequirementId;
  let choice;
  if(decision==='deny')choice=pending.availableChoices?.find(c=>c.decision==='denied'&&c.scope==='once')??pending.availableChoices?.find(c=>c.decision==='abort'&&c.scope==='once');
  else{
   if(selected?.sessionId!==pending.sessionId||selected.approvalId!==pending.approvalId||selected.sourceIndex!==requirement?.sourceIndex||selected.revision!==pendingRevision)throw Error('This approval choice is stale because the request changed. Review its current details.');
   choice=pending.availableChoices?.find(c=>c.choiceId===selected.choiceId&&c.scope==='once'&&['approved','denied','abort'].includes(c.decision));
  }
  if(!choice||typeof choice.choiceId!=='string'||requirement?.approvalId!==pending.approvalId||!Number.isInteger(requirement.sourceIndex)||requirement.sourceIndex<0)throw Error('Muse did not offer a supported one-time choice. Disconnect to stop this session.');
  const attempt=`${pending.approvalId}:${requirement.sourceIndex}`;if(approvalAttempts.has(attempt))throw Error('The previous approval is pending or already submitted.');approvalAttempts.add(attempt);
  const token=epoch;deciding=true;
  try{
   await bounded(owner.connection.command('approval/decide',{sessionId:state.sessionId,approvalId:pending.approvalId,choiceId:choice.choiceId,requirementId:structuredClone(requirement)},{maxAttempts:1}),timeoutMs);
   assertCurrent(token);
   if(decision!=='deny')return snapshot(); // Each explicit choice waits for its own approval/resolved.
   return await disconnect('Denial sent and the session closed. Inspect partial changes before reconnecting.');
  }catch(error){
   if(token===epoch)await disconnect('The approval outcome is unknown. The session was closed; inspect partial changes before reconnecting.');
   throw error;
  }finally{if(token===epoch)deciding=false;}
 }

 async function answerInput(input={}){
  const entry=requests.get('input:'+input.userInputId),pending=entry?.value,pendingRevision=entry?.revision;
  if(!owner||!state.permissionVerified||!['running','submitting'].includes(adapter?.snapshot().status)||pending?.kind!=='input')throw Error('There is no active native question.');
  if(input.sessionId!==state.sessionId||input.userInputId!==pending.userInputId||input.turnId!==pending.turnId||input.revision!==pendingRevision)throw Error('The question changed. Review the current request.');
  if(input.operation==='engage'){validateInputAnswers(pending,input);owner.connection.notify('userInput/engaged',{sessionId:pending.sessionId,userInputId:pending.userInputId});return snapshot();}
  if(deciding||['submitting','accepted','unknown'].includes(inputResponses.get(pending.userInputId)?.status))throw Error('The previous answer is pending or already submitted.');
  validateInputAnswers(pending,input);
  const token=epoch,commandId=owner.connection.mintCommandId(),request=structuredClone(pending),receipt={commandId,sessionId:request.sessionId,turnId:request.turnId,userInputId:request.userInputId,prompt:request,operation:input.operation,submittedAnswers:structuredClone(input.answers??[]),status:'submitting'};deciding=true;publishInput(receipt);
  try{
   const ack=await bounded(owner.connection.command(input.operation==='cancel'?'userInput/cancel':'userInput/answer',{sessionId:request.sessionId,userInputId:request.userInputId,...(input.operation==='answer'?{answers:structuredClone(input.answers)}:{})},{commandId,maxAttempts:1}),timeoutMs);
   assertCurrent(token);if(ack?.commandId!==commandId||ack?.userInputId!==request.userInputId||ack.status!=='accepted')throw Error('Question acknowledgement could not be verified.');
   if(requests.has('input:'+request.userInputId))publishInput({...receipt,status:'accepted'});return snapshot();
  }catch(error){if(token===epoch&&requests.has('input:'+request.userInputId))publishInput({...receipt,status:error.code===-32057?'rejected':'unknown'});throw error;}finally{if(token===epoch)deciding=false;}
 }

 async function steer({text,expectedTurnId}={}){
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Use a correction up to 16,000 characters.');
  if(steering||state.steering?.status==='unknown')throw Error('Inspect the previous steering outcome before sending another correction.');
  if(!owner||!state.permissionVerified||state.status!=='running'||pending||!expectedTurnId||adapter.snapshot().turnId!==expectedTurnId)throw Error('The target turn is no longer running or needs your attention.');
  const token=epoch,sessionId=state.sessionId,commandId=owner.connection.mintCommandId();steering=true;update({steering:{commandId,turnId:expectedTurnId,status:'submitting'}});
  try{const ack=await bounded(owner.connection.command('turn/steer',{sessionId,expectedTurnId,input:[{type:'text',text}]},{commandId,maxAttempts:1}),timeoutMs);assertCurrent(token);if(ack?.commandId!==commandId||ack?.turnId!==expectedTurnId||ack.status!=='accepted')throw Error('Steering acknowledgement could not be verified.');update({steering:{commandId,turnId:expectedTurnId,status:'accepted'}});return snapshot();}
  catch(error){if(token===epoch)update({steering:{commandId,turnId:expectedTurnId,status:error.code===-32030?'rejected':'unknown'}});throw error;}finally{steering=false;}
 }
 async function childControl(input={}){
  if(!owner||!adapter||!state.permissionVerified||input.sessionId!==state.sessionId||pending||compaction.pending()||connecting||!['idle','running','completed','failed','cancelled'].includes(state.status))throw Error('This child connection is unavailable or needs attention.');
  const startsWork=['followupTask','resume','reopen','retry'].includes(input.action);
  const child=children.snapshot().items.find(i=>i.itemId===input.itemId);
  if(startsWork&&!state.ownedTurnIds?.includes(child?.turnId))throw Error('This child belongs to an earlier request. Start a new task from the current conversation instead.');
  const target=children.prepare(input),key=input.itemId+':'+(input.childId??'');
  if(childCommands.has(key)||uncertainChildren.has(key))throw Error('The previous child command is pending or uncertain. Inspect its state before reconnecting.');
  const token=epoch,sessionId=state.sessionId,commandId=owner.connection.mintCommandId(),receipt={key,commandId,sessionId,itemId:input.itemId,revision:input.revision,action:input.action,...(input.body?{body:input.body}:{}),...(input.childId?{childId:input.childId,attempt:input.attempt}:{}),status:'submitting',at:new Date().toISOString()};
  const publish=r=>update({childReceipts:[...(state.childReceipts??[]).filter(x=>x.commandId!==commandId),r].slice(-40)});childCommands.add(key);if(startsWork){childWork.set(key,{itemId:input.itemId,revision:input.revision});syncChildren();}publish(receipt);
  try{const ack=await bounded(owner.connection.command(target.method,{sessionId,...target.params},{commandId,maxAttempts:1}),timeoutMs);assertCurrent(token);if(ack?.commandId!==commandId||ack.status!=='accepted')throw Error('Child command acknowledgement could not be verified.');publish({...receipt,status:'accepted'});return snapshot();}
  catch(error){if(token===epoch){if(error.code===-32030)childWork.delete(key);else uncertainChildren.add(key);publish({...receipt,status:error.code===-32030?'rejected':'unknown',reason:String(error.message).slice(0,1000)});syncChildren();}throw error;}finally{if(token===epoch)childCommands.delete(key);}
 }
 async function inspectChild(input={}){
  if(!owner||!adapter||connecting||!state.permissionVerified||input.sessionId!==state.sessionId)throw Error('Use the current interactive connection to read child activity.');
  const target={...children.inspect(input),sessionId:state.sessionId},token=epoch,key=target.itemId,readOwner=owner;
  if(childReads.has(key))throw Error('This child is already being read.');
  if(childReads.size>=4)throw Error('Wait for another child activity read to finish.');
  const publish=entry=>{
   const entries=(state.childInspections??[]).filter(i=>i.itemId!==key);
   if(entries.length>=8){const oldest=entries.findIndex(i=>i.status!=='loading');if(oldest>=0)entries.splice(oldest,1);}
   // The controller publishes this read model separately from lifecycle events.
   // A read must not trigger turn reconciliation or automatic goal continuation.
   state={...state,childInspections:[...entries,entry]};
  };
  childReads.add(key);publish({...target,status:'loading'});
  try{
   const read=await bounded(owner.connection.request('session/read',{sessionId:target.childSessionId,excludeItems:false}),timeoutMs);assertCurrent(token);
   if(owner!==readOwner||!state.permissionVerified)throw Error('Muse connection was interrupted or disconnected.');
   const current=children.snapshot().items.find(i=>i.itemId===key);
   if(current?.childSessionId!==target.childSessionId)throw Error('The child session changed while reading.');
   const data=projectChildRead(read,target);publish({...target,status:'ready',readAt:new Date().toISOString(),data});return snapshot();
  }catch(error){if(token===epoch&&state.permissionVerified)publish({...target,status:'error',error:'Could not read this child activity. Refresh to try again.'});throw error;}
  finally{if(token===epoch)childReads.delete(key);}
 }
 async function readMcpServers({sessionId}={}){
  if(!owner||!adapter||connecting||closing||!state.permissionVerified||sessionId!==state.sessionId)throw Error('Connect this chat to an interactive Muse session first.');
  const token=epoch,readOwner=owner;
  if(mcpReadEpoch===token)throw Error('MCP inventory is already being read.');
  mcpReadEpoch=token;
  try{
   // Timing out the caller does not cancel the SDK request. Keep its guard
   // until the native promise settles, without locking a replacement epoch.
   const request=(async()=>readOwner.connection.request('mcpServer/list',{sessionId}))().finally(()=>{if(mcpReadEpoch===token)mcpReadEpoch=null;});
   const value=await bounded(request,timeoutMs);
   assertCurrent(token);
   if(owner!==readOwner||!state.permissionVerified||sessionId!==state.sessionId)throw Error('Connection changed');
   return projectMcpInventory(value,sessionId);
  }catch(error){
   assertCurrent(token);
   if(!state.permissionVerified||owner!==readOwner)throw Error('Muse connection was interrupted.');
   throw Error(error?.code===-32601?'MCP inventory is not supported by this Muse host.':'Could not read MCP configuration. Try refreshing this session.');
  }
 }
 async function compact({sessionId,turnId}={}){
  if(!owner||!adapter||!state.permissionVerified||connecting||sending||steering||pending||childCommands.size||state.childrenBusy||!usable.has(state.status)||sessionId!==state.sessionId||!turnId||turnId!==state.turnId)throw Error('Finish the current turn and use this connection’s latest session before compacting.');
  const token=epoch,commandId=owner.connection.mintCommandId();compaction.start({sessionId,turnId,commandId});syncCompaction();
  compactionTimer=setTimeout(()=>{if(token===epoch){compaction.interrupt('Compaction completion was not observed. Inspect this session before reconnecting; the request is never retried automatically.');syncCompaction();}},120000);compactionTimer.unref?.();
  try{const ack=await bounded(owner.connection.command('session/compact',{sessionId,turnId},{commandId,maxAttempts:1}),timeoutMs);assertCurrent(token);compaction.ack(ack);syncCompaction();return snapshot();}
  catch(error){if(token===epoch){if(error.code===-32030)compaction.reject(error.message);else compaction.interrupt(error.message);syncCompaction();}throw error;}
 }
 return {snapshot,subscribe:fn=>{if(typeof fn!=='function')throw Error('A listener function is required.');listeners.add(fn);return()=>listeners.delete(fn);},connect,disconnect:()=>disconnect(),send,refreshModels,steer,compact,childControl,inspectChild,readMcpServers,answerInput,decide,close:()=>disconnect()};
}
