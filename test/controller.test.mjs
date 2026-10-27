import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createController } from '../src/controller/index.mjs';
import { DatabaseSync } from 'node:sqlite';

async function fixture(t, scripts = { test: 'node --test test.mjs', dev: 'node server.mjs' }) {
  const base = await mkdtemp(path.join(tmpdir(), 'musebench-'));
  const root = path.join(base, 'project');
  await mkdir(root);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({name:'fixture',scripts}));
  await writeFile(path.join(root, 'test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('source',()=>assert.ok(true));");
  await writeFile(path.join(root, 'index.html'), '<h1>Tea</h1>');
  const options = {dataDir:path.join(base,'data'),templateDir:path.resolve('templates/tea-store')};
  const controller = await createController(options);
  const controllers=[controller];
  t.after(async()=>{for(const c of controllers)await c.close(); await rm(base,{recursive:true,force:true});});
  await controller.dispatch({type:'openProject',path:root});
  await controller.dispatch({type:'newTask',request:'Improve tea selection',mode:'manual'});
  return {controller,root,base,options,controllers};
}
async function settled(controller, predicate) {
  for(let i=0;i<160;i++) { const s=controller.getState(); if(predicate(s)) return s; await new Promise(r=>setTimeout(r,50)); }
  assert.fail('controller did not settle');
}

test('snapshots include added and deleted files and invalidate evidence on refresh', async t=>{
  const {controller:c,root}=await fixture(t);
  await c.dispatch({type:'approvePlan'});
  await c.dispatch({type:'runCheck',script:'test'});
  assert.equal((await settled(c,s=>s.task.check?.status!=='running')).task.check.status,'passed');
  const initial=c.getState().task.revision;
  await writeFile(path.join(root,'new.txt'),'new\n');
  await rm(path.join(root,'index.html'));
  const s=await c.dispatch({type:'refresh'});
  assert.notEqual(s.task.revision,initial);
  assert.equal(s.task.check.status,'stale');
  assert.deepEqual(s.task.changes.map(f=>[f.path,f.status]),[['index.html','deleted'],['new.txt','added']]);
  assert.equal(s.task.previewRevision,null);
});

test('prototype-named source files have correct added and deleted status after persisted baseline restore',async t=>{
  const {controller:c,root,options,controllers}=await fixture(t);
  await writeFile(path.join(root,'constructor'),'source constructor\n');
  await writeFile(path.join(root,'toString'),'source conversion\n');
  let state=await c.dispatch({type:'refresh'});
  assert.deepEqual(state.task.changes.map(item=>[item.path,item.status]),[['constructor','added'],['toString','added']]);
  await c.dispatch({type:'newTask',request:'Remove the named files',mode:'manual'});await c.close();
  const reopened=await createController(options);controllers.push(reopened);
  await rm(path.join(root,'constructor'));await rm(path.join(root,'toString'));
  state=await reopened.dispatch({type:'refresh'});
  assert.deepEqual(state.task.changes.map(item=>[item.path,item.status]),[['constructor','deleted'],['toString','deleted']]);
});

test('failed package scripts cannot produce acceptance evidence',async t=>{
  const {controller:c}=await fixture(t,{test:'node -e "process.exit(3)"'});
  await c.dispatch({type:'approvePlan'});
  await c.dispatch({type:'runCheck',script:'test'});
  const s=await settled(c,s=>s.task.check?.status!=='running');
  assert.equal(s.task.check.status,'failed');
  assert.equal(s.task.check.exitCode,3);
  const denied=await c.dispatch({type:'accept',revision:s.task.revision});
  assert.match(denied.error,/preview|check/i);
  assert.equal(denied.checkpoints.length,0);
});

test('source change during check makes its successful result stale',async t=>{
  const {controller:c,root}=await fixture(t,{test:'node -e "setTimeout(()=>{},400)"'});
  await c.dispatch({type:'runCheck',script:'test'});
  await writeFile(path.join(root,'index.html'),'changed');
  const s=await settled(c,s=>s.task.check?.status!=='running');
  assert.equal(s.task.check.status,'stale');
  assert.equal(s.task.check.exitCode,0);
});

test('credential and generated files are excluded; linked source is refused',async t=>{
  const {controller:c,root,base}=await fixture(t);
  const revision=c.getState().task.revision;
  await writeFile(path.join(root,'.env.local'),'SECRET=private');
  await writeFile(path.join(root,'.npmrc'),'//registry.npmjs.org/:_authToken=private');
  await writeFile(path.join(root,'.pypirc'),'password=private');
  await mkdir(path.join(root,'node_modules'));
  await writeFile(path.join(root,'node_modules','cache.js'),'generated');
  assert.equal((await c.dispatch({type:'refresh'})).task.revision,revision);
  const outside=path.join(base,'outside'); await mkdir(outside); await writeFile(path.join(outside,'secret'),'sensitive');
  await symlink(outside,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');
  const s=await c.dispatch({type:'refresh'});
  assert.match(s.error,/symbolic|link/i);
  assert.equal(s.task.changes.length,0);
});

test('demo uses real preview/check evidence and checkpoints survive restart',async t=>{
  const {controller:c,options,controllers}=await fixture(t);
  let s=await c.dispatch({type:'createDemo'});
  assert.equal(s.task.mode,'demo');
  assert.equal(s.task.planApproved,false);
  await c.dispatch({type:'approvePlan'});
  s=await c.dispatch({type:'applyDemo'});
  assert.ok(s.task.changes.some(f=>f.path==='app.js'));
  await c.dispatch({type:'startPreview',script:'dev'});
  s=await settled(c,s=>s.preview.status==='running'||s.preview.status==='failed');
  assert.equal(s.preview.status,'running',s.preview.log);
  assert.match(s.preview.url,/^http:\/\/127\.0\.0\.1:\d+/);
  assert.match(await (await fetch(s.preview.url)).text(),/tea|Tea/);
  await c.dispatch({type:'inspectPreview',revision:s.task.revision});
  await c.dispatch({type:'runCheck',script:'test'});
  s=await settled(c,s=>s.task.check?.status!=='running');
  assert.equal(s.task.check.status,'passed',s.task.check.log);
  s=await c.dispatch({type:'accept',revision:s.task.revision});
  assert.equal(s.error,null);
  assert.equal(s.checkpoints.length,1);
  await c.close();
  const reopened=await createController(options);
  controllers.push(reopened);
  assert.equal(reopened.getState().checkpoints.length,1);
  assert.equal(reopened.getState().task.acceptedRevision,s.task.revision);
  assert.equal(reopened.getState().preview.status,'stopped');
});

test('all task journals are persisted when starting a subsequent task',async t=>{
  const {controller:c,options}=await fixture(t);
  const previous=c.getState().task.id;
  await c.dispatch({type:'newTask',request:'A second change',mode:'manual'});
  const db=new DatabaseSync(path.join(options.dataDir,'musebench.sqlite'),{readOnly:true});
  try{assert.ok(db.prepare('SELECT json FROM tasks WHERE id=?').get(previous));assert.equal(db.prepare('SELECT count(*) AS n FROM tasks').get().n,2);}finally{db.close();}
});

test('a check timeout stops a real long-running command',async t=>{
  const {controller:c,root,options,controllers}=await fixture(t,{test:'node -e "setTimeout(()=>{},10000)"'});
  await c.close();
  const bounded=await createController({...options,checkTimeoutMs:100});controllers.push(bounded);
  await bounded.dispatch({type:'runCheck',script:'test'});
  const s=await settled(bounded,s=>s.task.check?.status!=='running');
  assert.equal(s.task.check.status,'failed');
  assert.match(s.task.check.log,/timeout|timed out/i);
});

test('cancelling a live package script does not let a later exit pass',async t=>{
  const {controller:c}=await fixture(t,{test:'node -e "setTimeout(()=>{},5000)"'});
  await c.dispatch({type:'runCheck',script:'test'});
  await c.dispatch({type:'cancelCheck'});
  await new Promise(r=>setTimeout(r,150));
  assert.equal(c.getState().task.check.status,'cancelled');
});

test('source size limits fail closed before evidence is committed',async t=>{
  const {controller:c,root}=await fixture(t);
  await writeFile(path.join(root,'large.js'),Buffer.alloc(2*1024*1024+1,65));
  const s=await c.dispatch({type:'refresh'});
  assert.match(s.error,/2 MiB/);
  assert.equal(s.checkpoints.length,0);
});

test('accept rehashes source even without refresh and rejects fabricated preview inspection',async t=>{
  const {controller:c,root}=await fixture(t);
  let s=await c.dispatch({type:'inspectPreview',revision:c.getState().task.revision});
  assert.match(s.error,/preview/i);
  await c.dispatch({type:'approvePlan'});
  await c.dispatch({type:'runCheck',script:'test'});
  s=await settled(c,s=>s.task.check?.status!=='running');
  const revision=s.task.revision;
  await writeFile(path.join(root,'index.html'),'changed without refresh');
  s=await c.dispatch({type:'accept',revision});
  assert.equal(s.checkpoints.length,0);
  assert.match(s.error,/revision|changed|stale/i);
});

test('Muse completion belongs to an explicitly submitted turn and stream deltas replace partial text',async t=>{
  const {controller:c,options,controllers}=await fixture(t);await c.close();
  let observer;let state={status:'ready',reason:null,binary:'fixture',sdkVersion:'test',liveVerified:false,messages:[]};
  const runtime={snapshot:()=>structuredClone(state),subscribe:fn=>{observer=fn;return()=>{};},disconnect:async()=>{},send:async()=>{state.status='running';observer(state);}};
  const live=await createController({...options,runtime});controllers.push(live);
  await live.dispatch({type:'newTask',request:'Runtime integration test',mode:'muse'});
  state.status='completed';observer(state);
  assert.equal(live.getState().task.runtimeComplete,false,'a previous completion must not authorize a fresh task');
  await live.dispatch({type:'approvePlan'});
  await live.dispatch({type:'sendMessage',text:'Perform the approved change'});
  state.messages=[{id:'one',kind:'agentMessage',text:'partial'}];observer(state);
  state.messages[0].text='complete response';state.status='completed';observer(state);
  let result=live.getState();assert.equal(result.task.runtimeComplete,true);
  assert.equal(result.task.messages.find(m=>m.id==='runtime:one').text,'complete response');
  await live.dispatch({type:'updatePlan',plan:'A revised plan',criteria:['Recheck it']});observer(state);
  assert.equal(live.getState().task.runtimeComplete,false,'an old terminal state must not authorize the revised plan');
});

test('only the visible selected package script runs, without implicit lifecycle scripts',async t=>{
  const {controller:c,root}=await fixture(t,{pretest:'node -e "require(\'fs\').writeFileSync(\'hidden-marker\',\'ran\')"',test:'node -e "process.exit(0)"'});
  await c.dispatch({type:'runCheck',script:'test'});
  const s=await settled(c,s=>s.task.check?.status!=='running');
  assert.equal(s.task.check.status,'passed');
  await assert.rejects(access(path.join(root,'hidden-marker')),{code:'ENOENT'});
});

test('observed intermediate source changes permanently invalidate the running check',async t=>{
  const {controller:c,root}=await fixture(t,{test:'node -e "setTimeout(()=>{},700)"'});
  const original=await readFile(path.join(root,'index.html'));
  await c.dispatch({type:'runCheck',script:'test'});
  await writeFile(path.join(root,'index.html'),'transient edit');await c.dispatch({type:'refresh'});
  await writeFile(path.join(root,'index.html'),original);await c.dispatch({type:'refresh'});
  const s=await settled(c,s=>s.task.check?.status!=='running');
  assert.equal(s.task.check.status,'stale');
});

test('option-like package script names cannot run npm options as evidence',async t=>{
  const {controller:c}=await fixture(t,{'--version':'node -e "process.exit(9)"'});
  const s=await c.dispatch({type:'runCheck',script:'--version'});
  assert.match(s.error,/script|name/i);assert.equal(s.task.check,null);
});

test('built-output previews require rebuild provenance and are refused',async t=>{
  const {controller:c}=await fixture(t,{dev:'vite preview'});
  const s=await c.dispatch({type:'startPreview',script:'dev'});
  assert.match(s.error,/direct vite|dev|build/i);assert.equal(s.preview.status,'stopped');
});

test('a changed tutorial revision stops its old preview and requires restart',async t=>{
  const {controller:c}=await fixture(t);
  await c.dispatch({type:'createDemo'});await c.dispatch({type:'approvePlan'});
  await c.dispatch({type:'startPreview',script:'dev'});
  await settled(c,s=>s.preview.status==='running'||s.preview.status==='failed');
  const changed=await c.dispatch({type:'applyDemo'});
  assert.equal(changed.preview.status,'stopped');
  const inspected=await c.dispatch({type:'inspectPreview',revision:changed.task.revision});
  assert.match(inspected.error,/preview/i);assert.equal(inspected.task.previewRevision,null);
});

test('switching tasks persists cancellation in the archived task journal',async t=>{
  const {controller:c,options}=await fixture(t,{test:'node -e "console.log(12345);setTimeout(()=>{},5000)"'});
  await c.dispatch({type:'runCheck',script:'test'});
  await settled(c,s=>/\r?\n12345\r?\n/.test(s.task.check.log));
  const oldId=c.getState().task.id;
  await c.dispatch({type:'newTask',request:'Next task',mode:'manual'});
  const db=new DatabaseSync(path.join(options.dataDir,'musebench.sqlite'),{readOnly:true});
  try{const archived=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(oldId).json);assert.equal(archived.check.status,'cancelled');assert.ok(archived.check.endedAt);}finally{db.close();}
});

test('a verified approval pause preserves attribution to the submitted Muse turn',async t=>{
  const {controller:c,options,controllers}=await fixture(t);await c.close();
  let observer;const state={status:'idle',reason:null,binary:'fixture',sdkVersion:'test',liveVerified:false,messages:[],sessionId:'session-one',permissionVerified:true,pending:null};
  const runtime={snapshot:()=>structuredClone(state),subscribe:fn=>{observer=fn;return()=>{};},disconnect:async()=>{},send:async()=>{state.status='running';observer(state);}};
  const live=await createController({...options,runtime});controllers.push(live);
  await live.dispatch({type:'newTask',request:'A change requiring approval',mode:'muse'});
  await live.dispatch({type:'approvePlan'});
  await live.dispatch({type:'sendMessage',text:'Perform the approved change'});
  state.status='blocked';state.pending={kind:'approval',sessionId:'session-one',approvalId:'approval-one'};observer(state);
  assert.equal(live.getState().task.runtimeComplete,false);
  state.pending=null;state.status='running';observer(state);
  state.status='completed';observer(state);
  assert.equal(live.getState().task.runtimeComplete,true,'completion after an approved/resolved pause belongs to this turn');
  for(const blocked of [
    {status:'blocked',permissionVerified:false,pending:{kind:'approval',sessionId:'session-one'}},
    {status:'blocked',permissionVerified:true,pending:{kind:'input',sessionId:'session-one'}},
    {status:'blocked',permissionVerified:true,pending:{kind:'approval',sessionId:'different-session'}},
    {status:'blocked',permissionVerified:true,pending:null},
    {status:'uncertain',permissionVerified:true,pending:null},
    {status:'unavailable',permissionVerified:false,pending:null},
  ]) {
    Object.assign(state,{status:'idle',permissionVerified:true,pending:null});
    await live.dispatch({type:'sendMessage',text:'Start another explicit turn'});
    Object.assign(state,blocked);observer(state);
    state.status='completed';observer(state);
    assert.equal(live.getState().task.runtimeComplete,false,`completion must not revive ${JSON.stringify(blocked)}`);
  }
});

test('Muse chat and optional planning can send without approving a local review plan',async t=>{
  const {controller:c,options,controllers}=await fixture(t);await c.close();
  let sends=0,notify;let runtimeState={status:'idle',reason:null,binary:'fixture',sdkVersion:'test',liveVerified:false,messages:[]};
  const runtime={snapshot:()=>runtimeState,subscribe:fn=>{notify=fn;return()=>{};},disconnect:async()=>{},send:async()=>{sends++;runtimeState={...runtimeState,status:'running'};notify(runtimeState);runtimeState={...runtimeState,status:'completed',cleanup:'confirmed'};notify(runtimeState);}};
  const live=await createController({...options,runtime});controllers.push(live);
  await live.dispatch({type:'newTask',request:'A user-directed change',mode:'muse'});
  for(const mode of ['chat','plan']){const state=await live.dispatch({type:'sendMessage',text:'Inspect this change',mode});assert.equal(state.error,null);assert.equal(state.task.planApproved,false);}
  assert.equal(sends,2);
  const checkpoint=await live.dispatch({type:'accept',revision:live.getState().task.revision});
  assert.match(checkpoint.error,/approve.*plan/i);assert.equal(checkpoint.checkpoints.length,0);
});

test('sending from a disconnected chat verifies the runtime before submitting with the chosen access',async t=>{
  const {controller:c,options,controllers,root}=await fixture(t);await c.close();
  const events=[];let status='unavailable';
  const runtime={snapshot:()=>({status,binary:'fixture',messages:[]}),subscribe:()=>()=>{},disconnect:async()=>{},
    connect:async request=>{assert.equal(request.workspaceRoot,root);events.push('verified');status='idle';},
    send:async request=>{events.push('sent');assert.ok(request.text.endsWith('Current request:\ntalk to me'));assert.deepEqual(request.runOptions,{reasoning:'xhigh',approval:'ask'});}};
  const live=await createController({...options,runtime});controllers.push(live);
  await live.dispatch({type:'newTask',request:'talk to me',mode:'muse',runOptions:{reasoning:'xhigh',approval:'ask'}});
  const sent=await live.dispatch({type:'sendMessage',text:'talk to me'});
  assert.equal(sent.error,null);assert.deepEqual(events,['verified','sent']);assert.equal(sent.task.planApproved,false);
});

test('failed connection leaves the prompt retryable and never submits or approves anything',async t=>{
  const {controller:c,options,controllers}=await fixture(t);await c.close();let sends=0;
  const runtime={snapshot:()=>({status:'unavailable',messages:[]}),subscribe:()=>()=>{},disconnect:async()=>{},connect:async()=>{throw Error('Sandbox not ready');},send:async()=>{sends++;}};
  const live=await createController({...options,runtime});controllers.push(live);
  await live.dispatch({type:'newTask',request:'talk to me',mode:'muse'});
  for(let attempt=0;attempt<2;attempt++){
    const result=await live.dispatch({type:'sendMessage',text:'talk to me'});
    assert.equal(result.error,'Sandbox not ready');assert.equal(result.task.messages.some(m=>m.role==='user'),false);assert.equal(result.task.planApproved,false);
  }
  assert.equal(sends,0);
});

test('sending never reconnects a blocked runtime or resolves an approval automatically',async t=>{
  const {controller:c,options,controllers}=await fixture(t);await c.close();let connections=0,decisions=0;
  const runtime={snapshot:()=>({status:'blocked',pending:{kind:'approval'},messages:[]}),subscribe:()=>()=>{},disconnect:async()=>{},connect:async()=>{connections++;},decide:async()=>{decisions++;},send:async()=>{throw Error('Approval required');}};
  const live=await createController({...options,runtime});controllers.push(live);
  await live.dispatch({type:'newTask',request:'talk to me',mode:'muse'});
  const result=await live.dispatch({type:'sendMessage',text:'talk to me'});
  assert.equal(result.error,'Approval required');assert.equal(connections,0);assert.equal(decisions,0);assert.equal(result.task.planApproved,false);
});

test('chat goals and explicit memories persist and accompany only subsequent Muse requests',async t=>{
 const {controller:c,options,controllers}=await fixture(t);await c.close();const sent=[];let notify;let runtimeState={status:'idle',messages:[]};
 const runtime={snapshot:()=>runtimeState,subscribe:fn=>{notify=fn;return()=>{};},disconnect:async()=>{},send:async value=>{sent.push(value.text);runtimeState={status:'running',messages:[]};notify(runtimeState);runtimeState={status:'completed',messages:[]};notify(runtimeState);}};
 let live=await createController({...options,runtime});controllers.push(live);
 await live.dispatch({type:'newTask',request:'A focused chat',mode:'muse'});
 assert.equal((await live.dispatch({type:'setGoal',objective:'Keep the parser compatible',status:'active'})).error,null);
 assert.equal((await live.dispatch({type:'setMemories',text:'Prefer focused tests.'})).error,null);
 assert.equal((await live.dispatch({type:'renameTask',title:'Parser work'})).task.title,'Parser work');
 await live.dispatch({type:'sendMessage',text:'Explain the change'});
 assert.match(sent[0],/Keep the parser compatible/);assert.match(sent[0],/Prefer focused tests/);
 assert.equal(live.getState().task.messages.find(m=>m.role==='user').text,'Explain the change');
 await live.close();live=await createController({...options,runtime});controllers.push(live);
 assert.equal(live.getState().task.goal.objective,'Keep the parser compatible');assert.equal(live.getState().memories,'Prefer focused tests.');
 await live.dispatch({type:'setGoal',objective:'Keep the parser compatible',status:'paused'});
 await live.dispatch({type:'sendMessage',text:'One more question'});assert(!sent[1].includes('Keep the parser compatible'));
 await live.dispatch({type:'setMemories',text:''});await live.dispatch({type:'setGoal',objective:'',status:'active'});
 await live.dispatch({type:'sendMessage',text:'No extra context'});assert.ok(sent[2].endsWith('Current request:\nNo extra context'));assert.ok(!sent[2].includes('Prefer focused tests.'));assert.ok(!sent[2].includes('Keep the parser compatible'));
});


test('validation profiles execute sequentially, retain revision receipts and stop on failure',async t=>{
 const {controller:c}=await fixture(t,{test:'node -e "process.exit(0)"',lint:'node -e "process.exit(0)"',broken:'node -e "process.exit(1)"'});
 const projectId=c.getState().activeProject.id;
 assert.equal((await c.dispatch({type:'saveValidationProfile',projectId,scripts:['test','lint']})).error,null);
 await c.dispatch({type:'runValidation'});
 const settle=async()=>{for(let i=0;i<300;i++){const s=c.getState();if(s.task.validationRun.status!=='running')return s;await new Promise(r=>setTimeout(r,20));}assert.fail('Validation timeout');};
 let s=await settle();assert.equal(s.task.validationRun.status,'passed');assert.deepEqual(s.task.checkReceipts.map(r=>r.script),['test','lint']);assert.ok(s.task.checkReceipts.every(r=>r.revision===s.task.revision&&r.status==='passed'));
 await c.dispatch({type:'saveValidationProfile',projectId,scripts:['broken','lint']});await c.dispatch({type:'runValidation'});s=await settle();assert.equal(s.task.validationRun.status,'failed');assert.equal(s.task.checkReceipts.at(-1).script,'broken');assert.equal(s.task.validationRun.index,0);
});
test('validation stops on source changes and cancelled validation never continues',async t=>{
 const {controller:c}=await fixture(t,{mutate:'node -e "require(\'fs\').writeFileSync(\'new.txt\',\'changed\')"',later:'node -e "process.exit(0)"',slow:'node -e "setTimeout(()=>{},10000)"'});const projectId=c.getState().activeProject.id;
 await c.dispatch({type:'saveValidationProfile',projectId,scripts:['mutate','later']});await c.dispatch({type:'runValidation'});
 for(let i=0;i<300&&c.getState().task.validationRun.status==='running';i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(c.getState().task.validationRun.status,'stale');assert.equal(c.getState().task.validationRun.index,0);
 await c.dispatch({type:'saveValidationProfile',projectId,scripts:['slow','later']});await c.dispatch({type:'runValidation'});await c.dispatch({type:'cancelCheck'});assert.equal(c.getState().task.validationRun.status,'cancelled');
});
