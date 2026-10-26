import {preparePrompt} from './prompt-file.mjs';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {open,realpath,stat,lstat} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,sep} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {curateEnvironment,discoverMuseBinaries,parseMuseVersion,SETUP_URL} from './index.mjs';
import {createExecConversationFold} from './exec-conversation-events.mjs';
import {createJobSpawner} from './windows-job.mjs';
import {validateRunOptions,approvalArguments} from '../shared/run-options.mjs';

const HOST_VERSION='1.4.13';
const execFileAsync=promisify(execFile);
const readyFlags=['runner_trusted','runner_version_matches','sandbox_users_ready','capabilities_ready','restricted_network_required','wfp_ready'];
const usable=new Set(['idle','completed','failed','cancelled']);
const fileDescription='Windows file-editing mode. Each request starts an independent native run with Ask me and a fresh Windows sandbox readiness check; shell/web/input tools and hooks are disabled. This is startup evidence, not dynamic MSP permission evidence; planning is not read-only.';
const shellDescription='Windows sandboxed command mode. Each request starts an independent native run with Ask me and a fresh Windows sandbox readiness check. Managed PowerShell is enabled; web/input tools and hooks are disabled. Human approval requests stop the run. Command results are separate from MuseBench checks and review; planning is not read-only.';
const defaultHelperPath=fileURLToPath(new URL('../../native/bin/MuseBenchJob.exe',import.meta.url));
const failureCode=reason=>/\b402\b|billing/i.test(reason??'')?'billing':/\b40[13]\b|authentication|not logged in|unauthenticated/i.test(reason??'')?'auth':'protocol';

function safeReason(value) {
 const text=String(value??'');
 if(/(?:\b402\b|billing[_ ]|billing verification)/i.test(text))return 'Meta refused this request because of a billing issue (HTTP 402). Resolve billing in your Meta developer account, then explicitly send again. MuseBench has not retried or changed billing.';
 if(/(?:\b40[13]\b|unauthenticated|not logged in|authentication failed|invalid api key)/i.test(text))return 'Muse authentication is unavailable. Sign in directly in the official Muse CLI, then reconnect. Do not enter credentials in MuseBench.';
 return text.replace(/\b(?:Bearer\s+)[^\s,;]+/gi,'Bearer [redacted]').replace(/\b(?:[A-Z0-9]+_)*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,'credential=[redacted]').replace(/\bsk-[A-Za-z0-9_-]{8,}/g,'[redacted]').replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g,'$1').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,1200);
}

function stderrReason(value) {
 const category=failureCode(value);
 if(category==='billing')return safeReason('HTTP 402');
 if(category==='auth')return safeReason('authentication failed');
 return 'Muse failed. Inspect partial changes and use the official CLI for additional diagnostics.';
}

function permissionArgs(shellEnabled,approval='ask') {
 return [...approvalArguments(approval),'--no-session-log',...(!shellEnabled?['--disable-shell']:[]),'--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--max-tool-output-bytes','65536','-c','hooks={}','-c','managed_hooks_path=null'];
}

function execArgs(workspace,provider,prompt,maxSteps,shellEnabled,runOptions) {
 const options=validateRunOptions(runOptions);
 return ['exec','--provider',provider,'--json','--workspace',workspace,...permissionArgs(shellEnabled,options.approval),...(provider==='meta'?['--reasoning-effort',options.reasoning]:[]),'--max-model-steps',String(maxSteps),'--',prompt];
}

function shellPrompt(workspace,prompt) {
 return `This is an independent MuseBench request. Use only Muse's managed powershell tool for project commands. Before project commands in every PowerShell invocation, run Set-Location -LiteralPath '${workspace.replaceAll("'","''")}' to normalize the Windows working directory. Do not start background or detached processes or use any alternative host execution method. If human approval is required or the sandbox cannot run a command, stop and explain; MuseBench cannot answer interactive approvals. Native command results do not replace MuseBench Checks or review.\n\n${prompt}`;
}

