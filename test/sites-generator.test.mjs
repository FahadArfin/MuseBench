import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSitesGenerator} from '../src/sites/generator.mjs';
import {bundleFromFiles,readSiteFile} from '../src/sites/files.mjs';

const siteBundle=(body='Original page')=>bundleFromFiles([{path:'index.html',data:`<!doctype html><html><body>${body}</body></html>`},{path:'style.css',data:'body{color:#123}'}]);
function fakeRuntime(){
  const listeners=new Set(),calls=[];
  let state={status:'unavailable',reason:null,binary:'fake-native',sdkVersion:'fixture',transport:'exec',liveVerified:false,permissionVerified:false,messages:[],runId:null,activity:{items:[],truncated:false},shellResults:[]};
  const update=value=>{state={...state,...value};for(const listener of listeners)listener(structuredClone(state));};
  return{calls,snapshot:()=>structuredClone(state),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},async connect(options){calls.push({type:'connect',...options});update({status:'idle',permissionVerified:true,sessionId:'session'});},async send(options){calls.push({type:'send',...options});update({status:'running',runId:null,messages:[]});update({runId:`run-${calls.length}`});},async disconnect(){calls.push({type:'disconnect'});update({status:'closed',permissionVerified:false});},complete(){update({status:'completed',liveVerified:true,messages:[{id:`answer-${calls.length}`,kind:'agentMessage',text:'Saved the site.'}]});},fail(){update({status:'failed',reason:'The native run failed.'});}};
}
async function fixture(t,{runtime=fakeRuntime(),onGenerated}={}){
  const base=await mkdtemp(path.join(tmpdir(),'musebench-sites-generator-')),outputs=[];
  const options={dataDir:path.join(base,'data'),projectsDir:path.join(base,'projects'),runtime,onGenerated:async(id,bundle)=>{outputs.push({id,bundle});await onGenerated?.(id,bundle);}};
  const generator=await createSitesGenerator(options),instances=[generator];
  t.after(async()=>{for(const instance of instances)await instance.close();await rm(base,{recursive:true,force:true,maxRetries:3});});
  const siteId=randomUUID();
  const generate=(overrides={})=>generator.generate({siteId,title:'Local launch page',text:'Make a launch page.',bundle:siteBundle(),...overrides});
  const root=()=>path.join(options.projectsDir,`site-${siteId}`);
  return{base,options,generator,instances,runtime,outputs,siteId,generate,root};
}
async function settled(generator,predicate){for(let attempt=0;attempt<150;attempt++){const state=generator.getState();if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,10));}const state=generator.getState();assert.fail(`Site generator did not settle: ${JSON.stringify({busy:state.busy,error:state.error,runs:state.task?.runs,runtime:state.runtime?.status})}`);}
function delayConnect(){const runtime=fakeRuntime(),connect=runtime.connect;let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});runtime.connect=async options=>{runtime.calls.push({type:'connect-start'});entered();await gate;return connect(options);};return{runtime,started,release};}

test('selecting a site does not run Muse or create a task',async t=>{
  const h=await fixture(t),state=await h.generator.select(h.siteId);
  assert.equal(state.error,null);assert.equal(state.task,null);assert.equal(state.busy,false);assert.equal(h.runtime.calls.some(call=>call.type==='send'||call.type==='connect'),false);assert.deepEqual(await readdir(h.options.projectsDir),[]);
});

test('compact generation observations follow activity without returning transcript content',async t=>{
 const h=await fixture(t);await h.generator.select(h.siteId);assert.equal(h.generator.getUpdateState().busy,false);
 await h.generate();const active=h.generator.getUpdateState();assert.equal(active.busy,true);
 assert.equal(active.task?.messages,undefined);assert.equal(active.runtime.messages,undefined);
 await h.generator.stop();assert.equal(h.generator.getUpdateState().busy,false);
});

test('explicit generation uses its own guarded workspace and preserves original messages',async t=>{
  const h=await fixture(t),state=await h.generate();
  assert.equal(state.error,null);assert.equal(state.busy,true);assert.equal(state.task.mode,'muse');assert.equal(state.task.runs.at(-1).status,'working');
  assert.equal(state.task.messages.findLast(entry=>entry.role==='user').text,'Make a launch page.');assert.equal(state.task.runs.at(-1).prompt,'Make a launch page.');
  assert.equal(h.runtime.calls.find(call=>call.type==='connect').workspaceRoot,h.root());
  const sent=h.runtime.calls.find(call=>call.type==='send');assert.match(sent.text,/public\/index\.html/);assert.match(sent.text,/read_file|write_file/);assert.match(sent.text,/do not publish|never publish/i);assert.deepEqual(sent.runOptions,{reasoning:'high',approval:'ask'});
  assert.match(await readFile(path.join(h.root(),'public/index.html'),'utf8'),/Original page/);assert.equal(JSON.parse(await readFile(path.join(h.root(),'package.json'),'utf8')).private,true);
  assert.deepEqual(h.outputs,[]);
});

