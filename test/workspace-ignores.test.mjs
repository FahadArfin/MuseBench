import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
const exec=promisify(execFile);
async function fixture(t,{git=true}={}){
 await mkdir('artifacts/workspace-ignore-tests',{recursive:true});
 const base=await mkdtemp(path.resolve('artifacts/workspace-ignore-tests/run-')),root=path.join(base,'project');await mkdir(root);
 const run=(...args)=>exec('git',['-C',root,...args],{windowsHide:true});
 if(git)await run('init','--quiet');
 await writeFile(path.join(root,'package.json'),JSON.stringify({name:'ignore-fixture',scripts:{}}));
 await writeFile(path.join(root,'source.txt'),'initial');
 const controller=await createController({dataDir:path.join(base,'data')});t.after(()=>controller.close());
 return {root,run,controller};
}
test('opening a repository skips ignored generated archives while retaining tracked and new source changes',async t=>{
 const {root,run,controller:c}=await fixture(t);
 await writeFile(path.join(root,'.gitignore'),'artifacts/\n*.log\n');
 await mkdir(path.join(root,'artifacts'));await writeFile(path.join(root,'artifacts','app.asar'),Buffer.alloc(3*1024*1024));
 await writeFile(path.join(root,'artifacts','tracked.txt'),'tracked');await run('add','-f','artifacts/tracked.txt');
 await writeFile(path.join(root,'ignored.log'),'ignored');
 await writeFile(path.join(root,'.env'),'secret=fixture');await run('add','-f','.env');
 let state=await c.dispatch({type:'openProject',path:root});assert.equal(state.error,null);
 state=await c.dispatch({type:'newTask',request:'Inspect source changes',mode:'manual'});assert.equal(state.error,null);
 const revision=state.task.revision;
 await writeFile(path.join(root,'ignored.log'),'changed output');
 await writeFile(path.join(root,'.env'),'secret=changed-fixture');
 state=await c.dispatch({type:'refresh'});assert.equal(state.error,null);assert.equal(state.task.revision,revision);
 await writeFile(path.join(root,'artifacts','tracked.txt'),'changed tracked');await writeFile(path.join(root,'fresh.txt'),'new source');
 state=await c.dispatch({type:'refresh'});assert.equal(state.error,null);
 assert.deepEqual(state.task.changes.map(item=>[item.path,item.status]),[['artifacts/tracked.txt','modified'],['fresh.txt','added']]);
});
test('nested ignores and negations preserve explicitly included source files',async t=>{
 const {root,controller:c}=await fixture(t);await mkdir(path.join(root,'generated'));
 await writeFile(path.join(root,'generated','.gitignore'),'*.txt\n!keep.txt\n');
 await writeFile(path.join(root,'generated','large.txt'),Buffer.alloc(3*1024*1024));await writeFile(path.join(root,'generated','keep.txt'),'keep');
 assert.equal((await c.dispatch({type:'openProject',path:root})).error,null);
 await c.dispatch({type:'newTask',request:'Review included source',mode:'manual'});
 await writeFile(path.join(root,'generated','keep.txt'),'changed');const state=await c.dispatch({type:'refresh'});
 assert.equal(state.error,null);assert.deepEqual(state.task.changes.map(item=>item.path),['generated/keep.txt']);
});
test('non-repository projects inside an ignored test directory still capture their source',async t=>{
 const {root,controller:c}=await fixture(t,{git:false});assert.equal((await c.dispatch({type:'openProject',path:root})).error,null);
 await c.dispatch({type:'newTask',request:'Review plain folder',mode:'manual'});await writeFile(path.join(root,'source.txt'),'changed');
 const state=await c.dispatch({type:'refresh'});assert.equal(state.error,null);assert.deepEqual(state.task.changes.map(item=>item.path),['source.txt']);
});
test('invalid repository metadata reports a failure without registering a partial project',async t=>{
 const {root,controller:c}=await fixture(t);await writeFile(path.join(root,'.git','index'),'not a Git index');
 const state=await c.dispatch({type:'openProject',path:root});assert.match(state.error,/Could not read Git source paths/);assert.equal(state.activeProject,null);assert.equal(state.projects.length,0);
});
test('Git worktree roots use their repository ignore rules',async t=>{
 const {root,run,controller:c}=await fixture(t);await writeFile(path.join(root,'.gitignore'),'generated/\n');await run('add','.');
 await run('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Fixture');
 const worktree=path.join(path.dirname(root),'worktree');await run('worktree','add','--quiet','--detach',worktree,'HEAD');
 await mkdir(path.join(worktree,'generated'));await writeFile(path.join(worktree,'generated','large.bin'),Buffer.alloc(3*1024*1024));
 const state=await c.dispatch({type:'openProject',path:worktree});assert.equal(state.error,null);assert.equal(state.activeProject.root,worktree);
});
test('case-only tracked file and directory renames still capture changed disk contents',async t=>{
 const {root,run,controller:c}=await fixture(t);await run('config','core.ignorecase','true');
 await mkdir(path.join(root,'Folder'));await writeFile(path.join(root,'Folder','item.txt'),'old nested');await writeFile(path.join(root,'CaseFile.txt'),'old file');await run('add','.');
 assert.equal((await c.dispatch({type:'openProject',path:root})).error,null);await c.dispatch({type:'newTask',request:'Review case changes',mode:'manual'});
 await rename(path.join(root,'CaseFile.txt'),path.join(root,'casefile.txt'));await rename(path.join(root,'Folder'),path.join(root,'folder'));
 await writeFile(path.join(root,'casefile.txt'),'new file');await writeFile(path.join(root,'folder','item.txt'),'new nested');
 const state=await c.dispatch({type:'refresh'});assert.equal(state.error,null);
 assert.equal(state.task.changes.find(item=>item.path==='casefile.txt')?.after,'new file');
 assert.equal(state.task.changes.find(item=>item.path==='folder/item.txt')?.after,'new nested');
});
test('unignored dependency trees cannot consume the Git source-list budget',async t=>{
 const {root,controller:c}=await fixture(t);const dependencies=path.join(root,'NODE_MODULES');await mkdir(dependencies);
 // These names alone exceed the bounded Git output limit if exclusions run late.
 for(let batch=0;batch<12000;batch+=100)await Promise.all(Array.from({length:100},(_,offset)=>writeFile(path.join(dependencies,`${batch+offset}-${'x'.repeat(180)}.js`),'')));
 const state=await c.dispatch({type:'openProject',path:root});assert.equal(state.error,null);assert.equal(state.activeProject.root,root);
});
