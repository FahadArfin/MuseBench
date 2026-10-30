import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBackgroundEngine} from '../electron/background-engine.mjs';
import {createNativeControlRouter} from '../electron/native-control-router.mjs';

async function fixture(t,overrides={}){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-background-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
 const f={dataDir,windows:1,opened:0,quits:0,blocked:0,busy:false,trays:[]};
 f.engine=await createBackgroundEngine({dataDir,windowOpen:()=>f.windows>0,openWindow:async()=>{f.opened++;f.windows=1;},quit:()=>f.quits++,isBusy:()=>f.busy,onBlocked:()=>f.blocked++,createTray:actions=>{const tray={actions,destroyed:false,destroy(){this.destroyed=true;}};f.trays.push(tray);return tray;},...overrides});
 t.after(()=>f.engine.close());return f;
}
test('background defaults off, persists explicit opt-in, and closes without ending its engine',async t=>{
 const f=await fixture(t);assert.equal(f.engine.snapshot().enabled,false);
 await f.engine.command({type:'set',enabled:true});assert.equal(f.trays.length,1);
 f.windows=0;f.engine.windowClosed();assert.equal(f.quits,0);assert.equal(f.engine.snapshot().windowOpen,false);
 await f.trays[0].actions.open();assert.equal(f.opened,1);assert.equal(f.engine.snapshot().windowOpen,true);
 assert.deepEqual(JSON.parse(await readFile(path.join(f.dataDir,'background-engine.json'),'utf8')),{version:1,enabled:true});
 await f.engine.close();assert.equal(f.trays[0].destroyed,true);
 const restored=await createBackgroundEngine({dataDir:f.dataDir,createTray:()=>({destroy(){}}),openWindow:async()=>{},quit(){},isBusy:()=>false,windowOpen:()=>true});
 assert.equal(restored.snapshot().enabled,true);await restored.close();
});
test('off closes normally, active or uncertain work rejects quit, idle tray quit remains explicit',async t=>{
 const f=await fixture(t);f.engine.windowClosed();assert.equal(f.quits,1);f.busy=true;
 let prevented=0;assert.equal(f.engine.beforeQuit({preventDefault(){prevented++;}}),false);assert.equal(prevented,1);assert.equal(f.blocked,1);
 f.busy=false;assert.equal(f.engine.beforeQuit({preventDefault(){prevented++;}}),true);
 await f.engine.command({type:'set',enabled:true});f.trays[0].actions.quit();assert.equal(f.quits,2);
});
test('tray and disk failure cannot strand a headless app or claim an enabled setting',async t=>{
 const f=await fixture(t,{createTray:()=>{throw Error('tray unavailable');}});
 await assert.rejects(f.engine.command({type:'set',enabled:true}),/background/i);assert.equal(f.engine.snapshot().enabled,false);
 const g=await fixture(t,{save:async()=>{throw Error('disk');}});
 await assert.rejects(g.engine.command({type:'set',enabled:true}));assert.equal(g.engine.snapshot().enabled,false);assert.equal(g.trays[0].destroyed,true);
});
test('disable reopens before removing the tray, rejects invalid input and serializes writes',async t=>{
 const f=await fixture(t);await f.engine.command({type:'set',enabled:true});f.windows=0;
 await Promise.all([f.engine.command({type:'set',enabled:false}),f.engine.command({type:'set',enabled:true})]);
 assert.equal(f.opened,1);assert.equal(f.engine.snapshot().enabled,true);assert.equal(f.trays[0].destroyed,true);assert.equal(f.trays[1].destroyed,false);
 await assert.rejects(f.engine.command({type:'set',enabled:'yes'}));await assert.rejects(f.engine.command({type:'status',extra:true}));
});
test('close during configuration waits for it and disposes the resulting tray once',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);let saves=0;
 const f=await fixture(t,{save:async()=>{saves++;await gate;}});
 const change=f.engine.command({type:'set',enabled:true});await new Promise(resolve=>setImmediate(resolve));
 let prevented=false;assert.equal(f.engine.beforeQuit({preventDefault(){prevented=true;}}),false);assert.equal(prevented,true);
 const closing=f.engine.close();release();await Promise.all([change,closing]);assert.equal(saves,1);assert.equal(f.trays[0].destroyed,true);assert.equal(f.engine.snapshot().running,false);
});
test('native router keeps read-only engine access with no view and never opens a hidden UI',async()=>{
 let view=null,blocked=false;const controller={getState:()=>({tasks:[{id:'saved',title:'Saved chat'}],runtime:{status:'idle'}}),readChatHistory:async()=>({total:0,messages:[]})};
 const router=createNativeControlRouter({app:{getVersion:()=> '0.2.0',isPackaged:true},controller,getView:()=>view,getBackground:()=>({enabled:true,windowOpen:false}),isBlocked:()=>blocked});
 const status=JSON.parse((await router.call('app_status',{})).content[0].text);assert.equal(status.engine.windowOpen,false);assert.equal(status.chats[0].id,'saved');assert.equal(status.personal.available,false);
 assert.equal(JSON.parse((await router.call('read_chat',{taskId:'saved'})).content[0].text).total,0);
 await assert.rejects(router.call('navigate',{target:'code'}),/Open MuseBench/);await assert.rejects(router.call('screenshot',{}),/Open MuseBench/);
 view={call:async()=>({content:[{type:'text',text:'{"visible":true}'}]})};assert.equal(JSON.parse((await router.call('inspect_ui',{})).content[0].text).visible,true);
 blocked=true;await assert.rejects(router.call('app_status',{}),/closing or updating/);
});
