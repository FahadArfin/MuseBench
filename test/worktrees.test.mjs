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
test('worktree archive snapshots dirty files without changing index or deleting ignored data, then recovers separately',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-worktree-archive-')),root=path.join(dir,'repo'),data=path.join(dir,'data');await mkdir(root);const git=async(root,args)=>(await exec('git',['-C',root,...args],{windowsHide:true})).stdout.trim();
 try{await git(root,['init']);await git(root,['config','user.name','Fixture']);await git(root,['config','user.email','fixture@example.invalid']);await writeFile(path.join(root,'.gitignore'),'ignored.txt\n');await writeFile(path.join(root,'file.txt'),'base');await git(root,['add','.']);await git(root,['commit','-m','Initial']);const service=createWorktreeService(data),w=await service.create(root,{branch:'muse/archive'});
 await writeFile(path.join(w.path,'file.txt'),'staged');await git(w.path,['add','file.txt']);await writeFile(path.join(w.path,'file.txt'),'working');await writeFile(path.join(w.path,'new.txt'),'untracked');await writeFile(path.join(w.path,'ignored.txt'),'retained dependency');const index=await git(w.path,['diff','--cached']);
 const archived=await service.archive(root,w.id);assert.equal(archived.status,'archived');assert.match(archived.archiveCommit,/^[a-f0-9]{40,64}$/);assert.equal(await git(w.path,['diff','--cached']),index);assert.equal(await readFile(path.join(w.path,'ignored.txt'),'utf8'),'retained dependency');assert.equal((await service.inspect(root)).items[0].status,'archived');
 const recovered=await service.recover(root,w.id,'muse/recovered');assert.notEqual(recovered.path,w.path);assert.equal(await readFile(path.join(recovered.path,'file.txt'),'utf8'),'working');assert.equal(await readFile(path.join(recovered.path,'new.txt'),'utf8'),'untracked');await assert.rejects(readFile(path.join(recovered.path,'ignored.txt')),/ENOENT/);assert.equal((await service.restore(root,w.id)).status,'ready');
 await git(root,['worktree','lock',w.path]);await assert.rejects(service.archive(root,w.id),/locked/i);await git(root,['worktree','unlock',w.path]);await writeFile(path.join(w.path,'.gitmodules'),'[submodule "x"]');await assert.rejects(service.archive(root,w.id),/submodule/i);
 }finally{await rm(dir,{recursive:true,force:true,maxRetries:3});}
});
test('worktree setup executes an explicitly selected project script in the isolated checkout',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-worktree-setup-')),root=path.join(dir,'repo'),data=path.join(dir,'data');await mkdir(root);let c;
 const git=async args=>exec('git',['-C',root,...args],{windowsHide:true});
 try{await git(['init']);await git(['config','user.name','Fixture']);await git(['config','user.email','fixture@example.invalid']);await writeFile(path.join(root,'package.json'),JSON.stringify({name:'setup-fixture',scripts:{setup:`node -e "require('fs').writeFileSync('setup-proof.txt','ready')"`}}));await git(['add','.']);await git(['commit','-m','Initial']);c=await createController({dataDir:data});let s=await c.dispatch({type:'openProject',path:root});s=await c.dispatch({type:'createWorktree',projectId:s.activeProject.id,branch:'muse/setup',base:'HEAD'});assert.equal(s.error,null);const isolated=s.activeProject.root;
 s=await c.dispatch({type:'setupWorktree',projectId:s.activeProject.id,script:'setup'});assert.equal(s.error,null);const taskId=s.task.id;const until=Date.now()+10000;while(c.getState().task.check.status==='running'&&Date.now()<until)await new Promise(r=>setTimeout(r,30));s=c.getState();assert.equal(s.task.check.exitCode,0);assert.equal(await readFile(path.join(isolated,'setup-proof.txt'),'utf8'),'ready');await assert.rejects(readFile(path.join(root,'setup-proof.txt')),/ENOENT/);await c.close();c=await createController({dataDir:data});assert.equal(c.getState().task.id,taskId);assert.equal(c.getState().activeProject.worktree.branch,'muse/setup');
 }finally{await c?.close();await rm(dir,{recursive:true,force:true,maxRetries:3});}
});
