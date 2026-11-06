import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createWorkDocumentStore} from '../src/work/document-store.mjs';
import {applyWorkOperations} from '../src/shared/work-operations.mjs';

const id='123e4567-e89b-42d3-a456-426614174000';
const document=(itemId=id)=>({version:2,id:itemId,kind:'design',title:'Poster',revision:0,createdAt:'2026-11-05T12:00:00.000Z',updatedAt:'2026-11-05T12:00:00.000Z',assets:[],data:{artboards:[{id:'board',name:'Poster',width:800,height:600,background:'#ffffff',nodes:[]}]}});
const rename=title=>[{type:'rename',title}];
async function fixture(t,options={}){
  const rootDir=await mkdtemp(path.join(tmpdir(),'muse-work-doc-'));
  const stores=[];
  const open=async(extra={})=>{const store=createWorkDocumentStore({rootDir,...options,...extra});stores.push(store);await store.initialize();return store;};
  const store=await open();
  t.after(async()=>{await Promise.all(stores.map(s=>s.close()));await rm(rootDir,{recursive:true,force:true,maxRetries:3});});
  const itemDir=itemId=>path.join(rootDir,createHash('sha256').update(itemId).digest('hex'));
  return{rootDir,store,open,itemDir};
}

test('commits survive reopen, return independent snapshots, and reject stale revisions',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});
  const saved=await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Edited'),origin:'user'});
  assert.equal(saved.revision,1);saved.document.title='Not saved';
  await assert.rejects(h.store.commit({itemId:id,expectedRevision:0,operations:rename('Stale')}),e=>e.code==='CONFLICT'&&e.currentRevision===1);
  const reopened=await h.open();assert.equal((await reopened.read(id)).document.title,'Edited');
  assert.equal((await reopened.read(id,{revision:0})).document.title,'Poster');
});

test('two rapid edits serialize and never redirect to a different item',async t=>{
  const h=await fixture(t),other='second-item';
  await h.store.create({itemId:id,document:document()});await h.store.create({itemId:other,document:document(other)});
  const results=await Promise.allSettled([h.store.commit({itemId:id,expectedRevision:0,operations:rename('First')}),h.store.commit({itemId:id,expectedRevision:0,operations:rename('Second')}),h.store.commit({itemId:other,expectedRevision:0,operations:rename('Other')})]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'CONFLICT');assert.equal(results[2].status,'fulfilled');
  assert.equal((await h.store.read(id)).document.title,'First');assert.equal((await h.store.read(other)).document.title,'Other');
});

for(const phase of ['snapshot','pointer'])test(`disk failure at ${phase} preserves the committed revision`,async t=>{
  let fail=false;const h=await fixture(t,{beforeWrite:({phase:current})=>{if(fail&&current===phase){const error=Error('Disk full');error.code='ENOSPC';throw error;}}});
  await h.store.create({itemId:id,document:document()});fail=true;
  await assert.rejects(h.store.commit({itemId:id,expectedRevision:0,operations:rename('Lost')}),{code:'ENOSPC'});
  const reopened=await h.open({beforeWrite:undefined});assert.equal((await reopened.read(id)).revision,0);
  const next=await reopened.commit({itemId:id,expectedRevision:0,operations:rename('Next')});assert.equal(next.document.title,'Next');
});

test('corrupted latest snapshot recovers the last valid committed revision and records recovery',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Latest')});
  const state=JSON.parse(await readFile(path.join(h.itemDir(id),'revisions.json'),'utf8'));
  await writeFile(path.join(h.itemDir(id),'snapshots',state.history.at(-1).file),'{broken');
  const reopened=await h.open(),result=await reopened.read(id);
  assert.equal(result.document.title,'Poster');assert.equal(result.recovered,true);assert.match(result.recovery.message,/recover/i);
  const next=await reopened.commit({itemId:id,expectedRevision:0,operations:rename('Recovered edit')});assert.equal(next.revision,2);
});

