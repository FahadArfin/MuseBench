import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createController} from '../src/controller/index.mjs';

const result=(runId='run-current',callId='shell-current',overrides={})=>({callId,runId,toolName:'powershell',command:'npm.cmd run --ignore-scripts test',output:'Project test passed',exitCode:0,terminalStatus:'completed',truncated:false,outcome:'success',...overrides});

// The native runtime is an external, billable boundary. Exercise the real
// controller and SQLite journal with its public snapshot/subscription contract.
async function fixture(t,initial={},options={}){
  const root=await mkdtemp(join(tmpdir(),'musebench-shell-controller-'));
  const project=join(root,'project'),dataDir=join(root,'data');await mkdir(project);
  await writeFile(join(project,'package.json'),JSON.stringify({name:'shell-fixture',scripts:{}}));
  await writeFile(join(project,'index.html'),'<h1>Shell fixture</h1>');
  const state={status:'idle',reason:null,binary:'injected-muse.exe',sdkVersion:'1.4.13',transport:'exec',sessionId:'connection',permissionVerified:true,liveVerified:false,shellEnabled:true,runId:null,messages:[],shellResults:[],...initial};
  let observer=()=>{};
  const publish=patch=>{Object.assign(state,patch);observer(structuredClone(state));};
  const runtime={snapshot:()=>structuredClone(state),subscribe(fn){observer=fn;return()=>{observer=()=>{};};},async send(){publish({status:'checking-permissions'});publish({status:'running',runId:null,shellResults:[]});},async disconnect(){publish({status:'unavailable',sessionId:null,permissionVerified:false});}};
  const controllers=[];
  const projectsDir=join(root,'command-projects');
  const controller=await createController({dataDir,runtime,...(options.externalProjects?{projectsDir}:{} )});controllers.push(controller);
  t.after(async()=>{for(const c of controllers)await c.close();await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
  await controller.dispatch({type:'openProject',path:project});
  publish({status:'idle',sessionId:'connection',permissionVerified:true});
  await controller.dispatch({type:'newTask',request:'Run the approved project command',mode:'muse'});
  await controller.dispatch({type:'approvePlan'});
  const send=async()=>{const sent=await controller.dispatch({type:'sendMessage',text:'Run the approved project command.'});assert.equal(sent.error,null);};
  return{controller,publish,send,dataDir,controllers,project,projectsDir,root};
}

test('billing source reset closes idle connections and refuses running work',async t=>{
 const f=await fixture(t);const before=f.controller.getState().task.id;await f.controller.resetCodeConnections();assert.equal(f.controller.getState().runtime.permissionVerified,false);assert.equal(f.controller.getState().task.id,before);
 f.publish({status:'running',permissionVerified:true});await assert.rejects(f.controller.resetCodeConnections(),/running|work/i);
});

test('native command results remain separate from assistant prose and revision checks',async t=>{
  const {controller:c,publish,send}=await fixture(t);await send();
  publish({runId:'run-current',messages:[{id:'answer',kind:'agentMessage',text:'The command ran.'}],shellResults:[result(),result('run-current','shell-failed',{command:'node fail.mjs',output:'Native exception',exitCode:-1073741819,terminalStatus:'failed',terminalReason:'process exited',outcome:'failure'})]});
  publish({status:'completed',liveVerified:true});
  const state=c.getState();
  assert.equal(state.task.shellResults?.length,2);
  assert.equal(state.task.shellResults[1].exitCode,-1073741819,'the signed Windows exit code is preserved');
  assert.equal(state.task.shellResults[1].terminalStatus,'failed');
  assert.equal(state.task.runtimeComplete,true,'a completed model turn does not imply every command succeeded');
  assert.equal(state.task.check,null,'a native command cannot create revision check evidence');
  assert.equal(state.task.messages.some(item=>item.text.includes('Project test passed')),false,'tool output must not be attributed to Muse prose');
  assert.equal(state.task.messages.filter(item=>item.id==='runtime:answer').length,1);
});

test('new tasks ignore old runtime messages and shell results before and during a new send',async t=>{
  const {controller:c,publish,send}=await fixture(t);await send();
  publish({runId:'run-old',shellResults:[result('run-old','call-old')],messages:[{id:'old-answer',kind:'agentMessage',text:'Old task answer'}]});publish({status:'completed'});
  await c.dispatch({type:'newTask',request:'A separate task',mode:'muse'});await c.dispatch({type:'approvePlan'});
  publish({status:'completed',messages:[{id:'old-answer',kind:'agentMessage',text:'Old task answer'},{id:'late-old-answer',kind:'agentMessage',text:'Late old task answer'}]});
  assert.deepEqual(c.getState().task.shellResults,[]);
  assert.equal(c.getState().task.messages.some(item=>item.id.startsWith('runtime:')),false);
  await send();
  publish({runId:'run-new',shellResults:[result('run-old','call-old'),result('run-new','call-new')],messages:[{id:'old-answer',kind:'agentMessage',text:'Changed old answer'},{id:'late-old-answer',kind:'agentMessage',text:'Late old task answer'},{id:'new-answer',kind:'agentMessage',text:'Current partial'}]});
  publish({status:'completed',messages:[{id:'old-answer',kind:'agentMessage',text:'Changed old answer'},{id:'new-answer',kind:'agentMessage',text:'Current final'}]});
  const task=c.getState().task;
  assert.deepEqual(task.shellResults.map(item=>item.callId),['call-new']);
  assert.deepEqual(task.messages.filter(item=>item.id.startsWith('runtime:')).map(item=>item.text),['Current final']);
  assert.equal(task.runtimeComplete,true);
});

test('checking permissions cannot claim a previous exec run or authorize its late completion',async t=>{
  const {controller:c,publish,send}=await fixture(t,{runId:'run-old',shellResults:[result('run-old','call-old')],messages:[{id:'old',kind:'agentMessage',text:'Previous turn'}]});
  await send();
  publish({runId:'run-old',status:'completed',shellResults:[result('run-old','call-old')]});
  let task=c.getState().task;
  assert.deepEqual(task.shellResults,[]);assert.equal(task.runtimeComplete,false);
  assert.equal(task.messages.some(item=>item.id.startsWith('runtime:')),false);
});

test('disconnect freezes command evidence and excludes late native output',async t=>{
  const {controller:c,publish,send}=await fixture(t);await send();
  publish({runId:'run-current',shellResults:[result()],messages:[{id:'current',kind:'agentMessage',text:'Partial response'}]});
  await c.dispatch({type:'disconnectMuse'});
  publish({status:'completed',shellResults:[result(),result('run-current','late')],messages:[{id:'current',kind:'agentMessage',text:'Late replacement'},{id:'late',kind:'agentMessage',text:'Late response'}]});
  const task=c.getState().task;
  assert.deepEqual(task.shellResults.map(item=>item.callId),['shell-current']);
  assert.equal(task.runtimeComplete,false);
  assert.deepEqual(task.messages.filter(item=>item.id.startsWith('runtime:')).map(item=>item.text),['Partial response']);
});

test('shell command evidence survives controller restart independently of runtime state',async t=>{
  const {controller:c,publish,send,dataDir,controllers}=await fixture(t);await send();
  publish({runId:'run-current',shellResults:[result('run-current','persisted',{output:'<script>literal output</script>'})]});publish({status:'completed'});
  await c.close();const reopened=await createController({dataDir});controllers.push(reopened);
  const state=reopened.getState();
  assert.deepEqual(state.task.shellResults,[result('run-current','persisted',{output:'<script>literal output</script>'})]);
  assert.equal(state.task.check,null);assert.equal(state.runtime.status,'unavailable');
});

test('persisted command history is bounded while retaining recent results and truncation evidence',async t=>{
  const {controller:c,publish,send}=await fixture(t);await send();
  const results=Array.from({length:120},(_,index)=>result('run-current',`call-${index}`,{output:'x'.repeat(10000)}));
  results.at(-1).output='z'.repeat(700000);
  publish({runId:'run-current',shellResults:results});
  const saved=c.getState().task.shellResults;
  assert.ok(saved?.length>0&&saved.length<=100);
  assert.equal(saved.at(-1).callId,'call-119');assert.equal(saved.at(-1).truncated,true);
  assert.ok(saved.reduce((bytes,item)=>bytes+Buffer.byteLength(JSON.stringify(item)),0)<=512*1024,'total persisted shell evidence stays within 512 KiB');
  assert.equal(c.getState().task.check,null);
});

test('command-compatible copies preserve supported bytes, exclude local dependencies and secrets, and leave the source unchanged',async t=>{
  const {controller:c,project,projectsDir}=await fixture(t,{}, {externalProjects:true});
  await mkdir(join(project,'assets'));await writeFile(join(project,'assets','icon.bin'),Buffer.from([0,255,42]));
  await writeFile(join(project,'.env.local'),'TOKEN=private');await writeFile(join(project,'.npmrc'),'private registry token');
  for(const name of ['node_modules','.git','secrets']){await mkdir(join(project,name));await writeFile(join(project,name,'private.txt'),'excluded');}
  await promisify(execFile)('git',['-C',project,'init','--quiet'],{windowsHide:true});
  const original=await readFile(join(project,'index.html'));
  const first=await c.dispatch({type:'createCommandCopy'});
  assert.equal(first.error,null);assert.equal(first.activeProject.root.startsWith(projectsDir),true);
  assert.notEqual(first.activeProject.root,project);assert.equal(first.activeProject.name,'shell-fixture · working copy');
  assert.deepEqual(await readFile(join(first.activeProject.root,'index.html')),original);
  assert.deepEqual(await readFile(join(first.activeProject.root,'assets','icon.bin')),Buffer.from([0,255,42]));
  for(const name of ['.env.local','.npmrc','node_modules','.git','secrets'])await assert.rejects(access(join(first.activeProject.root,name)),{code:'ENOENT'});
  assert.equal(first.task.request,'Run the approved project command');assert.equal(first.task.mode,'muse');assert.equal(first.task.planApproved,false);
  assert.deepEqual(first.task.changes,[]);assert.deepEqual(first.task.shellResults,[]);assert.equal(first.task.check,null);
  await writeFile(join(first.activeProject.root,'index.html'),'copy changed');assert.deepEqual(await readFile(join(project,'index.html')),original);
  await c.dispatch({type:'selectProject',id:first.projects.find(item=>item.root===project).id});
  const second=await c.dispatch({type:'createCommandCopy'});assert.equal(second.error,null);assert.notEqual(second.activeProject.root,first.activeProject.root);
});

test('a source file named __proto__ changes the revision and survives working-copy creation',async t=>{
  const {controller:c,project}=await fixture(t,{}, {externalProjects:true});
  const before=c.getState().task.revision;
  await writeFile(join(project,'__proto__'),'ordinary source file\n');
  const changed=await c.dispatch({type:'refresh'});
  assert.notEqual(changed.task.revision,before);
  assert.deepEqual(changed.task.changes.map(item=>[item.path,item.status]),[['__proto__','added']]);
  const copied=await c.dispatch({type:'createCommandCopy'});assert.equal(copied.error,null);
  assert.equal(await readFile(join(copied.activeProject.root,'__proto__'),'utf8'),'ordinary source file\n');
  assert.equal(copied.task.revision,changed.task.revision);
  await writeFile(join(copied.activeProject.root,'__proto__'),'updated ordinary source file\n');
  const updated=await c.dispatch({type:'refresh'});
  assert.notEqual(updated.task.revision,copied.task.revision);
  assert.deepEqual(updated.task.changes.map(item=>[item.path,item.status]),[['__proto__','modified']]);
});

for(const externalProjects of [false,true])test(`tutorial previews remain supported in ${externalProjects?'configured':'legacy'} project storage`,async t=>{
  const {controller:c,dataDir,projectsDir}=await fixture(t,{}, {externalProjects});
  let state=await c.dispatch({type:'createDemo'});assert.equal(state.error,null);
  assert.equal(state.activeProject.root.startsWith(externalProjects?projectsDir:join(dataDir,'projects')),true);
  await c.dispatch({type:'approvePlan'});state=await c.dispatch({type:'applyDemo'});assert.equal(state.error,null);assert.ok(state.task.changes.some(item=>item.path==='app.js'));
  state=await c.dispatch({type:'startPreview',script:'dev'});assert.equal(state.error,null);
  for(let n=0;n<150&&c.getState().preview.status==='starting';n++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(c.getState().preview.status,'running',c.getState().preview.log);
});

test('previous tutorial storage remains editable after configuring a command-compatible project folder',async t=>{
  const {controller:c,dataDir,projectsDir,controllers}=await fixture(t);
  await c.dispatch({type:'createDemo'});await c.close();
  const reopened=await createController({dataDir,projectsDir});controllers.push(reopened);
  await reopened.dispatch({type:'approvePlan'});const state=await reopened.dispatch({type:'applyDemo'});
  assert.equal(state.error,null);assert.ok(state.task.changes.some(item=>item.path==='app.js'));
  const preview=await reopened.dispatch({type:'startPreview',script:'dev'});assert.equal(preview.error,null);
});

test('project storage is allocated only when needed and cannot create copies inside the original',async t=>{
  const {controller:c,dataDir,project,controllers}=await fixture(t);await c.close();
  const nested=join(project,'new-copy-storage'),reopened=await createController({dataDir,projectsDir:nested});controllers.push(reopened);
  await assert.rejects(access(nested),{code:'ENOENT'});
  const state=await reopened.dispatch({type:'createCommandCopy'});assert.match(state.error,/outside the original project/i);
  assert.equal(state.activeProject.root,project);await assert.rejects(access(nested),{code:'ENOENT'});
});

test('working-copy storage rejects a junction or symlink into the original project',async t=>{
  const {controller:c,dataDir,project,root,controllers}=await fixture(t);await c.close();
  const linked=join(root,'linked-storage');await symlink(project,linked,process.platform==='win32'?'junction':'dir');
  const reopened=await createController({dataDir,projectsDir:linked});controllers.push(reopened);
  const state=await reopened.dispatch({type:'createCommandCopy'});assert.match(state.error,/symbolic links|junctions/i);assert.equal(state.projects.length,1);
});

test('unwritable or unavailable copy storage does not prevent loading an existing project',async t=>{
  const {controller:c,dataDir,root,project,controllers}=await fixture(t);await c.close();
  const occupied=join(root,'occupied');await writeFile(occupied,'not a directory');
  const reopened=await createController({dataDir,projectsDir:join(occupied,'future')});controllers.push(reopened);
  assert.equal(reopened.getState().activeProject.root,project);
  const state=await reopened.dispatch({type:'createCommandCopy'});assert.ok(state.error);assert.equal(state.activeProject.root,project);assert.equal(state.projects.length,1);
});
