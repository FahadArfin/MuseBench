import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
async function fixture(t){
 const base=await fs.mkdtemp(path.join(tmpdir(),'musebench-refresh-queue-')),project=path.join(base,'project');await fs.mkdir(project);await fs.writeFile(path.join(project,'note.txt'),'before');
 let connected=false,disconnects=0,connects=0,onConnect=async()=>{};
 const runtime={snapshot:()=>({status:connected?'idle':'unavailable',permissionVerified:connected,cleanup:'confirmed',messages:[]}),subscribe:()=>()=>{},connect:async()=>{connects++;await onConnect();connected=true;},disconnect:async()=>{disconnects++;connected=false;}};
 const c=await createController({dataDir:path.join(base,'data'),runtime});
 t.after(async()=>{await c.close();await fs.rm(base,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
 const act=async action=>{const result=await c.dispatch(action);assert.equal(result.error,null);return result;};
 await act({type:'openProject',path:project});await act({type:'newTask',mode:'manual',request:'First task'});
 return{c,project,dataDir:path.join(base,'data'),act,get connected(){return connected;},get connects(){return connects;},get disconnects(){return disconnects;},set onConnect(fn){onConnect=fn;}};
}
function holdScan(t,project,{error}={}){
 const entered=deferred(),release=deferred(),done=deferred(),original=fs.readdir;let reads=0;
 t.mock.method(fs,'readdir',async function(directory,...options){
  if(path.resolve(directory)===project&&++reads===1){entered.resolve();await release.promise;done.resolve();if(error)throw Error(error);}
  return original.call(this,directory,...options);
 });
 t.after(()=>release.resolve());
 return{entered:entered.promise,release:release.resolve,done:done.promise,get reads(){return reads;}};
}
async function responsive(operation){
 let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Command remained behind source inspection.')),250);})]);}finally{clearTimeout(timer);}
}

test('a held background scan does not delay sending or publish its obsolete error',async t=>{
 const f=await fixture(t),gate=holdScan(t,f.project,{error:'obsolete inspection failure'}),scan=f.c.dispatch({type:'refresh'});await gate.entered;
 try{
  const sent=await responsive(f.act({type:'sendMessage',text:'Write a local journal entry'}));
  assert(sent.task.messages.some(message=>message.text==='Write a local journal entry'));
  gate.release();await scan;await gate.done;await new Promise(setImmediate);
  assert.equal(f.c.getState().error,null);assert.equal(f.c.getState().task.acceptedRevision,null);
 }finally{gate.release();await scan;}
});

test('refresh requests share one scan while it is pending',async t=>{
 const f=await fixture(t),gate=holdScan(t,f.project),first=f.c.dispatch({type:'refresh'});await gate.entered;
 try{const second=f.c.dispatch({type:'refresh'});assert.equal(first,second);gate.release();await Promise.all([first,second]);assert.equal(gate.reads,1);}
 finally{gate.release();await first;}
});

test('navigation preempts a held refresh and its result cannot replace the new task evidence',async t=>{
 const f=await fixture(t),gate=holdScan(t,f.project),scan=f.c.dispatch({type:'refresh'});await gate.entered;
 try{
  await fs.writeFile(path.join(f.project,'note.txt'),'after navigation');
  const next=await responsive(f.act({type:'newTask',mode:'manual',request:'Replacement task'}));
  const revision=next.task.revision;gate.release();await scan;await gate.done;await new Promise(setImmediate);
  const state=f.c.getState();assert.equal(state.task.id,next.task.id);assert.equal(state.task.revision,revision);assert.deepEqual(state.task.changes,[]);assert.equal(state.task.check,null);
 }finally{gate.release();await scan;}
});

test('disconnect preempts a held refresh',async t=>{
 const f=await fixture(t),gate=holdScan(t,f.project),scan=f.c.dispatch({type:'refresh'});await gate.entered;const before=f.disconnects;
 try{await responsive(f.act({type:'disconnectMuse'}));assert.equal(f.disconnects,before+1);}
 finally{gate.release();await scan;}
});

test('close completes while an obsolete directory read remains pending',async t=>{
 const f=await fixture(t),gate=holdScan(t,f.project),scan=f.c.dispatch({type:'refresh'});await gate.entered;
 try{await responsive(f.c.close());assert.equal(f.connected,false);}
 finally{gate.release();await scan;await gate.done;await new Promise(setImmediate);}
});

test('close rejects an accepted connect that has not started',async t=>{
 const f=await fixture(t),pending=f.c.dispatch({type:'connectMuse'}),rejected=assert.rejects(pending,/Controller closed/);
 await f.c.close();await rejected;assert.equal(f.connects,0);assert.equal(f.connected,false);
});

test('close disconnects after an already started connect becomes terminal',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();f.onConnect=async()=>{entered.resolve();await release.promise;};
 const pending=f.c.dispatch({type:'connectMuse'});await entered.promise;const closing=f.c.close();release.resolve();await Promise.all([pending,closing]);
 assert.equal(f.connects,1);assert.equal(f.connected,false);
});

test('a refresh persistence failure rolls back its task snapshot and remains retryable',async t=>{
 const f=await fixture(t),db=new DatabaseSync(path.join(f.dataDir,'musebench.sqlite')),original=f.c.getState().task;
 try{
  await fs.writeFile(path.join(f.project,'note.txt'),'after');
  db.exec("CREATE TRIGGER fail_refresh BEFORE UPDATE ON app WHEN json_extract(new.json,'$.task.changes[0].after')='after' BEGIN SELECT RAISE(ABORT,'refresh storage failure'); END");
  const failed=await f.c.dispatch({type:'refresh'});assert.match(failed.error,/refresh storage failure/);await new Promise(setImmediate);
  assert.equal(JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(original.id).json).revision,original.revision);
  db.exec('DROP TRIGGER fail_refresh');const recovered=await f.act({type:'refresh'});assert.notEqual(recovered.task.revision,original.revision);
  assert.equal(JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(original.id).json).revision,recovered.task.revision);
 }finally{db.exec('DROP TRIGGER IF EXISTS fail_refresh');db.close();}
});