test('only completed native output is validated and committed, with history retained after restart',async t=>{
  const h=await fixture(t);const sent=await h.generate();
  await writeFile(path.join(h.root(),'public/index.html'),'<!doctype html><h1>Generated page</h1>');h.runtime.complete();
  const completed=await settled(h.generator,state=>!state.busy&&h.outputs.length===1);
  assert.equal(completed.error,null);assert.equal(completed.task.runs.at(-1).status,'completed');assert.equal(h.outputs[0].id,h.siteId);assert.match(readSiteFile(h.outputs[0].bundle,'index.html'),/Generated page/);
  await h.generator.close();const restored=await createSitesGenerator({...h.options,runtime:fakeRuntime()});h.instances.push(restored);assert.equal(restored.getState().task.id,sent.task.id);assert.equal(restored.getState().task.messages.findLast(entry=>entry.role==='user').text,'Make a launch page.');assert.equal(h.outputs.length,1,'Restart must not re-commit old runs.');
});

test('invalid generated files and failed runs never replace the previous valid preview',async t=>{
  const h=await fixture(t);await h.generate();await writeFile(path.join(h.root(),'public/.env'),'TOKEN=must-never-publish');h.runtime.complete();
  let state=await settled(h.generator,value=>!value.busy);assert.match(state.error,/generated site|output|hidden|private|unsupported/i);assert.equal(h.outputs.length,0);
  await h.generate();assert.deepEqual((await readdir(path.join(h.root(),'public'))).sort(),['index.html','style.css']);h.runtime.fail();state=await settled(h.generator,value=>!value.busy);assert.equal(state.task.runs.at(-1).status,'failed');assert.equal(h.outputs.length,0);
});

test('selection and another send remain blocked throughout generation and awaited output commit',async t=>{
  let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const h=await fixture(t,{onGenerated:async()=>{entered();await gate;}});const sent=await h.generate();
  const refused=await h.generator.select(randomUUID());assert.match(refused.error,/finish|stop|running/i);assert.equal(refused.task.id,sent.task.id);
  const again=await h.generate({text:'Do not queue this second request.'});assert.match(again.error,/finish|stop|running/i);assert.equal(h.runtime.calls.filter(call=>call.type==='send').length,1);
  h.runtime.complete();await started;assert.equal(h.generator.getState().busy,true);release();await settled(h.generator,value=>!value.busy);
});

test('each site keeps a separate persisted task and current draft is synchronized before another run',async t=>{
  const h=await fixture(t);const first=await h.generate();h.runtime.complete();await settled(h.generator,state=>!state.busy);
  const secondId=randomUUID(),second=await h.generate({siteId:secondId,title:'Second site'});assert.notEqual(second.task.id,first.task.id);h.runtime.complete();await settled(h.generator,state=>!state.busy);
  const selected=await h.generator.select(h.siteId);assert.equal(selected.task.id,first.task.id);
  const again=await h.generate({bundle:bundleFromFiles([{path:'index.html',data:'<h1>New draft</h1>'}]),text:'Use the current draft.'});assert.equal(again.task.id,first.task.id);assert.deepEqual(await readdir(path.join(h.root(),'public')),['index.html']);assert.match(await readFile(path.join(h.root(),'public/index.html'),'utf8'),/New draft/);
});

test('stop disconnects a pending connection immediately and a late connection cannot submit',async t=>{
  const delayed=delayConnect(),h=await fixture(t,{runtime:delayed.runtime});const sending=h.generate();await delayed.started;
  const stopping=h.generator.stop();try{assert.ok(h.runtime.calls.some(call=>call.type==='disconnect'));}finally{delayed.release();await sending;await stopping;}
  assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);assert.equal(h.generator.getState().busy,false);assert.equal(h.generator.getState().runtime.status,'closed');assert.equal(h.outputs.length,0);
  assert.equal((await h.generate({text:'This is a new explicit request.'})).error,null);
});

test('close invalidates pending native connection before waiting for queue drain',async t=>{
  const delayed=delayConnect(),h=await fixture(t,{runtime:delayed.runtime});const sending=h.generate();await delayed.started;
  const closing=h.generator.close();try{assert.ok(h.runtime.calls.some(call=>call.type==='disconnect'));}finally{delayed.release();await sending;await closing;}
  assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);assert.equal(h.runtime.snapshot().status,'closed');assert.equal(h.outputs.length,0);
});

