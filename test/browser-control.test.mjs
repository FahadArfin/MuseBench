import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createChatBrowser} from '../electron/chat-browser.mjs';

const target={selector:'html > body:nth-of-type(1) > button:nth-of-type(1)',tag:'button',title:'Fixture',text:'Continue',rect:{x:0.1,y:0.1,width:0.3,height:0.1}};
function fixture(){
 let state={task:{id:'chat',projectId:'p'},activeProject:{id:'p',root:process.cwd()}},view;
 class Contents extends EventEmitter{
  constructor(){super();this.debugger=new EventEmitter();this.debugger.attach=()=>{};this.debugger.isAttached=()=>true;this.debugger.sendCommand=async(method,args)=>{this.protection={method,args};};this.session={setPermissionRequestHandler(){},setPermissionCheckHandler(){}};this.navigationHistory={canGoBack:()=>false,canGoForward:()=>false};this.inputs=[];}
  setWindowOpenHandler(){} async loadURL(url){this.url=url;this.emit('did-navigate',{},url);}getURL(){return this.url;}getTitle(){return 'Fixture';}isDestroyed(){return false;}close(){}async executeJavaScript(script){return script.includes('"type":"guard"')?{x:200,y:90}:script.includes('"type":"insert"')?{completed:true}:structuredClone(target);}async capturePage(){return {getSize:()=>({width:800,height:600}),toDataURL:()=> 'data:image/png;base64,aGVsbG8='};}sendInputEvent(event){this.inputs.push(event);}async insertText(text){this.typed=text;}
 }
 class View{constructor(){this.webContents=new Contents();view=this;}setVisible(value){this.visible=value;}setBounds(){}}
 const browser=createChatBrowser({window:{isVisible:()=>true,getContentBounds:()=>({width:800,height:600}),contentView:{addChildView(){},removeChildView(){}}},WebContentsView:View,getState:()=>state});
 const open=async()=>{await browser.command({type:'open',taskId:'chat',url:'http://localhost:4000'});await browser.command({type:'bounds',taskId:'chat',visible:true,rect:{x:0,y:0,width:800,height:600}});};
 return {browser,open,view:()=>view,foreign(){state={...state,task:{...state.task,id:'foreign'}};}};
}
test('browser capture selection remains document bound and control requires explicit current visible chat',async()=>{
 const h=fixture();await h.open();assert.equal(h.browser.snapshot().controlEnabled,false);
 await assert.rejects(h.browser.agentCommand({taskId:'chat',root:process.cwd()},{type:'status'}),/disabled/i);
 const capture=(await h.browser.command({type:'capture',taskId:'chat'})).capture;assert.match(capture.imageDataUrl,/^data:image\/png/);
 const selected=await h.browser.command({type:'inspect',taskId:'chat',token:capture.token,x:.2,y:.15});assert.deepEqual(selected.selection.target,target);
 await h.browser.command({type:'control',taskId:'chat',enabled:true});
 const inspected=await h.browser.agentCommand({taskId:'chat',root:process.cwd()},{type:'inspect',x:.2,y:.15});
 await h.browser.agentCommand({taskId:'chat',root:process.cwd()},{type:'click',documentId:inspected.documentId,ref:inspected.ref});assert.equal(h.view().webContents.inputs.at(-1).type,'mouseUp');
 h.view().webContents.emit('did-navigate',{},'http://localhost:4000/next');
 await assert.rejects(h.browser.command({type:'inspect',taskId:'chat',token:capture.token,x:.2,y:.15}),/changed|stale/i);
 await assert.rejects(h.browser.agentCommand({taskId:'chat',root:process.cwd()},{type:'click',documentId:inspected.documentId,ref:inspected.ref}),/changed|stale/i);
 await h.browser.command({type:'bounds',taskId:'chat',visible:false,rect:{x:0,y:0,width:800,height:600}});
 await assert.rejects(h.browser.agentCommand({taskId:'chat',root:process.cwd()},{type:'status'}),/visible|hidden/i);
 h.foreign();await assert.rejects(h.browser.agentCommand({taskId:'chat',root:process.cwd()},{type:'status'}),/chat/i);
});
test('late page capture is discarded after ownership changes',async()=>{
 const h=fixture();await h.open();let resolve;h.view().webContents.capturePage=()=>new Promise(r=>resolve=r);
 const capture=h.browser.command({type:'capture',taskId:'chat'});h.foreign();resolve({getSize:()=>({width:800,height:600}),toDataURL:()=> 'data:image/png;base64,aGVsbG8='});await assert.rejects(capture,/changed|chat/i);
});
test('browser control fails closed if file chooser interception is unavailable or detached',async()=>{
 const h=fixture();await h.open();h.view().webContents.debugger.sendCommand=async()=>{throw Error('unsupported');};
 await assert.rejects(h.browser.command({type:'control',taskId:'chat',enabled:true}),/file|control|protection/i);assert.equal(h.browser.snapshot().controlEnabled,false);
 h.view().webContents.debugger.sendCommand=async()=>{};await h.browser.command({type:'control',taskId:'chat',enabled:true});h.view().webContents.debugger.emit('detach');assert.equal(h.browser.snapshot().controlEnabled,false);
});
test('a revoked runtime lease cannot dispatch a mouse event after an asynchronous DOM read',async()=>{
 const h=fixture();await h.open();await h.browser.command({type:'control',taskId:'chat',enabled:true});let live=true;
 const binding={taskId:'chat',root:process.cwd(),isCurrent:()=>live},selected=await h.browser.agentCommand(binding,{type:'inspect',x:.2,y:.2});
 const original=h.view().webContents.executeJavaScript;h.view().webContents.executeJavaScript=async script=>{const result=await original(script);if(script.includes('"type":"guard"'))live=false;return result;};
 await assert.rejects(h.browser.agentCommand(binding,{type:'click',documentId:selected.documentId,ref:selected.ref}),/connection|changed/i);assert.equal(h.view().webContents.inputs.length,0);
});


test('discarding a pending element keeps the capture available for another selection',async()=>{
 const h=fixture();await h.open();const capture=(await h.browser.command({type:'capture',taskId:'chat'})).capture;
 const one=await h.browser.command({type:'inspect',taskId:'chat',token:capture.token,x:.2,y:.2});
 await h.browser.command({type:'discard',taskId:'chat',token:one.selection.token});
 const two=await h.browser.command({type:'inspect',taskId:'chat',token:capture.token,x:.3,y:.2});
 const saved=await h.browser.command({type:'feedback',taskId:'chat',token:two.selection.token,note:'Keep this note'});assert.equal(saved.annotation.note,'Keep this note');
 await h.browser.command({type:'discard',taskId:'chat',token:capture.token});
 await assert.rejects(h.browser.command({type:'inspect',taskId:'chat',token:capture.token,x:.2,y:.2}),/changed/i);
});
