import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateProjectAction,validateProjectActionRequest} from '../src/shared/project-actions.mjs';
import {inspectProjectActions,saveProjectAction,resolveProjectAction} from '../src/controller/project-actions.mjs';

const definition={id:'build',name:'Build site',cwd:'.',commands:{win32:'Write-Output windows',darwin:'printf mac',linux:'printf linux'},timeoutSeconds:120};
async function fixture(t){const root=await mkdtemp(path.join(tmpdir(),'muse-actions-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function manifest(root,actions=[definition]){await mkdir(path.join(root,'.musebench'),{recursive:true});await writeFile(path.join(root,'.musebench/actions.json'),JSON.stringify({version:1,actions}));}

test('actions validate portable choices and reject ambiguous or unbounded definitions',()=>{
 assert.deepEqual(validateProjectAction(definition),definition);
 for(const patch of [{id:'../outside'},{name:'x'.repeat(81)},{cwd:'../outside'},{cwd:'C:/outside'},{cwd:'\\\\server\\share'},{cwd:'a/../b'},{commands:{win32:'ok',other:'bad'}},{commands:{}},{commands:{win32:'a'.repeat(4001)}},{commands:{win32:'bad\0command'}},{timeoutSeconds:0},{timeoutSeconds:601},{timeoutSeconds:1.5},{autorun:true}])assert.throws(()=>validateProjectAction({...definition,...patch}));
 const {timeoutSeconds,...withoutTimeout}=definition;assert.equal(validateProjectAction(withoutTimeout).timeoutSeconds,120);
});
test('run and save requests carry exact identities and cannot override the reviewed command',()=>{
 const base={type:'runProjectAction',projectId:'project',taskId:'chat',revision:'a'.repeat(64),actionId:'build'};
 assert.deepEqual(validateProjectActionRequest(base),base);
 for(const patch of [{command:'something else'},{cwd:'/elsewhere'},{revision:'wrong'},{taskId:''},{actionId:'../a'}])assert.throws(()=>validateProjectActionRequest({...base,...patch}));
 assert.throws(()=>validateProjectActionRequest(Object.assign([],{...base})));
 assert.equal(validateProjectActionRequest({type:'saveProjectAction',projectId:'p',taskId:'t',revision:'b'.repeat(64),definition}).definition.name,'Build site');
});
test('opening a project does not create or execute actions; platform choice is explicit',async t=>{
 const root=await fixture(t),initial=await inspectProjectActions(root,{platform:'win32'});assert.deepEqual(initial.actions,[]);
 await assert.rejects(readFile(path.join(root,'.musebench/actions.json')),e=>e.code==='ENOENT');
 await manifest(root);
 for(const [platform,command,shell] of [['win32','Write-Output windows','Windows PowerShell'],['darwin','printf mac','/bin/sh'],['linux','printf linux','/bin/sh']]){
  const view=await inspectProjectActions(root,{platform});assert.equal(view.actions[0].command,command);assert.equal(view.actions[0].shell,shell);assert.equal(view.actions[0].folder,root);assert.equal(view.actions[0].supported,true);
 }
 await manifest(root,[{...definition,commands:{linux:'printf only-linux'}}]);const view=await inspectProjectActions(root,{platform:'win32'});assert.equal(view.actions[0].supported,false);await assert.rejects(resolveProjectAction(root,{revision:view.revision,actionId:'build'},{platform:'win32'}),/platform|Windows/i);
});
test('save is explicit, portable and rejects stale content instead of overwriting another edit',async t=>{
 const root=await fixture(t),before=await inspectProjectActions(root);await saveProjectAction(root,{revision:before.revision,definition});
 const bytes=await readFile(path.join(root,'.musebench/actions.json'),'utf8');assert.deepEqual(JSON.parse(bytes),{version:1,actions:[definition]});
 await assert.rejects(saveProjectAction(root,{revision:before.revision,definition:{...definition,name:'Stale edit'}}),/changed|review/i);assert.equal(await readFile(path.join(root,'.musebench/actions.json'),'utf8'),bytes);
 const view=await inspectProjectActions(root);await saveProjectAction(root,{revision:view.revision,definition:{...definition,name:'New name'}});assert.equal((await inspectProjectActions(root)).actions[0].name,'New name');
});
test('changed manifests, root identities and platforms invalidate reviewed actions',async t=>{
 const root=await fixture(t),other=await fixture(t);await manifest(root);await manifest(other);const view=await inspectProjectActions(root,{platform:'win32'});
 await assert.rejects(resolveProjectAction(other,{revision:view.revision,actionId:'build'},{platform:'win32'}),/changed|review/i);
 await assert.rejects(resolveProjectAction(root,{revision:view.revision,actionId:'build'},{platform:'linux'}),/changed|review/i);
 await manifest(root,[{...definition,commands:{win32:'Write-Output changed'}}]);await assert.rejects(resolveProjectAction(root,{revision:view.revision,actionId:'build'},{platform:'win32'}),/changed|review/i);
});
test('malformed, oversized and duplicate manifest data is rejected without replacement',async t=>{
 const root=await fixture(t);await manifest(root);const file=path.join(root,'.musebench/actions.json');
 for(const text of ['{bad',JSON.stringify({version:2,actions:[]}),JSON.stringify({version:1,actions:[definition,definition]}),' '.repeat(65537),JSON.stringify({version:1,actions:Array.from({length:51},(_,i)=>({...definition,id:'a'+i}))})]){
  await writeFile(file,text);await assert.rejects(inspectProjectActions(root));await assert.rejects(saveProjectAction(root,{revision:'a'.repeat(64),definition}));assert.equal(await readFile(file,'utf8'),text);
 }
});
test('working folders must exist inside the project and links cannot change their meaning',async t=>{
 const root=await fixture(t),outside=await fixture(t);await manifest(root,[{...definition,cwd:'missing'}]);await assert.rejects(inspectProjectActions(root),/folder|directory|ENOENT/i);
 await mkdir(path.join(root,'child'));await manifest(root,[{...definition,cwd:'child'}]);const view=await inspectProjectActions(root);assert.equal(view.actions[0].folder,path.join(root,'child'));
 await rm(path.join(root,'child'),{recursive:true});await symlink(outside,path.join(root,'child'),process.platform==='win32'?'junction':'dir');await assert.rejects(resolveProjectAction(root,{revision:view.revision,actionId:'build'}),/link|outside/i);
});
test('a linked configuration directory is never read or written',async t=>{
 const root=await fixture(t),outside=await fixture(t);await writeFile(path.join(outside,'actions.json'),JSON.stringify({version:1,actions:[definition]}));await symlink(outside,path.join(root,'.musebench'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(inspectProjectActions(root),/link/i);await assert.rejects(saveProjectAction(root,{revision:'a'.repeat(64),definition}),/link/i);assert.equal(JSON.parse(await readFile(path.join(outside,'actions.json'),'utf8')).actions[0].name,'Build site');
});
