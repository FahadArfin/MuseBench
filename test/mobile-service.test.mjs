import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {createMobileService} from '../electron/mobile-service.mjs';
test('mobile messages and stop remain bound when desktop navigation changes the selected chat',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-mobile-service-')),project=path.join(root,'project');await mkdir(project);await writeFile(path.join(project,'a.txt'),'hello');
 const sent=[];let stops=0;const runtime={snapshot:()=>({status:'idle',permissionVerified:true,messages:[]}),subscribe:()=>()=>{},send:async value=>sent.push(value.text),disconnect:async()=>{stops++;}};
 const controller=await createController({dataDir:path.join(root,'data'),runtime});t.after(async()=>{await controller.close();await rm(root,{recursive:true,force:true});});
 await controller.dispatch({type:'openProject',path:project});const first=(await controller.dispatch({type:'newTask',mode:'muse',request:'First'})).task.id;
 const second=(await controller.dispatch({type:'newTask',mode:'muse',request:'Second'})).task.id,service=createMobileService({controller});
 await assert.rejects(service.command({kind:'send',taskId:first,text:'wrong chat'}),/changed|select/i);
 const before=stops;await assert.rejects(service.command({kind:'stop',taskId:first}),/changed|select/i);assert.equal(stops,before);assert.equal(sent.length,0);
 await service.command({kind:'select',taskId:first});await service.command({kind:'send',taskId:first,text:'Correct message'});assert.equal(sent.length,1);assert.match(sent[0],/Correct message/);
 const view=service.snapshot();assert.equal(view.selectedTaskId,first);assert.equal(view.chats.some(c=>c.id===second),true);assert.ok(!JSON.stringify(view).includes(project));
 assert.ok(service.readChat({taskId:first}).messages.some(m=>m.text==='Correct message'));
 await assert.rejects(service.command({kind:'select',taskId:'missing'}));
});

test('an admitted controller send with uncertain runtime outcome reaches mobile as unknown',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-mobile-unknown-')),project=path.join(root,'project');await mkdir(project);
 const runtime={snapshot:()=>({status:'idle',permissionVerified:true,messages:[]}),subscribe:()=>()=>{},send:async()=>{throw Error('Command timeout; outcome uncertain');},disconnect:async()=>{}};
 const controller=await createController({dataDir:path.join(root,'data'),runtime});t.after(async()=>{await controller.close();await rm(root,{recursive:true,force:true});});
 await controller.dispatch({type:'openProject',path:project});const taskId=(await controller.dispatch({type:'newTask',mode:'muse',request:'Uncertain'})).task.id;
 const service=createMobileService({controller});
 await assert.rejects(service.command({kind:'send',taskId,text:'Do not replay an uncertain send'}),error=>error.outcome==='unknown');
 assert.ok(controller.getState().task.executionReceipts.some(receipt=>receipt.result==='unknown'));
});
