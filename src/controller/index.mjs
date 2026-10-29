import {createAnalyticsStore} from './analytics.mjs';
import {createSemanticNavigation} from './semantic-navigation.mjs';
import {workspaceSourcePaths} from './workspace-sources.mjs';
import {reviewPrompt,parseReview} from '../shared/reviewer-contracts.mjs';
import {newGoalDriver,goalDecision,pauseGoalDriver} from '../shared/goal-driver.mjs';
import {createExecutionLedger} from './execution-ledger.mjs';
import {proposeLesson,decideLesson} from '../shared/project-lessons.mjs';
import {restoreSelected} from './checkpoint-restore.mjs';
import {contextReceipt} from './context-receipts.mjs';
import {StringDecoder} from 'node:string_decoder';
import {createOutputStore} from './output-artifacts.mjs';
import {validateCheckScripts,missingChecks,checkDiagnostics} from '../shared/validation.mjs';
import {createHistoryStore} from './chat-history.mjs';
import {createDraftStore} from './code-drafts.mjs';
import {readRuntimeStatus,runtimeStatusBusy} from '../runtime/status.mjs';
import {restoreSkillReceipts} from '../shared/skill-receipts.mjs';
import {restoreUsage,combineUsage} from '../shared/native-usage.mjs';
import {DEFAULT_WORKFLOWS,validateWorkflow,workflowPrompts} from '../shared/workflows.mjs';
import {handoffText} from '../shared/context-handoff.mjs';
import {restoreNativeSession,prepareNativeSession,settleNativeSession} from '../shared/native-session.mjs';
import {createWorktreeService} from './worktrees.mjs';
import {createImageStore} from './code-images.mjs';
import {imageReferences} from '../shared/code-images.mjs';
import {moveQueuedPrompt,queuedPrompt,editQueuedPrompt} from '../shared/queued-prompts.mjs';
import {planSidebarMove} from '../shared/sidebar-order.mjs';
import {projectDetails} from '../shared/create-project.mjs';
import {projectGit} from '../shared/project-git.mjs';
import {composeChatContext,fileReferences,restoreSourceSnapshots,FILE_CONTEXT_LIMIT} from '../shared/chat-context.mjs';
import {computeFileDiff} from '../shared/file-diff.mjs';
import {restoreRuns} from '../shared/activity.mjs';
import {validateRunOptions,restoreRunOptions} from '../shared/run-options.mjs';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs, constants as FS } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';

