import path from 'node:path';
import {promises as fs,constants as FS} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createController} from '../controller/index.mjs';
import {validateRunOptions} from '../shared/run-options.mjs';
import {validateArtifact,demoArtifact,artifactPrompt} from '../shared/work-artifacts.mjs';
import {updateStateFlags} from '../shared/update-status.mjs';

const MAX_SOURCE=2*1024*1024,MAX_ARTIFACT=512*1024,MAX_MANIFEST=8*1024*1024;
const TEAMS=new Set(['finance','operations','marketing','sales','analytics','engineering']);
const KINDS=new Set(['dashboard','motion','document','slides']);
const EXTENSIONS=new Set(['.csv','.json','.md','.txt']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIVE=new Set(['running','starting','submitting','connecting','checking-permissions']);
const date=()=>new Date().toISOString();
const clone=value=>structuredClone(value);
const message=error=>String(error?.message??error).slice(0,1500);
const inside=(root,candidate)=>{const relative=path.relative(root,candidate);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith(`..${path.sep}`));};
const samePath=(a,b)=>path.relative(a,b)==='';

// All paths originate here or in the native file picker. Inspect every ancestor
// as junctions on Windows are just as capable of escaping as symbolic links.
async function inspectPath(target,{missing=false,directory=false}={}){
  if(typeof target!=='string'||!path.isAbsolute(target)||target.includes('\0')||target.split(/[\\/]/).includes('..'))throw Error('Use an absolute local path without traversal.');
  target=path.resolve(target);let current=path.parse(target).root;
  for(const part of path.relative(current,target).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    let stat;
    try{stat=await fs.lstat(current);}catch(error){if(missing&&error.code==='ENOENT')return target;throw error;}
    if(stat.isSymbolicLink())throw Error('Symbolic links and junctions are not allowed in Work files.');
    if(!samePath(current,await fs.realpath(current)))throw Error('A Work file path resolved outside its expected location.');
    if(current!==target&&!stat.isDirectory())throw Error('A Work path ancestor is not a folder.');
    if(current===target&&directory&&!stat.isDirectory())throw Error('The Work folder is not a directory.');
  }
  return target;
}
async function makeDirectory(target){await inspectPath(target,{missing:true});await fs.mkdir(target,{recursive:true});return inspectPath(target,{directory:true});}
async function boundedRead(target,limit){
  await inspectPath(target);const handle=await fs.open(target,FS.O_RDONLY|(FS.O_NOFOLLOW??0));
  try{
    const opened=await handle.stat();if(!opened.isFile()||opened.size>limit)throw Error(`Work file exceeds the ${Math.round(limit/1024)} KiB limit or is not a regular file.`);
    const buffer=Buffer.alloc(limit+1);let length=0;
    while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,null);if(!result.bytesRead)break;length+=result.bytesRead;}
    if(length>limit)throw Error('Work file grew beyond its size limit.');
    await inspectPath(target);const current=await fs.lstat(target);
    // Node on Windows can report dev=0 from lstat while fstat exposes the
    // volume ID. Compare device IDs only when both are populated.
    if(current.ino!==opened.ino||(current.dev!==0&&opened.dev!==0&&current.dev!==opened.dev))throw Error('Work file changed while it was being read.');
    const bytes=buffer.subarray(0,length);
    if(bytes.includes(0)||!Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes))throw Error('Work sources must be UTF-8 text.');
    return bytes.toString('utf8').replace(/^\uFEFF/,'');
  }finally{await handle.close();}
}
async function atomicWrite(target,text,{exclusive=false}={}){
  const parent=path.dirname(target);await inspectPath(parent,{directory:true});await inspectPath(target,{missing:true});
  if(exclusive){const handle=await fs.open(target,FS.O_WRONLY|FS.O_CREAT|FS.O_EXCL|(FS.O_NOFOLLOW??0),0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}return;}
  const temporary=path.join(parent,`.work-${randomUUID()}.tmp`);let exists=false;
  try{
    const handle=await fs.open(temporary,FS.O_WRONLY|FS.O_CREAT|FS.O_EXCL|(FS.O_NOFOLLOW??0),0o600);exists=true;
    try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
    await inspectPath(parent,{directory:true});await inspectPath(target,{missing:true});await fs.rename(temporary,target);exists=false;
  }finally{if(exists){try{await inspectPath(temporary);await fs.unlink(temporary);}catch{/* Retain a partial temporary file if its ownership changed. */}}}
}
function string(value,label,max,{empty=false}={}){if(typeof value!=='string'||value.length>max||value.includes('\0')||(!empty&&!value.trim()))throw Error(`${label} must be ${empty?'at most':'between 1 and'} ${max} characters.`);return value.trim();}
function command(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Work command.');
  const fields={create:['type','team','kind','title','brief','runOptions','demo'],select:['type','id'],send:['type','text'],stop:['type'],refresh:['type'],clearError:['type'],saveArtifact:['type','artifact']}[value.type];
  if(!fields||Object.keys(value).some(key=>!fields.includes(key)))throw Error('Unknown Work command or unsupported fields.');
  if(value.type==='create'){
    if(!TEAMS.has(value.team)||!KINDS.has(value.kind))throw Error('Choose a supported Work team and output type.');
    if(value.demo!==undefined&&typeof value.demo!=='boolean')throw Error('Invalid demo option.');
    return{...value,title:string(value.title,'Title',160),brief:string(value.brief,'Brief',12000,{empty:true}),runOptions:validateRunOptions(value.runOptions)};
  }
  if(value.type==='select'&&(!UUID.test(value.id??'')))throw Error('Choose a saved Work item.');
  if(value.type==='send')return{...value,text:string(value.text,'Message',12000)};
  return value;
}
function verifiedArtifact(value,kind){const artifact=validateArtifact(value);if(artifact.kind!==kind)throw Error('Artifact kind must match this Work item.');return artifact;}
function restoredRecord(value){
  const item=value?.item;
  if(!item||!UUID.test(item.id??'')||!UUID.test(item.projectId??'')||!UUID.test(item.taskId??'')||!TEAMS.has(item.team)||!KINDS.has(item.kind)||typeof item.demo!=='boolean'||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.updatedAt))||!Array.isArray(item.sources)||item.sources.length>8)throw Error('Saved Work item is invalid.');
  string(item.title,'Saved title',160);
  const sourceIds=new Set();
  for(const source of item.sources){
    if(!source||!UUID.test(source.id??'')||sourceIds.has(source.id)||typeof source.name!=='string'||source.name.length>120||typeof source.path!=='string'||!/^inputs\/[a-zA-Z0-9._-]+\.(csv|json|md|txt)$/.test(source.path)||!Number.isSafeInteger(source.bytes)||source.bytes<0||source.bytes>MAX_SOURCE||!Number.isFinite(Date.parse(source.addedAt)))throw Error('Saved Work source is invalid.');
    sourceIds.add(source.id);
  }
  const prompts={};
  for(const [key,text] of Object.entries(value.prompts??{}).slice(-150)){if(UUID.test(key)&&typeof text==='string'&&text.length<=12000)prompts[key]=text;}
  return{item:clone(item),prompts,artifactUpdatedAt:Number.isFinite(Date.parse(value.artifactUpdatedAt))?value.artifactUpdatedAt:null};
}

