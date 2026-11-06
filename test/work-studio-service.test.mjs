import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createWorkService} from '../src/work/index.mjs';
import {createWorkDocument} from '../src/shared/work-documents.mjs';

function fakeRuntime(){
  const listeners=new Set(),calls=[];
  let state={status:'unavailable',reason:null,binary:'fixture-native',sdkVersion:'test',transport:'exec',liveVerified:false,permissionVerified:false,messages:[],runId:null,activity:{items:[],truncated:false},shellResults:[]};
  const update=value=>{state={...state,...value};for(const listener of listeners)listener(structuredClone(state));};
  return{calls,snapshot:()=>structuredClone(state),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},async connect(options){calls.push({type:'connect',...options});update({status:'idle',permissionVerified:true,sessionId:'studio-session'});},async send(options){calls.push({type:'send',...options});update({status:'running',runId:'studio-run',messages:[]});},async disconnect(){calls.push({type:'disconnect'});update({status:'closed',permissionVerified:false});}};
}
async function fixture(t){
  const base=await mkdtemp(path.join(tmpdir(),'muse-work-studio-')),runtime=fakeRuntime();
  const options={dataDir:path.join(base,'data'),projectsDir:path.join(base,'projects'),runtime},services=[];
  const open=async()=>{const service=await createWorkService(options);services.push(service);return service;};
  const service=await open();t.after(async()=>{for(const current of services)await current.close();await rm(base,{recursive:true,force:true,maxRetries:3});});
  const itemDir=id=>path.join(options.dataDir,'documents',createHash('sha256').update(id).digest('hex'));
  return{base,options,runtime,service,open,itemDir};
}
const rename=title=>[{type:'rename',title}];

test('mixed legacy and creative projects reopen with original identities and no model requests',async t=>{
  const h=await fixture(t),legacy=await h.service.dispatch({type:'create',team:'finance',kind:'dashboard',title:'Legacy dashboard',brief:'Retain existing artifact.',demo:true});
  const legacyRoot=await h.service.getWorkspace(legacy.item.id),legacyBytes=await readFile(path.join(legacyRoot,'work-artifact.json'),'utf8');
  const creative=await h.service.createDocument({kind:'design',title:'Editable poster'}),item=h.service.getItem(creative.itemId);
  assert.equal(item.documentVersion,2);assert.equal(item.documentRevision,0);assert.equal(item.kind,'design');assert.notEqual(item.projectId,legacy.item.projectId);assert.notEqual(item.taskId,legacy.item.taskId);
  assert.equal(h.runtime.calls.some(call=>['connect','send'].includes(call.type)),false);
  assert.equal(await h.service.getArtifact(creative.itemId),null);assert.equal((await h.service.getArtifact(legacy.item.id)).title,JSON.parse(legacyBytes).title);
  await h.service.close();const reopened=await h.open();assert.equal(reopened.getState().error,null);assert.equal(reopened.getState().items.length,2);assert.deepEqual(reopened.getItem(creative.itemId),item);
  assert.equal((await reopened.readWorkDocument(creative.itemId)).document.id,item.id);assert.equal(await readFile(path.join(legacyRoot,'work-artifact.json'),'utf8'),legacyBytes);
});

test('creative edits update title and revision metadata and stale commits cannot overwrite them',async t=>{
  const h=await fixture(t),created=await h.service.createDocument({kind:'image',title:'Photo edit'}),before=h.service.getItem(created.itemId);
  const saved=await h.service.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename('Adjusted photo'),origin:'user'});
  assert.equal(saved.revision,1);assert.equal(h.service.getItem(created.itemId).title,'Adjusted photo');assert.equal(h.service.getItem(created.itemId).updatedAt,saved.document.updatedAt);assert.equal(h.service.getItem(created.itemId).documentRevision,1);
  await assert.rejects(h.service.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename('Stale result'),origin:'muse'}),e=>e.code==='CONFLICT'&&e.currentRevision===1);
  assert.equal(h.service.getItem(created.itemId).projectId,before.projectId);assert.equal(h.service.getItem(created.itemId).taskId,before.taskId);
  await h.service.close();const reopened=await h.open();assert.equal(reopened.getItem(created.itemId).documentRevision,1);assert.equal((await reopened.readWorkDocument(created.itemId)).document.title,'Adjusted photo');
});

test('queued edits remain bound to their item while the selected item changes',async t=>{
  const h=await fixture(t),first=await h.service.createDocument({kind:'design',title:'First'}),second=await h.service.createDocument({kind:'image',title:'Second'});
  const save=h.service.commitWorkEdit({itemId:first.itemId,expectedRevision:0,operations:rename('First saved in background')}),selection=h.service.dispatch({type:'select',id:second.itemId});
  await save;await selection;assert.equal(h.service.getState().activeId,second.itemId);assert.equal((await h.service.readWorkDocument(first.itemId)).document.title,'First saved in background');assert.equal((await h.service.readWorkDocument(second.itemId)).document.title,'Second');
  assert.equal(h.service.getItem(first.itemId).documentRevision,1);assert.equal(h.service.getItem(second.itemId).documentRevision,0);
});

