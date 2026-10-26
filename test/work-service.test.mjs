import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rename,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWorkService} from '../src/work/index.mjs';

const artifact=(title='Quarterly results',kind='dashboard')=>({version:1,kind,title,summary:'An explicit local fixture.',sources:[],metrics:[{label:'Revenue',value:'120'}],charts:[],sections:[{heading:'Evidence',body:'Local test data.'}],scenes:[]});
function fakeRuntime(){
  const listeners=new Set(),calls=[];
  let state={status:'unavailable',reason:null,binary:'fake-native',sdkVersion:'test',transport:'exec',liveVerified:false,permissionVerified:false,messages:[],runId:null,activity:{items:[],truncated:false},shellResults:[]};
  const update=value=>{state={...state,...value};for(const fn of listeners)fn(structuredClone(state));};
  return {calls,snapshot:()=>structuredClone(state),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async connect(options){calls.push({type:'connect',...options});update({status:'idle',permissionVerified:true,sessionId:'session'});},async send(options){calls.push({type:'send',...options});update({status:'running',runId:null,messages:[]});update({runId:`run-${calls.length}`});},async disconnect(){calls.push({type:'disconnect'});update({status:'closed',permissionVerified:false});},complete(){update({status:'completed',liveVerified:true,messages:[{id:`answer-${calls.length}`,kind:'agentMessage',text:'Saved the artifact.'}]});},fail(){update({status:'failed',reason:'Native process failed.'});}};
}
async function fixture(t,runtime=fakeRuntime()){
  const base=await mkdtemp(path.join(tmpdir(),'musebench-work-'));
  const options={dataDir:path.join(base,'data'),projectsDir:path.join(base,'projects'),runtime};
  const service=await createWorkService(options),services=[service];
  t.after(async()=>{for(const s of services)await s.close();await rm(base,{recursive:true,force:true,maxRetries:3});});
  const create=async(overrides={})=>service.dispatch({type:'create',team:'finance',kind:'dashboard',title:'Quarterly results',brief:'Summarize the quarterly results.',...overrides});
  const root=async()=>{const children=await readdir(options.projectsDir);assert.ok(children.length);return path.join(options.projectsDir,children.at(-1));};
  return{base,options,runtime,service,services,create,root};
}
async function settled(service,predicate){for(let i=0;i<120;i++){const state=service.getState();if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Work service did not settle.');}

test('creating a draft makes an independent persisted Muse workspace without running a model',async t=>{
  const h=await fixture(t),s=await h.create();
  assert.equal(s.error,null);assert.equal(s.items.length,1);assert.equal(s.item.kind,'dashboard');assert.equal(s.task.mode,'muse');assert.equal(s.artifact,null);
  assert.equal(h.runtime.calls.some(call=>['send','connect'].includes(call.type)),false);
  assert.equal(JSON.parse(await readFile(path.join(await h.root(),'package.json'),'utf8')).private,true);
  await h.service.close();const restored=await createWorkService(h.options);h.services.push(restored);
  assert.equal(restored.getState().activeId,s.item.id);assert.equal(restored.getState().task.id,s.task.id);
  assert.equal(restored.getState().task.request,'Summarize the quarterly results.');
});

test('demo selection writes a preview without model execution',async t=>{
  const h=await fixture(t),s=await h.create({demo:true});
  assert.equal(s.error,null);assert.equal(s.item.demo,true);assert.equal(s.artifact.kind,'dashboard');
  assert.equal(h.runtime.calls.some(call=>['send','connect'].includes(call.type)),false);
  assert.equal(JSON.parse(await readFile(path.join(await h.root(),'work-artifact.json'),'utf8')).kind,'dashboard');
});

test('copying a shared artifact is atomic with respect to concurrent Work selection',async t=>{
 const h=await fixture(t),original=await h.create();await h.service.dispatch({type:'saveArtifact',artifact:artifact('Private revision')});
 const copy=h.service.copyArtifact(artifact('Shared revision'),'finance');
 const selection=h.service.dispatch({type:'select',id:original.item.id});
 const copied=await copy;assert.equal(copied.error,null);assert.notEqual(copied.item.id,original.item.id);await selection;
 assert.equal((await h.service.getArtifact(original.item.id)).title,'Private revision');assert.equal((await h.service.getArtifact(copied.item.id)).title,'Shared revision');
 assert.equal(copied.item.sources.length,0);assert.equal(copied.task.runs.length,0);assert.match(copied.task.request,/private copy/);assert.equal(h.runtime.calls.some(c=>c.type==='send'),false);
});

test('native completion automatically reads real output and keeps concise messages across restart',async t=>{
  const h=await fixture(t);await h.create();
  let s=await h.service.dispatch({type:'send',text:'Show revenue by quarter.'});
  assert.equal(s.error,null);assert.equal(s.busy,true);assert.equal(s.task.runs.at(-1).status,'working');
  assert.equal(s.task.messages.findLast(m=>m.role==='user').text,'Show revenue by quarter.');assert.equal(s.task.runs.at(-1).prompt,'Show revenue by quarter.');
  assert.match(h.runtime.calls.find(call=>call.type==='send').text,/work-artifact\.json/);
  await writeFile(path.join(await h.root(),'work-artifact.json'),JSON.stringify(artifact()));h.runtime.complete();
  s=await settled(h.service,value=>value.artifact?.title==='Quarterly results'&&!value.busy);
  assert.equal(s.task.runtimeComplete,true);assert.equal(s.task.runs.at(-1).status,'completed');assert.equal(s.task.messages.at(-1).text,'Saved the artifact.');
  await h.service.close();const restored=await createWorkService(h.options);h.services.push(restored);
  assert.equal(restored.getState().artifact.title,'Quarterly results');assert.equal(restored.getState().task.messages.findLast(m=>m.role==='user').text,'Show revenue by quarter.');
});

test('malformed or mismatched output retains the last valid artifact after restart',async t=>{
  const h=await fixture(t);await h.create();await h.service.dispatch({type:'saveArtifact',artifact:artifact('Last good')});
  const output=path.join(await h.root(),'work-artifact.json');
  await writeFile(output,'{bad JSON');let s=await h.service.dispatch({type:'refresh'});
  assert.equal(s.artifact.title,'Last good');assert.match(s.artifactError,/JSON|artifact/i);
  await h.service.close();const restored=await createWorkService(h.options);h.services.push(restored);
  assert.equal(restored.getState().artifact.title,'Last good');assert.ok(restored.getState().artifactError);
  await writeFile(output,JSON.stringify(artifact('Wrong type','document')));s=await restored.dispatch({type:'refresh'});
  assert.equal(s.artifact.title,'Last good');assert.match(s.artifactError,/kind|type/i);
});

test('saved items and protocol artifact lookup remain isolated',async t=>{
  const h=await fixture(t),first=await h.create();await h.service.dispatch({type:'saveArtifact',artifact:artifact('First')});
  const second=await h.create({title:'Second item'});await h.service.dispatch({type:'saveArtifact',artifact:artifact('Second')});
  assert.equal((await h.service.getArtifact(first.item.id)).title,'First');assert.equal(h.service.getState().activeId,second.item.id);
  let s=await h.service.dispatch({type:'select',id:first.item.id});assert.equal(s.artifact.title,'First');assert.equal(s.task.id,first.task.id);
  s=await h.service.dispatch({type:'select',id:second.item.id});assert.equal(s.artifact.title,'Second');assert.equal(s.task.id,second.task.id);
  assert.equal(await h.service.getArtifact('../../secret'),null);
});

test('imports are bounded local UTF-8 snapshots until an explicit send',async t=>{
  const h=await fixture(t);await h.create();const source=path.join(h.base,'sales.csv');await writeFile(source,'quarter,revenue\nQ1,120\n');
  let s=await h.service.addSources([source]);assert.equal(s.error,null);assert.equal(s.item.sources.length,1);
  const imported=s.item.sources[0];assert.match(imported.path,/^inputs\/[a-zA-Z0-9._-]+\.csv$/);
  assert.equal(await readFile(path.join(await h.root(),imported.path),'utf8'),'quarter,revenue\nQ1,120\n');
  await writeFile(source,'changed');assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);
  s=await h.service.dispatch({type:'send',text:'Analyze the attached snapshot.'});assert.equal(s.error,null);
  const prompt=h.runtime.calls.find(call=>call.type==='send').text;assert.match(prompt,/inputs\//);assert.match(prompt,/untrusted|not instructions/i);assert.doesNotMatch(prompt,new RegExp(h.base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('invalid imports reject file types, oversized bytes, invalid UTF-8 and excess attachments',async t=>{
  const h=await fixture(t);await h.create();
  for(const [name,body] of [['unsafe.js','alert(1)'],['large.txt',Buffer.alloc(2*1024*1024+1)],['binary.txt',Buffer.from([0xff,0xfe,0])]]){
    const file=path.join(h.base,name);await writeFile(file,body);const s=await h.service.addSources([file]);assert.ok(s.error);assert.equal(s.item.sources.length,0);
  }
  const paths=await Promise.all(Array.from({length:9},async(_,i)=>{const file=path.join(h.base,`source-${i}.txt`);await writeFile(file,'data');return file;}));
  let s=await h.service.addSources(paths);assert.match(s.error,/8|eight/i);assert.equal(s.item.sources.length,0);
  s=await h.service.addSources(paths.slice(0,8));assert.equal(s.error,null);assert.equal(s.item.sources.length,8);
  s=await h.service.addSources(paths.slice(8));assert.match(s.error,/8|eight/i);
});

test('source and output junctions cannot escape the registered workspace',async t=>{
  const h=await fixture(t);await h.create();const outside=path.join(h.base,'outside');await mkdir(outside);await writeFile(path.join(outside,'secret.txt'),'private');
  const linked=path.join(h.base,'linked');await symlink(outside,linked,process.platform==='win32'?'junction':'dir');
  let s=await h.service.addSources([path.join(linked,'secret.txt')]);assert.match(s.error,/link|junction/i);assert.equal(s.item.sources.length,0);
  const root=await h.root();await mkdir(path.join(root,'inputs'));await rm(path.join(root,'inputs'),{recursive:true});await symlink(outside,path.join(root,'inputs'),process.platform==='win32'?'junction':'dir');
  s=await h.service.addSources([path.join(outside,'secret.txt')]);assert.match(s.error,/link|junction/i);assert.equal((await readdir(outside)).length,1);
});

test('generation locks mutation and stop always cancels the native run',async t=>{
  const h=await fixture(t),first=await h.create();const second=await h.create({title:'Second'});await h.service.dispatch({type:'send',text:'Generate a dashboard.'});
  for(const command of [{type:'select',id:first.item.id},{type:'create',team:'sales',kind:'document',title:'Blocked',brief:''},{type:'saveArtifact',artifact:artifact()}]){
    const s=await h.service.dispatch(command);assert.match(s.error,/running|finish|stop/i);assert.equal(s.activeId,second.item.id);
  }
  const source=path.join(h.base,'new.txt');await writeFile(source,'later');assert.match((await h.service.addSources([source])).error,/running|finish|stop/i);
  let s=await h.service.dispatch({type:'stop'});assert.equal(s.runtime.status,'closed');assert.equal(s.task.runs.at(-1).status,'cancelled');assert.equal(s.busy,false);
  s=await h.service.dispatch({type:'select',id:first.item.id});assert.equal(s.error,null);assert.equal(s.activeId,first.item.id);
});

test('dispatch rejects arbitrary paths, unknown fields, invalid enums and excessive text',async t=>{
  const h=await fixture(t);await h.create();
  for(const command of [{type:'import',paths:['C:/secret.txt']},{type:'send',text:'hello',path:'C:/secret.txt'},{type:'create',team:'invalid',kind:'dashboard',title:'x',brief:''},{type:'send',text:'x'.repeat(12001)},{type:'saveArtifact',artifact:artifact('Wrong','document')}]){
    const s=await h.service.dispatch(command);assert.ok(s.error);
  }
  assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);
  assert.equal((await h.service.dispatch({type:'clearError'})).error,null);
});

test('linked workspace replacement cannot read or write an outside artifact',async t=>{
  const h=await fixture(t);await h.create();await h.service.dispatch({type:'saveArtifact',artifact:artifact('Retained')});
  const root=await h.root(),outside=path.join(h.base,'outside-output');await mkdir(outside);await writeFile(path.join(outside,'work-artifact.json'),JSON.stringify(artifact('Outside')));
  await rename(root,`${root}-original`);await symlink(outside,root,process.platform==='win32'?'junction':'dir');
  let s=await h.service.dispatch({type:'refresh'});assert.equal(s.artifact.title,'Retained');assert.match(s.artifactError,/link|junction/i);
  s=await h.service.dispatch({type:'saveArtifact',artifact:artifact('Overwrite')});assert.match(s.error,/link|junction/i);
  assert.equal(JSON.parse(await readFile(path.join(outside,'work-artifact.json'),'utf8')).title,'Outside');
});

test('oversized generated output and invalid manual edits preserve the last good artifact',async t=>{
  const h=await fixture(t);await h.create();await h.service.dispatch({type:'saveArtifact',artifact:artifact('Retained')});
  const output=path.join(await h.root(),'work-artifact.json');await writeFile(output,Buffer.alloc(512*1024+1,32));
  let s=await h.service.dispatch({type:'refresh'});assert.equal(s.artifact.title,'Retained');assert.match(s.artifactError,/limit/i);
  s=await h.service.dispatch({type:'saveArtifact',artifact:{version:1,kind:'dashboard',title:'Missing content'}});assert.ok(s.error);assert.equal(s.artifact.title,'Retained');
});

test('native failure keeps its failed run and current preview while clearing busy state',async t=>{
  const h=await fixture(t);await h.create();await h.service.dispatch({type:'saveArtifact',artifact:artifact('Retained')});
  await h.service.dispatch({type:'send',text:'Make the next version.'});h.runtime.fail();
  const s=await settled(h.service,state=>!state.busy);assert.equal(s.task.runs.at(-1).status,'failed');assert.equal(s.runtime.reason,'Native process failed.');assert.equal(s.artifact.title,'Retained');assert.equal(s.task.runtimeComplete,false);
});

test('corrupt persisted source paths fail closed and preserve the saved manifest',async t=>{
  const h=await fixture(t);await h.create();const source=path.join(h.base,'source.txt');await writeFile(source,'safe');await h.service.addSources([source]);await h.service.close();
  const manifestPath=path.join(h.options.dataDir,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.items[0].item.sources[0].path='../../secret.txt';const corrupt=JSON.stringify(manifest);await writeFile(manifestPath,corrupt);
  const restored=await createWorkService(h.options);h.services.push(restored);assert.match(restored.getState().error,/library|source/i);assert.equal(restored.getState().items.length,0);
  const s=await restored.dispatch({type:'create',team:'finance',kind:'dashboard',title:'New',brief:''});assert.match(s.error,/unreadable|library/i);assert.equal(await readFile(manifestPath,'utf8'),corrupt);
});

function delayedConnection(){
  const runtime=fakeRuntime(),connect=runtime.connect;let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  runtime.connect=async options=>{runtime.calls.push({type:'connect-start'});entered();await gate;runtime.calls.push({type:'connect-finish'});return connect(options);};
  return{runtime,started,release};
}

test('Stop disconnects pending connection immediately and prevents a late model submission',async t=>{
  const delayed=delayedConnection(),h=await fixture(t,delayed.runtime);await h.create();h.runtime.calls.length=0;
  const sending=h.service.dispatch({type:'send',text:'This request must be cancelled before execution.'});
  await delayed.started;
  const stopping=h.service.dispatch({type:'stop'});
  try{assert.ok(h.runtime.calls.some(call=>call.type==='disconnect'),'Stop must reach the native runtime before the connection finishes.');}
  finally{delayed.release();await sending;await stopping;}
  assert.equal(h.runtime.calls.some(call=>call.type==='send'),false,'A cancelled connection must never submit a model request.');
  assert.equal(h.service.getState().runtime.status,'closed');assert.equal(h.service.getState().busy,false);assert.equal(h.service.getState().task.runs.length,0);
  const next=await h.service.dispatch({type:'send',text:'A new explicit request may run.'});assert.equal(next.error,null);assert.equal(next.task.runs.at(-1).status,'working');
});

test('close disconnects pending connection before queue drain and never submits afterwards',async t=>{
  const delayed=delayedConnection(),h=await fixture(t,delayed.runtime);await h.create();h.runtime.calls.length=0;
  const sending=h.service.dispatch({type:'send',text:'Cancel this on application shutdown.'});await delayed.started;
  const closing=h.service.close();
  try{assert.ok(h.runtime.calls.some(call=>call.type==='disconnect'),'Shutdown must reach the native runtime before waiting for connection.');}
  finally{delayed.release();await sending;await closing;}
  assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);assert.equal(h.runtime.snapshot().status,'closed');
  const restored=await createWorkService({...h.options,runtime:fakeRuntime()});h.services.push(restored);assert.equal(restored.getState().task.runs.length,0);
});

test('Stop invalidates sends that are queued but have not started preflight',async t=>{
  const h=await fixture(t);await h.create();h.runtime.calls.length=0;
  const sending=h.service.dispatch({type:'send',text:'Queued request.'}),stopping=h.service.dispatch({type:'stop'});
  await Promise.all([sending,stopping]);
  assert.equal(h.runtime.calls.some(call=>call.type==='connect'||call.type==='send'),false);assert.equal(h.service.getState().busy,false);
});

test('Stop reaches native send preflight while its controller action is pending',async t=>{
  const runtime=fakeRuntime(),send=runtime.send,disconnect=runtime.disconnect;let epoch=0,entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  runtime.send=async options=>{const token=epoch;runtime.calls.push({type:'send-preflight'});entered();await gate;if(token!==epoch)throw Error('Native preflight cancelled.');return send(options);};
  runtime.disconnect=async()=>{epoch++;return disconnect();};
  const h=await fixture(t,runtime);await h.create();runtime.calls.length=0;
  const sending=h.service.dispatch({type:'send',text:'Cancelled during native verification.'});await started;
  const stopping=h.service.dispatch({type:'stop'});
  try{assert.ok(runtime.calls.some(call=>call.type==='disconnect'),'Stop must invalidate the native runtime preflight before queue drain.');}
  finally{release();await sending;await stopping;}
  assert.equal(runtime.calls.some(call=>call.type==='send'),false);assert.equal(h.service.getState().busy,false);assert.equal(h.service.getState().task.runs.length,0);
});