test('stop invalidates a generate request queued before it starts',async t=>{
  const h=await fixture(t),sending=h.generate(),stopping=h.generator.stop();await Promise.all([sending,stopping]);assert.equal(h.runtime.calls.some(call=>call.type==='send'||call.type==='connect'),false);assert.equal(h.outputs.length,0);
});

test('linked public folders cannot be read or overwritten by generator',async t=>{
  const h=await fixture(t);await h.generate();await h.generator.stop();
  const publicDir=path.join(h.root(),'public'),outside=path.join(h.base,'private');await mkdir(outside);await writeFile(path.join(outside,'index.html'),'private data');await rename(publicDir,`${publicDir}-old`);await symlink(outside,publicDir,process.platform==='win32'?'junction':'dir');
  const state=await h.generate();assert.match(state.error,/link|junction/i);assert.equal(h.runtime.calls.filter(call=>call.type==='send').length,1);assert.equal(await readFile(path.join(outside,'index.html'),'utf8'),'private data');assert.equal(h.outputs.length,0);
});

test('invalid input cannot create workspaces or submit a model request',async t=>{
  const h=await fixture(t);
  for(const overrides of [{siteId:'../escape'},{text:''},{text:'x'.repeat(12001)},{title:'x'.repeat(161)},{bundle:{files:[]}}])assert.ok((await h.generate(overrides)).error);
  assert.equal(h.runtime.calls.some(call=>call.type==='send'||call.type==='connect'),false);assert.deepEqual(await readdir(h.options.projectsDir),[]);
});

test('unreadable task mapping fails closed and is preserved on disk',async t=>{
  const h=await fixture(t);await h.generator.close();const file=path.join(h.options.dataDir,'manifest.json'),broken='{"version":999,"records":[]}';await writeFile(file,broken);
  const restored=await createSitesGenerator({...h.options,runtime:fakeRuntime()});h.instances.push(restored);assert.match(restored.getState().error,/saved|library|mapping/i);
  const state=await restored.generate({siteId:h.siteId,title:'Cannot replace history',text:'Do not send.',bundle:siteBundle()});assert.match(state.error,/unreadable|mapping|library/i);assert.equal(await readFile(file,'utf8'),broken);
});

test('callback failure is surfaced and cannot leave the generator permanently busy',async t=>{
  const h=await fixture(t,{onGenerated:async()=>{throw Error('Cannot save generated draft.');}});await h.generate();h.runtime.complete();const state=await settled(h.generator,value=>!value.busy);assert.match(state.error,/Cannot save generated draft/);assert.equal(h.outputs.length,1);
});

test('a run completing before send returns commits exactly once',async t=>{
  const runtime=fakeRuntime(),send=runtime.send;runtime.send=async options=>{await send(options);runtime.complete();};
  const h=await fixture(t,{runtime});await h.generate();await settled(h.generator,value=>!value.busy);assert.equal(h.outputs.length,1);
});

test('stop reaches native send preflight and rejects completion from that cancelled epoch',async t=>{
  const runtime=fakeRuntime(),send=runtime.send,disconnect=runtime.disconnect;let epoch=0,entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  runtime.send=async options=>{const token=epoch;runtime.calls.push({type:'send-preflight'});entered();await gate;if(token!==epoch)throw Error('Native preflight cancelled.');return send(options);};
  runtime.disconnect=async()=>{epoch++;return disconnect();};
  const h=await fixture(t,{runtime}),sending=h.generate();await started;const stopping=h.generator.stop();
  try{assert.ok(runtime.calls.some(call=>call.type==='disconnect'));}finally{release();await sending;await stopping;}
  assert.equal(runtime.calls.some(call=>call.type==='send'),false);assert.equal(h.outputs.length,0);assert.equal(h.generator.getState().busy,false);
});

test('a persisted task cannot be reassigned to another sites workspace',async t=>{
  const h=await fixture(t),first=await h.generate();h.runtime.complete();await settled(h.generator,state=>!state.busy);
  const secondId=randomUUID();await h.generate({siteId:secondId});h.runtime.complete();await settled(h.generator,state=>!state.busy);await h.generator.close();
  const file=path.join(h.options.dataDir,'manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));manifest.records.find(record=>record.siteId===secondId).taskId=first.task.id;await writeFile(file,JSON.stringify(manifest));
  const runtime=fakeRuntime(),restored=await createSitesGenerator({...h.options,runtime});h.instances.push(restored);
  const state=await restored.generate({siteId:secondId,title:'Second site',text:'Do not edit the first site.',bundle:siteBundle()});assert.match(state.error,/association|mapping/i);assert.equal(runtime.calls.some(call=>call.type==='send'),false);
});
