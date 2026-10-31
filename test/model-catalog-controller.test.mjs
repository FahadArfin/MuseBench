import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';

const catalog={source:'providerCatalog',models:[{id:'muse-sample',label:'Muse Sample',description:'',efforts:['high'],defaultEffort:'high',isDefault:true,contextLimit:null}]};
async function fixture(t,discoverModels){
 const dir=await mkdtemp(path.join(tmpdir(),'musebench-catalog-')),dataDir=path.join(dir,'data'),project=path.join(dir,'project');await mkdir(project);
 const state={status:'unavailable',binary:path.join(dir,'muse.exe'),permissionVerified:false,cleanup:'confirmed',messages:[]};let connects=0,sends=0;const listeners=new Set(),emit=patch=>{Object.assign(state,patch);for(const fn of listeners)fn(structuredClone(state));};
 const runtime={snapshot:()=>structuredClone(state),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},connect:async()=>{connects++;},send:async()=>{sends++;},refreshModels:async()=>{throw Error('Session catalog must not be used');},disconnect:async()=>emit({permissionVerified:false})};
 const c=await createController({dataDir,runtime,discoverModels});t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
 return{c,state,emit,runtime,dataDir,project,get connects(){return connects;},get sends(){return sends;}};
}
test('model discovery needs no project or session and does not persist its catalog',async t=>{
 const inputs=[],f=await fixture(t,async input=>{inputs.push(input);return catalog;}),before=f.c.getState();
 const result=await f.c.dispatch({type:'refreshModels'});
 assert.equal(result.error,null);assert.deepEqual(result.runtime.modelCatalog,catalog);assert.equal(result.task,before.task);assert.equal(result.activeProject,before.activeProject);assert.equal(result.runtime.permissionVerified,false);assert.equal(f.connects,0);assert.equal(f.sends,0);assert.equal(inputs[0].workspace,f.dataDir);
 const db=new DatabaseSync(path.join(f.dataDir,'musebench.sqlite'),{readOnly:true});try{assert.equal(JSON.parse(db.prepare('SELECT json FROM app WHERE id=1').get().json).runtime.modelCatalog,undefined);}finally{db.close();}
});
test('concurrent catalog refreshes share one read and billing reset fences an in-flight result',async t=>{
 let release,calls=0;const f=await fixture(t,()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const first=f.c.dispatch({type:'refreshModels'}),second=f.c.dispatch({type:'refreshModels'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);assert.equal(f.c.canRestartForUpdate(),false);
 const reset=f.c.resetCodeConnections();release(catalog);await Promise.all([first,second,reset]);
 assert.equal(calls,1);assert.equal(f.c.getState().runtime.modelCatalog,undefined);assert.equal(f.c.getState().error,null);assert.equal(f.connects,0);
});
test('catalogs are scoped to project and cleared on billing changes',async t=>{
 const f=await fixture(t,async()=>catalog);await f.c.dispatch({type:'refreshModels'});await f.c.dispatch({type:'openProject',path:f.project});
 assert.equal(f.c.getState().runtime.modelCatalog,undefined);await f.c.dispatch({type:'refreshModels'});assert.deepEqual(f.c.getState().runtime.modelCatalog,catalog);
 await f.c.resetCodeConnections();assert.equal(f.c.getState().runtime.modelCatalog,undefined);
});
test('billing reset also invalidates a refresh still waiting to start',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return catalog;});
 const refresh=f.c.dispatch({type:'refreshModels'}),reset=f.c.resetCodeConnections();await Promise.all([refresh,reset]);
 assert.equal(f.c.getState().runtime.modelCatalog,undefined);assert.equal(calls,0);
});
test('a verified runtime catalog takes precedence after a later native refresh',async t=>{
 const f=await fixture(t,async()=>catalog);await f.c.dispatch({type:'refreshModels'});
 f.emit({permissionVerified:true,modelCatalog:{source:'configCatalog',models:[]}});
 assert.deepEqual(f.c.getState().runtime.modelCatalog,{source:'configCatalog',models:[]});
});
test('refreshing a verified idle session uses its current catalog without reconnecting',async t=>{
 let reads=0;const f=await fixture(t,async()=>{reads++;return catalog;});await f.c.dispatch({type:'refreshModels'});
 f.emit({status:'idle',permissionVerified:true,modelCatalog:catalog});
 f.runtime.refreshModels=async()=>f.emit({modelCatalog:{source:'configCatalog',models:[]}});
 const result=await f.c.dispatch({type:'refreshModels'});assert.equal(result.error,null);assert.deepEqual(result.runtime.modelCatalog,{source:'configCatalog',models:[]});assert.equal(reads,1);assert.equal(f.connects,0);assert.equal(f.sends,0);
});
test('idle runtime account cleanup failures also block subsequent catalog and billing work',async t=>{
 const f=await fixture(t,async()=>catalog);f.emit({status:'idle',permissionVerified:true});
 f.runtime.refreshModels=async()=>{throw Object.assign(Error('Account shutdown unconfirmed'),{code:'ACCOUNT_CLEANUP'});};
 await f.c.dispatch({type:'refreshModels'});assert.equal(f.c.canRestartForUpdate(),false);await assert.rejects(f.c.resetCodeConnections(),/shutdown/i);
});
test('running work rejects catalog discovery without opening or sending a session',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return catalog;});f.state.status='running';
 const result=await f.c.dispatch({type:'refreshModels'});assert.match(result.error,/running|Finish/);assert.equal(calls,0);assert.equal(f.connects,0);assert.equal(f.sends,0);
});
test('catalog failure is retryable while unconfirmed cleanup blocks further work and billing',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;if(calls===1)throw Error('Catalog unavailable');if(calls===3)throw Object.assign(Error('Cleanup unconfirmed'),{code:'CATALOG_CLEANUP'});return catalog;});
 assert.match((await f.c.dispatch({type:'refreshModels'})).error,/unavailable/);assert.equal((await f.c.dispatch({type:'refreshModels'})).error,null);
 await f.c.dispatch({type:'refreshModels'});assert.equal(f.c.canRestartForUpdate(),false);assert.ok(f.c.getUpdateBlockers().some(row=>/catalog/i.test(row.label)));
 await assert.rejects(f.c.resetCodeConnections(),/shutdown|cleanup/i);await f.c.dispatch({type:'refreshModels'});assert.equal(calls,3);
});
