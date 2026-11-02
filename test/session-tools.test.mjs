import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const temp=await import('../electron/temporary-chat.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const browser=await import('../electron/chat-browser.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const media=await import('../electron/session-media.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const owner=()=>({task:{id:'chat',projectId:'project',request:'MAIN_SECRET',messages:[{role:'user',text:'MAIN_SECRET'}],runOptions:{model:'muse-spark-1.3',reasoning:'high',approval:'ask'}},activeProject:{id:'project',root:process.cwd(),instructions:'Project rules'},runtime:{binary:'C:/muse.exe'},memories:''});
function fakeRuntime(){let state={status:'unavailable',messages:[],cleanup:'confirmed'};const listeners=new Set();return{inputs:[],connections:[],stops:0,snapshot:()=>structuredClone(state),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(p){state={...state,...p};for(const fn of listeners)fn(state);},async connect(p){this.connections.push(p);this.emit({status:'idle',permissionVerified:true});},async send(p){this.inputs.push(p);this.emit({status:'running',messages:[]});},async disconnect(){this.stops++;this.emit({status:'closed',cleanup:'confirmed'});}};}
const settle=()=>new Promise(r=>setTimeout(r,15));
test('temporary chat starts only on Send, receives no main history, and closes without a saved conversation',async()=>{
 let state=owner(),created=0;const rt=fakeRuntime(),service=temp.createTemporaryChat({getState:()=>state,runtimeFactory:()=>{created++;return rt;}});
 await service.command({type:'open',taskId:'chat'});assert.equal(created,0);
 await service.command({type:'send',taskId:'chat',text:'A separate question'});await settle();assert.equal(rt.inputs.length,1);assert.equal(rt.inputs[0].mode,'plan');assert.doesNotMatch(rt.inputs[0].text,/MAIN_SECRET/);assert.match(rt.inputs[0].text,/Project rules/);assert.equal(rt.connections[0].fullAccess,false);
 rt.emit({status:'completed',messages:[{id:'answer',kind:'agentMessage',text:'Side answer'}],cleanup:'confirmed'});assert.match(JSON.stringify(service.snapshot()),/Side answer/);assert.deepEqual(state.task.messages,[{role:'user',text:'MAIN_SECRET'}]);
 await service.command({type:'close',taskId:'chat'});assert.equal(service.snapshot().messages.length,0);assert.equal(rt.stops,1);assert.equal(service.isBusy(),false);
});
test('temporary chat cancels owner changes and a late connection cannot submit to the new owner',async()=>{
 let state=owner(),resolve;const rt=fakeRuntime();rt.connect=()=>new Promise(r=>resolve=r);const service=temp.createTemporaryChat({getState:()=>state,runtimeFactory:()=>rt});
 await service.command({type:'open',taskId:'chat'});await service.command({type:'send',taskId:'chat',text:'Question'});state={...state,task:{...state.task,id:'other'}};await service.reconcile();resolve();await settle();assert.equal(rt.inputs.length,0);assert.equal(service.snapshot().messages.length,0);await assert.rejects(service.command({type:'send',taskId:'chat',text:'Wrong owner'}),/chat/i);await service.close();
});
class Contents extends EventEmitter{constructor(){super();this.session={setPermissionRequestHandler:fn=>this.permissions=fn,setPermissionCheckHandler:()=>{}};this.navigationHistory={canGoBack:()=>false,canGoForward:()=>false};}setWindowOpenHandler(fn){this.popups=fn;}async loadURL(url){this.url=url;this.emit('did-navigate',{},url);}getURL(){return this.url??'';}getTitle(){return 'Page';}isDestroyed(){return this.closed;}close(){this.closed=true;}reload(){}stop(){}}
test('internal browser is isolated, bounded and disposed on owner change',async()=>{
 let state=owner(),view;class View{constructor(options){this.options=options;this.webContents=new Contents();view=this;}setBounds(rect){this.bounds=rect;}setVisible(value){this.visible=value;}}
 let zoom=1;const window={webContents:{getZoomFactor:()=>zoom},contentView:{addChildView(){},removeChildView(){}},getContentBounds:()=>({width:1000,height:700})};
 const service=browser.createChatBrowser({window,WebContentsView:View,getState:()=>state});
 await assert.rejects(service.command({type:'open',taskId:'chat',url:'file:///secret'}),/HTTP/);
 await service.command({type:'open',taskId:'chat',url:'https://example.com'});assert.equal(view.options.webPreferences.sandbox,true);assert.equal(view.options.webPreferences.nodeIntegration,false);assert.equal(view.options.webPreferences.preload,undefined);assert.ok(!view.options.webPreferences.partition.startsWith('persist:'));
 await service.command({type:'bounds',taskId:'chat',rect:{x:100,y:100,width:300,height:300},visible:true});assert.equal(view.visible,true);assert.equal(view.webContents.popups({url:'https://other.com'}).action,'deny');let permission;view.webContents.permissions(null,'camera',value=>permission=value);assert.equal(permission,false);
 zoom=1.25;await service.command({type:'bounds',taskId:'chat',rect:{x:100,y:100,width:300,height:300},visible:true});assert.deepEqual(view.bounds,{x:125,y:125,width:375,height:375});
 let prevented=false;view.webContents.emit('will-navigate',{preventDefault(){prevented=true;}},'javascript:alert(1)');assert.equal(prevented,true);
 state={...state,task:{...state.task,id:'other'}};service.reconcile();assert.equal(view.webContents.closed,true);await assert.rejects(service.command({type:'reload',taskId:'chat'}),/chat/i);service.close();
});
test('gallery reads only chat uploads or captured matching images and rejects changed files and escapes',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'musebench-gallery-'));t.after(()=>rm(root,{recursive:true,force:true}));const bytes=Buffer.from('89504e470d0a1a0a00000000','hex'),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(path.join(root,'created.png'),bytes);
 let state=owner();state.activeProject.root=root;const uploaded={id:'a'.repeat(64),name:'upload.png',mime:'image/png',bytes:bytes.length};state.task.messages=[{role:'user',images:[uploaded]}];
 let historyReads=0;const changes=[{path:'created.png',afterHash:hash,status:'added',runId:'run'}];const service=media.createSessionMedia({getState:()=>state,readHistory:async()=>{historyReads++;return{messages:state.task.messages};},capturedImages:()=>changes,readUpload:async()=>`data:image/png;base64,${bytes.toString('base64')}`,thumbnail:bytes=>`data:image/png;base64,${bytes.toString('base64')}`});
 const list=await service.command({type:'list',taskId:'chat'});assert.deepEqual(list.items.map(x=>x.kind),['uploaded','created']);const item=list.items[1];assert.match((await service.command({type:'read',taskId:'chat',id:item.id})).dataUrl,/^data:image\/png;base64,/);
 assert.equal(historyReads,1);
 await writeFile(path.join(root,'created.png'),'changed');await assert.rejects(service.command({type:'read',taskId:'chat',id:item.id}),/changed|image/i);await assert.rejects(service.command({type:'read',taskId:'other',id:item.id}),/chat/i);
 changes.push({path:'../escape.png',afterHash:hash,status:'added'});assert.equal((await service.command({type:'list',taskId:'chat'})).items.some(x=>x.path==='../escape.png'),false);
});