test('named checkpoints preview old content and restore it as a new revision',async t=>{
  const h=await fixture(t),created=await h.service.createDocument({kind:'design',title:'Original'});
  await h.service.checkpointWorkVersion({itemId:created.itemId,name:'Approved original'});
  await h.service.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename('Later')});
  assert.equal((await h.service.readWorkDocument(created.itemId,{revision:0})).document.title,'Original');
  assert.equal(h.service.getItem(created.itemId).documentRevision,1);assert.equal(h.service.getItem(created.itemId).title,'Later');
  const list=await h.service.listWorkVersions(created.itemId);assert.equal(list.versions.find(v=>v.revision===0).name,'Approved original');
  const restored=await h.service.restoreWorkVersion({itemId:created.itemId,revision:0,expectedRevision:1});assert.equal(restored.revision,2);assert.equal(h.service.getItem(created.itemId).documentRevision,2);assert.equal(h.service.getItem(created.itemId).title,'Original');
  await assert.rejects(h.service.restoreWorkVersion({itemId:created.itemId,revision:1,expectedRevision:1}),{code:'CONFLICT'});
});

test('schema-valid creative titles at the 240-character limit survive reopening',async t=>{
  const h=await fixture(t),created=await h.service.createDocument({kind:'design',title:'Short'}),title='A'.repeat(240);
  await h.service.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename(title)});await h.service.close();
  const reopened=await h.open();assert.equal(reopened.getState().error,null);assert.equal(reopened.getItem(created.itemId).title,title);assert.equal((await reopened.readWorkDocument(created.itemId)).document.title,title);
});

test('reopening reconciles recovered document revision and title with library metadata',async t=>{
  const h=await fixture(t),created=await h.service.createDocument({kind:'design',title:'Last complete'});
  await h.service.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename('Corrupted latest')});await h.service.close();
  const pointer=JSON.parse(await readFile(path.join(h.itemDir(created.itemId),'revisions.json'),'utf8'));
  await writeFile(path.join(h.itemDir(created.itemId),'snapshots',pointer.history.at(-1).file),'{broken');
  const reopened=await h.open(),saved=await reopened.readWorkDocument(created.itemId);
  assert.equal(saved.recovered,true);assert.equal(saved.revision,0);assert.equal(reopened.getItem(created.itemId).documentRevision,saved.revision);assert.equal(reopened.getItem(created.itemId).title,saved.document.title);
  const next=await reopened.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename('Recovery continued')});assert.equal(next.revision,2);
});

test('reopening refreshes stale manifest metadata from the authoritative document commit',async t=>{
  const h=await fixture(t),created=await h.service.createDocument({kind:'design',title:'Before'}),manifest=path.join(h.options.dataDir,'manifest.json'),oldBytes=await readFile(manifest,'utf8');
  await h.service.commitWorkEdit({itemId:created.itemId,expectedRevision:0,operations:rename('Actually committed')});await h.service.close();await writeFile(manifest,oldBytes);
  const reopened=await h.open();assert.equal((await reopened.readWorkDocument(created.itemId)).revision,1);assert.equal(reopened.getItem(created.itemId).documentRevision,1);assert.equal(reopened.getItem(created.itemId).title,'Actually committed');
});

test('creative creation validates identity and kind before adding a library record',async t=>{
  const h=await fixture(t),candidate=createWorkDocument('design',{title:'Preserved identity'});
  await assert.rejects(h.service.createDocument({kind:'image',document:candidate}));assert.equal(h.service.getState().items.length,0);
  const created=await h.service.createDocument({kind:'design',document:candidate});assert.equal(created.itemId,candidate.id);
  await assert.rejects(h.service.createDocument({kind:'design',document:candidate}));assert.equal(h.service.getState().items.length,1);
  assert.equal(h.service.getItem('missing'),null);await assert.rejects(h.service.getWorkspace('missing'));
  await assert.rejects(h.service.readWorkDocument('missing'));assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);
});

test('only explicit studio Muse submission sends target-bound native context',async t=>{
  const h=await fixture(t),first=await h.service.createDocument({kind:'design',title:'Muse target'}),second=await h.service.createDocument({kind:'image',title:'Selected item'});
  await h.service.commitWorkEdit({itemId:first.itemId,expectedRevision:0,operations:rename('Refinement target')});await h.service.listWorkVersions(first.itemId);assert.equal(h.runtime.calls.some(call=>call.type==='send'),false);
  const sent=await h.service.requestStudioMuse({itemId:first.itemId,prompt:`Propose local validated edits only for ${first.itemId} revision 1.`,displayText:'Improve the selected heading'});
  assert.deepEqual(sent,{accepted:true,itemId:first.itemId});assert.match(h.runtime.calls.find(call=>call.type==='send').text,new RegExp(first.itemId));assert.equal(h.service.getState().activeId,second.itemId);
  await h.service.dispatch({type:'stop'});assert.equal((await h.service.readWorkDocument(first.itemId)).revision,1);assert.equal((await h.service.readWorkDocument(second.itemId)).revision,0);
});
