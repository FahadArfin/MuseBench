import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';

test('background source refresh publishes updated files without disabling the composer',async()=>{
 const base=await mkdtemp(path.join(tmpdir(),'musebench-refresh-')),root=path.join(base,'project');
 await mkdir(root);await writeFile(path.join(root,'file.txt'),'before');
 const controller=await createController({dataDir:path.join(base,'data'),runtimeFactory:()=>({snapshot:()=>({status:'unavailable',binary:null}),subscribe:()=>()=>{},disconnect:async()=>{}})});
 try{
  await controller.dispatch({type:'openProject',path:root});await controller.dispatch({type:'newTask',mode:'manual',request:'Offline note'});
  await writeFile(path.join(root,'file.txt'),'after');
  const snapshots=[];const off=controller.subscribe(value=>snapshots.push(value));
  const result=await controller.dispatch({type:'refresh'});off();
  assert.equal(result.error,null);assert(snapshots.length>0,'must still publish the refreshed state');
  assert(snapshots.every(state=>!state.busy),'periodic refresh must not publish a global busy state');
  assert(result.task.changes.some(change=>change.path==='file.txt'),'source changes must still update');
  const actions=[];const stop=controller.subscribe(value=>actions.push(value.busy));
  await controller.dispatch({type:'newTask',mode:'manual',request:'Another note'});stop();
  assert(actions.includes(true),'explicit workspace mutations must retain their existing busy guard');
 }finally{await controller.close();await rm(base,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});