test('side chat ignores previous native output, bounds history and retains it on Stop',async()=>{
 const rt=fakeRuntime(),service=temp.createTemporaryChat({getState:owner,runtimeFactory:()=>rt});
 await service.command({type:'send',taskId:'chat',text:'First'});await settle();
 const first={id:'first',kind:'agentMessage',text:'First answer'};rt.emit({status:'completed',messages:[first]});
 rt.send=async function(p){this.inputs.push(p);this.emit({status:'running',messages:[first]});};
 await service.command({type:'send',taskId:'chat',text:'Second'});await settle();
 assert.equal(service.snapshot().messages.filter(m=>m.text==='First answer').length,1);
 rt.emit({status:'running',messages:[first,...Array.from({length:50},(_,i)=>({id:'new'+i,kind:'agentMessage',text:'More '+i}))]});
 assert.ok(service.snapshot().messages.length<=40);
 const before=service.snapshot().messages;await service.command({type:'stop',taskId:'chat'});
 assert.deepEqual(service.snapshot().messages,before);assert.equal(service.snapshot().busy,false);
 await service.close();assert.deepEqual(service.snapshot().messages,[]);
});
test('unconfirmed native cleanup blocks new side work and remains an update blocker',async()=>{
 const rt=fakeRuntime(),service=temp.createTemporaryChat({getState:owner,runtimeFactory:()=>rt});
 await service.command({type:'send',taskId:'chat',text:'Question'});await settle();rt.emit({status:'failed',cleanup:'unconfirmed'});
 assert.equal(service.isBusy(),true);
 await assert.rejects(service.command({type:'send',taskId:'chat',text:'Another'}),/cleanup/i);
 rt.disconnect=async()=>{};await assert.rejects(service.close(),/cleanup/i);assert.equal(service.isBusy(),true);
 rt.disconnect=async()=>rt.emit({cleanup:'confirmed'});await service.close();assert.equal(service.isBusy(),false);
});

test('main renderer reload closes native session tools while in-page and subframe navigation do not',async()=>{
 const {bindSessionToolsNavigation}=await import('../electron/session-tools-lifecycle.mjs');const wc=new EventEmitter();let browsers=0,sides=0;
 const detach=bindSessionToolsNavigation(wc,{browser:{close(){browsers++;}},sideChat:{async close(){sides++;}}});
 wc.emit('did-start-navigation',{},'https://example.com',false,false);wc.emit('did-start-navigation',{},'#hash',true,true);assert.equal(browsers,0);
 wc.emit('did-start-navigation',{},'app://reload',false,true);assert.equal(browsers,1);assert.equal(sides,1);
 detach();wc.emit('did-start-navigation',{},'app://reload',false,true);assert.equal(browsers,1);
});
