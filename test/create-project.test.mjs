import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {validateAction} from '../electron/security.mjs';
const action={type:'createProject',name:'My Project',goals:'Build a useful app',context:'Keep it accessible.'};
async function fixture(){await mkdir('artifacts/create-project-tests',{recursive:true});const root=await mkdtemp(path.resolve('artifacts/create-project-tests/run-'));const options={dataDir:path.join(root,'data'),projectsDir:path.join(root,'working-copies'),newProjectsDir:path.join(root,'Documents','MuseBench')};return {root,options,c:await createController(options)};}
test('creates a real named project with persistent instructions, no empty chat, and no changes to working-copy storage',async()=>{
 const {c,options}=await fixture();try{const next=await c.dispatch(action);assert.equal(next.error,null);assert.equal(next.activeProject.name,action.name);assert.equal(next.activeProject.root,path.join(options.newProjectsDir,action.name));assert.equal(next.task,null);assert.equal(next.tasks.length,0);assert.match(next.activeProject.instructions,/Keep it accessible/);assert.match(await readFile(path.join(next.activeProject.root,'README.md'),'utf8'),/Build a useful app/);assert.equal(next.projectCreationRoot,options.newProjectsDir);}finally{await c.close();}
 const restored=await createController(options);try{assert.equal(restored.getState().projects.length,1);assert.match(restored.getState().activeProject.instructions,/Keep it accessible/);}finally{await restored.close();}
});
test('rejects collisions without overwriting or registering existing folders',async()=>{
 const {c,options}=await fixture();try{await mkdir(path.join(options.newProjectsDir,'My Project'),{recursive:true});await writeFile(path.join(options.newProjectsDir,'My Project','README.md'),'keep me');const next=await c.dispatch({...action,name:'my project'});assert.match(next.error,/already exists/);assert.equal(next.projects.length,0);assert.equal(await readFile(path.join(options.newProjectsDir,'My Project','README.md'),'utf8'),'keep me');}finally{await c.close();}
});
test('rejects traversal and Windows device names at IPC and controller boundaries',async()=>{
 const {c}=await fixture();try{for(const name of ['../escape','..','/absolute','C:\\bad','foo/bar','foo\\bar','CON','NUL.txt','COM1','LPT2.md','hidden.','x:y','']){assert.throws(()=>validateAction({...action,name}));assert((await c.dispatch({...action,name})).error,name);}assert.equal(c.getState().projects.length,0);}finally{await c.close();}
});
test('refuses a junction as the new-project storage directory',async()=>{
 const {c,root,options}=await fixture();try{await mkdir(path.dirname(options.newProjectsDir),{recursive:true});const outside=path.join(root,'outside');await mkdir(outside);await symlink(outside,options.newProjectsDir,'junction');const next=await c.dispatch(action);assert.match(next.error,/symbolic links or junctions/);assert.deepEqual(await readdir(outside),[]);}finally{await c.close();}
});
