import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createFileEditor} from '../electron/file-editor.mjs';

test('opens only existing changed files from the bound task, remembering the chosen editor',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-editor-'));
 try {
  await mkdir(path.join(root,'project'));await writeFile(path.join(root,'project','a & b.ts'),'hello');
  const editor=path.join(root,'editor.exe');await writeFile(editor,'fixture');
  const state={activeProject:{root:path.join(root,'project')},task:{id:'task',changes:[{path:'a & b.ts'},{path:'gone.ts',status:'deleted'},{path:'../outside.ts'}]}};
  let choices=0;const launches=[];
  const options={dataDir:root,getState:()=>state,choose:async()=>{choices++;return editor;},launch:async(...args)=>launches.push(args),candidates:[]};
  const open=createFileEditor(options);
  await open({taskId:'task',path:'a & b.ts',editor:'choose'});
  await createFileEditor(options)({taskId:'task',path:'a & b.ts',editor:'preferred'});
  assert.equal(choices,1);assert.deepEqual(launches,[[editor,[path.join(root,'project','a & b.ts')]],[editor,[path.join(root,'project','a & b.ts')]]]);
  for(const input of [{taskId:'stale',path:'a & b.ts'},{taskId:'task',path:'unknown.ts'},{taskId:'task',path:'../outside.ts'},{taskId:'task',path:'gone.ts'},{taskId:'task',path:'a & b.ts',editor:'cmd.exe'}])await assert.rejects(open(input));
  assert.equal(launches.length,2);
  await mkdir(path.join(root,'outside'));await writeFile(path.join(root,'outside','file.ts'),'outside');
  await symlink(path.join(root,'outside'),path.join(root,'project','link'),'junction');state.task.changes.push({path:'link/file.ts'});
  await assert.rejects(open({taskId:'task',path:'link/file.ts'}),/outside/);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('cancelled editor selection does not launch or save a preference',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-editor-'));
 try {await writeFile(path.join(root,'file.ts'),'');let launched=false;
 const open=createFileEditor({dataDir:root,getState:()=>({activeProject:{root},task:{id:'t',changes:[{path:'file.ts'}]}}),choose:async()=>null,candidates:[],launch:async()=>{launched=true;}});
 assert.deepEqual(await open({taskId:'t',path:'file.ts'}),{opened:false});assert.equal(launched,false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('rechecks ownership after the editor picker returns',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-editor-'));
 try {await writeFile(path.join(root,'file.ts'),'');await writeFile(path.join(root,'editor.exe'),'');let launched=false;
 const state={activeProject:{root},task:{id:'t',changes:[{path:'file.ts'}]}};
 const open=createFileEditor({dataDir:root,getState:()=>state,choose:async()=>{state.task.id='other';return path.join(root,'editor.exe');},candidates:[],launch:async()=>{launched=true;}});
 await assert.rejects(open({taskId:'t',path:'file.ts',editor:'choose'}),/active task/);assert.equal(launched,false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('navigation can open an unchanged source file while keeping task and path boundaries',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-navigation-editor-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'project'));await writeFile(path.join(root,'project','source.ts'),'export const x=1;');await writeFile(path.join(root,'editor.exe'),'fixture');const launches=[];
 const open=createFileEditor({dataDir:root,getState:()=>({activeProject:{root:path.join(root,'project')},task:{id:'t',changes:[]}}),choose:async()=>path.join(root,'editor.exe'),candidates:[],launch:async(...args)=>launches.push(args)});
 await open({taskId:'t',path:'source.ts',source:'navigation'});assert.equal(launches.length,1);
 for(const input of [{taskId:'other',path:'source.ts',source:'navigation'},{taskId:'t',path:'../editor.exe',source:'navigation'},{taskId:'t',path:'source.ts',source:'untrusted'}])await assert.rejects(open(input));
});
