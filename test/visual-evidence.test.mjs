import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {restoreVisualEvidence} from '../src/shared/visual-evidence.mjs';
import {groupWorkLog} from '../src/shared/work-log.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'visual-evidence-')),project=path.join(dir,'project'),dataDir=path.join(dir,'data');await mkdir(project);
 let native={status:'idle',transport:'exec',sessionId:'connection',messages:[],permissionVerified:true,cleanup:'confirmed'},sequence=0;const listeners=new Set();
 const runtime={snapshot:()=>structuredClone(native),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(patch){native={...native,...patch};for(const fn of listeners)fn(native);},async disconnect(){this.emit({status:'closed',cleanup:'confirmed'});},async connect(){this.emit({status:'idle',permissionVerified:true,cleanup:'confirmed'});},async send(){this.emit({status:'running',runId:null,inputAccepted:false,cleanup:'pending'});this.emit({runId:'run-'+(++sequence),inputAccepted:true});}};
 let c=await createController({dataDir,runtime});t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
 await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',request:'Inspect project image',mode:'muse'});await c.dispatch({type:'sendMessage',text:'Inspect image'});
 return{get c(){return c;},runtime,owner:()=>({taskId:c.getState().task.id,root:project}),async reopen(){await c.close();c=await createController({dataDir,runtime});}};
}
test('visual evidence stays with its exact request through native updates, draft cleanup and restart',async t=>{
 const f=await fixture(t),record=f.c.beginVisual(f.owner());await record({kind:'view',name:'fixture.png',path:'fixture.png',imageDataUrl:dataUrl});
 let run=f.c.getState().task.runs.at(-1);assert.equal(run.visuals.length,1);assert.equal(groupWorkLog(run.visuals)[0].label,'Viewed an image');
 const projectId=f.c.getState().activeProject.id,image=run.visuals[0].images[0];assert.equal(await f.c.readImage({projectId,image}),dataUrl);
 f.runtime.emit({activity:{items:[],truncated:false}});await f.c.dispatch({type:'refresh'});run=f.c.getState().task.runs.at(-1);assert.equal(run.visuals.length,1,'native activity must not erase host image receipts');
 await f.c.saveCodeDraft({projectId,taskId:f.owner().taskId,text:'',images:[image],files:[],mode:'chat'});await f.c.saveCodeDraft({projectId,taskId:f.owner().taskId,text:'',images:[],files:[],mode:'chat'});assert.equal(await f.c.readImage({projectId,image}),dataUrl);
 await f.reopen();run=f.c.getState().task.runs.at(-1);assert.equal(run.visuals.length,1);assert.equal(await f.c.readImage({projectId,image}),dataUrl);
});
test('late visual results cannot attach to a replacement request or disconnected owner',async t=>{
 const f=await fixture(t),record=f.c.beginVisual(f.owner());f.runtime.emit({status:'completed',cleanup:'confirmed'});await f.c.dispatch({type:'refresh'});
 await f.c.dispatch({type:'sendMessage',text:'Second request'});await assert.rejects(record({kind:'capture',imageDataUrl:dataUrl}),/owner changed/);
 const next=f.c.beginVisual(f.owner());f.runtime.emit({sessionId:'replacement'});await assert.rejects(next({kind:'view',imageDataUrl:dataUrl}),/owner changed/);
 assert.ok(f.c.getState().task.runs.every(run=>!run.visuals?.length));
});
test('visual retention is bounded and invalid restored image references do not become evidence',async t=>{
 const f=await fixture(t),record=f.c.beginVisual(f.owner());for(let i=0;i<14;i++)await record({kind:'capture',imageDataUrl:dataUrl});
 const run=f.c.getState().task.runs.at(-1);assert.equal(run.visuals.length,12);assert.equal(run.visualsTruncated,true);assert.equal(groupWorkLog(run.visuals)[0].label,'Captured a screenshot');
 const valid=run.visuals[0];assert.equal(restoreVisualEvidence([valid]).length,1);
 for(const patch of [{images:[]},{status:'working'},{images:[{id:'bad'}]},{visual:{kind:'view',projectId:''}},{id:'forged'}])assert.deepEqual(restoreVisualEvidence([{...valid,...patch}]),[]);
});
test('revocation during import releases the unattached visual file',async t=>{
 const f=await fixture(t);let checks=0;
 const record=f.c.beginVisual({...f.owner(),isCurrent:()=>++checks<4});
 await assert.rejects(record({kind:'view',imageDataUrl:dataUrl}),/owner changed/);
 const bytes=Buffer.from(dataUrl.split(',')[1],'base64'),image={id:createHash('sha256').update(bytes).digest('hex'),name:'Viewed image',mime:'image/png',bytes:bytes.length};
 await assert.rejects(f.c.readImage({projectId:f.c.getState().activeProject.id,image}),/unavailable/);
});
test('pruned request images are released after their last retained reference disappears',async t=>{
 const f=await fixture(t);await f.c.beginVisual(f.owner())({kind:'view',imageDataUrl:dataUrl});
 const first=f.c.getState(),image=first.task.runs.at(-1).visuals[0].images[0],projectId=first.activeProject.id;
 for(let i=0;i<40;i++){f.runtime.emit({status:'completed',cleanup:'confirmed'});await f.c.dispatch({type:'refresh'});await f.c.dispatch({type:'sendMessage',text:'Next '+i});}
 assert.ok(f.c.getState().task.runs.every(run=>!run.visuals?.length));
 await f.reopen();await assert.rejects(f.c.readImage({projectId,image}),/unavailable/);
});
test('cleanup cannot unlink an image concurrently imported into a new request',async t=>{
 const f=await fixture(t);await f.c.beginVisual(f.owner())({kind:'view',imageDataUrl:dataUrl});
 let release,entered;const gate=new Promise(resolve=>release=resolve),deleting=new Promise(resolve=>entered=resolve),original=fs.promises.unlink;let first=true;
 fs.promises.unlink=async file=>{if(first&&String(file).includes('code-images')){first=false;entered();await gate;}return original(file);};syncBuiltinESMExports();
 try{
  for(let i=0;i<40;i++){f.runtime.emit({status:'completed',cleanup:'confirmed'});await f.c.dispatch({type:'refresh'});await f.c.dispatch({type:'sendMessage',text:'Next '+i});}
  await Promise.race([deleting,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Cleanup did not start')),3000);timer.unref();})]);
  let published=false;const recording=f.c.beginVisual(f.owner())({kind:'view',imageDataUrl:dataUrl}).then(()=>{published=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(published,false,'image publication waits for pending deletion');
  release();await recording;
  const state=f.c.getState(),image=state.task.runs.at(-1).visuals[0].images[0];assert.equal(await f.c.readImage({projectId:state.activeProject.id,image}),dataUrl);
 }finally{release();fs.promises.unlink=original;syncBuiltinESMExports();}
});
