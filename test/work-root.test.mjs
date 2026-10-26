import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {workDataDirectory} from '../electron/work-root.mjs';
import {createWorkService} from '../src/work/index.mjs';
test('trusted app data aliases resolve before strict Work path validation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'musebench-root-')),physical=path.join(root,'physical'),alias=path.join(root,'roaming-alias');let service;
 try{
  await mkdir(physical);await symlink(physical,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(createWorkService({dataDir:path.join(alias,'work'),projectsDir:path.join(root,'projects')}),/link|junction/);
  const dataDir=await workDataDirectory(alias);assert.equal(dataDir,path.join(physical,'work'));
  service=await createWorkService({dataDir,projectsDir:path.join(root,'projects')});const result=await service.dispatch({type:'create',team:'analytics',kind:'document',title:'Alias fixture',brief:'Draft only'});assert.equal(result.error,null);assert.equal(result.items.length,1);
 }finally{await service?.close();await rm(root,{recursive:true,force:true});}
});