export async function checkConfiguration({environment,workspaceRoot,extensionReview}) {
 // Only documented non-credential settings are inspected. Never enumerate or
 // read auth.json, and never include configuration values in diagnostics.
 const profile=environment.USERPROFILE;
 if(!profile||!isAbsolute(profile))throw Error('A valid Windows user profile is required to verify restricted Muse configuration.');
 const configRoot=join(profile,'.config','muse'),dataRoot=join(profile,'.local','share','muse');
 const paths=[join(configRoot,'settings.json')];
 const forbidden=[{path:join(configRoot,'trust.json'),label:'saved workspace trust'},...['installed.json','marketplaces.json','default-installs.json'].map(file=>({path:join(dataRoot,'plugins',file),label:'plugin inventory'}))];
 for(let directory=workspaceRoot;;directory=dirname(directory)){
  paths.push(join(directory,'.muse','settings.json'));
  forbidden.push({path:join(directory,'.mcp.json'),label:'project MCP configuration'},{path:join(directory,'.muse','hooks.json'),label:'project hooks'});
  if(dirname(directory)===directory)break;
 }
 for(const {path,label} of forbidden){
  try{await lstat(path);}catch(error){if(error.code==='ENOENT')continue;throw Error('Restricted Muse configuration could not be checked.');}
  if(label==='plugin inventory'&&await extensionReview?.allowFile(path))continue;
  throw Error(`This restricted mode cannot verify ${label}. Review that configuration in the official Muse CLI before using this connection; MuseBench has not changed it.`);
 }
 for(const path of paths){
  let source,handle;
  try{handle=await open(path,'r');const info=await handle.stat();if(!info.isFile()||info.size>1024*1024)throw Error('Unsupported Muse settings file.');const buffer=Buffer.alloc(1024*1024+1);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead>1024*1024)throw Error('Unsupported Muse settings file.');source=buffer.subarray(0,bytesRead).toString('utf8');}
  catch(error){if(error.code==='ENOENT')continue;throw Error('Muse settings could not be safely checked. Resolve the settings file before connecting.');}
  finally{await handle?.close();}
  let config;try{config=JSON.parse(source);}catch{throw Error('Muse settings are invalid. Correct them in the official CLI before connecting.');}
  // Only user-level, individually reviewed entries may cross this boundary.
  // Native project shell sandbox checks below still run on every request.
  if(path===join(configRoot,'settings.json')&&config.mcp_servers&&extensionReview){
   for(const [name,entry] of Object.entries(config.mcp_servers))if(!await extensionReview.allowMcp(name,entry))throw Error('MCP configuration needs review in Customize before running Muse.');
   delete config.mcp_servers;
  }
  const hasValue=value=>value!==null&&value!==false&&value!==''&&(typeof value!=='object'||Object.keys(value).length>0);
  function inspect(value){
   if(!value||typeof value!=='object')return false;
   return Object.entries(value).some(([key,item])=>((/mcp|plugin|extension|runtime_capabilities|managed_skills_path/i.test(key)&&hasValue(item))||inspect(item)));
  }
  if(inspect(config))throw Error('Configured MCP servers, plugins or managed capabilities may run outside the Muse sandbox. This restricted mode cannot safely exclude them; review their configuration in the official CLI before connecting. MuseBench has not changed it.');
 }
}

async function stopNativeProcess(child,{environment,timeoutMs}) {
 if(typeof child.stop==='function')return await child.stop();
 if(child.isSupervised)return false;
 if(child.exitCode!==null&&child.exitCode!==undefined)return true;
 if(!Number.isInteger(child.pid)||child.pid<=0)return false;
 try{
  const taskkill=join(environment.SystemRoot??'C:\\Windows','System32','taskkill.exe');
  await execFileAsync(taskkill,['/PID',String(child.pid),'/T','/F'],{env:environment,windowsHide:true,shell:false,timeout:timeoutMs,maxBuffer:16384});
  return true;
 }catch{return false;}
}

function deadline(promise,timeoutMs,message) {
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),timeoutMs);})]).finally(()=>clearTimeout(timer));
}

/** The synthetic sessionId is a readiness handle used by the controller. Actual
 * native session/command/run identifiers are separate and change on every send.
 * The injected process boundary is used by contract tests, never by product UI. */
