import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';

async function fixture(t,{compact=true,count=1,mode='manual'}={}){
 const root=await mkdtemp(path.join(tmpdir(),'musebench-status-')),project=path.join(root,'project');await mkdir(project);
 const runtimes=[];
 const factory=()=>{
  const state={status:'unavailable',transport:'exec',cleanup:'confirmed',permissionVerified:false,messages:[]};
  const r={state,full:0,compact:0,disconnects:0,flip:false,
   snapshot(){this.full++;return structuredClone({...state,...(this.flip?{status:this.full%2?'idle':'running'}:{})});},
   subscribe:()=>()=>{},async connect(){state.status='idle';state.permissionVerified=true;},async send(){},
   async disconnect(){this.disconnects++;state.status='unavailable';state.permissionVerified=false;},
  };
  if(compact)r.statusSnapshot=function(){this.compact++;return{status:state.status,operationBusy:!!state.operationBusy,childrenBusy:!!state.childrenBusy,cleanup:state.cleanup,pending:!!state.pending};};
  runtimes.push(r);return r;
 };
 const c=await createController({dataDir:path.join(root,'data'),runtimeFactory:factory});
 t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});
 const act=async input=>{const s=await c.dispatch(input);assert.equal(s.error,null);return s;};
 await act({type:'openProject',path:project});const ids=[];for(let i=0;i<count;i++)ids.push((await act({type:'newTask',mode,request:'Status fixture '+i})).task.id);
 return{c,act,runtimes,ids,reset(){for(const r of runtimes){r.full=0;r.compact=0;}}};
}

test('legacy runtime summaries use one fresh snapshot per retained context',async t=>{
 const f=await fixture(t,{compact:false,count:3});f.reset();const state=f.c.getState();
 assert.equal(state.tasks.length,3);assert.equal(f.runtimes.reduce((n,r)=>n+r.full,0),3);
 assert.ok(state.tasks.every(t=>t.runtimeStatus==='unavailable'&&!t.runtimeBusy));
});

test('compact runtime summaries do not copy retained native messages',async t=>{
 const f=await fixture(t,{count:3});for(const r of f.runtimes)r.state.messages=[{id:'large',text:'Retained text '.repeat(5000)}];f.reset();
 const state=f.c.getState();assert.equal(state.tasks.length,3);
 assert.equal(f.runtimes.reduce((n,r)=>n+r.full,0),0,'status inspection must not clone full native messages');
 assert.equal(f.runtimes.reduce((n,r)=>n+r.compact,0),3);
});

test('restart diagnostics name background owners using only compact current observations',async t=>{
 const f=await fixture(t,{count:2}),r=f.runtimes[0];r.state.status='running';r.state.messages=[{text:'private transcript'.repeat(50000)}];f.reset();
 let rows=f.c.getUpdateBlockers();assert.ok(rows.some(row=>row.label.includes('Status fixture 0')));assert.equal(f.runtimes.reduce((n,r)=>n+r.full,0),0);assert.doesNotMatch(JSON.stringify(rows),/private transcript/);
 r.state.status='idle';r.state.cleanup='unconfirmed';rows=f.c.getUpdateBlockers();assert.match(rows.find(row=>row.label.includes('Status fixture 0')).detail,/cleanup/i);
 r.state.cleanup='pending';rows=f.c.getUpdateBlockers();assert.match(rows.find(row=>row.label.includes('Status fixture 0'))?.detail??'',/cleanup/i);
 r.state.cleanup='confirmed';assert.deepEqual(f.c.getUpdateBlockers(),[]);assert.equal(f.c.canRestartForUpdate(),true);
});

test('legacy busy flag and status label use the same observation',async t=>{
 const f=await fixture(t,{compact:false}),r=f.runtimes[0];f.reset();r.flip=true;
 try{const summary=f.c.getState().tasks[0];assert.equal(summary.runtimeBusy,summary.runtimeStatus==='running');assert.equal(r.full,1);}
 finally{r.flip=false;}
});

