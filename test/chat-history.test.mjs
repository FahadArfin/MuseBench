import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createController } from '../src/controller/index.mjs';
import { validateAction } from '../electron/security.mjs';

async function fixture(t, runtime) {
  const root=await mkdtemp(join(tmpdir(),'musebench-history-')),dataDir=join(root,'data'),projects=[];
  for(const name of ['alpha','beta']){const directory=join(root,name);await mkdir(directory);await writeFile(join(directory,'package.json'),JSON.stringify({name,scripts:{test:'node -e "process.exit(0)"'}}));await writeFile(join(directory,'index.html'),`${name} original\n`);projects.push(directory);}
  const controllers=[],open=async()=>{const c=await createController({dataDir,runtime});controllers.push(c);return c;};
  t.after(async()=>{for(const c of controllers)await c.close();await rm(root,{recursive:true,force:true,maxRetries:3});});
  const c=await open();return{c,open,projects,dataDir};
}
async function task(c,request,mode='manual'){const state=await c.dispatch({type:'newTask',request,mode});assert.equal(state.error,null);return state.task;}
async function settled(c){for(let i=0;i<150;i++){const state=c.getState();if(state.task.check?.status!=='running')return state;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('Check did not finish');}
function editDatabase(dataDir,edit){const db=new DatabaseSync(join(dataDir,'musebench.sqlite'));try{edit(db);}finally{db.close();}}

test('task navigation keeps journals and original baselines across two projects and selects the newest project task',async t=>{
  const {c,projects}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});
  const first=await task(c,'First alpha change'),alphaId=c.getState().activeProject.id;
  await c.dispatch({type:'sendMessage',text:'Remember first alpha notes'});await writeFile(join(projects[0],'index.html'),'alpha updated\n');await c.dispatch({type:'refresh'});
  const second=await task(c,'Second alpha change');
  await c.dispatch({type:'openProject',path:projects[1]});const beta=await task(c,'Beta change'),betaId=c.getState().activeProject.id;
  let state=await c.dispatch({type:'selectProject',id:alphaId});assert.equal(state.error,null);assert.equal(state.task?.id,second.id);
  state=await c.dispatch({type:'selectTask',id:first.id});assert.equal(state.error,null);assert.equal(state.task.id,first.id);assert.equal(state.activeProject.id,alphaId);
  assert.ok(state.task.messages.some(message=>message.text==='Remember first alpha notes'));
  assert.deepEqual(state.task.changes.map(change=>[change.path,change.before,change.after]),[['index.html','alpha original\n','alpha updated\n']]);
  state=await c.dispatch({type:'selectTask',id:second.id});assert.deepEqual(state.task.changes,[],'each task restores its own original baseline');
  state=await c.dispatch({type:'selectTask',id:beta.id});assert.equal(state.activeProject.id,betaId);assert.equal(state.task.projectId,betaId);
  assert.deepEqual(state.tasks.map(item=>item.title).sort(),['Beta change','First alpha change','Second alpha change']);
  for(const summary of state.tasks){assert.ok(summary.projectId);assert.ok(Number.isFinite(Date.parse(summary.createdAt)));assert.ok(Number.isFinite(Date.parse(summary.updatedAt)));assert.equal('messages' in summary,false);}
  assert.deepEqual(validateAction({type:'selectTask',id:first.id}),{type:'selectTask',id:first.id});
});

test('all task associations and journals survive restart and selecting the current task is a no-op',async t=>{
  const {c,open,projects}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});const first=await task(c,'First persistent chat');
  await c.dispatch({type:'sendMessage',text:'A durable note'});const before=c.getState();
  const same=await c.dispatch({type:'selectTask',id:first.id});assert.equal(same.error,null);assert.deepEqual(same.task,before.task);
  await c.dispatch({type:'openProject',path:projects[1]});const second=await task(c,'Second persistent chat');await c.close();
  const reopened=await open();let state=reopened.getState();assert.equal(state.tasks?.length,2);assert.equal(state.task.id,second.id);
  state=await reopened.dispatch({type:'selectTask',id:first.id});assert.equal(state.error,null);assert.equal(state.activeProject.root,projects[0]);assert.ok(state.task.messages.some(message=>message.text==='A durable note'));
  assert.equal(state.preview.status,'stopped');assert.equal(state.task.previewRevision,null);
});

