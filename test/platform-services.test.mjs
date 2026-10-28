import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {createOnboarding} from '../electron/onboarding.mjs';
import {createCommandInfo} from '../electron/command-info.mjs';
import {createCustomize} from '../electron/customize.mjs';
import {createFileEditor} from '../electron/file-editor.mjs';
import {createDictation} from '../electron/dictation.mjs';
import {isolatedDesktopEnvironment} from '../scripts/isolated-desktop-environment.mjs';

test('POSIX Muse inherits its login home and locale without unrelated secrets or Node hooks',()=>{
 const env=curateEnvironment({HOME:'/home/muse',TMPDIR:'/tmp/muse',LANG:'en_US.UTF-8',XDG_CONFIG_HOME:'/home/muse/.config',NODE_OPTIONS:'--require evil',PRIVATE_KEY:'secret',PATH:'/usr/bin'});
 assert.deepEqual(env,{PATH:'/usr/bin',HOME:'/home/muse',TMPDIR:'/tmp/muse',LANG:'en_US.UTF-8',XDG_CONFIG_HOME:'/home/muse/.config'});
});
test('a GUI launch finds the official user-local Muse binary when PATH is minimal',async t=>{
 const home=await mkdtemp(path.join(tmpdir(),'muse-platform-'));t.after(()=>rm(home,{recursive:true,force:true}));
 await mkdir(path.join(home,'.local','bin'),{recursive:true});const binary=path.join(home,'.local','bin','muse');await writeFile(binary,'fixture');
 assert.deepEqual(discoverMuseBinaries({platform:'linux',environment:{HOME:home,PATH:''}}),[binary]);
});
test('native POSIX sign-in launches the executable with separate arguments and reaches ready',async()=>{
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={on(){},end(){}};child.kill=()=>{};
 const service=createOnboarding({platform:'darwin',getBinary:()=>path.resolve('muse'),personal:{checkLogin:async()=>({status:'required'})},spawnProcess:(binary,args,opts)=>{assert.equal(binary,path.resolve('muse'));assert.deepEqual(args,['login']);assert.equal(opts.shell,false);return child;}});
 try {assert.equal((await service.command({type:'loginCode'})).code.status,'pending');child.emit('close',0);assert.equal((await service.command({type:'status'})).code.status,'ready');}finally{service.close();}
});
test('POSIX skills queries and Customize work with HOME and a native executable',async t=>{
 const home=await mkdtemp(path.join(tmpdir(),'muse-platform-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const getState=()=>({runtime:{binary:path.join(home,'muse')}});
 const info=createCommandInfo({platform:'linux',getState,run:async(binary,args)=>{assert.deepEqual(args,['skills','list','--json']);return{stdout:JSON.stringify({skills:[{id:'review',name:'Review',activation:'on'}]})};}});
 assert.equal((await info('skills')).skills[0]?.id,'review');
 const customize=createCustomize({platform:'linux',environment:{HOME:home},dataDir:home,getState});assert.ok(customize);await customize.close();
});
test('a macOS editor bundle opens only the bound project file using separate open arguments',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-platform-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bundle=path.join(root,'Editor.app');await mkdir(bundle);await writeFile(path.join(root,'code.ts'),'hello');let launched;
 const service=createFileEditor({platform:'darwin',dataDir:root,candidates:[],getState:()=>({activeProject:{root},task:{id:'t',changes:[{path:'code.ts'}]}}),choose:async()=>bundle,launch:async(...args)=>{launched=args;}});
 assert.deepEqual(await service({taskId:'t',path:'code.ts'}),{opened:true});assert.deepEqual(launched,['/usr/bin/open',['-a',bundle,path.join(root,'code.ts')]]);
});
test('POSIX dictation never probes a Windows executable',async()=>{
 let calls=0;const service=createDictation({platform:'linux',helperPath:'windows-only.exe',probe:async()=>{calls++;throw Error('wrong platform');}});
 const state=await service.dispatch('status');assert.equal(state.available,false);assert.equal(calls,0);await service.close();
});
test('POSIX package launch evidence cannot inherit or invent Windows profile variables',()=>{
 const env=isolatedDesktopEnvironment('/isolated',{platform:'linux',source:{USERPROFILE:'windows',userprofile:'windows',LOCALAPPDATA:'windows',APPDATA:'windows',HOMEDRIVE:'C:',HOME:'/real',XDG_CONFIG_HOME:'/real/config',PATH:'/usr/bin',ELECTRON_RUN_AS_NODE:'1'}});
 for(const key of ['USERPROFILE','userprofile','LOCALAPPDATA','APPDATA','HOMEDRIVE','ELECTRON_RUN_AS_NODE'])assert.equal(env[key],undefined);
 assert.equal(env.HOME,'/isolated');assert.equal(env.XDG_CONFIG_HOME,path.join('/isolated','.config'));assert.equal(env.PATH,'/usr/bin');
});