test('all native busy flags block restart, billing reset and chat edits without an event',async t=>{
 const f=await fixture(t),r=f.runtimes[0],base={...r.state};
 const patches=[...['running','starting','submitting','connecting','checking-permissions'].map(status=>({status})),{operationBusy:true},{childrenBusy:true},{cleanup:'unconfirmed'},{pending:{kind:'approval'}}];
 for(const patch of patches){
  Object.assign(r.state,base,{operationBusy:false,childrenBusy:false,pending:null},patch);
  assert.equal(f.c.getState().tasks[0].runtimeBusy,true,JSON.stringify(patch));assert.equal(f.c.canRestartForUpdate(),false);
  const stops=r.disconnects;await assert.rejects(f.c.resetCodeConnections(),/Finish running or queued work/);assert.equal(r.disconnects,stops);
  const result=await f.c.dispatch({type:'setTaskFlags',id:f.ids[0],pinned:true});assert.match(result.error,/Finish or disconnect|approval|attention/i);assert.equal(result.tasks[0].pinned,false);
  Object.assign(r.state,base,{operationBusy:false,childrenBusy:false,pending:null});assert.equal(f.c.canRestartForUpdate(),true);assert.equal(f.c.getState().tasks[0].runtimeBusy,false);
 }
});

test('background runtime transitions immediately block targeted mutations and checkout reuse',async t=>{
 const f=await fixture(t,{count:2,mode:'muse'}),r=f.runtimes[0];r.state.status='running';
 for(const action of [{type:'renameTask',id:f.ids[0],title:'Wrong'},{type:'deleteTask',id:f.ids[0],allowUnarchived:true},{type:'setTaskFlags',id:f.ids[0],pinned:true}]){
  const s=await f.c.dispatch(action);assert.match(s.error,/Stop this chat/);assert.equal(s.task.id,f.ids[1]);
 }
 const blocked=await f.c.dispatch({type:'sendMessage',text:'Conflicting checkout'});assert.match(blocked.error,/Another chat is using this checkout/);r.state.status='unavailable';
});

test('controller-local pending work stays busy while native flags are idle',async t=>{
 const f=await fixture(t,{mode:'muse'});const s=await f.act({type:'sendMessage',text:'Locally pending fixture'});
 assert.equal(s.busy,false);assert.equal(f.runtimes[0].state.status,'idle');assert.equal(s.tasks[0].runtimeBusy,true);assert.equal(f.c.canRestartForUpdate(),false);
 await assert.rejects(f.c.resetCodeConnections(),/Finish running or queued work/);
});

test('invalid declared compact status cannot silently grant an idle decision',async t=>{
 const f=await fixture(t),r=f.runtimes[0],original=r.statusSnapshot;
 try{for(const value of [null,undefined,42,'idle',[]]){r.statusSnapshot=()=>value;assert.throws(()=>f.c.canRestartForUpdate(),/runtime status/i);assert.throws(()=>f.c.getState(),/runtime status/i);}}
 finally{r.statusSnapshot=original;}
});

test('pending approval keeps its native reason when navigation is refused',async t=>{
 const f=await fixture(t);f.runtimes[0].state.pending={kind:'approval'};f.runtimes[0].state.reason='Inspect the pending file change.';
 const result=await f.c.dispatch({type:'setMemories',text:'Must not change'});assert.equal(result.error,'Inspect the pending file change.');
 f.runtimes[0].state.pending=null;
});

test('billing reset rechecks pending and unconfirmed shutdown using fresh compact state',async t=>{
 const f=await fixture(t),r=f.runtimes[0],original=r.disconnect;
 try{for(const cleanup of ['pending','unconfirmed']){
  r.state.cleanup='confirmed';r.disconnect=async()=>{r.state.cleanup=cleanup;};f.reset();
  await assert.rejects(f.c.resetCodeConnections(),/Native shutdown is unconfirmed/);assert.equal(r.full,0);
 }}finally{r.disconnect=original;r.state.cleanup='confirmed';}
});
