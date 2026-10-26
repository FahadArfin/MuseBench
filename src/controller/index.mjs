import {moveQueuedPrompt} from '../shared/queued-prompts.mjs';
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
  task.messages=(Array.isArray(task.messages)?task.messages:[]).filter(item=>item&&typeof item.id==='string'&&['user','assistant','system'].includes(item.role)&&typeof item.text==='string').slice(-150).map(item=>({...item,text:item.text.slice(0,16000),sources:restoreSourceSnapshots(item.sources)}));
  task.runs=restoreRuns(task.runs);
  for(const item of task.messages){const run=task.runs.find(r=>r.promptId===(item.turnId??item.id));if(run)item.outcome=run.status;else if(['queued','working','waiting'].includes(item.outcome))item.outcome='interrupted';}
  task.pinned=task.pinned===true;task.archived=task.archived===true;task.archivedAt=task.archived?(Number.isFinite(Date.parse(task.archivedAt))?task.archivedAt:now()):null;
  task.promptQueue=Array.isArray(task.promptQueue)?task.promptQueue.filter(q=>q&&typeof q.id==='string'&&typeof q.text==='string'&&q.text.length<=16000).slice(0,5):[];task.queuePaused=true;task.queueHold=task.promptQueue.length>0;
  task.goal=task.goal&&typeof task.goal.objective==='string'?{objective:task.goal.objective.slice(0,1000),status:task.goal.status==='paused'?'paused':'active'}:null;
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
  const files=Object.create(null);let total=0,count=0;
  const walk=async relative=>{
    const entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const entry of entries){
      if(excluded(entry.name))continue;
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink())throw Error(`Symbolic links are not allowed in source: ${name}`);
      await safeFile(root,name);
      if(entry.isDirectory()){await walk(name);continue;}
      if(!entry.isFile())throw Error(`Unsupported source type: ${name}`);
      if(++count>MAX_FILES)throw Error('Project exceeds the 4,000 source-file limit.');
      const bytes=await readSafe(root,name);total+=bytes.length;if(total>MAX_TOTAL)throw Error('Project source exceeds the 24 MiB snapshot limit.');
      const binary=bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes);
      files[name]={hash:hash(bytes),text:binary?'':bytes.toString('utf8'),binary};
    }
  };
  await walk('');return {revision:hash(Object.keys(files).sort().map(name=>`${name}\0${files[name].hash}\0`).join('')),files};
}
function changes(before,after,cache){
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

export async function createController({dataDir,projectsDir,newProjectsDir,templateDir=fileURLToPath(new URL('../../templates/tea-store',import.meta.url)),runtime,checkTimeoutMs=120000,archiveNow=()=>Date.now()}={}){
  if(!dataDir)throw Error('A controller dataDir is required.');await fs.mkdir(dataDir,{recursive:true});dataDir=await fs.realpath(dataDir);
  const legacyProjectsDir=path.join(dataDir,'projects');projectsDir=projectsDir??legacyProjectsDir;
  if(!path.isAbsolute(projectsDir))throw Error('Project storage must be an absolute folder.');projectsDir=path.resolve(projectsDir);
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
  const saved=db.prepare('SELECT json FROM app WHERE id=1').get();
  const state=saved?JSON.parse(saved.json):{projects:[],activeProject:null,task:null,checkpoints:[],preview:stopped(),runtime:missingRuntime(),busy:false,error:null};
  state.projectCreationRoot=newProjectsDir;
  state.drafts=state.drafts&&typeof state.drafts==='object'&&!Array.isArray(state.drafts)?state.drafts:{};
  state.memories=typeof state.memories==='string'?state.memories.slice(0,1500):'';
  state.preview=stopped();state.busy=false;state.error=null;state.runtime=runtime?.snapshot?.()??missingRuntime();
  const taskRecords=new Map();
  for(const row of db.prepare('SELECT id,json FROM tasks ORDER BY rowid').all()){
    try{const task=restoreTask(JSON.parse(row.json));if(task.id!==row.id)continue;taskRecords.set(row.id,task);db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(task),row.id);}catch{/* Preserve unreadable history in the database, without exposing it as a selectable task. */}
  }
  if(state.task){
    const knownProject=state.projects.find(p=>p.id===state.activeProject?.id&&p.root===state.activeProject.root);
    state.task=restoreTask(state.task,knownProject?.id);
    if(!knownProject||state.task.projectId!==knownProject.id){state.task=null;state.error='The saved task has no valid project association. Select a project to continue.';}
    else taskRecords.set(state.task.id,structuredClone(state.task));
  }
  let baseline=state.task?JSON.parse(db.prepare('SELECT json FROM baselines WHERE task_id=?').get(state.task.id)?.json??'{}'):{};
  const listeners=new Set();let queue=Promise.resolve(),closed=false,closing=false,closePromise=null,checkProcess=null,previewProcess=null,previewToken=null,museTurnPending=false,checkInvalidated=false;
  let queueScheduled=false;
  let taskMessageBaseline=runtimeMessageIds(state.runtime),runtimeTurn=null,runtimeNavigation=false;
  const summaries=()=>[...taskRecords.values()].reverse().filter(t=>state.projects.some(p=>p.id===t.projectId)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(t=>({id:t.id,projectId:t.projectId,title:t.title,mode:t.mode,createdAt:t.createdAt,updatedAt:t.updatedAt,acceptedRevision:t.acceptedRevision,pinned:t.pinned===true,archived:t.archived===true,archivedAt:t.archivedAt??null}));
  const getState=()=>structuredClone({...state,tasks:summaries()});
  const saveTask=()=>{
    if(!state.task)return;
    const previous=taskRecords.get(state.task.id);
    if(previous&&JSON.stringify({...previous,updatedAt:undefined})!==JSON.stringify({...state.task,updatedAt:undefined}))state.task.updatedAt=new Date(Math.max(Date.now(),Date.parse(previous.updatedAt)+1)).toISOString();
    taskRecords.set(state.task.id,structuredClone(state.task));
    db.prepare('INSERT INTO tasks(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(state.task.id,JSON.stringify(state.task));
  };
  const persist=()=>{if(closed)return;saveTask();state.tasks=summaries();db.prepare('INSERT INTO app(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(state));for(const p of state.projects)db.prepare('INSERT INTO projects(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(p.id,JSON.stringify(p));};
  const emit=()=>{if(closed)return;persist();const view=getState();for(const listener of listeners)try{listener(view);}catch{}};
  const message=(role,text)=>{if(state.task){state.task.messages.push({id:randomUUID(),role,text:String(text).slice(0,16000),at:now()});state.task.messages=state.task.messages.slice(-150);}};
  const requireTask=()=>{if(!state.task||!state.activeProject)throw Error('Open a project and start a task first.');return state.task;};
  const diffCache=new Map();
  const current=async()=>{
    const task=requireTask(),root=state.activeProject.root;
    if(await canonicalRoot(root)!==root)throw Error('The workspace canonical path changed. Reopen the project.');
    const snap=await snapshot(root);
    if(task.revision!==snap.revision){task.revision=snap.revision;task.previewRevision=null;task.acceptedRevision=null;if(task.check?.status==='running')checkInvalidated=true;else if(task.check)task.check.status='stale';await stopPreview();}
    for(const key of diffCache.keys())if(!Object.hasOwn(baseline,key)&&!Object.hasOwn(snap.files,key))diffCache.delete(key);
    task.changes=changes(baseline,snap.files,diffCache);return snap;
  };
  const stopPreview=async()=>{previewToken=null;const child=previewProcess;previewProcess=null;await killTree(child);state.preview=stopped();};
  const cancelCheck=async()=>{const child=checkProcess;checkProcess=null;if(state.task?.check?.status==='running'){state.task.check.status='cancelled';state.task.check.endedAt=now();persist();}await killTree(child);};
  const cleanup=async(disconnect=true)=>{await cancelCheck();await stopPreview();if(disconnect)await runtime?.disconnect?.();};
  const requireNavigationIdle=()=>{if(museTurnPending||['running','starting','submitting','connecting','checking-permissions'].includes(state.runtime.status))throw Error('Finish or disconnect the running Muse turn before switching projects or tasks.');};
  const navigationCleanup=async()=>{
    runtimeNavigation=true;museTurnPending=false;runtimeTurn=null;if(state.task){state.task.queuePaused=true;state.task.queueHold=Boolean(state.task.promptQueue?.length);}
    try{await cleanup();state.runtime=runtime?.snapshot?.()??missingRuntime();if(state.runtime.cleanup==='unconfirmed')throw Error('Native shutdown could not be confirmed. Disconnect Muse before switching projects or tasks.');}
    finally{runtimeNavigation=false;saveTask();taskMessageBaseline=runtimeMessageIds(state.runtime);}
  };
  const deleteArchivedChat=async id=>{
    requireNavigationIdle();const target=taskRecords.get(id);if(!target)throw Error('Chat not found.');if(!target.archived)throw Error('Archive this chat before permanently deleting it.');
    const previous={state:structuredClone(state),baseline,records:new Map(taskRecords)};
    if(state.task?.id===id){await navigationCleanup();state.task=null;baseline={};diffCache.clear();state.runtime=missingRuntime();}
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('DELETE FROM tasks WHERE id=?').run(id);db.prepare('DELETE FROM baselines WHERE task_id=?').run(id);db.prepare('DELETE FROM checkpoints WHERE task_id=?').run(id);
      taskRecords.delete(id);delete state.drafts[draftKey(target.projectId,id)];state.checkpoints=state.checkpoints.filter(item=>item.taskId!==id);persist();db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');Object.assign(state,previous.state);baseline=previous.baseline;taskRecords.clear();for(const [key,value] of previous.records)taskRecords.set(key,value);state.runtime=runtime?.snapshot?.()??missingRuntime();throw error;}
    try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{/* Logical deletion is committed; SQLite retries checkpointing on close. */}
  };
  const purgeArchived=async()=>{
    if(closed||closing||museTurnPending||['running','starting','submitting','connecting','checking-permissions'].includes(state.runtime.status))return;
    const expired=[...taskRecords.values()].filter(t=>t.archived&&Number.isFinite(Date.parse(t.archivedAt))&&archiveNow()-Date.parse(t.archivedAt)>=30*24*60*60*1000);
    for(const task of expired)await deleteArchivedChat(task.id);
    if(expired.length)emit();
  };
  const newestTask=projectId=>summaries().find(t=>t.projectId===projectId&&!t.archived);
  const selectProject=async(p,taskId=newestTask(p.id)?.id)=>{
    if(state.activeProject?.id===p.id&&state.task?.id===taskId)return;
    requireNavigationIdle();
    if(await canonicalRoot(p.root)!==p.root)throw Error('The workspace canonical path changed. Reopen the project.');
    await snapshot(p.root);const info=await scriptsFor(p.root);
    let restored=null,restoredBaseline={};
    if(taskId){
      const record=taskRecords.get(taskId);if(!record||record.projectId!==p.id)throw Error('Saved task has no valid project association.');
      const row=db.prepare('SELECT revision,json FROM baselines WHERE task_id=?').get(taskId);if(!row||row.revision!==record.baselineRevision)throw Error('The saved task baseline is unavailable. Start a new task.');
      restored=restoreTask(record);restoredBaseline=JSON.parse(row.json);
    }
    await navigationCleanup();p.scripts=info.scripts;Object.assign(p,await projectGit(p.root));state.activeProject=p;state.task=restored;baseline=restoredBaseline;
    if(state.task)await current();
  };
  const startTask=async(request,mode,runOptions)=>{
    const options=validateRunOptions(runOptions);
    if(!state.activeProject)throw Error('Open a project first.');if(typeof request!=='string'||!request.trim())throw Error('Describe the change first.');if(!['manual','demo','muse'].includes(mode))throw Error('Unknown task mode.');
    requireNavigationIdle();await cleanup(false);saveTask();
    const snap=await snapshot(state.activeProject.root);baseline=snap.files;museTurnPending=false;
    taskMessageBaseline=runtimeMessageIds(state.runtime);runtimeTurn=null;
    const demo=mode==='demo',plan=demo?'Demo plan: add a caffeine preference filter to the tea collection. Offer All teas and Caffeine free choices, preserve the storefront, and keep product counts clear.':'Review the request and local project. Describe the intended change, then approve this plan before accepting work.';
    const createdAt=now();state.task={runOptions:options,id:randomUUID(),projectId:state.activeProject.id,createdAt,updatedAt:createdAt,title:request.trim().slice(0,100),request:request.trim().slice(0,12000),mode,plan,criteria:demo?['Caffeine free shows only herbal teas.','All teas restores the full collection.','The storefront works at narrow widths.']:['The requested change works in the preview.','The selected project check passes.'],planApproved:false,baselineRevision:snap.revision,revision:snap.revision,changes:[],messages:[],shellResults:[],runs:[],promptQueue:[],queuePaused:true,check:null,previewRevision:null,acceptedRevision:null,runtimeComplete:false};
    db.prepare('INSERT INTO baselines(task_id,revision,json) VALUES(?,?,?)').run(state.task.id,snap.revision,JSON.stringify(baseline));
    message('system',demo?'Deterministic tutorial. Only this copied sample is edited; diffs, preview, checks and checkpoints use real local files.':mode==='muse'?'Muse chat started. Send a request to connect with your selected approval access. Planning is optional; the sandbox remains enabled.':'Local task started. Approving a manual plan explicitly confirms user-directed manual work.');message(demo?'assistant':'system',plan);
  };
  const refreshScripts=async()=>{const p=state.activeProject;if(!p)throw Error('Open a project first.');p.scripts=(await scriptsFor(p.root)).scripts;Object.assign(p,await projectGit(p.root));return p;};
  const runCheck=async script=>{
    const task=requireTask();if(checkProcess)throw Error('A check is running. Cancel it first.');const project=await refreshScripts();if(!Object.hasOwn(project.scripts,script))throw Error('Choose a script listed in package.json.');const snap=await current();
    const check={id:randomUUID(),script,command:`npm run --ignore-scripts ${script} — ${project.scripts[script]}`,status:'running',revision:snap.revision,exitCode:null,log:'',startedAt:now()};task.check=check;checkInvalidated=false;const taskId=task.id,child=launchScript(project.root,script);checkProcess=child;
    const append=chunk=>{if(closed||state.task?.id!==taskId||state.task.check?.id!==check.id)return;check.log=(check.log+chunk.toString()).slice(-MAX_LOG);emit();};child.stdout.on('data',append);child.stderr.on('data',append);
    let done=false;const timeout=setTimeout(async()=>{check.log=(check.log+`\nCheck stopped after ${checkTimeoutMs} ms timeout.`).slice(-MAX_LOG);await killTree(child);finish(null,Error('Project check timed out.'));},Math.max(100,Math.min(checkTimeoutMs,600000)));
    const finish=(code,error)=>{if(done)return;done=true;clearTimeout(timeout);queue=queue.then(async()=>{
      if(closed||state.task?.id!==taskId||state.task.check?.id!==check.id)return;if(checkProcess===child)checkProcess=null;if(error)check.log=(check.log+'\n'+error.message).slice(-MAX_LOG);check.exitCode=code;check.endedAt=now();
      if(check.status!=='cancelled')try{const latest=await current();check.status=checkInvalidated||latest.revision!==check.revision?'stale':code===0?'passed':'failed';}catch(e){check.status='stale';state.error=e.message;}emit();
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
  const validateBinding=(projectId,taskId)=>{
    if(state.activeProject?.id!==projectId||taskId!=null&&state.task?.id!==taskId)throw Error('The selected project or chat changed. Open context again.');
  };
  const contextAllowed=name=>!name.split('/').some(part=>['.muse','.codex','.config','auth.json','.mcp.json'].includes(part.toLowerCase()));
  const selectedSources=async(files=[])=>{
    const refs=fileReferences(files);if(!state.activeProject)throw Error('Open a project first.');
    const root=state.activeProject.root;if(await canonicalRoot(root)!==root)throw Error('Project path changed. Reopen the project.');
    const snap=await snapshot(root);let size=0;
    const attachments=refs.map(ref=>{const file=snap.files[ref.path];if(!contextAllowed(ref.path)||!file||file.binary||file.hash!==ref.hash)throw Error(`Context file changed or is unavailable. Select it again: ${ref.path}`);size+=JSON.stringify({path:ref.path,hash:ref.hash,text:file.text}).length;if(size>FILE_CONTEXT_LIMIT)throw Error('Selected files exceed 24,000 characters. Choose fewer or smaller files.');return{...ref,text:file.text};});
    return{snap,attachments};
  };
  const inspectContext=async({projectId,taskId=null,text='',files=[]}={})=>{
    validateBinding(projectId,taskId);const task=taskId?structuredClone(state.task):null,project=structuredClone(state.activeProject),memories=state.memories;
    const {snap,attachments}=await selectedSources(files);validateBinding(projectId,taskId);
    const context=composeChatContext({task,project,memories,text,attachments,history:state.runtime.transport!=='msp'});
    return{...context,attachments,files:Object.entries(snap.files).filter(([name,f])=>contextAllowed(name)&&!f.binary).map(([path,f])=>({path,hash:f.hash,characters:f.text.length}))};
  };
  const searchChats=({query='',includeArchived=false}={})=>{
    if(typeof query!=='string'||query.length>200||typeof includeArchived!=='boolean')throw Error('Invalid chat search.');
    const needle=query.trim().toLocaleLowerCase();return summaries().filter(t=>includeArchived||!t.archived).flatMap(summary=>{
      const t=taskRecords.get(summary.id),project=state.projects.find(p=>p.id===t.projectId);
      const source=[t.title,project.name,...t.messages.filter(m=>m.role!=='system').map(m=>m.text)].find(text=>text.toLocaleLowerCase().includes(needle));
      if(source===undefined)return[];const index=needle?source.toLocaleLowerCase().indexOf(needle):0;
      return[{...summary,projectName:project.name,snippet:source.slice(Math.max(0,index-50),index+180)}];
    }).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)).slice(0,100);
  };
  const queueEligible=()=>!closing&&!closed&&state.task?.mode==='muse'&&!state.task.queueHold&&!state.task.queuePaused&&state.task.promptQueue?.length&&!state.task.archived;
  const scheduleQueue=()=>{
    if(queueScheduled||closed||!queueEligible())return;queueScheduled=true;const taskId=state.task.id;
    const operation=queue.then(async()=>{
      if(closed||state.task?.id!==taskId||!queueEligible()||museTurnPending)return;
      if(state.runtime.status!=='completed'||state.runtime.cleanup!=='confirmed'||!state.task.runtimeComplete){state.task.queuePaused=true;state.task.queueHold=true;emit();return;}
      const item=state.task.promptQueue.shift();persist();
      try{await handle({type:'sendMessage',text:item.text,mode:item.mode,files:item.files,runOptions:item.runOptions,fromQueue:true});}
      catch(error){state.task.promptQueue.unshift(item);state.task.queuePaused=true;state.task.queueHold=true;state.error=error.message;}finally{emit();}
    });
    queue=operation.catch(()=>{});void operation.finally(()=>{queueScheduled=false;if(!museTurnPending&&state.runtime.status==='completed'&&queueEligible())scheduleQueue();}).catch(()=>{});
  };
  const onRuntime=event=>{
    if(closed)return;const next=runtime?.snapshot?.()??event;if(!next||typeof next!=='object')return;state.runtime=structuredClone(next);
    if(state.task?.mode==='muse'&&!runtimeNavigation){
      const turn=museTurnPending&&runtimeTurn?.taskId===state.task.id?runtimeTurn:null;
      if(turn&&['running','starting','submitting'].includes(next.status)){
        turn.started=true;
        if(next.transport==='exec'&&next.runId===null)turn.resetSeen=true;
      }
      if(turn?.started&&next.transport==='exec'&&turn.resetSeen&&!turn.runId&&typeof next.runId==='string'&&next.runId!==turn.previousRunId)turn.runId=next.runId;
      const ownsTurn=Boolean(turn?.started&&(next.transport!=='exec'||turn.runId&&next.runId===turn.runId));
      if(ownsTurn){
        for(const item of Array.isArray(next.messages)?next.messages:[]){const key=runtimeMessageKey(item);if(typeof item?.text!=='string'||taskMessageBaseline.has(key)||turn.messageBaseline.has(key)||!['userMessage','agentMessage'].includes(item.kind))continue;const known=state.task.messages.find(m=>m.id===`runtime:${key}`);if(known){known.text=item.text.slice(0,16000);continue;}state.task.messages.push({id:`runtime:${key}`,role:item.kind==='userMessage'?'user':'assistant',text:item.text.slice(0,16000),turnId:turn.promptId,at:now()});state.task.messages=state.task.messages.slice(-150);}
        if(next.transport==='exec'&&next.shellEnabled===true&&Array.isArray(next.shellResults)){const owned=Array.isArray(next.ownedRunIds)&&next.ownedRunIds.includes(turn.runId)?next.ownedRunIds.slice(0,5):[turn.runId];for(const runId of owned)state.task.shellResults=mergeShellResults(state.task.shellResults,next.shellResults,runId);}
      }
      const verifiedApprovalPause=next.status==='blocked'&&next.permissionVerified===true&&next.pending?.kind==='approval'&&typeof next.sessionId==='string'&&next.pending.sessionId===next.sessionId;
      const progress=turn&&(state.task.runs??[]).find(item=>item.id===turn.promptId);
      if(progress){
        if(ownsTurn){progress.runId=turn.runId;progress.ownedRunIds=Array.isArray(next.ownedRunIds)&&next.ownedRunIds.includes(turn.runId)?next.ownedRunIds.slice(0,5):[turn.runId];if(Array.isArray(next.activity?.items)){progress.activities=next.activity.items;progress.truncated=next.activity.truncated===true;}}
        if(['running','starting','submitting'].includes(next.status))progress.status='working';
        if(['completed','failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)){
          progress.status=next.status==='completed'?(ownsTurn?'completed':'interrupted'):next.status==='cancelled'?'cancelled':verifiedApprovalPause?'waiting':'failed';
          if(!verifiedApprovalPause)progress.endedAt=now();progress.reason=next.reason??'';
          if(!verifiedApprovalPause)progress.activities=progress.activities.map(item=>['queued','working','waiting'].includes(item.status)?{...item,status:next.status==='cancelled'?'cancelled':'interrupted'}:item);
        }
        for(const item of state.task.messages)if(item.id===progress.promptId||item.turnId===progress.promptId)item.outcome=progress.status;
        state.task.runs=restoreRuns(state.task.runs,{interrupt:false});
      }
      if(next.status==='completed'&&museTurnPending){state.task.runtimeComplete=ownsTurn;museTurnPending=false;runtimeTurn=null;}
      if(['failed','cancelled','uncertain','unavailable'].includes(next.status)||(next.status==='blocked'&&!verifiedApprovalPause)){state.task.runtimeComplete=false;museTurnPending=false;runtimeTurn=null;}
      if(['running','starting','submitting'].includes(next.status))state.task.runtimeComplete=false;
    }
    if(state.task&&(['failed','cancelled','uncertain','unavailable','blocked'].includes(next.status)||next.status==='completed'&&next.cleanup!=='confirmed')){state.task.queuePaused=true;state.task.queueHold=Boolean(state.task.promptQueue?.length);}
    emit();if(next.status==='completed')scheduleQueue();
  };
  const unsubscribe=runtime?.subscribe?.(onRuntime);
  const handle=async action=>{
    switch(action.type){
      case 'clearError':state.error=null;break;
      case 'createProject':{
        requireNavigationIdle();const {name,instructions}=projectDetails(action);
        const parent=await prepareProjectsDir(undefined,newProjectsDir),root=path.join(parent,name);
        if(!inside(parent,root)||inside(root,dataDir))throw Error('Choose a different project location.');
        if((await fs.readdir(parent)).some(entry=>entry.toLowerCase()===name.toLowerCase()))throw Error('A folder with this name already exists. Choose another name or open the existing folder.');
        try{await fs.mkdir(root);}catch(error){if(error.code==='EEXIST')throw Error('A folder with this name already exists. Choose another name.');throw error;}
        if(await canonicalRoot(root)!==root)throw Error('The new project folder changed unexpectedly.');
        await fs.writeFile(path.join(root,'README.md'),`# ${name}\n\n${instructions}\n`,{flag:'wx'});
        const p={id:randomUUID(),name,root,demo:false,scripts:{},instructions};await selectProject(p);state.projects.push(p);break;
      }
      case 'openProject':{
        requireNavigationIdle();const root=await canonicalRoot(action.path);if(inside(root,dataDir))throw Error('The project cannot contain MuseBench application data.');const info=await scriptsFor(root);await snapshot(root);
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
      case 'setProjectInstructions':{requireNavigationIdle();validateBinding(action.projectId,null);if(typeof action.text!=='string'||action.text.length>4000)throw Error('Project instructions must be at most 4,000 characters.');state.activeProject.instructions=action.text.trim();const p=state.projects.find(p=>p.id===action.projectId);p.instructions=state.activeProject.instructions;break;}
      case 'saveDraft':{
        const p=state.projects.find(p=>p.id===action.projectId);if(!p||action.taskId!=null&&taskRecords.get(action.taskId)?.projectId!==p.id)throw Error('Draft project or chat is unavailable.');
        if(typeof action.text!=='string'||action.text.length>16000||!['chat','plan'].includes(action.mode??'chat'))throw Error('Invalid draft.');
        const key=draftKey(action.projectId,action.taskId),files=fileReferences(action.files);
        if(!action.text&&!files.length)delete state.drafts[key];else state.drafts[key]={text:action.text,files,mode:action.mode??'chat',updatedAt:now()};break;
      }
      case 'moveSidebarItem':{
        requireNavigationIdle();
        const planned=planSidebarMove(state.projects,summaries(),state.sidebarOrder,action);
        if(action.kind==='chat'){
          const original=state.task?.id===action.id?state.task:taskRecords.get(action.id);
          const t=structuredClone(original);
          if(action.section==='project'&&t.projectId!==action.projectId){
            const destination=state.projects.find(p=>p.id===action.projectId),oldKey=draftKey(t.projectId,t.id),draft=state.drafts[oldKey];
            if(t.promptQueue?.length||draft?.files?.length)throw Error('Remove queued messages and draft attachments before moving this chat to another project.');
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
              taskRecords.set(t.id,t);db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(t),t.id);
              if(state.task?.id===t.id){state.task=t;state.activeProject=destination;baseline=snap.files;diffCache.clear();}
              state.sidebarOrder=planned.orders;persist();db.exec('COMMIT');
            }catch(error){db.exec('ROLLBACK');Object.assign(state,before.state);taskRecords.set(t.id,before.record);baseline=before.baseline;throw error;}
          }else{
            if(action.section==='pinned')t.pinned=true;
            if(action.section==='recents')t.pinned=false;
            taskRecords.set(t.id,t);db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(t),t.id);
            if(state.task?.id===t.id)state.task=t;
          }
        }
        state.sidebarOrder=planned.orders;break;
      }
      case 'setTaskFlags':{
        requireNavigationIdle();if(action.pinned!==undefined&&typeof action.pinned!=='boolean'||action.archived!==undefined&&typeof action.archived!=='boolean')throw Error('Invalid chat organization choice.');
        const t=state.task?.id===action.id?state.task:taskRecords.get(action.id);if(!t)throw Error('Chat not found.');
        if(action.pinned!==undefined){if(t.archived&&action.pinned)throw Error('Restore this chat before pinning it.');t.pinned=action.pinned;}if(action.archived!==undefined){if(action.archived&&!t.archived)t.archivedAt=new Date(archiveNow()).toISOString();if(!action.archived)t.archivedAt=null;t.archived=action.archived;}if(t.archived){t.pinned=false;t.queuePaused=true;t.queueHold=true;}
        t.updatedAt=now();taskRecords.set(t.id,structuredClone(t));db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(t),t.id);break;
      }
      case 'deleteTask':await deleteArchivedChat(action.id);break;
      case 'queueMessage':{
        const t=requireTask();if(t.mode!=='muse'||t.archived)throw Error('Open an active Muse chat to queue a request.');if(typeof action.text!=='string'||!action.text.trim()||action.text.length>16000)throw Error('Use a prompt up to 16,000 characters.');
        if(!['chat','plan'].includes(action.mode??'chat'))throw Error('Invalid conversation mode.');if((t.promptQueue??[]).length>=5)throw Error('The queue holds up to five prompts.');const files=fileReferences(action.files);await selectedSources(files);
        t.promptQueue??=[];t.promptQueue.push({id:randomUUID(),text:action.text.trim(),files,mode:action.mode??'chat',runOptions:validateRunOptions(action.runOptions??t.runOptions),at:now()});
        if(!closing&&!t.queueHold&&museTurnPending&&['running','starting','submitting'].includes(state.runtime.status))t.queuePaused=false;break;
      }
      case 'moveQueued':{const t=requireTask();t.promptQueue=moveQueuedPrompt(t,action);break;}
      case 'removeQueued':{const t=requireTask();t.promptQueue=(t.promptQueue??[]).filter(q=>q.id!==action.id);break;}
      case 'pauseQueue':{const t=requireTask();t.queuePaused=true;t.queueHold=true;break;}
      case 'resumeQueue':{
        requireNavigationIdle();const t=requireTask();if(t.archived)throw Error('Restore this archived chat first.');const item=t.promptQueue?.shift();if(!item)break;t.queuePaused=false;t.queueHold=false;
        try{await handle({type:'sendMessage',text:item.text,mode:item.mode,files:item.files,runOptions:item.runOptions,fromQueue:true});}catch(error){t.promptQueue.unshift(item);t.queuePaused=true;t.queueHold=true;throw error;}break;
      }
      case 'forkTask':{
        requireNavigationIdle();const original=structuredClone(requireTask()),index=original.messages.findIndex(m=>m.id===action.messageId&&['user','assistant'].includes(m.role));if(index<0)throw Error('Choose a prompt or response to branch from.');const selected=original.messages[index];
        await startTask(original.request,original.mode==='demo'?'manual':original.mode,original.runOptions);const t=state.task;t.title=`Branch · ${original.title}`.slice(0,100);t.forkedFrom=original.id;t.goal=original.goal;
        t.messages=original.messages.slice(0,index+(selected.role==='assistant'?1:0)).filter(m=>m.role!=='system').map(m=>({id:randomUUID(),role:m.role,text:m.text,at:m.at,sources:m.sources,files:m.files,outcome:original.runs?.find(r=>r.promptId===(m.turnId??m.id))?.status??m.outcome}));message('system',selected.role==='assistant'?'Branched conversation through the selected response. Current project files are unchanged.':'Branched conversation. Current project files are unchanged; the selected prompt is an unsent draft.');
        if(selected.role==='user')state.drafts[draftKey(t.projectId,t.id)]={text:selected.text,files:selected.files??[],mode:'chat',updatedAt:now()};break;
      }
      case 'renameTask':{requireNavigationIdle();const t=requireTask();if(typeof action.title!=='string'||!action.title.trim()||action.title.length>100)throw Error('Use a chat name up to 100 characters.');t.title=action.title.trim();break;}
      case 'setMemories':{requireNavigationIdle();if(typeof action.text!=='string'||action.text.length>1500)throw Error('Memory instructions must be at most 1,500 characters.');state.memories=action.text.trim();break;}
      case 'setGoal':{requireNavigationIdle();const t=requireTask();if(typeof action.objective!=='string'||action.objective.length>1000||!['active','paused'].includes(action.status))throw Error('Use a goal up to 1,000 characters.');t.goal=action.objective.trim()?{objective:action.objective.trim(),status:action.status}:null;break;}
      case 'setRunOptions':{requireNavigationIdle();const t=requireTask();t.runOptions=validateRunOptions(action.runOptions);break;}
      case 'updatePlan':{const t=requireTask();if(typeof action.plan!=='string'||!Array.isArray(action.criteria))throw Error('A plan and criteria are required.');t.plan=action.plan.slice(0,16000);t.criteria=action.criteria.filter(x=>typeof x==='string').slice(0,20).map(x=>x.slice(0,1000));t.planApproved=false;t.runtimeComplete=false;t.acceptedRevision=null;museTurnPending=false;runtimeTurn=null;break;}
      case 'approvePlan':{const t=requireTask();if(!t.plan.trim()||!t.criteria.length)throw Error('Write a plan and at least one criterion.');t.planApproved=true;t.runtimeComplete=t.mode==='manual';message('system',t.mode==='manual'?'Plan approved. Manual work context explicitly confirmed.':'Plan approved.');break;}
      case 'applyDemo':{
        const t=requireTask(),p=state.activeProject;if(t.mode!=='demo'||!p.demo||!(inside(projectsDir,p.root)||inside(legacyProjectsDir,p.root)))throw Error('Demo edits are restricted to a copied tutorial.');if(!t.planApproved)throw Error('Approve the demo plan first.');const target=await safeFile(p.root,'app.js'),source=(await readSafe(p.root,'app.js')).toString();
        if(!source.includes('/* MUSEBENCH_FILTER: false */')&&!source.includes('/* MUSEBENCH_FILTER: true */'))throw Error('Tutorial source changed. Start a fresh tutorial.');await fs.writeFile(target,source.replace('/* MUSEBENCH_FILTER: false */\nconst FILTER_ENABLED = false;','/* MUSEBENCH_FILTER: true */\nconst FILTER_ENABLED = true;'));t.runtimeComplete=true;message('assistant','Demo edit applied: caffeine controls now filter the real product collection. Inspect the diff, start the preview and run the project test.');await current();break;
      }
      case 'refresh':if(state.task)await current();if(state.activeProject)await refreshScripts();state.runtime=runtime?.snapshot?.()??state.runtime;break;
      case 'runCheck':await runCheck(action.script);break;
      case 'cancelCheck':await cancelCheck();break;
      case 'startPreview':await startPreview(action.script);break;
      case 'stopPreview':await stopPreview();if(state.task)state.task.previewRevision=null;break;
      case 'inspectPreview':{const snap=await current();if(action.revision!==snap.revision)throw Error('Revision changed. Inspect the current files.');if(state.preview.status!=='running'||!previewProcess)throw Error('Start the local preview before marking it inspected.');state.task.previewRevision=snap.revision;break;}
      case 'accept':{
        const snap=await current(),t=state.task;if(action.revision!==snap.revision)throw Error('Revision changed. Inspect and check the current files.');if(!t.planApproved)throw Error('Approve the plan first.');if(!t.runtimeComplete)throw Error('The Muse turn must complete, or explicitly approve a manual work plan.');if(t.previewRevision!==snap.revision||state.preview.status!=='running')throw Error('Inspect the running preview for this exact revision.');if(t.check?.status!=='passed'||t.check.revision!==snap.revision)throw Error('A passing check for this exact revision is required.');
        const verified=await current();if(verified.revision!==snap.revision)throw Error('Files changed while accepting. Repeat preview and checks.');if(!t.runtimeComplete||state.preview.status!=='running'||t.previewRevision!==verified.revision||t.check?.status!=='passed'||t.check.revision!==verified.revision)throw Error('Review evidence changed while accepting. Repeat preview and checks.');if(t.acceptedRevision===snap.revision)break;
        const checkpoint={id:randomUUID(),taskId:t.id,title:t.title,revision:snap.revision,createdAt:now()};db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run(checkpoint.id,t.id,snap.revision,JSON.stringify({...checkpoint,files:verified.files}));state.checkpoints.unshift(checkpoint);t.acceptedRevision=snap.revision;persist();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}message('system',`Local checkpoint saved for revision ${snap.revision.slice(0,12)}.`);break;
      }
      case 'sendMessage':{
        if(closing)throw Error('The app is closing. This prompt was not sent.');
        requireNavigationIdle();const t=requireTask();if(t.archived)throw Error('Restore this archived chat before sending.');if(typeof action.text!=='string'||!action.text.trim()||action.text.length>16000)throw Error('Use a prompt up to 16,000 characters.');
        const files=fileReferences(action.files);if(!action.fromQueue&&!state.drafts[draftKey(t.projectId,t.id)])state.drafts[draftKey(t.projectId,t.id)]={text:action.text,files,mode:action.mode??'chat',updatedAt:now()};const {attachments}=await selectedSources(files);
        if(closing)throw Error('The app is closing. This prompt was not sent.');
        const prepared=composeChatContext({task:t,project:state.activeProject,memories:state.memories,text:action.text,attachments,history:state.runtime.transport!=='msp'});
        if(t.mode==='muse'){
          if(!runtime)throw Error('Muse is unavailable. Connect an installed Muse CLI first.');
          const connection=runtime.snapshot?.()??state.runtime;
          // Sending is the user's request to connect. Never reconnect over a pending
          // approval, an uncertain run, or an existing verified runtime.
          if(['unavailable','closed'].includes(connection.status)&&!connection.pending&&!connection.permissionVerified){
            await runtime.connect({workspaceRoot:state.activeProject.root});state.runtime=runtime.snapshot();
          }
          if(closing)throw Error('The app is closing. This prompt was not sent.');
          t.runtimeComplete=false;t.acceptedRevision=null;museTurnPending=true;
          const before=runtime.snapshot?.()??state.runtime;
          const prompt={id:randomUUID(),role:'user',text:action.text.slice(0,16000),files,sources:attachments,at:now()};
          runtimeTurn={taskId:t.id,promptId:prompt.id,messageBaseline:runtimeMessageIds(before),previousRunId:before.runId??null,runId:null,started:false,resetSeen:false};
          t.runs=restoreRuns([...(t.runs??[]),{id:prompt.id,promptId:prompt.id,prompt:prompt.text,runId:null,status:'queued',startedAt:prompt.at,activities:[]}],{interrupt:false});
          t.messages.push(prompt);t.messages=t.messages.slice(-150);
          const {prompt:contextPrompt,...contextSummary}=prepared;t.contextSummary=contextSummary;
          try{await runtime.send({text:contextPrompt,mode:action.mode??'chat',runOptions:restoreRunOptions(action.fromQueue?action.runOptions:t.runOptions)});}
          catch(e){if(!runtimeTurn?.started){state.drafts[draftKey(t.projectId,t.id)]={text:action.text,files,mode:action.mode??'chat',updatedAt:now()};t.messages=t.messages.filter(item=>item.id!==prompt.id);t.runs=(t.runs??[]).filter(item=>item.id!==prompt.id);}museTurnPending=false;runtimeTurn=null;throw e;}
        }else{message('user',action.text);message('system','Added to the local task journal. Manual and demo messages do not call a model.');}if(!action.fromQueue&&state.drafts[draftKey(t.projectId,t.id)]?.text===action.text)delete state.drafts[draftKey(t.projectId,t.id)];break;
      }
      case 'connectMuse':if(!state.activeProject)throw Error('Open a project first.');if(!runtime)throw Error('Muse runtime unavailable in this installation.');await runtime.connect({binary:action.binary,workspaceRoot:state.activeProject.root});state.runtime=runtime.snapshot();break;
      case 'disconnectMuse':if(state.task){state.task.queuePaused=true;state.task.queueHold=Boolean(state.task.promptQueue?.length);}if(state.task?.runs)state.task.runs=state.task.runs.map(run=>['queued','working','waiting'].includes(run.status)?{...run,status:'cancelled',endedAt:now(),activities:run.activities.map(item=>['queued','working','waiting'].includes(item.status)?{...item,status:'cancelled'}:item)}:run);for(const item of state.task?.messages??[]){const run=state.task.runs?.find(r=>r.promptId===(item.turnId??item.id));if(run)item.outcome=run.status;}museTurnPending=false;runtimeTurn=null;if(state.task?.mode==='muse')state.task.runtimeComplete=false;await runtime?.disconnect?.();state.runtime=runtime?.snapshot?.()??missingRuntime();break;
      case 'runtimeDecision':if(!runtime)throw Error('Muse is not connected.');await runtime.decide(action.decision);state.runtime=runtime.snapshot();break;
      default:throw Error('Unknown controller action.');
    }
  };
  await purgeArchived();
  if(state.task)try{const row=db.prepare('SELECT revision FROM baselines WHERE task_id=?').get(state.task.id);if(!row||row.revision!==state.task.baselineRevision)throw Error('The saved task baseline is unavailable. Start a new task.');await current();}catch(error){state.error=error.message;state.task.previewRevision=null;state.task.acceptedRevision=null;state.task.runtimeComplete=false;if(state.task.check)state.task.check.status='stale';}
  persist();
  const archiveTimer=setInterval(()=>{queue=queue.then(purgeArchived).catch(error=>{state.error=error.message;emit();});},60*60*1000);archiveTimer.unref?.();
  return{getState,inspectContext,searchChats,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},dispatch(action){if(closing||closed)return Promise.reject(Error('Controller closed.'));const op=queue.then(async()=>{if(closed)throw Error('Controller closed.');state.error=null;const quiet=action?.type==='saveDraft';if(!quiet){state.busy=true;emit();}try{if(!action||typeof action.type!=='string')throw Error('Invalid action.');await handle(action);}catch(e){state.error=e.message;}finally{if(quiet)persist();else{state.busy=false;emit();}}return getState();});queue=op.catch(()=>{});return op;},close(){if(closePromise)return closePromise;closing=true;clearInterval(archiveTimer);if(state.task){state.task.queuePaused=true;state.task.queueHold=true;}closePromise=(async()=>{await Promise.all([queue,runtime?.disconnect?.()]);if(state.task){state.task.queuePaused=true;state.task.queueHold=true;}await cleanup(false);unsubscribe?.();persist();closed=true;listeners.clear();db.close();})();return closePromise;}};
}