test('an uncommitted snapshot never becomes current after an interrupted pointer write',async t=>{
  let fail=false;const h=await fixture(t,{beforeWrite:({phase})=>{if(fail&&phase==='pointer')throw Error('Simulated interruption');}});
  await h.store.create({itemId:id,document:document()});fail=true;
  await assert.rejects(h.store.commit({itemId:id,expectedRevision:0,operations:rename('Uncommitted')}));
  const reopened=await h.open({beforeWrite:undefined});assert.equal((await reopened.read(id)).document.title,'Poster');
});

test('named versions survive bounded ordinary history and restore creates a new revision',async t=>{
  const h=await fixture(t,{maxHistoryCount:2,maxHistoryBytes:4096});await h.store.create({itemId:id,document:document()});
  await h.store.checkpoint({itemId:id,name:'Original'});
  for(let revision=0;revision<6;revision++)await h.store.commit({itemId:id,expectedRevision:revision,operations:rename(`Version ${revision+1}`)});
  const list=await h.store.listVersions(id);assert.ok(list.versions.length<=4);assert.equal(list.versions.find(v=>v.revision===0).name,'Original');
  const restored=await h.store.restore({itemId:id,revision:0,expectedRevision:6});assert.equal(restored.revision,7);assert.equal(restored.document.title,'Poster');
  const reopened=await h.open();assert.equal((await reopened.read(id)).revision,7);assert.equal((await reopened.listVersions(id)).versions.find(v=>v.revision===0).name,'Original');
});

test('untrusted edits cannot replace identity, inject arbitrary paths, or save invalid kind data',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});
  for(const operations of [[{type:'replaceData',data:{arbitrary:true}}],[{type:'rename',title:'New',id:'other'}],[{type:'set',path:'__proto__.polluted',value:true}],[{type:'replaceAssets',assets:[{storageRef:'../../secret'}]}]]){
    await assert.rejects(h.store.commit({itemId:id,expectedRevision:0,operations}));
  }
  assert.equal((await h.store.read(id)).revision,0);
  const original=document(),next=applyWorkOperations(original,rename('Pure'));assert.equal(original.title,'Poster');assert.equal(next.title,'Pure');assert.equal(next.id,id);
});

test('unsafe filesystem links fail without reading or writing their target',async t=>{
  const h=await fixture(t),outside=await mkdtemp(path.join(tmpdir(),'muse-work-outside-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  await writeFile(path.join(outside,'sentinel'),'untouched');
  await symlink(outside,h.itemDir(id),'junction');
  await assert.rejects(h.store.create({itemId:id,document:document()}),e=>e.code==='PATH_UNSAFE');
  assert.deepEqual(await readdir(outside),['sentinel']);
});

test('corrupt pointer recovers its validated previous committed pointer',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Latest')});
  await writeFile(path.join(h.itemDir(id),'revisions.json'),'{bad');
  const reopened=await h.open(),saved=await reopened.read(id);assert.equal(saved.revision,0);assert.equal(saved.recovered,true);
});

test('recovery reserve survives a document larger than the ordinary history byte budget',async t=>{
  const h=await fixture(t,{maxHistoryBytes:1024}),initial=document();initial.data.artboards[0].nodes=[{id:'text',type:'text',x:1,y:1,width:700,height:500,rotation:0,opacity:1,locked:false,hidden:false,text:'A'.repeat(2000)}];
  await h.store.create({itemId:id,document:initial});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Large latest')});
  const state=JSON.parse(await readFile(path.join(h.itemDir(id),'revisions.json'),'utf8'));
  await writeFile(path.join(h.itemDir(id),'snapshots',state.history.at(-1).file),'broken');
  const result=await h.store.read(id);assert.equal(result.revision,0);assert.equal(result.recovered,true);
  const next=await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Recovered large')});assert.equal(next.revision,2);
});

test('corrupt pointer recovery never reuses an existing snapshot revision number',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Revision one')});
  await writeFile(path.join(h.itemDir(id),'revisions.json'),'broken');
  const saved=await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Recovered save')});assert.equal(saved.revision,2);
});