test('restoring an inactive task rehashes source and invalidates revision-bound evidence before displaying it',async t=>{
  const {c,projects}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});const first=await task(c,'Checked alpha change');await c.dispatch({type:'approvePlan'});await c.dispatch({type:'runCheck',script:'test'});assert.equal((await settled(c)).task.check.status,'passed');
  await c.dispatch({type:'openProject',path:projects[1]});await task(c,'Beta');await writeFile(join(projects[0],'index.html'),'edited while away\n');
  const state=await c.dispatch({type:'selectTask',id:first.id});assert.equal(state.error,null);assert.notEqual(state.task.revision,first.revision);assert.equal(state.task.check.status,'stale');assert.equal(state.task.acceptedRevision,null);assert.equal(state.task.previewRevision,null);assert.equal(state.preview.status,'stopped');assert.equal(state.task.changes[0].before,'alpha original\n');
});

test('startup rehashes the active task rather than reviving stale checks and checkpoints',async t=>{
  const {c,open,projects,dataDir}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});await task(c,'Restored active chat');await c.dispatch({type:'runCheck',script:'test'});assert.equal((await settled(c)).task.check.status,'passed');await c.close();
  editDatabase(dataDir,db=>{const app=JSON.parse(db.prepare('SELECT json FROM app WHERE id=1').get().json);app.task.acceptedRevision=app.task.revision;app.task.previewRevision=app.task.revision;db.prepare('UPDATE app SET json=? WHERE id=1').run(JSON.stringify(app));});
  await writeFile(join(projects[0],'index.html'),'edited while closed\n');const state=(await open()).getState();assert.equal(state.task.check.status,'stale');assert.equal(state.task.acceptedRevision,null);assert.equal(state.task.previewRevision,null);assert.equal(state.preview.status,'stopped');
});

test('legacy migration associates only the known current task and preserves unrelated unassociated records',async t=>{
  const {c,open,projects,dataDir}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});const older=await task(c,'Unassociated legacy chat'),active=await task(c,'Known legacy current chat');const projectId=c.getState().activeProject.id;await c.close();
  editDatabase(dataDir,db=>{for(const row of db.prepare('SELECT id,json FROM tasks').all()){const item=JSON.parse(row.json);delete item.projectId;delete item.createdAt;delete item.updatedAt;db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(item),row.id);}const app=JSON.parse(db.prepare('SELECT json FROM app WHERE id=1').get().json);delete app.task.projectId;delete app.task.createdAt;delete app.task.updatedAt;delete app.tasks;db.prepare('UPDATE app SET json=? WHERE id=1').run(JSON.stringify(app));});
  const reopened=await open();let state=reopened.getState();assert.equal(state.task.projectId,projectId);assert.deepEqual(state.tasks.map(item=>item.id),[active.id]);
  state=await reopened.dispatch({type:'selectTask',id:older.id});assert.match(state.error,/project|association/i);assert.equal(state.task.id,active.id);assert.equal(state.activeProject.id,projectId);
  editDatabase(dataDir,db=>assert.ok(db.prepare('SELECT json FROM tasks WHERE id=?').get(older.id),'unassociated history is preserved, not silently deleted'));
});

test('invalid task association fails before replacing the current project or task',async t=>{
  const {c,open,projects,dataDir}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});const older=await task(c,'Invalid associated task');const active=await task(c,'Current valid task');await c.close();
  editDatabase(dataDir,db=>{const item=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(older.id).json);item.projectId='missing-project';db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(item),older.id);});
  const reopened=await open();const state=await reopened.dispatch({type:'selectTask',id:older.id});assert.match(state.error,/project|association/i);assert.equal(state.task.id,active.id);assert.equal(state.activeProject.root,projects[0]);assert.equal(state.tasks.some(item=>item.id===older.id),false);
});

