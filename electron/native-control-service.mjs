import {randomUUID} from 'node:crypto';
import {validateNativeCall} from '../src/shared/native-control.mjs';
const textResult=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const clean=(value,max=240)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max):'';
function createScreenshotCapture(window){
 const contents=window.webContents;
 let closed=false,inFlight=false,cancel=null;
 const unavailable=()=>{
  if(closed||window.isDestroyed()||contents.isDestroyed())return Error('The MuseBench window is closed.');
  if(!window.isVisible()||window.isMinimized())return Error('Open and restore MuseBench before taking a screenshot.');
  return null;
 };
 return{capture(signal){
  const error=unavailable();if(error)return Promise.reject(error);
  if(signal?.aborted)return Promise.reject(Error('Screenshot request was cancelled.'));
  if(inFlight)return Promise.reject(Error('A screenshot is still finishing. Try again when it completes.'));
  inFlight=true;
  const deadline=performance.now()+6000;
  const timedOut=()=>Error('The app capture timed out. Try again when MuseBench is ready.');
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,image)=>{
    if(settled)return;settled=true;clearTimeout(timer);cancel=null;
    signal?.removeEventListener('abort',abort);
    for(const event of ['hide','minimize','closed'])window.removeListener(event,changed);
    for(const event of ['did-start-loading','render-process-gone','destroyed'])contents.removeListener(event,changed);
    if(error)reject(error);else resolve(image);
   };
   const abort=()=>finish(Error('Screenshot request was cancelled.'));
   const changed=()=>finish(unavailable()??Error('The app changed during capture. Inspect it before trying again.'));
   const timer=setTimeout(()=>finish(timedOut()),6000);
   cancel=()=>finish(Error('The MuseBench window is closed.'));
   signal?.addEventListener('abort',abort,{once:true});
   for(const event of ['hide','minimize','closed'])window.on(event,changed);
   for(const event of ['did-start-loading','render-process-gone','destroyed'])contents.on(event,changed);
   // Electron cannot cancel capturePage. Retain the single-capture lock until
   // it settles, even if the caller has already cancelled or timed out.
   try{Promise.resolve(window.capturePage()).then(image=>{
    inFlight=false;if(!settled)finish(performance.now()>=deadline?timedOut():unavailable(),image);
   },()=>{inFlight=false;finish(Error('The app could not capture a screenshot.'));});}
   catch{inFlight=false;finish(Error('The app could not capture a screenshot.'));}
  });
 },close(){closed=true;cancel?.();}};
}
export function createNativeRenderer({window,ipcMain,trusted}){
 const contents=window.webContents;
 const pending=new Map();let closed=false;
 const receive=(event,value)=>{
  if(!trusted(event)||!value||typeof value.id!=='string')return;
  const item=pending.get(value.id);if(!item?.claimed)return;
  if(Buffer.byteLength(JSON.stringify(value))>160000)return item.finish(Error('UI response exceeded its limit.'));
  item.finish(value.error?Error('The app could not complete this UI request.'):null,value.result);
 };
 ipcMain.on('musebench:native-reply',receive);
 ipcMain.handle('musebench:native-claim',(event,id)=>{
  const item=typeof id==='string'?pending.get(id):null;
  if(!trusted(event)||!item||item.claimed||Date.now()>item.deadline||item.signal?.aborted)return false;
  item.claimed=true;return true;
 });
 const cancel=()=>{for(const item of pending.values())item.finish(Error('The app UI changed before the request completed.'));};
 contents.on('did-start-loading',cancel);contents.on('render-process-gone',cancel);
 return{call(operation,args={},signal){
  if(closed||window.isDestroyed()||contents.isDestroyed())return Promise.reject(Error('The MuseBench window is closed.'));
  if(signal?.aborted)return Promise.reject(Error('UI request was cancelled.'));
  if(pending.size)return Promise.reject(Error('Another native UI request is still running.'));
  return new Promise((resolve,reject)=>{
   const id=randomUUID(),deadline=Date.now()+8000;
   const abort=()=>finish(Error('UI request expired. Inspect the current state before continuing.'));
   const timer=setTimeout(abort,8000);
   const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);pending.delete(id);if(error)reject(error);else resolve(result);};
   pending.set(id,{finish,deadline,signal,claimed:false});signal?.addEventListener('abort',abort,{once:true});
   contents.send('musebench:native-request',{id,operation,args,deadline});
  });
 },close(){closed=true;cancel();ipcMain.removeHandler('musebench:native-claim');ipcMain.removeListener('musebench:native-reply',receive);contents.removeListener('did-start-loading',cancel);contents.removeListener('render-process-gone',cancel);}};
}
export function createNativeControlService({app,window,controller,personal,renderer,isBlocked=()=>false}){
 const contents=window.webContents;
 const screenshots=createScreenshotCapture(window);
 const events=[];let unresponsive=false;const record=kind=>{events.push({kind,at:new Date().toISOString()});if(events.length>50)events.shift();};
 const consoleEvent=(event,legacyLevel)=>{if(event?.level==='error'||legacyLevel===3)record('renderer-console-error');};
 const crash=()=>record('renderer-process-gone');
 const stalled=()=>{unresponsive=true;record('renderer-unresponsive');},recovered=()=>{unresponsive=false;record('renderer-responsive');};
 window.on('unresponsive',stalled);window.on('responsive',recovered);
 contents.on('console-message',consoleEvent);contents.on('render-process-gone',crash);
 return{async call(name,args,{signal}={}){
  validateNativeCall(name,args);
  if(signal?.aborted)throw Error('Request cancelled.');
  if(isBlocked())throw Error('MuseBench is starting, closing or updating. Try again when it is ready.');
  if(name==='app_status'){
   const state=controller.getState(),page=personal.snapshot();
   return textResult({version:app.getVersion(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,busy:!!state.busy,selectedTaskId:state.task?.id??null,runtime:{status:state.runtime.status,hostVersion:state.runtime.hostVersion??null,liveVerified:state.runtime.liveVerified===true,needsAttention:!!state.runtime.pending},personal:{destination:page.destination,loading:page.loading,visible:page.visible,authenticating:page.authenticating,hasError:!!page.error,available:page.available},chats:(state.tasks??[]).slice(0,100).map(t=>({id:t.id,title:clean(t.title),projectId:t.projectId,status:t.runtimeStatus??'idle',archived:!!t.archived})),chatsTruncated:(state.tasks?.length??0)>100});
  }
  if(name==='inspect_ui'||name==='navigate')return textResult(await renderer.call(name,args,signal));
  if(name==='screenshot'){
   const screenshot=await screenshots.capture(signal);if(screenshot.isEmpty())throw Error('The app did not produce a screenshot.');
   const size=screenshot.getSize(),ratio=Math.min(1,1400/size.width,1200/size.height),data=screenshot.resize({width:Math.round(size.width*ratio),height:Math.round(size.height*ratio)}).toJPEG(80);
   return{content:[{type:'image',mimeType:'image/jpeg',data:data.toString('base64')}]};
  }
  if(name==='diagnostics')return textResult({responsive:!unresponsive&&!contents.isDestroyed()&&!contents.isCrashed(),visible:window.isVisible(),minimized:window.isMinimized(),events:[...events],controllerHasError:!!controller.getState().error});
  if(name==='read_chat'){
   const page=await controller.readChatHistory({...args,limit:args.limit??20});
   return textResult({taskId:args.taskId,before:page.before,total:page.total,messages:page.messages.map(m=>({id:m.id,role:m.role,text:clean(m.text,3000),truncated:(m.textLength??m.text?.length??0)>3000,at:m.at}))});
  }
 },close(){screenshots.close();window.removeListener('unresponsive',stalled);window.removeListener('responsive',recovered);contents.removeListener('console-message',consoleEvent);contents.removeListener('render-process-gone',crash);renderer.close();}};
}
