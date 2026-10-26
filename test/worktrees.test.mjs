import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWorktreeService} from '../src/controller/worktrees.mjs';
import {createController} from '../src/controller/index.mjs';
const exec=promisify(execFile);
test('managed worktrees isolate committed base, preserve dirty source, survive reopen and validate branch/base',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-worktree-')),root=path.join(dir,'repo'),data=path.join(dir,'data');await mkdir(root);
 const git=async args=>(await exec('git',['-C',root,...args],{windowsHide:true})).stdout.trim();
 try{
 await git(['init']);await git(['config','user.name','Fixture']);await git(['config','user.email','fixture@example.invalid']);await writeFile(path.join(root,'file.txt'),'original');await git(['add','.']);await git(['commit','-m','Initial']);await writeFile(path.join(root,'file.txt'),'dirty');
 const service=createWorktreeService(data,{storageDir:path.join(dir,'worktrees')});const info=await service.inspect(root);assert.equal(info.dirty,true);
 await assert.rejects(service.create(root,{branch:'--bad',base:'HEAD'}),/branch/i);
 await assert.rejects(service.create(root,{branch:'muse/missing',base:'missing-ref'}),/base/i);
 const item=await service.create(root,{branch:'muse/test',base:'HEAD'});
 assert.equal(await readFile(path.join(item.path,'file.txt'),'utf8'),'original');assert.equal(await readFile(path.join(root,'file.txt'),'utf8'),'dirty');
 const reopened=await createWorktreeService(data,{storageDir:path.join(dir,'worktrees')}).inspect(root);assert.equal(reopened.items.length,1);assert.equal(reopened.items[0].branch,'muse/test');assert.equal(reopened.items[0].available,true);
 const legacy=await createWorktreeService(data).create(root,{branch:'muse/legacy'});assert.ok((await service.inspect(root)).items.some(row=>row.id===legacy.id));assert.equal((await service.open(root,legacy.id)).path,legacy.path);
 const controller=await createController({dataDir:data,projectsDir:dir});let state=await controller.dispatch({type:'openProject',path:root});const originalId=state.activeProject.id;
 state=await controller.dispatch({type:'openWorktree',projectId:originalId,id:item.id});assert.equal(state.error,null);assert.equal(state.activeProject.root,item.path);assert.equal(state.activeProject.worktree.branch,'muse/test');await controller.close();
 const restored=await createController({dataDir:data});try{assert.equal(restored.getState().activeProject.root,item.path);state=await restored.dispatch({type:'selectProject',id:originalId});assert.equal(state.activeProject.root,root);}finally{await restored.close();}
 await assert.rejects(service.create(root,{branch:'muse/test',base:'HEAD'}),/exists/i);
 }finally{await rm(dir,{recursive:true,force:true,maxRetries:3});}
});
