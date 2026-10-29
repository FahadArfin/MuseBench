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

function screenshotService(){
 const contents=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isCrashed:()=>false});
 const image={isEmpty:()=>false,getSize:()=>({width:800,height:600}),resize(){return this;},toJPEG:()=>Buffer.from('test image')};
 const window=Object.assign(new EventEmitter(),{webContents:contents,isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,capturePage:async()=>image});
 const service=createNativeControlService({app:{},window,controller:{},personal:{},renderer:{close(){}}});
 return{window,service,image};
}

test('screenshots reject hidden and minimized windows without returning stale pixels',async()=>{
 const {window,service}=screenshotService();
 try{
  window.isVisible=()=>false;
  await assert.rejects(service.call('screenshot',{}),/Open and restore MuseBench/);
  window.isVisible=()=>true;window.isMinimized=()=>true;
  await assert.rejects(service.call('screenshot',{}),/Open and restore MuseBench/);
  window.isMinimized=()=>false;
  assert.equal((await service.call('screenshot',{})).content[0].type,'image');
 }finally{service.close();}
});

test('screenshots discard a late image when the window is hidden during capture',async()=>{
 const {window,service,image}=screenshotService();let complete;
 window.capturePage=()=>new Promise(resolve=>{complete=resolve;});
 try{
  const pending=service.call('screenshot',{});const rejected=assert.rejects(pending,/Open and restore MuseBench/);
  window.isVisible=()=>false;window.emit('hide');complete(image);await rejected;
 }finally{service.close();}
});

test('cancelled screenshots discard late pixels and prevent overlapping native captures',async()=>{
 const {window,service,image}=screenshotService();let complete;
 const native=new Promise(resolve=>{complete=resolve;});window.capturePage=()=>native;
 try{
  const cancellation=new AbortController();
  const pending=service.call('screenshot',{},{signal:cancellation.signal});
  const cancelled=assert.rejects(pending,/cancelled/);cancellation.abort();
  const overlapping=assert.rejects(service.call('screenshot',{}),/still finishing/);
  complete(image);await Promise.all([cancelled,overlapping]);
  assert.equal((await service.call('screenshot',{})).content[0].type,'image');
 }finally{service.close();}
});

test('stalled screenshots expire before the host deadline and discard late pixels',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {window,service,image}=screenshotService();let complete;
 window.capturePage=()=>new Promise(resolve=>{complete=resolve;});
 try{
  const pending=service.call('screenshot',{});
  const expired=assert.rejects(pending,/capture timed out/);
  t.mock.timers.tick(7000);complete(image);await expired;
  assert.equal(window.listenerCount('hide'),0);
 }finally{service.close();}
});

test('closing app control cancels an active screenshot',async()=>{
 const {window,service,image}=screenshotService();let complete;
 window.capturePage=()=>new Promise(resolve=>{complete=resolve;});
 const pending=service.call('screenshot',{});const closed=assert.rejects(pending,/closed/);
 service.close();complete(image);await closed;
 await assert.rejects(service.call('screenshot',{}),/closed/);
});

test('screenshots reject a late native result even before an overdue timer runs',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);
 const {window,service,image}=screenshotService();let complete;
 window.capturePage=()=>new Promise(resolve=>{complete=resolve;});
 try{
  const pending=service.call('screenshot',{});const late=assert.rejects(pending,/capture timed out/);
  now=7000;complete(image);await late;
 }finally{service.close();}
});

test('service reports bounded real state without credentials, and reads only the requested chat',async()=>{
 const contents=new EventEmitter();contents.isDestroyed=()=>false;contents.isCrashed=()=>false;
 const window=Object.assign(new EventEmitter(),{webContents:contents,isVisible:()=>true,isMinimized:()=>false});let historyInput;
 const controller={getState:()=>({runtime:{status:'ready',binary:'PRIVATE_PATH',token:'PRIVATE_TOKEN'},tasks:[{id:'a',title:'Test',messages:['PRIVATE_TEXT']}]}),readChatHistory:input=>{historyInput=input;return{messages:[{id:'m',role:'assistant',text:'x'.repeat(6000)}],total:1};}};
 const service=createNativeControlService({app:{getVersion:()=> '1.2.3',isPackaged:true},window,controller,personal:{snapshot:()=>({destination:'bot',profile:{secret:'PRIVATE_TOKEN'},loading:true})},renderer:{close(){}}});
 const status=await service.call('app_status',{});assert.ok(!JSON.stringify(status).includes('PRIVATE_'));assert.equal(JSON.parse(status.content[0].text).personal.loading,true);
 const history=await service.call('read_chat',{taskId:'a',limit:10});assert.deepEqual(historyInput,{taskId:'a',limit:10});const message=JSON.parse(history.content[0].text).messages[0];assert.equal(message.text.length,3000);assert.equal(message.truncated,true);
 await assert.rejects(service.call('read_chat',{taskId:'a',path:'secret'}));
 contents.emit('console-message',{level:'error'},3,'PRIVATE_CONSOLE');
 window.emit('unresponsive');let diagnostics=JSON.parse((await service.call('diagnostics',{})).content[0].text);assert.equal(diagnostics.responsive,false);assert.ok(diagnostics.events.some(item=>item.kind==='renderer-console-error'));assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE_CONSOLE'));
 window.emit('responsive');diagnostics=JSON.parse((await service.call('diagnostics',{})).content[0].text);assert.equal(diagnostics.responsive,true);
 contents.isCrashed=()=>true;contents.emit('render-process-gone');diagnostics=JSON.parse((await service.call('diagnostics',{})).content[0].text);assert.equal(diagnostics.responsive,false);service.close();
});
