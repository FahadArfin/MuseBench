import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createController} from '../src/controller/index.mjs';import {validateAction} from '../electron/security.mjs';import {missingChecks} from '../src/shared/validation.mjs';
const makeDefinition=(command,patch={})=>({id:'test',name:'test',cwd:'.',commands:{win32:command,linux:command,darwin:command},timeoutSeconds:120,...patch});
async function fixture(t,definition=makeDefinition('node -e "console.log(123)"')){
 const root=await mkdtemp(path.join(tmpdir(),'muse-action-controller-')),project=path.join(root,'project with spaces'),dataDir=path.join(root,'data');await mkdir(project);await mkdir(path.join(project,'.musebench'));
 await writeFile(path.join(project,'package.json'),JSON.stringify({name:'actions',scripts:{test:'node -e "console.log(42)"'}}));await writeFile(path.join(project,'.musebench/actions.json'),JSON.stringify({version:1,actions:[definition]}));
 const c=await createController({dataDir});t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});
 const act=async input=>{const state=await c.dispatch(input);assert.equal(state.error,null);return state;};await act({type:'openProject',path:project});const state=await act({type:'newTask',mode:'manual',request:'Action fixture'}),binding={projectId:state.task.projectId,taskId:state.task.id};
 const inspect=()=>c.inspectProjectActions(binding),request=async()=>({...binding,type:'runProjectAction',actionId:definition.id,revision:(await inspect()).revision});return{root,project,dataDir,c,act,binding,inspect,request};
}
// Cold PowerShell startup under concurrent Windows CI can exceed 15 seconds.
// Keep the real completion/output/exit assertions and a bounded fixture deadline.
async function waitFor(fn){const deadline=Date.now()+60000;while(!fn()){if(Date.now()>deadline)throw Error('Timed out waiting for owned action');await new Promise(resolve=>setTimeout(resolve,30));}}

test('import and inspection never execute; save changes only the portable definition',async t=>{
 const f=await fixture(t,makeDefinition('node -e "require(\'fs\').writeFileSync(\'ran.txt\',\'bad\')"'));const before=await f.inspect();assert.equal(before.actions[0].supported,true);assert.equal(f.c.getState().task.check,null);await assert.rejects(readFile(path.join(f.project,'ran.txt')),e=>e.code==='ENOENT');
 const action={...f.binding,type:'saveProjectAction',revision:before.revision,definition:makeDefinition('node -e "console.log(456)"')};assert.equal(validateAction(action).type,'saveProjectAction');await f.act(action);assert.equal(f.c.getState().task.check,null);assert.match((await f.inspect()).actions[0].command,/456/);await assert.rejects(readFile(path.join(f.project,'ran.txt')),e=>e.code==='ENOENT');
});
test('the exact reviewed action runs with output, exit and restart receipt, but cannot satisfy a package check',async t=>{
 const f=await fixture(t);const action=await f.request();assert.equal(validateAction(action).type,'runProjectAction');await f.act(action);await waitFor(()=>f.c.getState().task.check?.status!=='running');
 const state=f.c.getState(),check=state.task.check;assert.equal(check.status,'passed');assert.equal(check.exitCode,0);assert.match(check.log,/123/);assert.equal(check.action.definitionRevision,action.revision);assert.equal(check.action.cwd,f.project);assert.equal(check.action.platform,process.platform);assert.equal(check.action.id,'test');assert.equal(state.task.checkReceipts.length,1);assert.deepEqual(missingChecks(state.task,check.revision,['test']),['test']);assert.equal(state.activityInbox[0].kind,'check_passed');
 await f.c.close();const restored=await createController({dataDir:f.dataDir});t.after(()=>restored.close());assert.match(restored.getState().task.checkReceipts[0].log,/123/);assert.equal(restored.getState().task.checkReceipts[0].action.definitionRevision,action.revision);await restored.close();
});
test('stale definition or chat identity cannot run or overwrite a replacement',async t=>{
 const f=await fixture(t),action=await f.request();await writeFile(path.join(f.project,'.musebench/actions.json'),JSON.stringify({version:1,actions:[makeDefinition('node -e "console.log(999)"')]}));let state=await f.c.dispatch(action);assert.match(state.error,/changed|review/i);assert.equal(state.task.check,null);
 state=await f.c.dispatch({...action,type:'saveProjectAction',actionId:undefined,definition:makeDefinition('node -e "console.log(7)"')});assert.ok(state.error);assert.match((await f.inspect()).actions[0].command,/999/);
 const current=await f.request();state=await f.c.dispatch({...current,taskId:'different'});assert.match(state.error,/changed|chat/i);state=await f.c.dispatch({...current,command:'replacement'});assert.ok(state.error);assert.equal(state.task.check,null);
 await assert.rejects(f.c.inspectProjectActions({...f.binding,taskId:'different'}),/changed|chat/i);
});
test('duplicate starts are rejected and stopping persists an exact receipt before navigation',async t=>{
 const f=await fixture(t,makeDefinition('node -e "console.log(\'ready\');setTimeout(()=>{},15000)"'));const action=await f.request();let state=await f.act(action);const id=state.task.check.id;state=await f.c.dispatch(action);assert.match(state.error,/running|finish/i);assert.equal(state.task.check.id,id);await waitFor(()=>f.c.getState().task.check.log.includes('ready'));
 const row=f.c.getState().workActivity.find(item=>item.kind==='check');assert.match(row.label,/test/);await f.act({type:'stopWork',taskId:row.taskId,id:row.id,controlId:row.controlId});state=f.c.getState();assert.equal(state.task.check.status,'cancelled');assert.equal(state.task.checkReceipts.filter(item=>item.id===id).length,1);assert.match(state.task.checkReceipts.find(item=>item.id===id).log,/ready/);
 await f.act({type:'newTask',mode:'manual',request:'Second chat'});await f.act({type:'selectTask',id:f.binding.taskId});assert.equal(f.c.getState().task.checkReceipts.find(item=>item.id===id).status,'cancelled');
});
test('timeouts stop an owned action with a failed receipt and no success inference',async t=>{
 const f=await fixture(t,makeDefinition('node -e "setTimeout(()=>{},15000)"',{timeoutSeconds:1}));await f.act(await f.request());await waitFor(()=>f.c.getState().task.check?.status!=='running');const check=f.c.getState().task.check;assert.equal(check.status,'failed');assert.match(check.log,/timeout|timed out/i);assert.notEqual(check.exitCode,0);assert.equal(f.c.getState().task.checkReceipts.length,1);
});
test('archived chats and extra invocation fields cannot execute actions',async t=>{
 const f=await fixture(t),action=await f.request();await f.act({type:'setTaskFlags',id:f.binding.taskId,archived:true});const state=await f.c.dispatch(action);assert.match(state.error,/archived|restore/i);assert.equal(state.task.check,null);
 for(const patch of [{cwd:'elsewhere'},{shell:'custom'},{revision:'old'},{timeoutSeconds:9999}])assert.throws(()=>validateAction({...action,...patch}));
});
test('a native command failure retains its exit code and bounded output',async t=>{
 const f=await fixture(t,makeDefinition('node -e "console.log(\'x\'.repeat(100000));process.exit(3)"'));await f.act(await f.request());await waitFor(()=>f.c.getState().task.check?.status!=='running');const check=f.c.getState().task.check;assert.equal(check.status,'failed');assert.equal(check.exitCode,3);assert.ok(check.log.length<=65536);assert.ok(check.log.includes('xxx'));assert.ok(f.c.getState().task.checkReceipts[0].log.length<=8000);
});