/** Local Work library. getArtifact(id) is asynchronous and returns the last
 * validated artifact for a registered item, or null, without changing selection.
 * addSources(paths) is a main-process-only entry point for native picker results.
 */
export async function createWorkService({dataDir,projectsDir,runtime}={}){
  if(!dataDir||!path.isAbsolute(dataDir))throw Error('An absolute Work data folder is required.');
  dataDir=await makeDirectory(dataDir);
  projectsDir=await makeDirectory(projectsDir??path.join(dataDir,'workspaces'));
  if(samePath(dataDir,projectsDir)||inside(projectsDir,dataDir))throw Error('Workspaces cannot contain Work application data.');
  const artifactDir=await makeDirectory(path.join(dataDir,'artifacts')),manifestFile=path.join(dataDir,'manifest.json');
  const records=new Map(),artifacts=new Map(),artifactErrors=new Map(),listeners=new Set(),observedTerminals=new Set();
  let activeId=null,ownError=null,manifestReadable=true,closed=false,closing=false,operationBusy=false,queue=Promise.resolve(),pendingDisplay=null;
  let cancellationEpoch=0,activeSendEpoch=null,closePromise=null;
  const requireCurrentSend=token=>{if(closed||closing||token===null||token!==cancellationEpoch)throw Error('Work request cancelled before submission.');};
  // The controller serializes its actions. Cancellation must also reach native
  // preflight immediately, and a connection that finishes late must not submit.
  const guardedRuntime=runtime?{
    snapshot:(...args)=>runtime.snapshot?.(...args),
    subscribe:(...args)=>runtime.subscribe?.(...args),
    disconnect:(...args)=>runtime.disconnect?.(...args),
    decide:(...args)=>runtime.decide?.(...args),
    async connect(...args){const token=activeSendEpoch;requireCurrentSend(token);const result=await runtime.connect(...args);requireCurrentSend(token);return result;},
    async send(...args){const token=activeSendEpoch;requireCurrentSend(token);const result=await runtime.send(...args);requireCurrentSend(token);return result;}
  }:undefined;
  function cancelPending(){
    cancellationEpoch++;
    // Invoke now rather than in a promise continuation or the service queue.
    // Capture a rejection until the queued action can report it to the UI.
    try{return Promise.resolve(runtime?.disconnect?.()).then(()=>null,error=>error);}catch(error){return Promise.resolve(error);}
  }
  try{
    const manifest=JSON.parse(await boundedRead(manifestFile,MAX_MANIFEST));
    if(manifest.version!==1||!Array.isArray(manifest.items)||manifest.items.length>200)throw Error('Unsupported saved Work library.');
    for(const value of manifest.items){const record=restoredRecord(value);if(records.has(record.item.id))throw Error('Duplicate saved Work item.');records.set(record.item.id,record);}
    activeId=records.has(manifest.activeId)?manifest.activeId:null;
  }catch(error){if(error.code!=='ENOENT'){ownError=`The saved Work library could not be opened: ${message(error)}`;manifestReadable=false;records.clear();}}
  const controller=await createController({dataDir:path.join(dataDir,'controller'),projectsDir,runtime:guardedRuntime});
  let native=controller.getState();
  const rootFor=record=>path.join(projectsDir,`work-${record.item.id}`);
  const cacheFor=record=>path.join(artifactDir,`${record.item.id}.json`);
  async function workspace(record){
    const root=rootFor(record),project=native.projects.find(value=>value.id===record.item.projectId);
    if(!project||!samePath(project.root,root)||!inside(projectsDir,root))throw Error('The saved Work workspace association is invalid.');
    await inspectPath(projectsDir,{directory:true});await inspectPath(root,{directory:true});return root;
  }
  const executing=()=>LIVE.has(native.runtime?.status)||(native.task?.runs??[]).some(run=>['queued','working','waiting'].includes(run.status));
  const requireIdle=()=>{if(executing())throw Error('Stop or finish the running Muse request before changing Work items or sources.');};
  const requireItem=()=>{const record=records.get(activeId);if(!record)throw Error('Create or select a Work item first.');return record;};
  function getState(){
    const record=records.get(activeId),item=record?.item??null;
    const task=item&&native.task?.id===item.taskId?clone(native.task):null;
    if(task){
      task.messages=task.messages.map(entry=>entry.role==='user'&&(record.prompts[entry.id]||record.prompts[entry.turnId])?{...entry,text:record.prompts[entry.id]||record.prompts[entry.turnId]}:entry);
      task.runs=(task.runs??[]).map(run=>record.prompts[run.promptId]?{...run,prompt:record.prompts[run.promptId]}:run);
    }
    return clone({items:[...records.values()].map(record=>record.item).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),activeId,item,task,runtime:native.runtime,busy:operationBusy||native.busy||executing(),error:ownError??native.error??null,artifact:artifacts.get(activeId)??null,artifactError:artifactErrors.get(activeId)??null,artifactUpdatedAt:record?.artifactUpdatedAt??null,capabilities:{mp4:false}});
  }
  function getUpdateState(){return{...updateStateFlags(native),busy:operationBusy||native.busy||executing(),item:{title:records.get(activeId)?.item?.title??null}};}
  const emit=()=>{if(closed||closing)return;const state=getState();for(const listener of listeners)try{listener(state);}catch{/* A renderer listener cannot interrupt persistence. */}};
  async function persist(){
    if(!manifestReadable)throw Error('The saved Work library is unreadable. Its original file was preserved.');
    const text=JSON.stringify({version:1,activeId,items:[...records.values()]});
    if(Buffer.byteLength(text)>MAX_MANIFEST)throw Error('The Work library exceeds its storage limit.');
    await atomicWrite(manifestFile,text);
  }
  async function act(action){native=await controller.dispatch(action);if(native.error)throw Error(native.error);return native;}
  async function refresh(record,{required=false}={}){
    try{
      const root=await workspace(record),text=await boundedRead(path.join(root,'work-artifact.json'),MAX_ARTIFACT);
      const artifact=verifiedArtifact(JSON.parse(text),record.item.kind);
      if(JSON.stringify(artifacts.get(record.item.id))!==JSON.stringify(artifact)){
        await atomicWrite(cacheFor(record),JSON.stringify(artifact));artifacts.set(record.item.id,artifact);record.artifactUpdatedAt=date();record.item.updatedAt=record.artifactUpdatedAt;await persist();
      }
      artifactErrors.delete(record.item.id);
    }catch(error){if(error.code!=='ENOENT'||artifacts.has(record.item.id)||required)artifactErrors.set(record.item.id,`Artifact could not be refreshed: ${message(error)}`);}
  }
  function schedule(operation){
    const pending=queue.then(operation);queue=pending.catch(error=>{ownError=message(error);emit();});return pending;
  }
  function onController(value){
    if(closed||closing)return;native=value;
    if(pendingDisplay&&native.task?.id===pendingDisplay.record.item.taskId){
      for(const entry of native.task.messages)if(entry.role==='user'&&!pendingDisplay.previous.has(entry.id)&&UUID.test(entry.id))pendingDisplay.record.prompts[entry.id]=pendingDisplay.text;
    }
    const record=[...records.values()].find(record=>record.item.taskId===native.task?.id);
    if(record){
      const run=native.task.runs?.at(-1);
      if(run&&['completed','failed','cancelled','interrupted'].includes(run.status)&&!observedTerminals.has(run.id)){
        observedTerminals.add(run.id);
        void schedule(async()=>{await refresh(record,{required:run.status==='completed'});emit();}).catch(()=>{});
      }
    }
    emit();
  }
  const unsubscribe=controller.subscribe(onController);
  for(const record of records.values()){
    try{artifacts.set(record.item.id,verifiedArtifact(JSON.parse(await boundedRead(cacheFor(record),MAX_ARTIFACT)),record.item.kind));}catch(error){if(error.code!=='ENOENT')artifactErrors.set(record.item.id,`Saved preview could not be read: ${message(error)}`);}
  }
  if(activeId)try{const record=requireItem();await workspace(record);await act({type:'selectTask',id:record.item.taskId});await refresh(record);}catch(error){ownError=message(error);}

  async function perform(value,requestedEpoch){
    switch(value.type){
      case 'clearError':ownError=null;await act({type:'clearError'});break;
      case 'stop':await act({type:'disconnectMuse'});break;
      case 'create':{
        requireIdle();if(records.size>=200)throw Error('This Work library has reached its 200 item limit.');
        if(!manifestReadable)throw Error('The saved Work library is unreadable. Its original file was preserved.');
        const id=randomUUID(),root=path.join(projectsDir,`work-${id}`);await inspectPath(projectsDir,{directory:true});await fs.mkdir(root);
        await atomicWrite(path.join(root,'package.json'),JSON.stringify({name:`musebench-work-${id}`,private:true,scripts:{}}),{exclusive:true});
        await act({type:'openProject',path:root});await act({type:'newTask',request:value.brief||value.title,mode:'muse',runOptions:value.runOptions});
        const createdAt=date(),record={item:{id,title:value.title,team:value.team,kind:value.kind,projectId:native.activeProject.id,taskId:native.task.id,createdAt,updatedAt:createdAt,sources:[],demo:value.demo===true},prompts:{},artifactUpdatedAt:null};
        records.set(id,record);activeId=id;await persist();
        if(value.demo)await saveArtifact(record,demoArtifact(value.kind,value.team));
        break;
      }
      case 'select':{requireIdle();const record=records.get(value.id);if(!record)throw Error('Saved Work item not found.');await workspace(record);await act({type:'selectTask',id:record.item.taskId});activeId=value.id;await refresh(record);await persist();break;}
      case 'refresh':{const record=requireItem();await refresh(record);break;}
      case 'saveArtifact':{requireIdle();await saveArtifact(requireItem(),value.artifact);break;}
      case 'send':{
        requireCurrentSend(requestedEpoch);
        requireIdle();const record=requireItem(),root=await workspace(record);await refresh(record);
        for(const source of record.item.sources)await boundedRead(path.join(root,source.path),MAX_SOURCE);
        const prompt=artifactPrompt({item:record.item,text:value.text,sources:record.item.sources,artifact:artifacts.get(record.item.id)??null});
        if(typeof prompt!=='string'||prompt.length>16000)throw Error('The request and source context exceed the native message limit. Shorten the message.');
        const previous=new Set(native.task?.messages.map(entry=>entry.id));
        requireCurrentSend(requestedEpoch);activeSendEpoch=requestedEpoch;
        pendingDisplay={record,previous,text:value.text};
        try{await act({type:'sendMessage',text:prompt});}finally{
          pendingDisplay=null;activeSendEpoch=null;
          const sent=native.task?.messages.findLast(entry=>entry.role==='user'&&!previous.has(entry.id));
          if(sent){record.prompts[sent.id]=value.text;record.prompts=Object.fromEntries(Object.entries(record.prompts).slice(-150));record.item.updatedAt=date();await persist();}
        }
        break;
      }
    }
  }
  async function saveArtifact(record,value){
    const artifact=verifiedArtifact(value,record.item.kind),root=await workspace(record),text=JSON.stringify(artifact);
    await atomicWrite(path.join(root,'work-artifact.json'),text);await atomicWrite(cacheFor(record),text);
    artifacts.set(record.item.id,artifact);artifactErrors.delete(record.item.id);record.artifactUpdatedAt=date();record.item.updatedAt=record.artifactUpdatedAt;await persist();
  }
  async function run(operation){
    return schedule(async()=>{
      if(closed||closing)throw Error('Work service is closed.');ownError=null;operationBusy=true;emit();
      try{await operation();}catch(error){ownError=message(error);}finally{operationBusy=false;emit();}
      return getState();
    });
  }
  return{
    getState,getUpdateState,
    copyArtifact(value,team){return run(async()=>{
      const artifact=validateArtifact(value);
      const draft=command({type:'create',team,kind:artifact.kind,title:artifact.title,brief:'Revise this private copy of the shared artifact. Publishing back to its space is a separate action.'});
      // Creation and initial content are one queue operation: another selection
      // cannot redirect the imported artifact into an existing private item.
      await perform(draft);await saveArtifact(requireItem(),artifact);
    });},
    subscribe(listener){if(typeof listener!=='function')throw Error('A Work state listener is required.');listeners.add(listener);return()=>listeners.delete(listener);},
    dispatch(value){
      let parsed;
      try{parsed=command(value);}catch(error){return run(async()=>{throw error;});}
      const requestedEpoch=cancellationEpoch;
      if(parsed.type==='stop'){
        const cancellation=cancelPending();
        return run(async()=>{const error=await cancellation;await perform(parsed);if(error)throw error;});
      }
      return run(async()=>perform(parsed,requestedEpoch));
    },
    addSources(paths){return run(async()=>{
      requireIdle();const record=requireItem();
      if(!Array.isArray(paths)||paths.length===0||paths.length+record.item.sources.length>8)throw Error('Choose between one and eight source files; each Work item supports 8 sources.');
      const root=await workspace(record),inputDir=path.join(root,'inputs');await inspectPath(inputDir,{missing:true});
      const pending=[];
      for(const sourcePath of paths){
        if(typeof sourcePath!=='string'||!path.isAbsolute(sourcePath))throw Error('Sources must come from the native file picker.');
        const extension=path.extname(sourcePath).toLowerCase();if(!EXTENSIONS.has(extension))throw Error('Sources must be CSV, JSON, Markdown or TXT files.');
        const content=await boundedRead(sourcePath,MAX_SOURCE),id=randomUUID();
        const name=path.basename(sourcePath).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120)||`source${extension}`;
        const filename=`${id}-${path.basename(name,path.extname(name)).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)}${extension}`;
        pending.push({content,source:{id,name,path:`inputs/${filename}`,bytes:Buffer.byteLength(content),addedAt:date()}});
      }
      await makeDirectory(inputDir);const created=[];
      try{for(const entry of pending){const destination=path.join(root,entry.source.path);await atomicWrite(destination,entry.content,{exclusive:true});created.push(destination);}}
      catch(error){for(const destination of created)try{await inspectPath(destination);await fs.unlink(destination);}catch{}throw error;}
      record.item.sources.push(...pending.map(entry=>entry.source));record.item.updatedAt=date();await persist();
    });},
    async getArtifact(id){if(typeof id!=='string'||!UUID.test(id)||!records.has(id))return null;const artifact=artifacts.get(id);return artifact?clone(verifiedArtifact(artifact,records.get(id).item.kind)):null;},
    close(){
      if(closePromise)return closePromise;
      closing=true;const cancellation=cancelPending();
      closePromise=(async()=>{const error=await cancellation;await queue;unsubscribe();await controller.close();closed=true;listeners.clear();if(error)throw error;})();
      return closePromise;
    }
  };
}