export function createExecRuntime({environment=process.env,platform=process.platform,helperPath=defaultHelperPath,spawnProcess,stopProcess=stopNativeProcess,verifyConfiguration=checkConfiguration,extensionReview,timeoutMs=10000,runTimeoutMs=180000,maxModelSteps=8}={}) {
 if(platform!=='win32')throw Error('The native exec compatibility mode is supported only on Windows.');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isInteger(runTimeoutMs)||runTimeoutMs<1||runTimeoutMs>180000||!Number.isInteger(maxModelSteps)||maxModelSteps<1||maxModelSteps>16)throw Error('Invalid Muse runtime limits.');
 const env=curateEnvironment(environment),candidates=discoverMuseBinaries({environment,platform});
 const spawnNative=spawnProcess??createJobSpawner({helperPath});
 let state={status:'unavailable',reason:candidates.length?'Connect to verify the native Windows sandbox and exec format.':'Install official Muse, then select its native executable.',binary:candidates[0]??null,sdkVersion:HOST_VERSION,transport:'exec',sessionId:null,nativeSessionId:null,commandId:null,runId:null,modelId:null,providerId:null,liveVerified:false,messages:[],shellEnabled:false,shellUnavailableReason:null,shellResults:[],activity:{items:[],truncated:false},pending:null,setupUrl:SETUP_URL,permissionVerified:false,permissionProfile:null,permissionDescription:fileDescription,planReadOnlyEnforced:false};
 let epoch=0,owner=null,connecting=false,workspace=null,closing=null;
 const listeners=new Set();
 const snapshot=()=>structuredClone(state);
 const update=patch=>{state={...state,...patch};for(const listener of listeners){try{listener(snapshot());}catch{/* Observers do not control the native owner. */}}};
 const current=token=>{if(token!==epoch)throw Error('Muse connection was interrupted or disconnected.');};

 async function release(processOwner) {
  if(!processOwner)return 'not-started';
  if(processOwner.stopPromise)return processOwner.stopPromise;
  if(processOwner.closed)return processOwner.child.isSupervised&&processOwner.child.cleanupConfirmed!==true?'unconfirmed':'confirmed';
  processOwner.stopped=true;clearTimeout(processOwner.timer);
  processOwner.stopPromise=(async()=>{
   let stopped=false;
   try{stopped=await deadline(Promise.resolve(stopProcess(processOwner.child,{environment:env,timeoutMs})),timeoutMs,'Native shutdown timed out.');}catch{}
   if(!stopped)return 'unconfirmed';
   try{await deadline(processOwner.closedPromise,timeoutMs,'Native shutdown timed out.');return processOwner.child.isSupervised&&processOwner.child.cleanupConfirmed!==true?'unconfirmed':'confirmed';}catch{return 'unconfirmed';}
  })();
  return processOwner.stopPromise;
 }

 function begin(args,{token,model=false,probe=false,maxBytes=4*1024*1024,duration=timeoutMs}={}) {
  current(token);if(owner&&!owner.closed)throw Error('The previous native process has not stopped.');
  const fold=(model||probe)?createExecConversationFold():null;
  const decoder=new StringDecoder('utf8'),messageId=randomUUID();
  let resolveResult,rejectResult,resolveClosed;
  const p={child:null,closed:false,stopped:false,settled:false,stopPromise:null,failure:null,timer:null,stdout:'',stderr:'',buffer:'',bytes:0,result:new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;}),closedPromise:new Promise(resolve=>{resolveClosed=resolve;})};
  // Startup/model process errors are handled below; retain no unhandled promise.
  p.result.catch(()=>{});
  const settle=(value,error)=>{if(p.settled)return;p.settled=true;if(error)rejectResult(error);else resolveResult(value);};
  async function abort(reason,status='uncertain') {
   if(p.failure||p.closed)return;
   p.failure=safeReason(reason);p.stopped=true;clearTimeout(p.timer);
   if(model&&token===epoch)update({status,reason:p.failure,permissionVerified:false,pending:null,cleanup:'pending',liveVerified:false});
   const cleanup=await release(p);
   if(token===epoch)update({cleanup,...(cleanup==='unconfirmed'?{permissionVerified:false,reason:p.failure+' Native shutdown could not be confirmed; check the process before restarting MuseBench.'}:{})});
   settle(null,Error(p.failure));
  }
  function consume(text,final=false){
   if(!fold){p.stdout+=text;return;}
   p.buffer+=text;
   if(p.buffer.length>512*1024&&!p.buffer.includes('\n'))throw Error('Muse output exceeded its record limit.');
   const lines=p.buffer.split('\n');p.buffer=lines.pop();if(final&&p.buffer){lines.push(p.buffer);p.buffer='';}
   for(const raw of lines){
    if(!raw.trim())continue;if(raw.length>512*1024)throw Error('Muse output exceeded its record limit.');
    let record;try{record=JSON.parse(raw);}catch{throw Error('Muse sent malformed JSON output. Inspect partial changes before reconnecting.');}
    const value=fold.accept(record);
    if(value.approvalRequested){void abort('Muse requested approval or interactive input. This native mode cannot safely answer it; the run was stopped without approval.','blocked');return;}
    if(model&&token===epoch){
     const hadMessage=state.messages.some(item=>item.id===messageId);
     const messages=state.messages.filter(item=>item.id!==messageId);
     if(value.text||hadMessage)messages.push({id:messageId,kind:'agentMessage',text:value.text,status:'running',phase:'answer'});
     update({nativeSessionId:value.sessionId,commandId:value.commandId,runId:value.runId,modelId:value.modelId,providerId:value.providerId,messages,activity:value.activity,ownedRunIds:value.ownedRunIds,shellResults:value.shellResults});
    }
   }
  }
  try{p.child=spawnNative(state.binary,args,{cwd:workspace,env:{...env},windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});}
  catch{const error=Error('Muse could not start. Verify the native executable.');settle(null,error);if(model&&token===epoch)update({status:'uncertain',reason:error.message,failureCode:'protocol',permissionVerified:false,cleanup:'not-started'});throw error;}
  owner=p;
  p.child.stdout.on('data',chunk=>{
   if(p.closed||p.stopped||token!==epoch)return;
   p.bytes+=Buffer.byteLength(chunk);if(p.bytes>maxBytes){void abort('Muse output exceeded the bounded run limit.');return;}
   try{consume(decoder.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));}catch(error){void abort(error.message);}
  });
  p.child.stderr.on('data',chunk=>{if(p.closed||p.stopped||token!==epoch)return;if(p.stderr.length<16384)p.stderr+=(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk)).slice(0,16384-p.stderr.length);});
  p.child.on('error',()=>{void abort('Muse could not start or its process failed. Verify the native executable and inspect partial changes.');});
  p.child.on('close',(code,signal)=>{
   if(p.closed)return;p.closed=true;clearTimeout(p.timer);resolveClosed();
   if(p.stopped||token!==epoch){settle(null,Error(p.failure??'Muse run was disconnected.'));return;}
   try{
    if(p.child.isSupervised&&p.child.cleanupConfirmed!==true)throw Error('Native process ownership cleanup could not be confirmed. Inspect partial changes and check the process before restarting MuseBench.');
    if(p.child.isSupervised&&p.child.terminationReason!==undefined&&p.child.terminationReason!=='rootExit')throw Error('The native process supervisor stopped this run. Inspect partial changes and reconnect; its completion cannot be verified.');
    consume(decoder.end(),true);
    if(p.stopped){settle(null,Error(p.failure??'Muse requested unsupported input.'));return;}
    const result=fold?fold.finish(code):{success:code===0,exitCode:code,stdout:p.stdout};
    if(model){
     if(result.success&&(result.providerId!=='meta'||!result.modelId))throw Error('Muse completed without verifiable Meta model identity. Inspect changes and reconnect.');
     const text=result.reason?safeReason(result.reason):stderrReason(p.stderr);
     const status=result.success?'completed':result.terminal==='cancelled'?'cancelled':'failed';
     const messages=state.messages.map(item=>item.id===messageId?{...item,text:result.text,status:result.success?'completed':'failed'}:item);
     if(token!==epoch){settle(null,Error('Muse run was disconnected.'));return;}
     update({status,reason:result.success?null:text||'Muse failed. Inspect partial changes before sending again.',failureCode:result.success?null:failureCode(text),liveVerified:result.success,cleanup:'confirmed',messages,activity:result.activity,ownedRunIds:result.ownedRunIds,shellResults:result.shellResults});
    }
    if(!result.success&&!model)throw Error(stderrReason(p.stderr));
    settle(result);
   }catch(error){
    const reason=safeReason(error.message);
    const cleanup=p.child.isSupervised&&p.child.cleanupConfirmed!==true?'unconfirmed':'confirmed';
    const supervisedStop=p.child.isSupervised&&cleanup==='confirmed'&&p.child.terminationReason!==undefined&&p.child.terminationReason!=='rootExit';
    const status=supervisedStop?(p.child.terminationReason==='stop'?'cancelled':'failed'):'uncertain';
    if(token===epoch&&(model||cleanup==='unconfirmed'))update({status,reason,failureCode:failureCode(reason),liveVerified:false,permissionVerified:false,cleanup,...(supervisedStop?{messages:state.messages.map(item=>item.id===messageId?{...item,status:'failed'}:item)}:{})});
    settle(null,Error(reason));
   }
  });
  p.timer=setTimeout(()=>{void abort('Muse operation timed out. The run was stopped; inspect partial changes before reconnecting. Interactive approvals and sandbox stalls cannot be resolved by this headless connection.');},duration);
  return p;
 }

 async function verifyManagedConfiguration(token) {
  const result=await begin(['config','status'],{token,maxBytes:16384}).result;current(token);
  const sources=result.stdout.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('plane='));
  const expected=new Set(['defaults:system_file','policy:system_file','defaults:windows_machine_policy','policy:windows_machine_policy']);
  for(const line of sources){
   const match=line.match(/^plane=(defaults|policy) source_class=(system_file|windows_machine_policy) state=absent$/);
   if(!match||!expected.delete(`${match[1]}:${match[2]}`))throw Error('Managed Muse configuration could not be excluded. This restricted mode requires all managed defaults and policy sources to be absent.');
  }
  if(expected.size)throw Error('Managed Muse configuration status was incomplete. This restricted mode cannot safely start.');
 }

 async function verifySandbox(token) {
  const readiness=await begin(['sandbox','windows','check'],{token,maxBytes:16384}).result;current(token);
  const values=Object.fromEntries(readiness.stdout.split(/\r?\n/).map(line=>line.trim().split('=')));
  if(values.backend!=='windows_elevated'||values.status!=='ready'||readyFlags.some(key=>values[key]!=='true'))throw Error('Windows Muse sandbox is not ready. Run muse sandbox windows check and complete official sandbox setup before connecting.');
  update({sandboxReadiness:Object.fromEntries(['backend','status',...readyFlags].map(key=>[key,values[key]]))});
 }

 async function connect({binary=state.binary,workspaceRoot}={}) {
  if(state.cleanup==='unconfirmed')throw Error('Native shutdown is unconfirmed. Check the process before restarting MuseBench.');
  if(connecting||state.permissionVerified||owner&&!owner.closed)throw Error('Disconnect the current Muse run before reconnecting.');
  if(closing||state.cleanup==='pending')throw Error('Wait for native shutdown to finish.');
  if(state.cleanup==='unconfirmed')throw Error('Native shutdown is unconfirmed. Check the process before restarting MuseBench.');
  if(typeof binary!=='string'||!isAbsolute(binary)||!binary.toLowerCase().endsWith('.exe'))throw Error('Select an absolute path to the official native Muse .exe.');
  if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('Select an absolute workspace directory first.');
  const token=++epoch;connecting=true;
  update({status:'connecting',reason:'Checking native version, Windows sandbox and exec output.',failureCode:null,binary,sessionId:null,nativeSessionId:null,commandId:null,runId:null,liveVerified:false,messages:[],shellEnabled:false,shellUnavailableReason:null,shellResults:[],permissionVerified:false,permissionProfile:null,cleanup:undefined});
  try{
   binary=await realpath(binary);workspace=await realpath(workspaceRoot);current(token);
   if(!(await stat(binary)).isFile()||!(await stat(workspace)).isDirectory())throw Error('Native binary or workspace is unavailable.');
   await verifyConfiguration({environment:env,workspaceRoot:workspace,extensionReview});current(token);update({binary});
   const profileRoot=await realpath(env.USERPROFILE);current(token);
   const profileRelative=relative(profileRoot.toLowerCase(),workspace.toLowerCase());
   const inProfile=profileRelative===''||(!isAbsolute(profileRelative)&&profileRelative!=='..'&&!profileRelative.startsWith(`..${sep}`));
   const shellEnabled=!inProfile;
   update({shellEnabled,shellUnavailableReason:inProfile?'Muse 1.4.13 managed PowerShell stalls for workspaces inside the Windows user profile on this machine. File editing remains available. Use a project folder outside your user profile for sandboxed commands.':null,permissionDescription:shellEnabled?shellDescription:fileDescription,permissionArguments:permissionArgs(shellEnabled)});
   const version=await begin(['--version'],{token,maxBytes:16384}).result;current(token);
   if(parseMuseVersion(version.stdout)!==HOST_VERSION)throw Error(`Muse version mismatch. This mode requires ${HOST_VERSION}.`);
   update({hostVersion:HOST_VERSION});
   await verifySandbox(token);current(token);
   await verifyManagedConfiguration(token);current(token);
   await begin(execArgs(workspace,'echo','Reply with MUSEBENCH_FORMAT_PROBE_ONLY',1,state.shellEnabled),{token,probe:true,maxBytes:1024*1024}).result;current(token);
   owner=null;update({status:'idle',reason:null,sessionId:randomUUID(),permissionVerified:true,permissionProfile:':ask-me',cleanup:'confirmed'});
   return snapshot();
  }catch(error){
   if(token===epoch){const cleanup=await release(owner);if(token===epoch)update({status:'unavailable',reason:safeReason(error.message),permissionVerified:false,sessionId:null,cleanup});}
   throw Error(safeReason(error.message));
  }finally{if(token===epoch)connecting=false;}
 }

 async function send({text,mode='chat',runOptions}={}) {
  const options=validateRunOptions(runOptions);
  if(typeof text!=='string'||!text.trim()||text.length>64000||!['chat','plan'].includes(mode))throw Error('Enter a message up to 64,000 characters in chat or plan mode.');
  if(connecting||closing||!state.permissionVerified||!usable.has(state.status)||owner&&!owner.closed)throw Error('Muse is blocked or uncertain. Connect a verified native runtime first.');
  const token=epoch;update({status:'checking-permissions',reason:null});
  try{await verifyConfiguration({environment:env,workspaceRoot:workspace,extensionReview});current(token);await verifyManagedConfiguration(token);current(token);await verifySandbox(token);current(token);}
  catch(error){if(token===epoch)update({status:'blocked',reason:safeReason(error.message),permissionVerified:false});throw error;}
  let prompt=mode==='plan'?`Plan the requested work and explain your proposed changes. Planning instructions are not an enforced read-only boundary.\n\n${text.trim()}`:text.trim();
  if(state.shellEnabled)prompt=shellPrompt(workspace,prompt);
  let prepared;try{prepared=await preparePrompt(prompt);current(token);}catch(error){await prepared?.dispose();if(token===epoch)update({status:'blocked',reason:'The request context could not be prepared. Try sending again.',permissionVerified:false});throw error;}
  const label=options.approval==='ask'?'Ask me':options.approval==='auto'?'Auto-review':'No prompts (sandboxed)';
  update({status:'running',reason:null,failureCode:null,liveVerified:false,nativeSessionId:null,commandId:null,runId:null,modelId:null,providerId:null,shellResults:[],activity:{items:[],truncated:false},cleanup:undefined,runOptions:options,permissionProfile:options.approval==='never'?null:options.approval==='auto'?':auto-review':':ask-me',permissionArguments:permissionArgs(state.shellEnabled,options.approval),permissionDescription:(state.shellEnabled?shellDescription:fileDescription).replace('Ask me',label)});
  try{current(token);const args=execArgs(workspace,'meta','',maxModelSteps,state.shellEnabled,options).slice(0,-2).concat(prepared.args);const run=begin(args,{token,model:true,duration:runTimeoutMs});void run.result.finally(prepared.dispose).catch(()=>{});}catch(error){await prepared.dispose();throw error;}
  return snapshot();
 }

 async function disconnect(){
  if(closing){await closing;return snapshot();}
  if(state.cleanup==='unconfirmed')return snapshot();
  ++epoch;connecting=false;const previous=owner;
  if(previous)previous.stopped=true;
  update({status:'unavailable',reason:'Disconnected. Connect again to verify the native runtime.',sessionId:null,permissionVerified:false,permissionProfile:null,pending:null,liveVerified:false,cleanup:'pending'});
  closing=release(previous);const cleanup=await closing;closing=null;
  if(cleanup!=='unconfirmed')owner=null;
  update({cleanup,...(cleanup==='unconfirmed'?{reason:'Native shutdown could not be confirmed. Check the process before restarting MuseBench.'}:{})});return snapshot();
 }

 return {snapshot,subscribe(fn){if(typeof fn!=='function')throw Error('A listener function is required.');listeners.add(fn);return()=>listeners.delete(fn);},connect,send,disconnect,close:disconnect,async decide(){throw Error('Interactive approval is unavailable in native mode. No approval was sent; disconnect and inspect any partial changes.');}};
}