test('navigation cannot detach a running Muse turn and restored tasks reject late runtime output',async t=>{
  // Muse is an external model/process boundary; only that contract is injected.
  let observer=()=>{};const native={status:'unavailable',reason:null,binary:'injected-muse.exe',sdkVersion:'1.4.13',transport:'exec',sessionId:null,permissionVerified:false,liveVerified:false,runId:null,messages:[],shellResults:[]};
  const publish=patch=>{Object.assign(native,patch);observer(structuredClone(native));};
  const runtime={snapshot:()=>structuredClone(native),subscribe(fn){observer=fn;return()=>{observer=()=>{};};},async connect(){publish({status:'idle',sessionId:'session',permissionVerified:true});},async send(){publish({status:'running',runId:null});},async disconnect(){publish({status:'unavailable',sessionId:null,permissionVerified:false,cleanup:'confirmed'});}};
  const {c,projects}=await fixture(t,runtime);await c.dispatch({type:'openProject',path:projects[0]});const old=await task(c,'Old alpha chat','muse');const alphaId=c.getState().activeProject.id;
  await c.dispatch({type:'openProject',path:projects[1]});const active=await task(c,'Active beta chat','muse');await c.dispatch({type:'approvePlan'});await c.dispatch({type:'connectMuse'});await c.dispatch({type:'sendMessage',text:'Perform the approved change'});
  publish({runId:'active-run',messages:[{id:'active-response',kind:'agentMessage',text:'Working in beta'}]});
  for(const action of [{type:'selectTask',id:old.id},{type:'selectProject',id:alphaId},{type:'openProject',path:projects[0]},{type:'createDemo'},{type:'createCommandCopy'}]){const state=await c.dispatch(action);assert.match(state.error,/finish|disconnect|running/i);assert.equal(state.task.id,active.id);assert.equal(state.activeProject.root,projects[1]);assert.equal(state.runtime.status,'running');}
  await c.dispatch({type:'disconnectMuse'});let state=await c.dispatch({type:'selectTask',id:old.id});assert.equal(state.error,null);assert.equal(state.runtime.sessionId,null);assert.equal(state.runtime.status,'unavailable');
  publish({status:'completed',runId:'active-run',messages:[{id:'late-response',kind:'agentMessage',text:'Late beta output'}]});state=c.getState();assert.equal(state.task.id,old.id);assert.equal(state.task.runtimeComplete,false);assert.equal(state.task.messages.some(item=>item.text==='Late beta output'),false);
});

test('restored task journals bound saved shell output and message text',async t=>{
  const {c,open,projects,dataDir}=await fixture(t);await c.dispatch({type:'openProject',path:projects[0]});const old=await task(c,'Bounded restored journal');await task(c,'Current journal');await c.close();
  editDatabase(dataDir,db=>{const item=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(old.id).json);item.messages=Array.from({length:200},(_,i)=>({id:String(i),role:'assistant',text:'x'.repeat(20000),at:'2026-10-25T12:00:00.000Z'}));item.shellResults=Array.from({length:120},(_,i)=>({callId:String(i),runId:'saved-run',toolName:'powershell',command:'node test.mjs',output:'y'.repeat(70000),exitCode:0,terminalStatus:'completed',truncated:false,outcome:'success'}));db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(item),old.id);});
  const state=await (await open()).dispatch({type:'selectTask',id:old.id});assert.equal(state.error,null);assert.ok(state.task.messages.length<=150);assert.ok(state.task.messages.every(item=>item.text.length<=16000));assert.ok(state.task.shellResults.length>0&&state.task.shellResults.length<=100);assert.ok(Buffer.byteLength(JSON.stringify(state.task.shellResults))<=512*1024);assert.equal(state.task.shellResults.at(-1).truncated,true);
});
