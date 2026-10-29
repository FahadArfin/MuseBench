import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNativeRenderer,createNativeControlService} from '../electron/native-control-service.mjs';

test('renderer requests reject wrong senders, expire on navigation and clean up on close',async()=>{
 const ipc=new EventEmitter(),contents=new EventEmitter();const handlers=new Map();ipc.handle=(name,fn)=>handlers.set(name,fn);ipc.removeHandler=name=>handlers.delete(name);contents.isDestroyed=()=>false;
 let request;contents.send=(_name,value)=>{request=value;};const window={webContents:contents,isDestroyed:()=>false};
 const renderer=createNativeRenderer({window,ipcMain:ipc,trusted:event=>event.source==='shell'});
 let settled=false;const pending=renderer.call('inspect_ui').then(value=>{settled=true;return value;});
 assert.equal(typeof handlers.get('musebench:native-claim'),'function');
 assert.equal(handlers.get('musebench:native-claim')({source:'remote'},request.id),false);
 assert.equal(handlers.get('musebench:native-claim')({source:'shell'},request.id),true);
 ipc.emit('musebench:native-reply',{source:'remote'},{id:request.id,result:'not trusted'});await new Promise(r=>setTimeout(r,10));assert.equal(settled,false);
 ipc.emit('musebench:native-reply',{source:'shell'},{id:request.id,result:{headings:['Settings']}});assert.deepEqual(await pending,{headings:['Settings']});
 const aborted=renderer.call('navigate',{target:'code'});const rejected=assert.rejects(aborted,/UI changed/);contents.emit('did-start-loading');await rejected;
 const controller=new AbortController(),active=renderer.call('inspect_ui',{},controller.signal);const cancelled=assert.rejects(active,/expired/);controller.abort();await cancelled;
 assert.equal(handlers.get('musebench:native-claim')({source:'shell'},request.id),false);
 renderer.close();assert.equal(ipc.listenerCount('musebench:native-reply'),0);await assert.rejects(renderer.call('inspect_ui'),/closed/);
});

test('service reports bounded real state without credentials, and reads only the requested chat',async()=>{
 const contents=new EventEmitter();contents.isDestroyed=()=>false;
 const window=Object.assign(new EventEmitter(),{webContents:contents,isVisible:()=>true,isMinimized:()=>false});let historyInput;
 const controller={getState:()=>({runtime:{status:'ready',binary:'PRIVATE_PATH',token:'PRIVATE_TOKEN'},tasks:[{id:'a',title:'Test',messages:['PRIVATE_TEXT']}]}),readChatHistory:input=>{historyInput=input;return{messages:[{id:'m',role:'assistant',text:'x'.repeat(6000)}],total:1};}};
 const service=createNativeControlService({app:{getVersion:()=> '1.2.3',isPackaged:true},window,controller,personal:{snapshot:()=>({destination:'bot',profile:{secret:'PRIVATE_TOKEN'},loading:true})},renderer:{close(){}}});
 const status=await service.call('app_status',{});assert.ok(!JSON.stringify(status).includes('PRIVATE_'));assert.equal(JSON.parse(status.content[0].text).personal.loading,true);
 const history=await service.call('read_chat',{taskId:'a',limit:10});assert.deepEqual(historyInput,{taskId:'a',limit:10});const message=JSON.parse(history.content[0].text).messages[0];assert.equal(message.text.length,3000);assert.equal(message.truncated,true);
 await assert.rejects(service.call('read_chat',{taskId:'a',path:'secret'}));
 contents.emit('console-message',{level:'error'},3,'PRIVATE_CONSOLE');
 window.emit('unresponsive');let diagnostics=JSON.parse((await service.call('diagnostics',{})).content[0].text);assert.equal(diagnostics.responsive,false);assert.ok(diagnostics.events.some(item=>item.kind==='renderer-console-error'));assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE_CONSOLE'));
 window.emit('responsive');diagnostics=JSON.parse((await service.call('diagnostics',{})).content[0].text);assert.equal(diagnostics.responsive,true);service.close();
});