const MAX_FILE=2*1024*1024,MAX_TOTAL=24*1024*1024,MAX_FILES=4000,MAX_LOG=65536;
const MAX_SHELL_HISTORY=512*1024;
const EXCLUDED=new Set(['.git','.venv','venv','__pycache__','.pytest_cache','.mypy_cache','node_modules','dist','build','out','coverage','.next','.nuxt','.cache','.vite','.turbo','release','target','vendor','.ssh','.aws','.azure','.gnupg','.kube','.credentials','.secrets','secrets','credentials','.npmrc','.pypirc','.netrc','_netrc','.git-credentials','id_rsa','id_ed25519','service-account.json']);
const excluded=name=>EXCLUDED.has(name.toLowerCase())||/^\.env/i.test(name)||/(?:^credentials(?:\.|$)|\.(?:pem|key|p12|pfx|keystore)$)/i.test(name);
const EXCLUDED_PATTERNS=[...EXCLUDED,'.env*','credentials.*','*.pem','*.key','*.p12','*.pfx','*.keystore'];
const hash=input=>createHash('sha256').update(input).digest('hex');
const now=()=>new Date().toISOString();
const runtimeMessageKey=item=>item?.id??JSON.stringify(item);
const runtimeMessageIds=value=>new Set((Array.isArray(value?.messages)?value.messages:[]).map(runtimeMessageKey));
function boundedShellResult(item){
  if(!item||item.toolName!=='powershell'||typeof item.callId!=='string'||!item.callId||item.callId.length>200||typeof item.runId!=='string'||!item.runId||item.runId.length>200||typeof item.command!=='string'||typeof item.output!=='string'||!Number.isSafeInteger(item.exitCode)||!['completed','failed'].includes(item.terminalStatus)||typeof item.outcome!=='string')return null;
  const result={callId:item.callId,runId:item.runId,toolName:'powershell',command:item.command.slice(0,16000),output:item.output.slice(0,MAX_LOG),exitCode:item.exitCode,terminalStatus:item.terminalStatus,...(typeof item.terminalReason==='string'?{terminalReason:item.terminalReason.slice(0,1000)}:{}),truncated:item.truncated===true||item.command.length>16000||item.output.length>MAX_LOG||(item.terminalReason?.length??0)>1000||item.outcome.length>200,outcome:item.outcome.slice(0,200)};
  return result;
}
function mergeShellResults(previous,incoming,runId){
  const entries=new Map(previous.map(item=>[`${item.runId}\0${item.callId}`,item]));
  for(const item of incoming){if(runId!==null&&item?.runId!==runId)continue;const result=boundedShellResult(item);if(result)entries.set(`${result.runId}\0${result.callId}`,result);}
  const recent=[];let bytes=2;
  for(const item of [...entries.values()].slice(-100).reverse()){const size=Buffer.byteLength(JSON.stringify(item))+1;if(bytes+size>MAX_SHELL_HISTORY)break;recent.push(item);bytes+=size;}
  return recent.reverse();
}
function restoreTask(record,knownProjectId){
  const task=structuredClone(record);
  if(!task.projectId&&knownProjectId)task.projectId=knownProjectId;
  const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
  task.steeringReceipts=(Array.isArray(task.steeringReceipts)?task.steeringReceipts:[]).filter(r=>r&&['commandId','turnId','status','text','at'].every(k=>typeof r[k]==='string')).slice(-20).map(r=>({...r,text:r.text.slice(0,16000)}));
  task.inputReceipts=(Array.isArray(task.inputReceipts)?task.inputReceipts:[]).filter(r=>r&&typeof r.userInputId==='string'&&typeof r.sessionId==='string').slice(-20).map(r=>['submitting','accepted'].includes(r.status)?{...r,status:'unknown'}:r);
  task.childControlReceipts=(Array.isArray(task.childControlReceipts)?task.childControlReceipts:[]).filter(r=>r&&['commandId','itemId','status','action'].every(k=>typeof r[k]==='string')).slice(-40).map(r=>r.status==='submitting'?{...r,status:'unknown',reason:'The app restarted before command admission was confirmed.'}:r);
  task.compactionReceipts=(Array.isArray(task.compactionReceipts)?task.compactionReceipts:[]).filter(r=>r&&['commandId','turnId','sessionId','status'].every(k=>typeof r[k]==='string')).slice(-20).map(r=>['submitting','accepted'].includes(r.status)?{...r,status:'unknown',reason:'The app restarted before native completion was observed. This request will not be replayed.'}:r);
  task.nativeSession=restoreNativeSession(task.nativeSession);task.nativeUsage=restoreUsage(task.nativeUsage);task.skillReceipts=restoreSkillReceipts(task.skillReceipts);
  task.messages=(Array.isArray(task.messages)?task.messages:[]).filter(item=>item&&typeof item.id==='string'&&['user','assistant','system'].includes(item.role)&&typeof item.text==='string').slice(-150).map(item=>({...item,contextTruncated:item.contextTruncated===true||item.text.length>16000,text:item.text.slice(0,16000),sources:restoreSourceSnapshots(item.sources)}));
  task.runs=restoreRuns(task.runs);
  for(const item of task.messages){const run=task.runs.find(r=>r.promptId===(item.turnId??item.id));if(run)item.outcome=run.status;else if(['queued','working','waiting'].includes(item.outcome))item.outcome='interrupted';}
  task.pinned=task.pinned===true;task.archived=task.archived===true;task.archivedAt=task.archived?(Number.isFinite(Date.parse(task.archivedAt))?task.archivedAt:now()):null;
  task.checkReceipts=Array.isArray(task.checkReceipts)?task.checkReceipts.filter(c=>c&&typeof c.script==='string'&&typeof c.revision==='string').slice(-40):[];if(task.validationRun?.status==='running')task.validationRun.status='cancelled';
  task.promptQueue=Array.isArray(task.promptQueue)?task.promptQueue.filter(q=>q&&typeof q.id==='string'&&typeof q.text==='string'&&q.text.length<=16000).slice(0,5).map(q=>({...q,...(q.delivery==='sending'?{delivery:'unknown'}:{})})):[];task.queuePaused=true;task.queueHold=task.promptQueue.length>0;
  task.goal=task.goal&&typeof task.goal.objective==='string'?{objective:task.goal.objective.slice(0,1000),status:task.goal.status==='paused'?'paused':'active',...(task.goal.driver?{driver:{...task.goal.driver,armed:false,reason:'Restarted; explicitly start a new bounded continuation'}}:{})}:null;
  task.createdAt=validDate(task.createdAt)?task.createdAt:task.messages.find(item=>validDate(item.at))?.at??now();
  task.updatedAt=validDate(task.updatedAt)?task.updatedAt:task.messages.findLast(item=>validDate(item.at))?.at??task.createdAt;
  task.shellResults=mergeShellResults([],Array.isArray(task.shellResults)?task.shellResults:[],null);
  if(task.check?.status==='running'){task.check.status='cancelled';task.check.endedAt=now();}
  task.previewRevision=null;
  return task;
}
const stopped=()=>({status:'stopped',url:null,log:'',script:null});
const missingRuntime=()=>({status:'unavailable',reason:'Muse is not connected. Select an installed Muse CLI in Setup. Tutorial and manual review work without Muse.',binary:null,sdkVersion:'unavailable',liveVerified:false});
function inside(root,candidate){const rel=path.relative(root,candidate);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${path.sep}`));}
async function canonicalRoot(root){if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Choose an absolute project folder.');const real=await fs.realpath(root);if(!(await fs.stat(real)).isDirectory())throw Error('The project path must be a folder.');return real;}
async function safeFile(root,relative){
  const candidate=path.resolve(root,relative);if(!inside(root,candidate)||path.isAbsolute(relative))throw Error('Path is outside the selected project.');
  let current=root;
  for(const part of path.relative(root,candidate).split(path.sep).filter(Boolean)){
    current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error(`Symbolic links are not allowed in source: ${relative}`);
    if(!inside(root,await fs.realpath(current)))throw Error('Resolved path escaped the project.');
  }
  return candidate;
}
async function readSafe(root,relative){
  const handle=await fs.open(await safeFile(root,relative),FS.O_RDONLY|(FS.O_NOFOLLOW??0));
  try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_FILE)throw Error(`Source file exceeds the 2 MiB limit: ${relative}`);await safeFile(root,relative);return await handle.readFile();}finally{await handle.close();}
}
async function snapshot(root){
  const files=Object.create(null),sourcePaths=await workspaceSourcePaths(root,EXCLUDED_PATTERNS);let total=0,count=0;
  const walk=async (relative,includeAll=!sourcePaths)=>{
    const entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const entry of entries){
      if(excluded(entry.name))continue;
      const name=relative?`${relative}/${entry.name}`:entry.name;
      const sourceKey=sourcePaths?.caseInsensitive?name.toLowerCase():name;
      if(!includeAll&&!sourcePaths.files.has(sourceKey)&&!sourcePaths.parents.has(sourceKey))continue;
      if(entry.isSymbolicLink())throw Error(`Symbolic links are not allowed in source: ${name}`);
      await safeFile(root,name);
      // Git represents submodules and embedded untracked repositories as a single
      // directory entry. Preserve their existing bounded filesystem inspection.
      if(entry.isDirectory()){await walk(name,includeAll||sourcePaths.files.has(sourceKey));continue;}
      if(!entry.isFile())throw Error(`Unsupported source type: ${name}`);
      if(++count>MAX_FILES)throw Error('Project exceeds the 4,000 source-file limit.');
      const bytes=await readSafe(root,name);total+=bytes.length;if(total>MAX_TOTAL)throw Error('Project source exceeds the 24 MiB snapshot limit.');
      const binary=bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes);
      files[name]={hash:hash(bytes),text:binary?'':bytes.toString('utf8'),binary};
    }
  };
  await walk('');return {revision:hash(Object.keys(files).sort().map(name=>`${name}\0${files[name].hash}\0`).join('')),files};
}
function changes(before,after,cache=new Map()){
  return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(name=>{
    const a=Object.hasOwn(before,name)?before[name]:undefined,b=Object.hasOwn(after,name)?after[name]:undefined;if(a?.hash===b?.hash)return [];
    const binary=Boolean(a?.binary||b?.binary),key=`${a?.hash??''}:${b?.hash??''}`,cached=cache.get(name);
    let diff=cached?.key===key?cached:binary?{additions:0,deletions:0,approximate:false}:computeFileDiff(a?.text??'',b?.text??'');
    cache.set(name,{key,additions:diff.additions,deletions:diff.deletions,approximate:diff.approximate});
    return [{path:name,status:!a?'added':!b?'deleted':'modified',additions:diff.additions,deletions:diff.deletions,approximate:diff.approximate,before:a?.text??'',after:b?.text??'',binary}];
  });
}
async function scriptsFor(root){let bytes;try{bytes=await readSafe(root,'package.json');}catch(error){if(error.code==='ENOENT')return{name:path.basename(root),scripts:{}};throw error;}const json=JSON.parse(bytes.toString());const scripts={};for(const [k,v]of Object.entries(json.scripts??{}))if(/^\w[\w:.-]*$/.test(k)&&typeof v==='string')scripts[k]=v;return{name:typeof json.name==='string'?json.name:path.basename(root),scripts};}
function launchScript(root,script,args=[]){
  const env={...process.env,NO_COLOR:'1',BROWSER:'none',HOST:'127.0.0.1'};
  if(process.platform==='win32')return spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`npm.cmd run --ignore-scripts ${script}${args.length?' -- '+args.join(' '):''}`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  return spawn('npm',['run','--ignore-scripts',script,...(args.length?['--',...args]:[])],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
}
async function killTree(child){
  if(!child?.pid)return;
  let timer;const exited=new Promise(resolve=>{child.once('close',resolve);timer=setTimeout(resolve,3000);});
  if(process.platform==='win32')await new Promise(resolve=>{const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',resolve);killer.once('close',resolve);});
  else{try{process.kill(-child.pid,'SIGTERM');}catch{}await new Promise(r=>setTimeout(r,100));try{process.kill(-child.pid,'SIGKILL');}catch{}}
  await exited;clearTimeout(timer);
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(r=>server.close(r));return port;}

export async function createController({dataDir,projectsDir,newProjectsDir,templateDir=fileURLToPath(new URL('../../templates/tea-store',import.meta.url)),runtime,runtimeFactory,checkTimeoutMs=120000,archiveNow=()=>Date.now()}={}){
  if(!dataDir)throw Error('A controller dataDir is required.');await fs.mkdir(dataDir,{recursive:true});dataDir=await fs.realpath(dataDir);
  runtime??=runtimeFactory?.();
  const imageStore=createImageStore(dataDir);
  const legacyProjectsDir=path.join(dataDir,'projects');projectsDir=projectsDir??legacyProjectsDir;
  if(!path.isAbsolute(projectsDir))throw Error('Project storage must be an absolute folder.');projectsDir=path.resolve(projectsDir);
  const worktrees=createWorktreeService(dataDir,{storageDir:path.join(projectsDir,'worktrees')});
  newProjectsDir=newProjectsDir??projectsDir;if(!path.isAbsolute(newProjectsDir))throw Error('New project storage must be an absolute folder.');newProjectsDir=path.resolve(newProjectsDir);
  const prepareProjectsDir=async (sourceRoot,storageDir=projectsDir)=>{
    if(sourceRoot&&inside(sourceRoot,storageDir))throw Error('Working-copy storage must be outside the original project.');
    let part=path.parse(storageDir).root;
    for(const segment of path.relative(part,storageDir).split(path.sep).filter(Boolean)){
      part=path.join(part,segment);try{if((await fs.lstat(part)).isSymbolicLink())throw Error('Project storage cannot use symbolic links or junctions.');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await fs.mkdir(storageDir,{recursive:true});const canonical=await canonicalRoot(storageDir);
    if(path.relative(storageDir,canonical)!==''||sourceRoot&&inside(sourceRoot,canonical))throw Error('Project storage resolved outside the expected folder.');
    return canonical;
  };
  const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));
  db.exec('PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS baselines(task_id TEXT PRIMARY KEY,revision TEXT NOT NULL,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,revision TEXT NOT NULL,json TEXT NOT NULL);');
  const history=createHistoryStore(db),outputs=createOutputStore(db),analytics=createAnalyticsStore(db);
  const saved=db.prepare('SELECT json FROM app WHERE id=1').get();
  const executions=createExecutionLedger(db);
  const state=saved?JSON.parse(saved.json):{projects:[],activeProject:null,task:null,checkpoints:[],preview:stopped(),runtime:missingRuntime(),busy:false,error:null};
  state.projectCreationRoot=newProjectsDir;
  state.workflows=Array.isArray(state.workflows)?state.workflows.flatMap(w=>{try{return[validateWorkflow(w)];}catch{return[];}}).slice(0,30):structuredClone(DEFAULT_WORKFLOWS);
  const draftStore=createDraftStore(db,state.drafts&&typeof state.drafts==='object'&&!Array.isArray(state.drafts)?state.drafts:{});
  state.drafts=draftStore.read();
  state.memories=typeof state.memories==='string'?state.memories.slice(0,1500):'';
  state.preview=stopped();state.busy=false;state.error=null;state.runtime=runtime?.snapshot?.()??missingRuntime();
  const taskRecords=new Map();
  for(const row of db.prepare('SELECT id,json FROM tasks ORDER BY rowid').all()){
    try{const raw=JSON.parse(row.json);if(raw.id===row.id)history.sync(raw,true);const task=restoreTask(raw);if(task.id!==row.id)continue;taskRecords.set(row.id,task);db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(task),row.id);}catch{/* Preserve unreadable history in the database, without exposing it as a selectable task. */}
  }
  if(state.task){
    const knownProject=state.projects.find(p=>p.id===state.activeProject?.id&&p.root===state.activeProject.root);
    history.sync(state.task,true);state.task=restoreTask(state.task,knownProject?.id);
    // Task rows are written before the app selection snapshot. A crash between
    // those writes must not replace a sending/unknown queue with an older copy.
    const persistedQueue=taskRecords.get(state.task.id)?.promptQueue;
    if(persistedQueue){state.task.promptQueue=structuredClone(persistedQueue);state.task.queueHold=persistedQueue.length>0;}
    if(!knownProject||state.task.projectId!==knownProject.id){state.task=null;state.error='The saved task has no valid project association. Select a project to continue.';}
    else taskRecords.set(state.task.id,structuredClone(state.task));
  }
  let baseline=state.task?JSON.parse(db.prepare('SELECT json FROM baselines WHERE task_id=?').get(state.task.id)?.json??'{}'):{};
  for(const task of taskRecords.values())analytics.sync(task);
  const listeners=new Set();let queue=Promise.resolve(),closed=false,closing=false,closePromise=null,checkProcess=null,previewProcess=null,previewToken=null,checkInvalidated=false;
  const contexts=new Map();let preferredBinary=runtime?.snapshot?.().binary??null;
  const newContext=(owner,task=null)=>({runtime:owner,task,root:null,pending:false,turn:null,messageBaseline:runtimeMessageIds(owner?.snapshot?.()),navigation:false,queueScheduled:false,unsubscribe:null});
  let context=newContext(runtime,state.task);if(state.task)contexts.set(state.task.id,context);
  const contextBusy=c=>!!c&&(c.pending||runtimeStatusBusy(readRuntimeStatus(c.runtime)));
  const saveRecord=t=>{if(!t)return;analytics.sync(t);history.sync(t);t.messages=t.messages.slice(-150);t.updatedAt=now();if(contexts.has(t.id))contexts.get(t.id).task=t;taskRecords.set(t.id,structuredClone(t));db.prepare('INSERT INTO tasks(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(t.id,JSON.stringify(t));};
  const bindContext=task=>{
    if(!runtimeFactory){contexts.clear();context.task=task;if(task)contexts.set(task.id,context);return;}
    let next=task&&contexts.get(task.id);
    if(!next){next=!context.task&&!contextBusy(context)?context:newContext(runtimeFactory());next.task=task;if(task)contexts.set(task.id,next);subscribeContext(next);}
    context=next;runtime=context.runtime;state.runtime=runtime?.snapshot?.()??missingRuntime();
  };
  const requireSwitchable=()=>{if(!runtimeFactory)requireNavigationIdle();};
  const requireWritable=(task,project)=>{
    const other=[...contexts.values()].filter(c=>c.task?.id!==task.id&&contextBusy(c));
    if(other.length>=4)throw Error('Four chats are already running. Wait or stop one before starting another.');
    if(other.some(c=>{const root=state.projects.find(p=>p.id===c.task?.projectId)?.root;return root&&(inside(root,project.root)||inside(project.root,root));}))throw Error('Another chat is using this checkout. Wait for it to stop, or create an isolated worktree.');
  };
  const summaries=()=>[...taskRecords.values()].reverse().filter(t=>state.projects.some(p=>p.id===t.projectId)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(t=>{
    const owner=contexts.get(t.id),status=readRuntimeStatus(owner?.runtime);
    return{id:t.id,projectId:t.projectId,title:t.title,mode:t.mode,createdAt:t.createdAt,updatedAt:t.updatedAt,acceptedRevision:t.acceptedRevision,runtimeBusy:!!owner&&(owner.pending||runtimeStatusBusy(status)),runtimeStatus:status.status,pinned:t.pinned===true,archived:t.archived===true,archivedAt:t.archivedAt??null};
  });
  const getState=()=>structuredClone({...state,task:state.task?{...state.task,reviewUsage:combineUsage((state.task.reviewChildren??[]).map(id=>taskRecords.get(id)?.nativeUsage??null)),executionReceipts:closed?state.task.executionReceipts??[]:executions.list(state.task.id)}:null,backgroundChats:!!runtimeFactory,tasks:summaries()});
  const saveTask=()=>{
    if(!state.task)return;analytics.sync(state.task);history.sync(state.task);state.task.messages=state.task.messages.slice(-150);context.task=state.task;
    const previous=taskRecords.get(state.task.id);
    if(previous&&JSON.stringify({...previous,updatedAt:undefined})!==JSON.stringify({...state.task,updatedAt:undefined}))state.task.updatedAt=new Date(Math.max(Date.now(),Date.parse(previous.updatedAt)+1)).toISOString();
    taskRecords.set(state.task.id,structuredClone(state.task));
    db.prepare('INSERT INTO tasks(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(state.task.id,JSON.stringify(state.task));
  };
  const persist=()=>{if(closed)return;saveTask();draftStore.sync(state.drafts);state.tasks=summaries();db.prepare('INSERT INTO app(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify({...state,runtime:{...state.runtime,childInspections:undefined}}));for(const p of state.projects)db.prepare('INSERT INTO projects(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(p.id,JSON.stringify(p));};
  const emit=()=>{if(closed)return;persist();const view=getState();for(const listener of listeners)try{listener(view);}catch{}};
  const runtimeDirty=new Set();let runtimeTimer=null;
  const flushRuntime=()=>{
    if(runtimeTimer){clearTimeout(runtimeTimer);runtimeTimer=null;}if(closed||!runtimeDirty.size)return;
    for(const task of runtimeDirty)if(task.id!==state.task?.id)saveRecord(task);runtimeDirty.clear();emit();
  };
  const publishRuntime=(task,next,owner)=>{
    if(task)runtimeDirty.add(task);const control=JSON.stringify([next.inputAccepted,next.nativeSessionId,(next.activity?.items??[]).map(item=>[item.id,item.status,item.tool])]);const replaceable=task&&next.status==='running'&&!next.pending&&owner.lastStreamRun===next.runId&&owner.lastControl===control&&!next.activity?.items?.some(item=>item.status==='waiting');owner.lastStreamRun=next.runId;owner.lastControl=control;
    if(!replaceable){if(runtimeDirty.size)flushRuntime();else emit();return;}
    if(!runtimeTimer){runtimeTimer=setTimeout(flushRuntime,40);runtimeTimer.unref?.();}
  };
  const message=(role,text)=>{if(state.task){state.task.messages.push({id:randomUUID(),role,text:String(text).slice(0,16000),at:now()});state.task.messages=state.task.messages.slice(-150);}};
  const readMcpServers=async input=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['taskId','sessionId'].includes(key))||['taskId','sessionId'].some(key=>typeof input[key]!=='string'||!input[key]||input[key].length>200))throw Error('Invalid MCP inventory scope.');
    const readRuntime=runtime,taskId=state.task?.id,connection=readRuntime?.snapshot?.();
    const current=()=>{const next=readRuntime?.snapshot?.();return !closing&&!closed&&runtime===readRuntime&&state.task?.id===taskId&&next?.permissionVerified&&next.transport==='msp'&&next.sessionId===connection?.sessionId&&next.connectionEpoch===connection?.connectionEpoch;};
    if(input.taskId!==taskId||input.sessionId!==connection?.sessionId||!current()||!readRuntime?.readMcpServers)throw Error('Connect this chat to an interactive Muse session first.');
    const result=await readRuntime.readMcpServers({sessionId:connection.sessionId});
    if(!current())throw Error('The chat or connection changed while reading MCP configuration.');
    return result;
  };
  const inspectChild=async action=>{
    const readRuntime=runtime,taskId=state.task?.id,readConnection=readRuntime?.snapshot?.();
    let readError=null;
    const current=()=>{const next=readRuntime?.snapshot?.();return !closing&&!closed&&runtime===readRuntime&&state.task?.id===taskId&&next?.permissionVerified&&next.sessionId===readConnection?.sessionId&&next.connectionEpoch===readConnection?.connectionEpoch;};
    try{
      if(!taskId||action.taskId!==taskId||!readRuntime?.snapshot?.().childControlsSupported)throw Error('This chat does not have an interactive child connection.');
      const operation=readRuntime.inspectChild(action);
      if(current()){state.runtime=readRuntime.snapshot();emit();}
      await operation;
    }catch(error){if(current())readError=error.message;}
    if(current()){state.runtime=readRuntime?.snapshot?.()??state.runtime;emit();}
    // Concurrent reads must not inherit or overwrite another action's error.
    return {...getState(),error:readError};
  };
  const requireTask=()=>{if(!state.task||!state.activeProject)throw Error('Open a project and start a task first.');return state.task;};
  const diffCache=new Map();
  const applyCurrentSnapshot=async snap=>{
    const task=requireTask();
    if(task.revision!==snap.revision){task.revision=snap.revision;task.previewRevision=null;task.acceptedRevision=null;if(task.check?.status==='running')checkInvalidated=true;else if(task.check)task.check.status='stale';await stopPreview();}
    for(const key of diffCache.keys())if(!Object.hasOwn(baseline,key)&&!Object.hasOwn(snap.files,key))diffCache.delete(key);
    task.changes=changes(baseline,snap.files,diffCache);return snap;
  };
  const current=async()=>{
    requireTask();const root=state.activeProject.root;
    if(await canonicalRoot(root)!==root)throw Error('The workspace canonical path changed. Reopen the project.');
    return applyCurrentSnapshot(await snapshot(root));
  };
  const stopPreview=async()=>{previewToken=null;const child=previewProcess;previewProcess=null;await killTree(child);state.preview=stopped();};
  const cancelCheck=async()=>{if(state.task?.validationRun?.status==='running')state.task.validationRun.status='cancelled';const child=checkProcess;checkProcess=null;if(state.task?.check?.status==='running'){state.task.check.status='cancelled';outputs.finish(state.task.id,state.task.check.id,'cancelled');state.task.check.endedAt=now();persist();}await killTree(child);};
  const cleanup=async(disconnect=true)=>{await cancelCheck();await stopPreview();if(disconnect)await runtime?.disconnect?.();};
  const requireNavigationIdle=()=>{if(contextBusy(context)){const current=context.runtime?.snapshot?.();throw Error(current?.pending&&(current.reason||(current.pending.kind==='approval'?'Approval required':'Muse needs your attention'))||'Finish or disconnect the running Muse turn before switching projects or tasks.');}};
  const navigationCleanup=async()=>{
    pauseGoalDriver(state.task?.goal?.driver,'Changed active chat; explicitly resume continuation');
    if(runtimeFactory){await cleanup(false);saveTask();return;}
    context.navigation=true;context.pending=false;context.turn=null;if(state.task){state.task.queuePaused=true;state.task.queueHold=Boolean(state.task.promptQueue?.length);}
    try{await cleanup();state.runtime=runtime?.snapshot?.()??missingRuntime();if(state.runtime.cleanup==='unconfirmed')throw Error('Native shutdown could not be confirmed. Disconnect Muse before switching projects or tasks.');}
    finally{context.navigation=false;saveTask();context.messageBaseline=runtimeMessageIds(state.runtime);}
  };
  const deleteArchivedChat=async (id,allowUnarchived=false)=>{
    requireNavigationIdle();if(typeof allowUnarchived!=='boolean')throw Error('Invalid direct-delete choice.');const target=taskRecords.get(id);if(!target)throw Error('Chat not found.');if(!target.archived&&!allowUnarchived)throw Error('Archive this chat before permanently deleting it.');if(contextBusy(contexts.get(id)))throw Error('Stop this chat before deleting it.');
    const previous={state:structuredClone(state),baseline,records:new Map(taskRecords)};
    if(state.task?.id===id){await navigationCleanup();state.task=null;baseline={};diffCache.clear();state.runtime=missingRuntime();}
    db.exec('BEGIN IMMEDIATE');
    try{
      executions.deleteTask(id);outputs.deleteTask(id);history.deleteTask(id);db.prepare('DELETE FROM restore_operations WHERE task_id=?').run(id);db.prepare('DELETE FROM tasks WHERE id=?').run(id);db.prepare('DELETE FROM baselines WHERE task_id=?').run(id);db.prepare('DELETE FROM checkpoints WHERE task_id=?').run(id);
      const retained=contexts.get(id);if(retained){retained.unsubscribe?.();retained.unsubscribe=null;retained.task=null;contexts.delete(id);}if(context.task?.id===id)context.task=null;
      analytics.deleteTask(id);taskRecords.delete(id);delete state.drafts[draftKey(target.projectId,id)];state.checkpoints=state.checkpoints.filter(item=>item.taskId!==id);persist();db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');Object.assign(state,previous.state);baseline=previous.baseline;taskRecords.clear();for(const [key,value] of previous.records)taskRecords.set(key,value);state.runtime=runtime?.snapshot?.()??missingRuntime();throw error;}
    try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{/* Logical deletion is committed; SQLite retries checkpointing on close. */}
  };
  const purgeArchived=async()=>{
    if(closed||closing||context.pending||['running','starting','submitting','connecting','checking-permissions'].includes(state.runtime.status))return;
    const expired=[...taskRecords.values()].filter(t=>t.archived&&Number.isFinite(Date.parse(t.archivedAt))&&archiveNow()-Date.parse(t.archivedAt)>=30*24*60*60*1000);
    for(const task of expired)await deleteArchivedChat(task.id);
    if(expired.length)emit();
  };
  const newestTask=projectId=>summaries().find(t=>t.projectId===projectId&&!t.archived);
  const selectProject=async(p,taskId=newestTask(p.id)?.id)=>{
    if(state.activeProject?.id===p.id&&state.task?.id===taskId)return;
    requireSwitchable();
    if(await canonicalRoot(p.root)!==p.root)throw Error('The workspace canonical path changed. Reopen the project.');
    const info=await scriptsFor(p.root);
    let restored=null,restoredBaseline={};
    if(taskId){
      const record=taskRecords.get(taskId);if(!record||record.projectId!==p.id)throw Error('Saved task has no valid project association.');
      const row=db.prepare('SELECT revision,json FROM baselines WHERE task_id=?').get(taskId);if(!row||row.revision!==record.baselineRevision)throw Error('The saved task baseline is unavailable. Start a new task.');
      restored=contexts.get(taskId)?.task??restoreTask(record);restoredBaseline=JSON.parse(row.json);
    }
    await navigationCleanup();
    const git=await projectGit(p.root);
    // Capture after cleanup, which may finish source writes. Validate before
    // replacing the selection, then use this same fresh capture for its diff.
    if(await canonicalRoot(p.root)!==p.root)throw Error('The workspace canonical path changed. Reopen the project.');
    const snap=await snapshot(p.root);
    p.scripts=info.scripts;Object.assign(p,git);state.activeProject=p;state.task=restored;baseline=restoredBaseline;bindContext(restored);
    if(state.task)await applyCurrentSnapshot(snap);
  };
  const startTask=async(request,mode,runOptions)=>{
    const options=validateRunOptions(runOptions);
    if(!state.activeProject)throw Error('Open a project first.');if(typeof request!=='string'||!request.trim())throw Error('Describe the change first.');if(!['manual','demo','muse'].includes(mode))throw Error('Unknown task mode.');
    requireSwitchable();await cleanup(false);saveTask();
    if(!runtimeFactory&&state.task&&runtime?.snapshot?.().permissionVerified){await runtime.disconnect();state.runtime=runtime.snapshot();context.root=null;if(state.runtime.cleanup==='unconfirmed')throw Error('Native shutdown could not be confirmed. Disconnect before starting another chat.');}
    const snap=await snapshot(state.activeProject.root);baseline=snap.files;if(runtimeFactory)bindContext(null);context.pending=false;
    context.messageBaseline=runtimeMessageIds(state.runtime);context.turn=null;
    const demo=mode==='demo',plan=demo?'Demo plan: add a caffeine preference filter to the tea collection. Offer All teas and Caffeine free choices, preserve the storefront, and keep product counts clear.':'Review the request and local project. Describe the intended change, then approve this plan before accepting work.';
    const createdAt=now();state.task={runOptions:options,id:randomUUID(),projectId:state.activeProject.id,createdAt,updatedAt:createdAt,title:request.trim().slice(0,100),request:request.trim().slice(0,12000),mode,plan,criteria:demo?['Caffeine free shows only herbal teas.','All teas restores the full collection.','The storefront works at narrow widths.']:['The requested change works in the preview.','The selected project check passes.'],planApproved:false,baselineRevision:snap.revision,revision:snap.revision,changes:[],messages:[],shellResults:[],runs:[],promptQueue:[],queuePaused:true,check:null,previewRevision:null,acceptedRevision:null,runtimeComplete:false};
    bindContext(state.task);
    db.prepare('INSERT INTO baselines(task_id,revision,json) VALUES(?,?,?)').run(state.task.id,snap.revision,JSON.stringify(baseline));
    message('system',demo?'Deterministic tutorial. Only this copied sample is edited; diffs, preview, checks and checkpoints use real local files.':mode==='muse'?'Muse chat started. Send a request to connect with your selected approval access. Planning is optional; execution access is set in your connection settings.':'Local task started. Approving a manual plan explicitly confirms user-directed manual work.');message(demo?'assistant':'system',plan);
  };
  const refreshScripts=async()=>{const p=state.activeProject;if(!p)throw Error('Open a project first.');p.scripts=(await scriptsFor(p.root)).scripts;Object.assign(p,await projectGit(p.root));return p;};
  const runCheck=async script=>{
    const task=requireTask();requireNavigationIdle();requireWritable(task,state.activeProject);if(checkProcess)throw Error('A check is running. Cancel it first.');const project=await refreshScripts();if(!Object.hasOwn(project.scripts,script))throw Error('Choose a script listed in package.json.');const snap=await current();
    const check={id:randomUUID(),script,command:`npm run --ignore-scripts ${script} — ${project.scripts[script]}`,status:'running',revision:snap.revision,exitCode:null,log:'',startedAt:now()};task.check=check;outputs.start(task.id,check.id,check.command);checkInvalidated=false;const taskId=task.id,child=launchScript(project.root,script);checkProcess=child;
    const append=text=>{if(closed||state.task?.id!==taskId||state.task.check?.id!==check.id)return;outputs.append(taskId,check.id,text);check.log=(check.log+text).slice(-MAX_LOG);emit();};
    for(const stream of [child.stdout,child.stderr]){const decoder=new StringDecoder('utf8');stream.on('data',chunk=>append(decoder.write(chunk)));stream.on('end',()=>{const tail=decoder.end();if(tail)append(tail);});}
    let done=false;const timeout=setTimeout(async()=>{append(`\n[MuseBench] Check stopped after ${checkTimeoutMs} ms timeout.`);await killTree(child);finish(null,Error('Project check timed out.'));},Math.max(100,Math.min(checkTimeoutMs,600000)));
    const finish=(code,error)=>{if(done)return;done=true;clearTimeout(timeout);queue=queue.then(async()=>{
      if(closed||state.task?.id!==taskId||state.task.check?.id!==check.id)return;if(checkProcess===child)checkProcess=null;if(error){outputs.append(taskId,check.id,'\n[MuseBench] '+error.message);check.log=(check.log+'\n'+error.message).slice(-MAX_LOG);}check.exitCode=code;check.endedAt=now();
      if(check.status!=='cancelled')try{const latest=await current();check.status=checkInvalidated||latest.revision!==check.revision?'stale':code===0?'passed':'failed';}catch(e){check.status='stale';state.error=e.message;}
      outputs.finish(task.id,check.id,check.status);task.checkReceipts=[...(task.checkReceipts??[]),{...check,log:check.log.slice(-8000)}].slice(-40);
      const validation=task.validationRun;
      if(validation?.status==='running'){
        if(check.status!=='passed'||check.revision!==validation.revision)validation.status=check.status==='passed'?'stale':check.status;
        else if(validation.index+1<validation.scripts.length){validation.index++;try{await runCheck(validation.scripts[validation.index]);}catch(error){validation.status='failed';state.error=error.message;}}
        else validation.status='passed';
      }emit();if(task.goal?.driver?.armed)scheduleGoal(context);
    }).catch(e=>{if(!closed){state.error=e.message;emit();}});};child.once('error',e=>finish(null,e));child.once('close',code=>finish(code));
  };
  const startPreview=async script=>{
    requireTask();await stopPreview();const p=await refreshScripts(),command=p.scripts[script];if(!command)throw Error('Choose a preview script listed in package.json.');
    const demo=p.demo&&(inside(projectsDir,p.root)||inside(legacyProjectsDir,p.root))&&command==='node server.mjs';
    if(!demo&&!/^vite(?: --strictPort)?$/.test(command.trim()))throw Error('Preview supports a direct vite dev script and the tutorial. Built-output previews require rebuild provenance; other servers need a supported loopback recipe.');
    await current();const port=await freePort(),url=`http://127.0.0.1:${port}/`,token=randomUUID();previewToken=token;state.preview={status:'starting',url:null,log:`npm run --ignore-scripts ${script} — ${command}\nLoopback port ${port}\n`,script};
    const child=launchScript(p.root,script,['--host','127.0.0.1','--port',String(port),...(!demo?['--strictPort']:[])]);previewProcess=child;
    const append=chunk=>{if(closed||previewToken!==token)return;state.preview.log=(state.preview.log+chunk.toString()).slice(-MAX_LOG);emit();};child.stdout.on('data',append);child.stderr.on('data',append);
    const fail=text=>{if(closed||previewToken!==token)return;state.preview.status='failed';state.preview.url=null;state.preview.log=(state.preview.log+'\n'+text).slice(-MAX_LOG);if(state.task)state.task.previewRevision=null;emit();};child.once('error',e=>fail(e.message));child.once('close',code=>fail(`Preview process exited (${code??'signal'}).`));
    void(async()=>{for(let i=0;i<150;i++){if(closed||previewToken!==token||state.preview.status==='failed')return;try{const response=await fetch(url,{signal:AbortSignal.timeout(400)});if(response.ok){await response.body?.cancel();if(previewToken===token){state.preview.status='running';state.preview.url=url;emit();}return;}}catch{}await new Promise(r=>setTimeout(r,100));}fail('Preview did not become ready within 15 seconds.');await killTree(child);})();state.task.previewRevision=null;
  };
  const draftKey=(projectId,taskId)=>`${projectId}:${taskId??'new'}`;
  const writeDraft=async action=>{
    if(!action||typeof action!=='object')throw Error('Invalid draft.');
    const project=state.projects.find(p=>p.id===action.projectId);
    if(!project||action.taskId!=null&&taskRecords.get(action.taskId)?.projectId!==project.id)throw Error('Draft project or chat is unavailable.');
    if(typeof action.text!=='string'||action.text.length>16000||!['chat','plan'].includes(action.mode??'chat'))throw Error('Invalid draft.');
    const key=draftKey(action.projectId,action.taskId),files=fileReferences(action.files),images=imageReferences(action.images);
    await imageStore.resolve(action.projectId,images);
    const value=!action.text&&!files.length&&!images.length?null:{text:action.text,files,images,mode:action.mode??'chat',updatedAt:now()};
    draftStore.write(key,value);
    if(value===null)delete state.drafts[key];else state.drafts[key]=value;
  };
  const saveCodeDraft=input=>{
    if(closing||closed)return Promise.reject(Error('Controller closed.'));
    // Retain ordering with sends/navigation and close draining, without
    // flushing runtime progress, publishing state, or building a snapshot.
    const operation=queue.then(async()=>{if(closed)throw Error('Controller closed.');await writeDraft(input);});
    queue=operation.catch(()=>{});
    return operation;
  };
  const validateBinding=(projectId,taskId)=>{
    if(state.activeProject?.id!==projectId||taskId!=null&&state.task?.id!==taskId)throw Error('The selected project or chat changed. Open context again.');
  };
  const inspectWorktrees=async ({projectId})=>{const p=state.projects.find(p=>p.id===projectId);if(!p)throw Error('Project unavailable.');return worktrees.inspect(p.root);};
  const importImage=async ({projectId,taskId=null,...input})=>{validateBinding(projectId,taskId);const ref=await imageStore.import(projectId,input);validateBinding(projectId,taskId);return ref;};
  const readImage=async ({projectId,image})=>{if(!state.projects.some(p=>p.id===projectId))throw Error('Project unavailable.');return imageStore.read(projectId,image);};
  const contextAllowed=name=>!name.split('/').some(part=>['.muse','.codex','.config','auth.json','.mcp.json'].includes(part.toLowerCase()));
  const selectedSources=async(files=[],project=state.activeProject)=>{
    const refs=fileReferences(files);if(!project)throw Error('Open a project first.');
    const root=project.root;if(await canonicalRoot(root)!==root)throw Error('Project path changed. Reopen the project.');
    const snap=await snapshot(root);let size=0;
    const attachments=refs.map(ref=>{const file=snap.files[ref.path];if(!contextAllowed(ref.path)||!file||file.binary||file.hash!==ref.hash)throw Error(`Context file changed or is unavailable. Select it again: ${ref.path}`);size+=JSON.stringify({path:ref.path,hash:ref.hash,text:file.text}).length;if(size>FILE_CONTEXT_LIMIT)throw Error('Selected files exceed 24,000 characters. Choose fewer or smaller files.');return{...ref,text:file.text};});
    return{snap,attachments};
  };
  db.exec('CREATE TABLE IF NOT EXISTS restore_operations(id TEXT PRIMARY KEY, task_id TEXT NOT NULL, json TEXT NOT NULL)');
  const inspectCheckpoint=async({taskId,id}={})=>{
    const t=requireTask();if(taskId!==t.id)throw Error('Active chat changed.');const row=db.prepare('SELECT json FROM checkpoints WHERE id=? AND task_id=?').get(id,taskId);if(!row)throw Error('Checkpoint not found in this chat.');const checkpoint=JSON.parse(row.json),snap=await snapshot(state.activeProject.root);
    return{revision:snap.revision,files:changes(snap.files,checkpoint.files).map(change=>({...change,restorable:!snap.files[change.path]?.binary&&!checkpoint.files[change.path]?.binary})),operations:db.prepare('SELECT json FROM restore_operations WHERE task_id=? ORDER BY rowid DESC LIMIT 5').all(taskId).map(row=>{const op=JSON.parse(row.json);return{id:op.id,status:op.status,completed:op.completed.length,total:op.paths.length};})};
  };
  const inspectContext=async({projectId,taskId=null,text='',files=[]}={})=>{
    validateBinding(projectId,taskId);const task=taskId?structuredClone(state.task):null,project=structuredClone(state.activeProject),memories=state.memories;
    const {snap,attachments}=await selectedSources(files);validateBinding(projectId,taskId);
    const context=composeChatContext({task,project,memories,text,attachments,history:state.runtime.transport==='msp'?!state.runtime.sessionSeeded:!task?.nativeSession?.seeded,nativeSession:state.runtime.transport==='msp'?!!state.runtime.sessionSeeded:!!task?.nativeSession?.seeded});
    return{...context,receipt:contextReceipt(context,{project,memories,attachments,revision:snap.revision}),attachments,files:Object.entries(snap.files).filter(([name,f])=>contextAllowed(name)&&!f.binary).map(([path,f])=>({path,hash:f.hash,characters:f.text.length}))};
  };
  const searchChats=({query='',includeArchived=false}={})=>{
    if(typeof query!=='string'||query.length>200||typeof includeArchived!=='boolean')throw Error('Invalid chat search.');
    const needle=query.trim().toLocaleLowerCase();return summaries().filter(t=>includeArchived||!t.archived).flatMap(summary=>{
      const t=taskRecords.get(summary.id),project=state.projects.find(p=>p.id===t.projectId);
      const hit=needle?history.search(t.id,query):null;
      const source=[t.title,project.name].find(text=>text.toLocaleLowerCase().includes(needle));
      if(!hit&&source===undefined)return[];
      return[{...summary,projectName:project.name,snippet:hit?.snippet??source,...(hit?{messageId:hit.messageId,offset:hit.offset,at:hit.at}:{})}];
    }).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)).slice(0,100);
  };
  const semanticQueries=new Set();
  const semanticNavigate=async input=>{const project=state.activeProject;if(closing||closed)throw Error('Controller closed.');if(!project||input?.projectId!==project.id)throw Error('Choose the current project.');const service=createSemanticNavigation(project.root);semanticQueries.add(service);try{const result=await service.query(input);if(closing||closed||state.activeProject?.id!==project.id)throw Error('The selected project changed. Run navigation again.');return result;}finally{await service.dispose();semanticQueries.delete(service);}};
  const readCapturedOutput=input=>{if(!input||!taskRecords.has(input.taskId))throw Error('Chat not found.');return outputs.read(input);};
  const readChatHistory=input=>{if(!input||!taskRecords.has(input.taskId))throw Error('Chat not found.');return history.page(input);};
  const selectedContext=()=>context;
  const connectNative=async(owner,task,project,options={})=>{
    for(const field of ['fullAccess','workspaceTools'])if(options[field]!==undefined&&typeof options[field]!=='boolean')throw Error(`${field} must be an explicit boolean.`);
    const saved=task?.nativeSession,transport=options.transport??saved?.transport??(saved?'exec':undefined);
    if(saved&&saved.root!==project.root)throw Error('This session belongs to another folder. Start a fresh session before continuing.');
    if(saved&&transport!==(saved.transport??'exec'))throw Error('This session belongs to another transport. Start a fresh session before continuing.');
    const request={binary:options.binary??preferredBinary??undefined,workspaceRoot:project.root,transport,fullAccess:options.fullAccess??saved?.fullAccess??false,workspaceTools:options.workspaceTools??saved?.workspaceTools??false,...(saved?.transport==='msp'?{sessionId:saved.id}:{})};
    await owner.runtime.connect(request);owner.root=project.root;
    const next=owner.runtime.snapshot();if(owner===selectedContext())state.runtime=next;
    preferredBinary=next.binary??preferredBinary;
    if(task&&next.transport==='msp'&&next.permissionVerified&&next.nativeSessionId){
      if(saved&&saved.id!==next.nativeSessionId){await owner.runtime.disconnect();throw Error('Native session restoration returned a different session. Start fresh explicitly to replace it.');}
      const restored=next.restoration?.status==='restored',active=restored?next.restoration.activeTurnId:null;
      task.nativeSession={id:next.nativeSessionId,root:project.root,transport:'msp',seeded:next.sessionSeeded===true||saved?.seeded===true,status:active?'needs-recovery':'ready',fullAccess:request.fullAccess,workspaceTools:request.workspaceTools};
      if(active){
        const receipt=executions.list(task.id).find(r=>r.nativeSessionId===next.nativeSessionId&&r.runId===active),run=receipt&&(task.runs??[]).find(r=>r.id===receipt.id&&r.runId===active);
        if(receipt&&run){owner.turn={taskId:task.id,promptId:receipt.id,messageBaseline:runtimeMessageIds({messages:[]}),previousRunId:null,runId:active,started:true,resetSeen:false,restored:true};owner.pending=true;task.nativeSession.status='running';onRuntime(next,owner);}
        else{task.nativeSession.status='needs-recovery';task.queuePaused=true;task.queueHold=true;}
      }
      saveRecord(task);persist();
    }
    return next;
  };
  const sendToTask=async(action,t=state.task,context=contexts.get(t?.id)??selectedContext())=>{
        const runtime=context.runtime,project=state.projects.find(p=>p.id===t?.projectId);if(!t||!project)throw Error('Chat or project unavailable.');
        const assertGoalDispatch=()=>{if(!action.fromGoal)return;const driver=t.goal?.driver;if(!driver?.armed||driver.id!==action.goalDriverId)throw Error(driver?.reason||'Goal continuation is no longer active.');if(Date.now()>=driver.deadline){pauseGoalDriver(driver,'Time budget reached');throw Error(driver.reason);}if(context!==selectedContext()||t.promptQueue?.length)throw Error('User input or navigation takes priority');};
        assertGoalDispatch();
        let runtimeState=runtime?.snapshot?.()??missingRuntime();
        if(closing)throw Error('The app is closing. This prompt was not sent.');
        if(runtimeFactory){if(contextBusy(context))throw Error('This chat already has a running or unresolved request.');}else requireNavigationIdle();if(t.mode==='muse')requireWritable(t,project);if(t.archived)throw Error('Restore this archived chat before sending.');if(t.validationRun?.status==='running')throw Error('Wait for validation or cancel it first.');if(action.fromQueue&&action.requiredChecks?.length){const snap=await snapshot(project.root);const missing=missingChecks(t,snap.revision,validateCheckScripts(action.requiredChecks));if(missing.length)throw Error('Run passing checks for this revision before this workflow phase: '+missing.join(', '));}if(typeof action.text!=='string'||!action.text.trim()||action.text.length>16000)throw Error('Use a prompt up to 16,000 characters.');
        const files=fileReferences(action.files),images=imageReferences(action.images);const imagePaths=await imageStore.resolve(t.projectId,images);if(images.length&&t.mode!=='muse')throw Error('Screenshots require a Muse chat.');if(!action.fromQueue&&!state.drafts[draftKey(t.projectId,t.id)])state.drafts[draftKey(t.projectId,t.id)]={text:action.text,files,images,mode:action.mode??'chat',updatedAt:now()};const {attachments,snap:contextSnapshot}=await selectedSources(files,project);
        if(closing)throw Error('The app is closing. This prompt was not sent.');
        const prepared=composeChatContext({task:t,project:project,memories:state.memories,text:action.text,attachments,history:runtimeState.transport!=='msp'||!runtimeState.sessionSeeded});
        if(t.mode==='muse'){
          if(!runtime)throw Error('Muse is unavailable. Connect an installed Muse CLI first.');
          if(t.nativeSession&&t.nativeSession.status!=='ready')throw Error('Open Session to recover the interrupted native run before sending another request.');
          const connection=runtime.snapshot?.()??runtimeState;
          // Sending is the user's request to connect. Never reconnect over a pending
          // approval, an uncertain run, or an existing verified runtime.
          if(runtimeFactory&&context.root!==project.root||['unavailable','closed'].includes(connection.status)&&!connection.pending&&!connection.permissionVerified){
            runtimeState=await connectNative(context,t,project);
          }
          if(closing)throw Error('The app is closing. This prompt was not sent.');
          assertGoalDispatch();
          if(images.length&&runtimeState.transport!=='exec'&&runtimeState.imagesSupported!==true)throw Error('This native connection does not support screenshots.');
          delete t.queueError;
          const previousSession=t.nativeSession?structuredClone(t.nativeSession):null;
          const durable=runtimeState.durableSessions===true?prepareNativeSession(t.nativeSession,project.root,runtimeState):null;
          const prepared=composeChatContext({task:t,project:project,memories:state.memories,text:action.text,attachments,history:durable?durable.history:runtimeState.transport!=='msp'||!runtimeState.sessionSeeded,nativeSession:runtimeState.transport==='msp'?!!runtimeState.sessionSeeded:!!durable&&!durable.history});
          if(durable)t.nativeSession=durable.session;
          t.skillReceipts=[];t.nativeUsage=null;t.runtimeComplete=false;t.acceptedRevision=null;context.pending=true;
          const before=runtime.snapshot?.()??runtimeState;
          const prompt={id:randomUUID(),role:'user',text:action.text.slice(0,16000),files,images,sources:attachments,at:now()};
          context.turn={taskId:t.id,promptId:prompt.id,queueItemId:action.fromQueue?action.id:null,messageBaseline:runtimeMessageIds(before),previousRunId:before.runId??null,runId:null,started:false,resetSeen:false};
          t.runs=restoreRuns([...(t.runs??[]),{id:prompt.id,promptId:prompt.id,prompt:prompt.text,runId:null,status:'queued',startedAt:prompt.at,activities:[]}],{interrupt:false});
          t.messages.push(prompt);t.messages=t.messages.slice(-150);
          const {prompt:contextPrompt,...contextSummary}=prepared;t.contextSummary={...contextSummary,receipt:contextReceipt(prepared,{project,memories:state.memories,attachments,revision:contextSnapshot.revision})};
          executions.begin(t.id,{id:prompt.id,promptHash:t.contextSummary.receipt.promptHash,revision:contextSnapshot.revision,nativeSessionId:durable?.session.id??null,binary:before.binary??null,hostVersion:before.hostVersion??null,processId:null,runId:null});
          context.task=t;saveRecord(t);persist();executions.patch(prompt.id,{phase:'dispatched'});
          try{await runtime.send({text:contextPrompt,imagePaths,...(durable?{sessionId:durable.session.id,resumeSession:Boolean(previousSession)}:{}),mode:action.mode??'chat',runOptions:restoreRunOptions(action.fromQueue?action.runOptions:t.runOptions)});}
          catch(e){
            const rejected=e?.inputAdmission==='not-sent'||executions.list(t.id).find(r=>r.id===prompt.id)?.result==='rejected',unknownNative=runtimeState.transport==='msp'&&durable&&!rejected;
            executions.patch(prompt.id,{phase:'settled',result:rejected?'rejected':'unknown',reason:String(e.message).slice(0,1000)});
            if(unknownNative){t.nativeSession={...durable.session,status:'needs-recovery'};const run=t.runs.find(r=>r.id===prompt.id);if(run){run.status='interrupted';run.endedAt=now();}prompt.outcome='interrupted';}
            else if(!context.turn?.started){t.nativeSession=previousSession;if(!action.fromQueue&&!state.drafts[draftKey(t.projectId,t.id)])state.drafts[draftKey(t.projectId,t.id)]={text:action.text,files,images,mode:action.mode??'chat',updatedAt:now()};history.remove(t.id,prompt.id);t.messages=t.messages.filter(item=>item.id!==prompt.id);t.runs=(t.runs??[]).filter(item=>item.id!==prompt.id);}
            context.pending=false;context.turn=null;throw Object.assign(new Error(String(e.message??e)),{queueDeliveryUnknown:action.fromQueue&&!rejected});
          }
        }else{t.messages.push({id:randomUUID(),role:'user',text:action.text,at:now()},{id:randomUUID(),role:'system',text:'Added to the local task journal. Manual and demo messages do not call a model.',at:now()});}if(!action.fromQueue&&state.drafts[draftKey(t.projectId,t.id)]?.text===action.text)delete state.drafts[draftKey(t.projectId,t.id)];saveRecord(t);
  };

  const deliverQueued=async(t,item,owner,{runQueue=false}={})=>{
    queuedPrompt(t,{taskId:t.id,id:item.id,expectedRevision:item.revision??0});
    t.queuePaused=!runQueue;t.queueHold=!runQueue;item.delivery='sending';saveRecord(t);persist();
    try{await sendToTask({...item,type:'sendMessage',fromQueue:true},t,owner);}
    catch(error){item.delivery=error.queueDeliveryUnknown?'unknown':'ready';t.queuePaused=true;t.queueHold=true;t.queueError=error.message;throw error;}
    finally{saveRecord(t);persist();}
  };
  const queueEligible=c=>!closing&&!closed&&c.task?.mode==='muse'&&!c.task.queueHold&&!c.task.queuePaused&&c.task.promptQueue?.length&&!c.task.archived;
  const scheduleQueue=(owner=context)=>{
    if(owner.queueScheduled||!queueEligible(owner))return;owner.queueScheduled=true;
    const operation=queue.then(async()=>{
      const t=owner.task,next=owner.runtime?.snapshot?.();if(!queueEligible(owner)||owner.pending)return;
      if(next?.status!=='completed'||next.cleanup!=='confirmed'||!t.runtimeComplete){t.queuePaused=true;t.queueHold=true;saveRecord(t);emit();return;}
      const item=t.promptQueue[0];
      try{await deliverQueued(t,item,owner,{runQueue:true});}
      catch(error){t.queuePaused=true;t.queueHold=true;t.queueError=error.message;}finally{saveRecord(t);emit();}
    });
    queue=operation.catch(()=>{});void operation.finally(()=>{owner.queueScheduled=false;if(!owner.pending&&owner.runtime?.snapshot?.().status==='completed'&&queueEligible(owner))scheduleQueue(owner);}).catch(()=>{});
  };
  const scheduleGoal=(owner=context)=>{
    const driver=owner.task?.goal?.driver;if(owner.goalScheduled||!driver?.armed||closing||closed)return;owner.goalScheduled=true;const ticket=driver.id;
    setTimeout(()=>{owner.goalScheduled=false;if(closing||closed)return;const operation=queue.then(async()=>{
      const t=owner.task,d=t?.goal?.driver;if(!d?.armed||d.id!==ticket||owner.pending)return;if(owner!==selectedContext()){pauseGoalDriver(d,'Active chat changed');saveRecord(t);return;}
      if(t.validationRun?.status==='running')return;
      if(d.phase==='checking'&&t.validationRun?.status==='passed'){const snap=await current();if(missingChecks(t,snap.revision,t.validationRun.scripts).length)t.validationRun.status='stale';}
      if(d.phase==='checking'&&t.validationRun?.status==='failed'){const fingerprint=hash((t.check?.script??'')+'\n'+JSON.stringify(checkDiagnostics(t.check?.log??'').length?checkDiagnostics(t.check.log):{revision:t.check?.revision,exitCode:t.check?.exitCode}));d.repeatedFailures=d.lastFailure===fingerprint?d.repeatedFailures+1:1;d.lastFailure=fingerprint;}
      const decision=goalDecision(d,{userPending:!!t.promptQueue?.length,result:executions.list(t.id)[0]?.result,validation:t.validationRun?.status});
      if(decision.kind==='pause'){pauseGoalDriver(d,decision.reason);saveRecord(t);emit();return;}
      if(decision.kind==='validate'){
        const p=await refreshScripts(),scripts=validateCheckScripts(p.validationScripts),snap=await current();d.phase='checking';t.validationRun={scripts,revision:snap.revision,index:0,status:'running'};saveRecord(t);await runCheck(scripts[0]);emit();return;
      }
      if(decision.kind==='run'){
        d.rounds++;d.phase='running';saveRecord(t);const diagnostic=t.check?.status==='failed'?`\nValidation failed (${t.check.script}):\n${t.check.log.slice(-6000)}`:'';
        await sendToTask({type:'sendMessage',fromGoal:true,goalDriverId:ticket,text:`Continue this objective within the current run budget: ${t.goal.objective}\nVerify the existing work. Avoid repeating completed external actions. The app will run the saved validation profile when you finish.${diagnostic}`},t,owner);emit();
      }
    }).catch(error=>{const d=owner.task?.goal?.driver;if(d?.id===ticket){pauseGoalDriver(d,error.message);if(owner.task.validationRun?.status==='running'&&!checkProcess)owner.task.validationRun.status='failed';saveRecord(owner.task);emit();}});queue=operation.catch(()=>{});},150);
  };
  const onRuntime=(event,owner)=>{
    const selected=owner===selectedContext(),context=owner,runtime=owner.runtime,task=owner.task;
    if(closed)return;const next=runtime?.snapshot?.()??event;if(!next||typeof next!=='object')return;if(selected)state.runtime=structuredClone(next);
    if(task&&next.childReceipts?.length){for(const receipt of next.childReceipts)task.childControlReceipts=[...(task.childControlReceipts??[]).filter(r=>r.commandId!==receipt.commandId),structuredClone(receipt)].slice(-40);saveRecord(task);}
    if(task&&next.compaction?.commandId){task.compactionReceipts=[...(task.compactionReceipts??[]).filter(r=>r.commandId!==next.compaction.commandId),structuredClone(next.compaction)].slice(-20);saveRecord(task);}
    if(task&&next.inputResponse?.userInputId){
      const receipt=next.inputResponse,key=`input:${receipt.sessionId}:${receipt.userInputId}`;
      task.inputReceipts=[...(task.inputReceipts??[]).filter(r=>r.sessionId!==receipt.sessionId||r.userInputId!==receipt.userInputId),structuredClone(receipt)].slice(-20);
      const text=confirmedInputText(receipt);
      if(text&&!task.messages.some(m=>m.id===key)){const message={id:key,role:'user',text,turnId:context.turn?.promptId,at:now()};history.put(task.id,message);task.messages.push(message);task.messages=task.messages.slice(-150);}
      saveRecord(task);
    }
    if(task?.mode==='muse'&&!context.navigation){
      // A native child can resume its exclusively owned parent after an idle interval.
      if(next.transport==='msp'&&next.status==='running'&&context.turn?.taskId===task.id&&context.turn.runId===next.rootTurnId)context.pending=true;
      const turn=context.pending&&context.turn?.taskId===task.id?context.turn:null;
      if(turn&&['running','starting','submitting'].includes(next.status)){
        turn.started=true;
        if(next.transport==='exec'&&next.runId===null)turn.resetSeen=true;
      }
      if(turn?.started&&next.transport==='exec'&&turn.resetSeen&&!turn.runId&&typeof next.runId==='string'&&next.runId!==turn.previousRunId)turn.runId=next.runId;
      if(turn?.started&&next.transport==='msp'&&next.inputAccepted===true&&next.turnId&&!turn.runId&&next.rootTurnId)turn.runId=next.rootTurnId;
      const ownsTurn=Boolean(turn?.started&&(next.transport==='msp'?turn.runId&&next.rootTurnId===turn.runId&&(!task.nativeSession||task.nativeSession.id===next.nativeSessionId):next.transport!=='exec'||turn.runId&&next.runId===turn.runId));
      if(ownsTurn&&task.nativeSession&&task.nativeSession.id===next.nativeSessionId&&next.inputAccepted===true)task.nativeSession.seeded=true;
      if(ownsTurn){
        executions.patch(turn.promptId,{phase:'running',result:'unknown',runId:turn.runId,nativeSessionId:next.nativeSessionId??task.nativeSession?.id??null,processId:Number.isInteger(next.pid)?next.pid:null,acceptance:next.inputAccepted===true?'accepted':'unknown'});
        task.nativeUsage=restoreUsage(next.usage);task.skillReceipts=restoreSkillReceipts(next.skills);
        for(const item of Array.isArray(next.messages)?next.messages:[]){const key=runtimeMessageKey(item);if(typeof item?.text!=='string'||context.messageBaseline.has(key)||turn.messageBaseline.has(key)||!['userMessage','agentMessage'].includes(item.kind)||next.transport==='msp'&&item.kind==='userMessage')continue;const known=task.messages.find(m=>m.id===`runtime:${key}`);const received={id:`runtime:${key}`,role:item.kind==='userMessage'?'user':'assistant',text:item.text,turnId:turn.promptId,at:known?.at??now()};history.put(task.id,received);if(known){known.text=item.text.slice(0,16000);known.contextTruncated=item.text.length>16000;continue;}task.messages.push({...received,text:item.text.slice(0,16000),contextTruncated:item.text.length>16000});task.messages=task.messages.slice(-150);}
        if(next.transport==='exec'&&next.shellEnabled===true&&Array.isArray(next.shellResults)){const owned=Array.isArray(next.ownedRunIds)&&next.ownedRunIds.includes(turn.runId)?next.ownedRunIds.slice(0,5):[turn.runId];for(const item of next.shellResults)if(owned.includes(item?.runId)&&boundedShellResult(item))outputs.put(task.id,`shell:${item.runId}:${item.callId}`,item.command||'Native command',item.output,item.terminalStatus,item.truncated===true);for(const runId of owned)task.shellResults=mergeShellResults(task.shellResults,next.shellResults,runId);}
      }
      const verifiedApprovalPause=next.status==='blocked'&&next.permissionVerified===true&&typeof next.sessionId==='string'&&(['approval','input'].includes(next.pending?.kind)&&next.pending.sessionId===next.sessionId||next.transport==='msp'&&next.restoringRequests>0&&ownsTurn&&task.nativeSession?.id===next.sessionId);
      const queued=turn?.queueItemId&&task.promptQueue?.find(item=>item.id===turn.queueItemId);
      if(queued?.delivery==='sending'){
        if(ownsTurn&&(next.inputAccepted===true||next.status==='completed'&&next.cleanup==='confirmed'))task.promptQueue=task.promptQueue.filter(item=>item.id!==queued.id);
        else if(['completed','failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)&&!verifiedApprovalPause){queued.delivery=next.inputAccepted===false&&!turn.runId&&next.cleanup==='confirmed'?'ready':'unknown';task.queuePaused=true;task.queueHold=true;task.queueError=next.reason??(queued.delivery==='ready'?'Request was not accepted. Review and send it when ready.':'Request outcome is unknown. Check the session before sending again.');}
      }
      if(turn&&['completed','failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)&&!verifiedApprovalPause){const rejected=next.inputAccepted===false&&!turn.runId&&next.cleanup==='confirmed';executions.patch(turn.promptId,{phase:'settled',result:rejected?'rejected':ownsTurn&&next.cleanup==='confirmed'&&['completed','failed','cancelled'].includes(next.status)?next.status:'unknown',acceptance:next.inputAccepted===true?'accepted':rejected?'rejected':'unknown',cleanup:next.cleanup??'unknown',reason:typeof next.reason==='string'?next.reason.slice(0,1000):null});}
      const progress=turn&&(task.runs??[]).find(item=>item.id===turn.promptId);
      if(progress){
        if(ownsTurn){progress.runId=turn.runId;progress.ownedRunIds=Array.isArray(next.ownedRunIds)&&next.ownedRunIds.includes(turn.runId)?next.ownedRunIds.slice(0,5):[turn.runId];if(Array.isArray(next.activity?.items)){progress.activities=next.activity.items;progress.truncated=next.activity.truncated===true;}}
        if(['running','starting','submitting'].includes(next.status)){progress.status='working';delete progress.endedAt;}
        if(['completed','failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)){
          progress.status=next.status==='completed'?(ownsTurn?'completed':'interrupted'):next.status==='cancelled'?'cancelled':verifiedApprovalPause?'waiting':'failed';
          if(!verifiedApprovalPause)progress.endedAt=now();progress.reason=next.reason??'';
          if(!verifiedApprovalPause)progress.activities=progress.activities.map(item=>['queued','working','waiting'].includes(item.status)?{...item,status:next.status==='cancelled'?'cancelled':'interrupted'}:item);
        }
        for(const item of task.messages)if(item.id===progress.promptId||item.turnId===progress.promptId)item.outcome=progress.status;
        task.runs=restoreRuns(task.runs,{interrupt:false});
      }
      if(turn&&task.nativeSession&&['completed','failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)&&!verifiedApprovalPause)task.nativeSession=settleNativeSession(task.nativeSession,next,ownsTurn);
      if(turn&&next.transport==='exec'&&next.inputAccepted===false&&!turn.runId&&['failed','cancelled','unavailable'].includes(next.status)&&next.cleanup==='confirmed'){
        const rejected=task.messages.find(m=>m.id===turn.promptId);
        if(rejected){const key=draftKey(task.projectId,task.id);if(!turn.queueItemId&&!state.drafts[key])state.drafts[key]={text:rejected.text,files:rejected.files??[],images:rejected.images??[],mode:'chat',updatedAt:now()};history.remove(task.id,rejected.id);task.messages=task.messages.filter(m=>m.id!==rejected.id);}
      }
      if(next.status==='completed'&&context.pending){task.runtimeComplete=ownsTurn;context.pending=false;if(next.transport!=='msp')context.turn=null;}
      if(['failed','cancelled','uncertain','unavailable'].includes(next.status)||(next.status==='blocked'&&!verifiedApprovalPause)){task.runtimeComplete=false;context.pending=false;context.turn=null;}
      if(['running','starting','submitting'].includes(next.status))task.runtimeComplete=false;
    }
    if(task&&(['failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)||next.status==='completed'&&next.cleanup!=='confirmed')){task.queuePaused=true;task.queueHold=Boolean(task.promptQueue?.length);}
    publishRuntime(task,next,owner);if(next.status==='completed')scheduleQueue(owner);if(task?.goal?.driver?.armed&&['completed','failed','cancelled','uncertain','unavailable','blocked'].includes(next.status))scheduleGoal(owner);
  };
  const subscribeContext=owner=>{if(!owner.unsubscribe)owner.unsubscribe=owner.runtime?.subscribe?.(event=>onRuntime(event,owner));};
  subscribeContext(context);
  const handle=async action=>{
    switch(action.type){
      // Companion actions are deliberately absent from renderer validateAction.
      // The paired host supplies only these bound operations to this same queue.
      case 'mobileSelect':{
        const task=taskRecords.get(action.taskId),project=state.projects.find(p=>p.id===task?.projectId);
        if(!task||task.mode!=='muse'||task.archived||!project)throw Error('Chat is unavailable.');
        await selectProject(project,task.id);break;
      }
      case 'mobileMessage':case 'mobileStop':{
        const task=state.task;
        if(!task||task.id!==action.taskId||task.mode!=='muse'||task.archived)throw Error('The selected desktop chat changed. Select the chat again.');
        if(action.type==='mobileStop')await handle({type:'disconnectMuse'});
        else {pauseGoalDriver(task.goal?.driver,'User input takes priority');await sendToTask({type:'sendMessage',text:action.text,mode:'chat'});}
        break;
      }
      case 'clearError':state.error=null;break;
      case 'createProject':{
        requireSwitchable();const {name,instructions}=projectDetails(action);
        const parent=await prepareProjectsDir(undefined,newProjectsDir),root=path.join(parent,name);
        if(!inside(parent,root)||inside(root,dataDir))throw Error('Choose a different project location.');
        if((await fs.readdir(parent)).some(entry=>entry.toLowerCase()===name.toLowerCase()))throw Error('A folder with this name already exists. Choose another name or open the existing folder.');
        try{await fs.mkdir(root);}catch(error){if(error.code==='EEXIST')throw Error('A folder with this name already exists. Choose another name.');throw error;}
        if(await canonicalRoot(root)!==root)throw Error('The new project folder changed unexpectedly.');
        await fs.writeFile(path.join(root,'README.md'),`# ${name}\n\n${instructions}\n`,{flag:'wx'});
        const p={id:randomUUID(),name,root,demo:false,scripts:{},instructions};await selectProject(p);state.projects.push(p);break;
      }
      case 'createWorktree':case 'openWorktree':case 'recoverWorktree':{
        requireSwitchable();validateBinding(action.projectId,null);const source=state.activeProject;
        const item=action.type==='createWorktree'?await worktrees.create(source.root,{branch:action.branch,base:action.base}):action.type==='recoverWorktree'?await worktrees.recover(source.root,action.id,action.branch):await worktrees.open(source.root,action.id);
        const root=await canonicalRoot(item.path);if(root!==item.path)throw Error('Worktree folder changed.');const info=await scriptsFor(root);await snapshot(root);
        let p=state.projects.find(p=>p.root===root);if(!p){p={id:randomUUID(),name:source.name.split(' · ')[0]+' · '+item.branch,root,demo:false,scripts:info.scripts,instructions:source.instructions,worktree:{id:item.id,sourceRoot:item.sourceRoot,branch:item.branch,base:item.base}};state.projects.push(p);}await selectProject(p);break;
      }
      case 'archiveWorktree':case 'restoreWorktree':{
        validateBinding(action.projectId,null);const info=await worktrees.inspect(state.activeProject.root),item=info.items.find(w=>w.id===action.id);if(!item)throw Error('Worktree unavailable.');
        for(const c of contexts.values()){const p=state.projects.find(p=>p.id===c.task?.projectId);if(contextBusy(c)&&p&&(inside(p.root,item.path)||inside(item.path,p.root)))throw Error('Stop the chat using this worktree before archiving.');}
        if(checkProcess&&state.activeProject.root===item.path)throw Error('Stop the project check before archiving.');
        await worktrees[action.type==='archiveWorktree'?'archive':'restore'](state.activeProject.root,action.id);break;
      }
      case 'setupWorktree':{
        requireNavigationIdle();validateBinding(action.projectId,null);if(!state.activeProject.worktree)throw Error('Open a managed worktree first.');
        if(!state.task)await startTask('Set up '+state.activeProject.name,'manual');await runCheck(action.script);break;
      }
      case 'openProject':{
        requireSwitchable();const root=await canonicalRoot(action.path);if(inside(root,dataDir))throw Error('The project cannot contain MuseBench application data.');const info=await scriptsFor(root);await snapshot(root);
        let p=state.projects.find(p=>p.root===root);if(!p){p={id:randomUUID(),name:info.name,root,demo:false,scripts:info.scripts};await selectProject(p);state.projects.push(p);}else await selectProject(p);break;
      }
      case 'selectProject':{
        const p=state.projects.find(p=>p.id===action.id);if(!p)throw Error('Saved project not found.');await selectProject(p);break;
      }
      case 'selectTask':{
        const task=taskRecords.get(action.id),p=state.projects.find(p=>p.id===task?.projectId);if(!task||!p)throw Error('Saved task has no valid project association.');await selectProject(p,task.id);break;
      }
      case 'createDemo':{
        requireNavigationIdle();await navigationCleanup();const root=path.join(await prepareProjectsDir(),`tea-store-${randomUUID().slice(0,8)}`);await fs.cp(templateDir,root,{recursive:true,errorOnExist:true,force:false});const info=await scriptsFor(root);const p={id:randomUUID(),name:'Willow & Leaf · tutorial',root,demo:true,scripts:info.scripts};state.projects.push(p);state.activeProject=p;await startTask('Add a caffeine-free tea filter','demo');break;
      }
      case 'createCommandCopy':{
        requireNavigationIdle();
        const source=state.activeProject;if(!source)throw Error('Open a project before creating a working copy.');
        const sourceRoot=await canonicalRoot(source.root);if(inside(sourceRoot,projectsDir))throw Error('Working-copy storage must be outside the original project.');
        const request=state.task?.request??'Review and update this project in the working copy.';
        await navigationCleanup();state.runtime=runtime?.snapshot?.()??state.runtime;
        if(state.runtime.cleanup==='unconfirmed')throw Error('Native shutdown could not be confirmed. Disconnect Muse before copying the project.');
        const snap=await snapshot(sourceRoot),root=path.join(await prepareProjectsDir(sourceRoot),`working-copy-${randomUUID()}`);
        await fs.mkdir(root);
        try{
          for(const [relative,file] of Object.entries(snap.files)){
            const bytes=await readSafe(sourceRoot,relative);if(hash(bytes)!==file.hash)throw Error('The source changed while copying. Refresh and try again.');
            const destination=path.join(root,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
            if(!inside(root,await fs.realpath(path.dirname(destination))))throw Error('Working-copy destination changed during copying.');
            await fs.writeFile(destination,bytes,{flag:'wx'});
          }
          if((await snapshot(sourceRoot)).revision!==snap.revision||(await snapshot(root)).revision!==snap.revision)throw Error('The source changed while copying. Refresh and try again.');
        }catch(error){if(inside(projectsDir,root)&&await fs.realpath(root)===root)await fs.rm(root,{recursive:true,force:true});throw error;}
        const info=await scriptsFor(root),p={id:randomUUID(),name:`${source.name} · working copy`,root,demo:source.demo===true,scripts:info.scripts};
        state.projects.push(p);state.activeProject=p;await startTask(request,'muse');
        message('system','Working copy created from the reviewed source files. Dependencies, Git metadata and local secrets were excluded. Your original project is unchanged.');break;
      }
      case 'newTask':await startTask(action.request,action.mode,action.runOptions);break;
      case 'proposeLesson':{
        requireNavigationIdle();validateBinding(action.projectId,action.taskId);const t=requireTask(),p=state.activeProject;if(!history.page({taskId:t.id,messageId:action.messageId}).messages.some(m=>m.id===action.messageId))throw Error('Source message is unavailable.');const snap=await current();proposeLesson(p,{id:randomUUID(),title:action.title,text:action.text,applicability:action.applicability,sourceTaskId:t.id,sourceMessageId:action.messageId,revision:snap.revision,validation:(t.checkReceipts??[]).findLast(c=>c.revision===snap.revision&&c.status==='passed')??null});Object.assign(state.projects.find(item=>item.id===p.id),p);break;
      }
      case 'decideLesson':{requireNavigationIdle();validateBinding(action.projectId,null);decideLesson(state.activeProject,action.id,action.decision);Object.assign(state.projects.find(p=>p.id===action.projectId),state.activeProject);break;}
      case 'setProjectInstructions':{requireNavigationIdle();validateBinding(action.projectId,null);if(typeof action.text!=='string'||action.text.length>4000)throw Error('Project instructions must be at most 4,000 characters.');state.activeProject.instructions=action.text.trim();const p=state.projects.find(p=>p.id===action.projectId);p.instructions=state.activeProject.instructions;break;}
      case 'saveDraft':await writeDraft(action);break;
      case 'moveSidebarItem':{
        requireNavigationIdle();
        const planned=planSidebarMove(state.projects,summaries(),state.sidebarOrder,action);
        if(action.kind==='chat'){
          if(contextBusy(contexts.get(action.id)))throw Error('Stop this chat before moving it.');
          const original=state.task?.id===action.id?state.task:taskRecords.get(action.id);
          const t=structuredClone(original);
          if(action.section==='project'&&t.projectId!==action.projectId){
            const destination=state.projects.find(p=>p.id===action.projectId),oldKey=draftKey(t.projectId,t.id),draft=state.drafts[oldKey];
            if(t.nativeSession)throw Error('Start a fresh native session before moving this chat to another project.');if(t.promptQueue?.length||(draft?.files?.length||draft?.images?.length)||t.messages.some(m=>m.images?.length))throw Error('Remove queued messages and draft attachments before moving this chat to another project.');
            if(await canonicalRoot(destination.root)!==destination.root)throw Error('The destination folder changed. Reopen the project.');
            const snap=await snapshot(destination.root);
            if(state.task?.id===t.id)await navigationCleanup();
            t.projectId=destination.id;t.baselineRevision=snap.revision;t.revision=snap.revision;t.changes=[];t.check=null;t.previewRevision=null;t.acceptedRevision=null;t.runtimeComplete=false;t.planApproved=false;
            t.messages.push({id:randomUUID(),role:'system',at:now(),text:`Moved to ${destination.name}. Future work uses ${destination.root}. Previous messages and activity are retained; file review starts from this folder's current contents.`});
            const before={state:structuredClone(state),record:taskRecords.get(t.id),baseline};
            db.exec('BEGIN IMMEDIATE');
            try{
              db.prepare('UPDATE baselines SET revision=?,json=? WHERE task_id=?').run(snap.revision,JSON.stringify(snap.files),t.id);
              if(draft){state.drafts[draftKey(t.projectId,t.id)]=draft;delete state.drafts[oldKey];}
              if(contexts.has(t.id))contexts.get(t.id).task=t;taskRecords.set(t.id,t);db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(t),t.id);
              if(state.task?.id===t.id){state.task=t;state.activeProject=destination;baseline=snap.files;diffCache.clear();}
              state.sidebarOrder=planned.orders;persist();db.exec('COMMIT');
            }catch(error){db.exec('ROLLBACK');Object.assign(state,before.state);taskRecords.set(t.id,before.record);baseline=before.baseline;throw error;}
          }else{
            if(action.section==='pinned')t.pinned=true;
            if(action.section==='recents')t.pinned=false;
            saveRecord(t);
            if(state.task?.id===t.id)state.task=t;
          }
        }
        state.sidebarOrder=planned.orders;break;
      }
      case 'setTaskFlags':{
        requireNavigationIdle();if(action.pinned!==undefined&&typeof action.pinned!=='boolean'||action.archived!==undefined&&typeof action.archived!=='boolean')throw Error('Invalid chat organization choice.');
        const t=state.task?.id===action.id?state.task:taskRecords.get(action.id);if(!t)throw Error('Chat not found.');if(contextBusy(contexts.get(t.id)))throw Error('Stop this chat before changing its archive or pin state.');
        if(action.pinned!==undefined){if(t.archived&&action.pinned)throw Error('Restore this chat before pinning it.');t.pinned=action.pinned;}if(action.archived!==undefined){if(action.archived&&!t.archived)t.archivedAt=new Date(archiveNow()).toISOString();if(!action.archived)t.archivedAt=null;t.archived=action.archived;}if(t.archived){t.pinned=false;t.queuePaused=true;t.queueHold=true;}
        saveRecord(t);break;
      }
      case 'deleteTask':await deleteArchivedChat(action.id,action.allowUnarchived);break;
      case 'saveWorkflow':{const w=validateWorkflow(action.workflow),index=state.workflows.findIndex(item=>item.id===w.id);if(index<0){if(state.workflows.length>=30)throw Error('The library holds up to 30 workflows.');state.workflows.push(w);}else state.workflows[index]=w;break;}
      case 'deleteWorkflow':state.workflows=state.workflows.filter(w=>w.id!==action.id);break;
      case 'queueWorkflow':{
        const t=requireTask();if(t.id!==action.taskId)throw Error('The selected chat changed. Reopen Workflows.');if(t.archived||t.mode!=='muse')throw Error('Open an active Muse chat.');
        if(typeof action.id!=='string'||!action.id||action.id.length>200)throw Error('Invalid workflow request.');
        const w=state.workflows.find(w=>w.id===action.workflowId);if(!w)throw Error('Workflow no longer exists.');
        const digest=hash(JSON.stringify({workflow:w,objective:action.objective})),receipt=t.workflowReceipts?.find(r=>r.id===action.id);
        if(receipt){if(receipt.digest!==digest)throw Error('Workflow request changed. Reopen Workflows.');break;}
        const prompts=workflowPrompts(w,action.objective);if((t.promptQueue??[]).length+prompts.length>5)throw Error('Make room in the queue for all workflow phases (five prompts maximum).');
        t.promptQueue??=[];for(const p of prompts)t.promptQueue.push({id:randomUUID(),text:p.text,files:[],images:[],mode:'chat',runOptions:{...restoreRunOptions(t.runOptions),budget:p.budget},at:now(),...(p.requiredChecks?.length?{requiredChecks:p.requiredChecks}:{}),workflow:{id:action.id,title:w.title,phase:p.title,index:p.index,total:prompts.length}});
        t.workflowReceipts=[...(t.workflowReceipts??[]),{id:action.id,digest}].slice(-100);if(context.pending&&!t.queueHold)t.queuePaused=false;else{t.queuePaused=true;t.queueHold=true;}break;
      }
      case 'handoffContext':{
        const source=requireTask();if(action.sourceTaskId!==source.id)throw Error('The selected source chat changed. Open the handoff again.');
        if(typeof action.id!=='string'||!action.id||action.id.length>200)throw Error('Invalid handoff identity.');
        const target=contexts.get(action.targetTaskId)?.task??taskRecords.get(action.targetTaskId);
        if(!target||target.id===source.id||target.mode!=='muse')throw Error('Choose another Muse chat.');if(target.archived)throw Error('Restore the archived recipient first.');
        const files=fileReferences(action.files),digest=hash(JSON.stringify({source:source.id,target:target.id,text:action.text,files})),receipt=target.handoffReceipts?.find(r=>r.id===action.id);
        if(receipt){if(receipt.digest!==digest)throw Error('This handoff identity was already used for different context.');break;}
        if((target.promptQueue??[]).length>=5)throw Error('The recipient queue already holds five prompts.');
        const {attachments}=await selectedSources(files),text=handoffText({title:source.title,project:state.activeProject.name,text:action.text,files:attachments});
        target.promptQueue??=[];target.promptQueue.push({id:randomUUID(),text,files:[],images:[],mode:'chat',runOptions:restoreRunOptions(target.runOptions),at:now(),handoff:{id:action.id,sourceTaskId:source.id,sourceTitle:source.title}});
        target.handoffReceipts=[...(target.handoffReceipts??[]),{id:action.id,digest}].slice(-100);
        const owner=contexts.get(target.id);if(owner?.pending&&!target.queueHold)target.queuePaused=false;
        saveRecord(target);break;
      }
      case 'queueMessage':{pauseGoalDriver(state.task?.goal?.driver,'Queued user input takes priority');
        const t=requireTask();if(t.mode!=='muse'||t.archived)throw Error('Open an active Muse chat to queue a request.');if(typeof action.text!=='string'||!action.text.trim()||action.text.length>16000)throw Error('Use a prompt up to 16,000 characters.');
        if(!['chat','plan'].includes(action.mode??'chat'))throw Error('Invalid conversation mode.');if((t.promptQueue??[]).length>=5)throw Error('The queue holds up to five prompts.');const files=fileReferences(action.files),images=imageReferences(action.images);await selectedSources(files);await imageStore.resolve(t.projectId,images);
        t.promptQueue??=[];t.promptQueue.push({id:randomUUID(),text:action.text.trim(),files,images,mode:action.mode??'chat',runOptions:validateRunOptions(action.runOptions??t.runOptions),at:now()});
        if(!closing&&!t.queueHold&&context.pending&&['running','starting','submitting'].includes(state.runtime.status))t.queuePaused=false;break;
      }
      case 'moveQueued':{const t=requireTask();t.promptQueue=moveQueuedPrompt(t,action);break;}
      case 'beginQueueEdit':{const t=requireTask();queuedPrompt(t,action);t.queuePaused=true;t.queueHold=true;break;}
      case 'editQueued':{const t=requireTask(),edited=editQueuedPrompt(t,action);t.promptQueue=t.promptQueue.map(item=>item.id===edited.id?edited:item);t.queuePaused=true;t.queueHold=true;break;}
      case 'sendQueued':{const t=requireTask(),item=queuedPrompt(t,action);requireNavigationIdle();await deliverQueued(t,item,context);break;}
      case 'removeQueued':{const t=requireTask();if(action.taskId!==undefined)queuedPrompt(t,action,{allowUnknown:true});t.promptQueue=(t.promptQueue??[]).filter(q=>q.id!==action.id);break;}
      case 'pauseQueue':{const t=requireTask();t.queuePaused=true;t.queueHold=true;break;}
      case 'resumeQueue':{
        const t=requireTask();if(t.archived)throw Error('Restore this archived chat first.');const item=t.promptQueue?.[0];if(!item)break;queuedPrompt(t,{taskId:t.id,id:item.id,expectedRevision:item.revision??0});requireNavigationIdle();await deliverQueued(t,item,context,{runQueue:true});break;
      }
      case 'forkTask':{
        requireNavigationIdle();const original=structuredClone(requireTask()),index=original.messages.findIndex(m=>m.id===action.messageId&&['user','assistant'].includes(m.role));if(index<0)throw Error('Choose a prompt or response to branch from.');const selected=original.messages[index];
        await startTask(original.request,original.mode==='demo'?'manual':original.mode,original.runOptions);const t=state.task;t.title=`Branch · ${original.title}`.slice(0,100);t.forkedFrom=original.id;t.goal=original.goal;
        t.messages=original.messages.slice(0,index+(selected.role==='assistant'?1:0)).filter(m=>m.role!=='system').map(m=>({id:randomUUID(),role:m.role,text:m.text,contextTruncated:m.contextTruncated===true,at:m.at,sources:m.sources,files:m.files,images:m.images,outcome:original.runs?.find(r=>r.promptId===(m.turnId??m.id))?.status??m.outcome}));message('system',selected.role==='assistant'?'Branched conversation through the selected response. Current project files are unchanged.':'Branched conversation. Current project files are unchanged; the selected prompt is an unsent draft.');
        if(selected.role==='user')state.drafts[draftKey(t.projectId,t.id)]={text:selected.text,files:selected.files??[],images:selected.images??[],mode:'chat',updatedAt:now()};break;
      }
      case 'renameTask':{requireNavigationIdle();if(action.id!==undefined&&(typeof action.id!=='string'||!action.id.trim()||action.id.length>200))throw Error('Invalid chat identifier.');const t=action.id===undefined?requireTask():state.task?.id===action.id?state.task:taskRecords.get(action.id);if(!t)throw Error('Chat not found.');if(contextBusy(contexts.get(t.id)))throw Error('Stop this chat before editing its details.');if(typeof action.title!=='string'||!action.title.trim()||action.title.length>100)throw Error('Use a chat name up to 100 characters.');t.title=action.title.trim();saveRecord(t);break;}
      case 'setMemories':{requireNavigationIdle();if(typeof action.text!=='string'||action.text.length>1500)throw Error('Memory instructions must be at most 1,500 characters.');state.memories=action.text.trim();break;}
      case 'createReviewer':{
        requireNavigationIdle();const parent=requireTask();if(action.parentTaskId!==parent.id)throw Error('Parent chat changed.');if(!runtimeFactory)throw Error('Independent review needs background runtime support.');if(parent.reviewContract)throw Error('Reviewer chats cannot recursively delegate.');if((parent.reviewChildren??[]).length>=3)throw Error('This parent has used its three review slots (up to 9 minutes / 24 steps).');if(checkProcess||contextBusy(context))throw Error('Finish the current work first.');
        const project=state.activeProject,target=state.projects.find(p=>p.id===action.projectId);if(!target||target.id!==project.id&&target.worktree?.sourceRoot!==(project.worktree?.sourceRoot??project.root))throw Error('Choose this project or its managed worktree.');
        const snap=await current(),input=await snapshot(target.root);if(input.revision!==snap.revision)throw Error('The review checkout does not match the source revision. Refresh the worktree or review this idle checkout.');const prompt=reviewPrompt({role:action.role,question:action.question,sourceRevision:snap.revision});
        pauseGoalDriver(parent.goal?.driver,'Independent review started');parent.queuePaused=true;parent.queueHold=!!parent.promptQueue?.length;saveRecord(parent);const contract={parentTaskId:parent.id,parentProjectId:project.id,sourceRevision:snap.revision,inputRevision:input.revision,role:action.role,question:action.question,budget:'standard',createdAt:now()};
        if(target.id!==project.id)await selectProject(target,null);await startTask('Review · '+action.question,'muse',{...restoreRunOptions(parent.runOptions),approval:'ask',budget:'standard'});const reviewer=state.task;reviewer.reviewContract=contract;parent.reviewChildren=[...(parent.reviewChildren??[]),reviewer.id];saveRecord(parent);saveRecord(reviewer);await sendToTask({type:'sendMessage',text:prompt});break;
      }
      case 'integrateReview':{
        requireNavigationIdle();const child=requireTask(),contract=child.reviewContract;if(!contract||action.taskId!==child.id)throw Error('Review chat changed.');if(!child.runtimeComplete||executions.list(child.id)[0]?.result!=='completed')throw Error('Wait for a confirmed reviewer result.');const parent=taskRecords.get(contract.parentTaskId),project=state.projects.find(p=>p.id===contract.parentProjectId);if(!parent||!project||parent.archived)throw Error('Parent chat is unavailable.');if(contextBusy(contexts.get(parent.id)))throw Error('Wait for the parent run to finish.');if((await snapshot(project.root)).revision!==contract.sourceRevision||(await current()).revision!==contract.inputRevision)throw Error('Review is stale: source or review files changed. Start a fresh review.');
        const answer=child.messages.findLast(m=>m.role==='assistant');if(answer?.contextTruncated)throw Error('Review output was shortened. Ask for a smaller structured report.');const report=parseReview(answer?.text);const key=draftKey(project.id,parent.id),draft=state.drafts[key];if(draft?.text||draft?.files?.length||draft?.images?.length)throw Error('The parent already has a draft. Save or send it before integrating this review.');const reviewText=`Independent ${contract.role} findings from chat ${child.id}, revision ${contract.sourceRevision}. Review these claims before applying changes.\n\n${JSON.stringify(report,null,2)}`;if(reviewText.length>16000)throw Error('Review is too large for a draft. Ask for a shorter structured report.');state.drafts[key]={text:reviewText,files:[],images:[],mode:'chat',updatedAt:now()};contract.integratedAt=now();saveRecord(child);await selectProject(project,parent.id);break;
      }
      case 'cancelReviewers':{
        const parent=requireTask();for(const id of parent.reviewChildren??[]){const child=contexts.get(id);if(child?.pending)await child.runtime?.disconnect?.();}break;
      }
      case 'continueGoal':{
        requireNavigationIdle();const t=requireTask();if(!t.goal?.objective||t.mode!=='muse')throw Error('Save a goal in a Muse chat first.');if(contextBusy(context)||checkProcess||t.promptQueue?.length)throw Error('Finish active work and queued prompts first.');validateCheckScripts(state.activeProject.validationScripts);t.goal.driver=newGoalDriver(action);t.goal.status='active';saveRecord(t);const owner=context,ticket=t.goal.driver.id;clearTimeout(owner.goalDeadline);owner.goalDeadline=setTimeout(async()=>{const d=owner.task?.goal?.driver;if(closing||closed||!d?.armed||d.id!==ticket)return;pauseGoalDriver(d,'Time budget reached');saveRecord(owner.task);try{if(owner===selectedContext())await cancelCheck();if(owner.pending)await owner.runtime?.disconnect?.();}catch(error){d.reason+='; cleanup needs review: '+error.message;}if(!closed){saveRecord(owner.task);emit();}},action.minutes*60000);owner.goalDeadline.unref?.();scheduleGoal(context);break;
      }
      case 'pauseGoalContinuation':{const t=requireTask();pauseGoalDriver(t.goal?.driver,'Paused by you');break;}
      case 'setGoal':{requireNavigationIdle();const t=requireTask();if(typeof action.objective!=='string'||action.objective.length>1000||!['active','paused'].includes(action.status))throw Error('Use a goal up to 1,000 characters.');t.goal=action.objective.trim()?{objective:action.objective.trim(),status:action.status}:null;break;}
      case 'refreshModels':{requireNavigationIdle();if(!runtime?.refreshModels)throw Error('Model discovery needs a native connection.');if(!runtime.snapshot().permissionVerified){if(!state.activeProject)throw Error('Choose a project first.');if(state.task?.nativeSession&&state.task.nativeSession.status!=='ready')throw Error('Open Session to recover the interrupted native run first.');await connectNative(context,state.task,state.activeProject);}await runtime.refreshModels();break;}
      case 'setRunOptions':{requireNavigationIdle();const t=requireTask();t.runOptions=validateRunOptions(action.runOptions);break;}
      case 'updatePlan':{requireNavigationIdle();const t=requireTask();if(typeof action.plan!=='string'||!Array.isArray(action.criteria))throw Error('A plan and criteria are required.');t.plan=action.plan.slice(0,16000);t.criteria=action.criteria.filter(x=>typeof x==='string').slice(0,20).map(x=>x.slice(0,1000));t.planApproved=false;t.runtimeComplete=false;t.acceptedRevision=null;context.pending=false;context.turn=null;break;}
      case 'approvePlan':{const t=requireTask();if(!t.plan.trim()||!t.criteria.length)throw Error('Write a plan and at least one criterion.');t.planApproved=true;t.runtimeComplete=t.mode==='manual';message('system',t.mode==='manual'?'Plan approved. Manual work context explicitly confirmed.':'Plan approved.');break;}
      case 'applyDemo':{
        const t=requireTask(),p=state.activeProject;if(t.mode!=='demo'||!p.demo||!(inside(projectsDir,p.root)||inside(legacyProjectsDir,p.root)))throw Error('Demo edits are restricted to a copied tutorial.');if(!t.planApproved)throw Error('Approve the demo plan first.');const target=await safeFile(p.root,'app.js'),source=(await readSafe(p.root,'app.js')).toString();
        if(!source.includes('/* MUSEBENCH_FILTER: false */')&&!source.includes('/* MUSEBENCH_FILTER: true */'))throw Error('Tutorial source changed. Start a fresh tutorial.');await fs.writeFile(target,source.replace(/\/\* MUSEBENCH_FILTER: false \*\/(\r?\n)const FILTER_ENABLED = false;/,'/* MUSEBENCH_FILTER: true */$1const FILTER_ENABLED = true;'));t.runtimeComplete=true;message('assistant','Demo edit applied: caffeine controls now filter the real product collection. Inspect the diff, start the preview and run the project test.');await current();break;
      }
      case 'restoreCheckpoint':{
        requireNavigationIdle();const t=requireTask();if(action.taskId!==t.id)throw Error('Active chat changed.');requireWritable(t,state.activeProject);if(contextBusy(context)||checkProcess||previewProcess)throw Error('Stop the runtime, checks and preview before restoring files.');
        const info=await inspectCheckpoint(action);if(info.revision!==action.revision)throw Error('Files changed after review. Refresh the comparison.');if(!Array.isArray(action.paths)||action.paths.some(name=>!info.files.some(f=>f.path===name&&f.restorable)))throw Error('Select captured text files from the comparison.');
        const row=db.prepare('SELECT json FROM checkpoints WHERE id=? AND task_id=?').get(action.id,t.id),saved=JSON.parse(row.json),snap=await snapshot(state.activeProject.root);if(snap.revision!==action.revision)throw Error('Files changed after review.');
        const backup={id:randomUUID(),taskId:t.id,title:'Before restore · '+t.title,revision:snap.revision,createdAt:now()};
        db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run(backup.id,t.id,snap.revision,JSON.stringify({...backup,files:snap.files}));state.checkpoints.unshift(backup);persist();
        try{await restoreSelected({root:state.activeProject.root,before:snap.files,after:saved.files,paths:action.paths,record:operation=>db.prepare('INSERT OR REPLACE INTO restore_operations(id,task_id,json) VALUES(?,?,?)').run(operation.id,t.id,JSON.stringify(operation))});}finally{await current();}
        t.check=null;t.checkReceipts=[];t.previewRevision=null;t.acceptedRevision=null;message('system','Selected files restored. Use the Before restore checkpoint to redo. Git staging and conversation history were not changed.');break;
      }
      case 'refresh':if(state.task)await current();if(state.activeProject)await refreshScripts();state.runtime=runtime?.snapshot?.()??state.runtime;break;
      case 'saveValidationProfile':{
        requireNavigationIdle();validateBinding(action.projectId,null);const scripts=validateCheckScripts(action.scripts);const p=await refreshScripts();if(scripts.some(name=>!Object.hasOwn(p.scripts,name)))throw Error('Choose scripts listed in package.json.');if(state.task?.validationRun?.status==='running')throw Error('Cancel validation before changing the profile.');p.validationScripts=scripts;state.projects.find(item=>item.id===p.id).validationScripts=scripts;break;
      }
      case 'runValidation':{
        requireNavigationIdle();const t=requireTask(),p=await refreshScripts();if(checkProcess)throw Error('A check is already running.');const scripts=validateCheckScripts(p.validationScripts);if(scripts.some(name=>!Object.hasOwn(p.scripts,name)))throw Error('A profile script was removed. Update the profile.');const snap=await current();t.validationRun={scripts,revision:snap.revision,index:0,status:'running'};try{await runCheck(scripts[0]);}catch(error){t.validationRun.status='failed';throw error;}break;
      }
      case 'runCheck':await runCheck(action.script);break;
      case 'cancelCheck':await cancelCheck();break;
      case 'startPreview':await startPreview(action.script);break;
      case 'stopPreview':await stopPreview();if(state.task)state.task.previewRevision=null;break;
      case 'inspectPreview':{const snap=await current();if(action.revision!==snap.revision)throw Error('Revision changed. Inspect the current files.');if(state.preview.status!=='running'||!previewProcess)throw Error('Start the local preview before marking it inspected.');state.task.previewRevision=snap.revision;break;}
      case 'accept':{
        const snap=await current(),t=state.task;const missing=missingChecks(t,snap.revision,state.activeProject.validationScripts??[]);if(missing.length)throw Error('Validation profile needs passing checks for this revision: '+missing.join(', '));if(action.revision!==snap.revision)throw Error('Revision changed. Inspect and check the current files.');if(!t.planApproved)throw Error('Approve the plan first.');if(!t.runtimeComplete)throw Error('The Muse turn must complete, or explicitly approve a manual work plan.');if(t.previewRevision!==snap.revision||state.preview.status!=='running')throw Error('Inspect the running preview for this exact revision.');if(t.check?.status!=='passed'||t.check.revision!==snap.revision)throw Error('A passing check for this exact revision is required.');
        const verified=await current();if(verified.revision!==snap.revision)throw Error('Files changed while accepting. Repeat preview and checks.');if(!t.runtimeComplete||state.preview.status!=='running'||t.previewRevision!==verified.revision||t.check?.status!=='passed'||t.check.revision!==verified.revision)throw Error('Review evidence changed while accepting. Repeat preview and checks.');if(t.acceptedRevision===snap.revision)break;
        const checkpoint={id:randomUUID(),taskId:t.id,title:t.title,revision:snap.revision,createdAt:now()};db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run(checkpoint.id,t.id,snap.revision,JSON.stringify({...checkpoint,files:verified.files}));state.checkpoints.unshift(checkpoint);t.acceptedRevision=snap.revision;persist();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}message('system',`Local checkpoint saved for revision ${snap.revision.slice(0,12)}.`);break;
      }
      case 'recoverSession':{
        requireNavigationIdle();const t=requireTask();if(!['continue','fresh'].includes(action.choice))throw Error('Choose a session recovery action.');
        if(state.runtime.cleanup==='unconfirmed'||state.runtime.pending)throw Error('Resolve the existing native process or pending approval before recovering this session.');
        if(state.runtime.status==='blocked'||state.runtime.status==='uncertain'){await runtime?.disconnect?.();state.runtime=runtime?.snapshot?.()??state.runtime;}
        if(action.choice==='fresh'){await runtime?.disconnect?.();state.runtime=runtime?.snapshot?.()??state.runtime;if(state.runtime.cleanup==='unconfirmed')throw Error('Native shutdown could not be confirmed. Resolve the existing process before starting fresh.');context.turn=null;context.pending=false;t.nativeSession=null;}
        else if(t.nativeSession?.transport==='msp'){await runtime?.disconnect?.();state.runtime=runtime?.snapshot?.()??state.runtime;if(state.runtime.cleanup==='unconfirmed')throw Error('Native shutdown could not be confirmed. Resolve the existing process before restoring.');await connectNative(context,t,state.activeProject);}
        else if(t.nativeSession){if(!t.nativeSession.seeded)throw Error('Native input receipt was not confirmed before interruption. Start a fresh session to avoid replaying an uncertain request.');t.nativeSession={...t.nativeSession,status:'ready'};}break;
      }
      case 'childControl':{const t=requireTask(),r=runtime?.snapshot?.();if(action.taskId!==t.id||!r?.childControlsSupported)throw Error('This chat does not have an interactive child connection.');if(['sendMessage','followupTask','resume','reopen','retry'].includes(action.action)){requireWritable(t,state.activeProject);if(checkProcess||t.validationRun?.status==='running')throw Error('Wait for validation before changing child work.');}pauseGoalDriver(t.goal?.driver,'Manual child control');await runtime.childControl(action);break;}
      case 'compactSession':{const t=requireTask(),r=runtime?.snapshot?.();if(action.taskId!==t.id||!r?.compactionSupported||context.pending||checkProcess)throw Error('Finish the active request before compacting.');pauseGoalDriver(t.goal?.driver,'Manual compaction');await runtime.compact({sessionId:action.sessionId,turnId:action.turnId});break;}
      case 'steerMessage':{
        const t=requireTask(),r=runtime?.snapshot?.();if(action.taskId!==t.id||!context.pending||!context.turn||!r?.steeringSupported||r.turnId!==action.expectedTurnId)throw Error('The target turn changed or does not support steering.');
        if(typeof action.text!=='string'||!action.text.trim()||action.text.length>16000)throw Error('Use a correction up to 16,000 characters.');
        const turn=context.turn,previousCommand=r.steering?.commandId;pauseGoalDriver(t.goal?.driver,'User steering takes priority');
        try{await runtime.steer({text:action.text,expectedTurnId:action.expectedTurnId});}
        finally{const receipt=runtime.snapshot().steering;if(receipt?.turnId===action.expectedTurnId&&receipt.commandId!==previousCommand){t.steeringReceipts=[...(t.steeringReceipts??[]).filter(x=>x.commandId!==receipt.commandId),{...receipt,text:action.text,at:now()}].slice(-20);saveRecord(t);}}
        t.messages.push({id:randomUUID(),role:'user',text:action.text,at:now(),turnId:turn.promptId});const key=draftKey(t.projectId,t.id);if(state.drafts[key]?.text===action.text&&!state.drafts[key]?.files?.length&&!state.drafts[key]?.images?.length)delete state.drafts[key];saveRecord(t);break;
      }
      case 'sendMessage':pauseGoalDriver(state.task?.goal?.driver,'User input takes priority');await sendToTask(action);break;
      case 'setExecutionAccess':{
        requireNavigationIdle();const t=requireTask();if(action.taskId!==t.id)throw Error('The active chat changed.');if(typeof action.fullAccess!=='boolean')throw Error('Full access must be explicitly selected.');if(!runtime||!state.activeProject)throw Error('Open a project and connect Muse first.');
        const previous=runtime.snapshot();if(previous.permissionVerified&&previous.fullAccess===action.fullAccess)break;
        const transport=action.fullAccess&&previous.transport==='msp'?'msp':'exec',binary=(previous.permissionVerified?previous.binary:preferredBinary)??previous.binary??undefined;
        if(t.nativeSession&&(t.nativeSession.transport??'exec')!==transport)throw Error('Start a fresh native session before changing transport.');
        await runtime.disconnect();await connectNative(context,t,state.activeProject,{binary,transport,fullAccess:action.fullAccess});if(t.nativeSession)t.nativeSession.fullAccess=action.fullAccess;break;
      }
      case 'connectMuse':if(!state.activeProject)throw Error('Open a project first.');if(!runtime)throw Error('Muse runtime unavailable in this installation.');await connectNative(context,state.task,state.activeProject,action);break;
      case 'disconnectMuse':{
        pauseGoalDriver(state.task?.goal?.driver,'Disconnected by you');if(state.task?.nativeSession?.status==='running')state.task.nativeSession.status='needs-recovery';if(state.task){state.task.queuePaused=true;state.task.queueHold=Boolean(state.task.promptQueue?.length);}
        const turn=context.turn;
        try{await runtime?.disconnect?.();}finally{
          // Keep turn ownership until the terminal callback has recorded cleanup.
          // Adapters that throw or return without a terminal event remain unknown.
          if(turn&&executions.list(state.task.id).find(r=>r.id===turn.promptId)?.phase!=='settled')executions.patch(turn.promptId,{phase:'settled',result:'unknown',cleanup:'unknown',reason:'Disconnect did not report a confirmed terminal outcome.'});
          if(state.task?.runs)state.task.runs=state.task.runs.map(run=>['queued','working','waiting'].includes(run.status)||run.id===turn?.promptId&&run.status!=='completed'?{...run,status:'cancelled',endedAt:now(),activities:run.activities.map(item=>['queued','working','waiting'].includes(item.status)?{...item,status:'cancelled'}:item)}:run);for(const item of state.task?.messages??[]){const run=state.task.runs?.find(r=>r.promptId===(item.turnId??item.id));if(run)item.outcome=run.status;}
          context.pending=false;context.turn=null;if(state.task?.mode==='muse')state.task.runtimeComplete=false;state.runtime=runtime?.snapshot?.()??missingRuntime();
        }break;
      }
      case 'answerInput':{const t=requireTask();if(action.taskId!==t.id||!runtime?.answerInput)throw Error('This question belongs to another chat or connection.');await runtime.answerInput(action);state.runtime=runtime.snapshot();break;}
      case 'runtimeDecision':if(!runtime)throw Error('Muse is not connected.');await runtime.decide(action.decision);state.runtime=runtime.snapshot();break;
      default:throw Error('Unknown controller action.');
    }
  };
  await purgeArchived();
  if(state.task)try{const row=db.prepare('SELECT revision FROM baselines WHERE task_id=?').get(state.task.id);if(!row||row.revision!==state.task.baselineRevision)throw Error('The saved task baseline is unavailable. Start a new task.');await current();}catch(error){state.error=error.message;state.task.previewRevision=null;state.task.acceptedRevision=null;state.task.runtimeComplete=false;if(state.task.check)state.task.check.status='stale';}
  persist();
  const resetCodeConnections=()=>{
    const op=queue.then(async()=>{
      const all=[...new Set([context,...contexts.values()])];
      if(closing||closed||state.busy||checkProcess||all.some(c=>contextBusy(c)||c.task?.goal?.driver?.armed||c.task?.promptQueue?.length&&!c.task.queuePaused))throw Error('Finish running or queued work before changing billing.');
      await Promise.all(all.map(c=>c.runtime?.disconnect?.()));
      if(all.some(c=>['pending','unconfirmed'].includes(readRuntimeStatus(c.runtime).cleanup)))throw Error('Native shutdown is unconfirmed. Billing was not changed.');
      for(const c of all)c.root=null;
      state.runtime=runtime?.snapshot?.()??missingRuntime();emit();
    });queue=op.catch(()=>{});return op;
  };
  const archiveTimer=setInterval(()=>{queue=queue.then(purgeArchived).catch(error=>{state.error=error.message;emit();});},60*60*1000);archiveTimer.unref?.();
  return{getState,saveCodeDraft,readMcpServers,resetCodeConnections,readAnalytics(options){for(const task of taskRecords.values())analytics.sync(task);if(state.task)analytics.sync(state.task);return analytics.read(options);},canRestartForUpdate:()=>!closing&&!closed&&!state.busy&&!checkProcess&&![...new Set([context,...contexts.values()])].some(c=>contextBusy(c)||c.task?.goal?.driver?.armed||c.task?.promptQueue?.length&&!c.task.queuePaused),recordDelivery(id,status){if(!closed){executions.delivery(id,status);emit();}},inspectCheckpoint,inspectContext,searchChats,readChatHistory,readCapturedOutput,semanticNavigate,inspectWorktrees,importImage,readImage,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},dispatch(action){if(!closing&&!closed)flushRuntime();if(closing||closed)return Promise.reject(Error('Controller closed.'));if(action?.type==='inspectChild')return inspectChild(action);const op=queue.then(async()=>{if(closed)throw Error('Controller closed.');state.error=null;const quiet=action?.type==='saveDraft';if(!quiet){state.busy=true;emit();}try{if(!action||typeof action.type!=='string')throw Error('Invalid action.');await handle(action);}catch(e){state.error=e.message;}finally{if(quiet)persist();else{state.busy=false;emit();}}return getState();});queue=op.catch(()=>{});return op;},close(){if(closePromise)return closePromise;closing=true;flushRuntime();clearInterval(archiveTimer);if(state.task){state.task.queuePaused=true;state.task.queueHold=true;}closePromise=(async()=>{await Promise.all([queue,...[...semanticQueries].map(service=>service.dispose()),...[...new Set([context,...contexts.values()])].map(c=>c.runtime?.disconnect?.())]);if(state.task){state.task.queuePaused=true;state.task.queueHold=true;}await cleanup(false);for(const c of new Set([context,...contexts.values()])){c.unsubscribe?.();if(c.task)saveRecord(c.task);}persist();if(state.task)state.task.executionReceipts=executions.list(state.task.id);closed=true;clearTimeout(runtimeTimer);runtimeDirty.clear();listeners.clear();db.close();})();return closePromise;}};
}
import {confirmedInputText} from '../shared/user-input.mjs';