test('future pointer versions fail explicitly and preserve files rather than downgrade to backup',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Latest')});
  const pointer=path.join(h.itemDir(id),'revisions.json'),value=JSON.parse(await readFile(pointer,'utf8'));value.version=99;await writeFile(pointer,JSON.stringify(value));
  await assert.rejects(h.store.read(id),{code:'UNSUPPORTED'});assert.equal(JSON.parse(await readFile(pointer,'utf8')).version,99);
});

test('post-commit mirror failure reports a saved revision with a warning',async t=>{
  const h=await fixture(t,{beforeWrite:({phase})=>{if(phase==='mirror')throw Error('Mirror not writable');}});await h.store.create({itemId:id,document:document()});
  const saved=await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Saved')});assert.equal(saved.revision,1);assert.match(saved.warning,/mirror/i);assert.equal((await h.store.read(id)).document.title,'Saved');
});

test('close drains complete queued edits and rejects future mutations',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});
  const pending=h.store.commit({itemId:id,expectedRevision:0,operations:rename('Drained')});await h.store.close();assert.equal((await pending).revision,1);
  await assert.rejects(h.store.read(id),{code:'CLOSED'});assert.equal((await (await h.open()).read(id)).document.title,'Drained');
});

test('a real process exit between snapshot and pointer leaves the last complete revision readable',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});
  const moduleUrl=new URL('../src/work/document-store.mjs',import.meta.url).href;
  const script=`import {createWorkDocumentStore} from ${JSON.stringify(moduleUrl)}; const store=createWorkDocumentStore({rootDir:process.argv[1],beforeWrite:({phase})=>{if(phase==='pointer')process.exit(42);}}); await store.initialize(); await store.commit({itemId:${JSON.stringify(id)},expectedRevision:0,operations:[{type:'rename',title:'Interrupted child'}]});`;
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script,h.rootDir],{stdio:'pipe',windowsHide:true});let stderr='';child.stderr.on('data',data=>{stderr+=data;});child.on('error',reject);child.on('exit',code=>code===42?resolve(code):reject(Error(`Unexpected child exit ${code}: ${stderr}`)));});
  assert.equal(code,42);const reopened=await h.open();assert.equal((await reopened.read(id)).document.title,'Poster');
  assert.equal((await reopened.commit({itemId:id,expectedRevision:0,operations:rename('After process crash')})).revision,2);
});

test('linked snapshots fail closed rather than reading an outside file',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});
  const state=JSON.parse(await readFile(path.join(h.itemDir(id),'revisions.json'),'utf8')),file=path.join(h.itemDir(id),'snapshots',state.history[0].file);
  const outside=path.join(h.rootDir,'outside.json');await writeFile(outside,await readFile(file));await rm(file);await symlink(outside,file,'file');
  await assert.rejects(h.store.read(id),{code:'PATH_UNSAFE'});
});

test('unreadable pointer and backup never get overwritten by create or commit',async t=>{
  const h=await fixture(t);await h.store.create({itemId:id,document:document()});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Latest')});
  for(const file of ['revisions.json','revisions.previous.json'])await writeFile(path.join(h.itemDir(id),file),'broken');
  await assert.rejects(h.store.create({itemId:id,document:document()}),{code:'CORRUPT'});await assert.rejects(h.store.commit({itemId:id,expectedRevision:0,operations:rename('Overwrite')}),{code:'CORRUPT'});
  assert.equal(await readFile(path.join(h.itemDir(id),'revisions.json'),'utf8'),'broken');
});

test('named versions report pressure instead of deleting preserved content',async t=>{
  const h=await fixture(t,{maxHistoryBytes:1024}),initial=document();initial.title='Named large';initial.data.artboards[0].nodes=[{id:'text',type:'text',x:1,y:1,width:700,height:500,rotation:0,opacity:1,locked:false,hidden:false,text:'A'.repeat(2000)}];
  await h.store.create({itemId:id,document:initial});await h.store.checkpoint({itemId:id,name:'Keep me'});await h.store.commit({itemId:id,expectedRevision:0,operations:rename('Current')});
  const list=await h.store.listVersions(id);assert.equal(list.storage.pressure,true);assert.ok(list.versions.some(v=>v.name==='Keep me'));assert.equal((await h.store.read(id,{revision:0})).document.title,'Named large');
});
