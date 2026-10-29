import {randomUUID} from 'node:crypto';
import {validateNativeCall} from '../src/shared/native-control.mjs';
const textResult=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const clean=(value,max=240)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max):'';
export function createNativeRenderer({window,ipcMain,trusted}){
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
 window.webContents.on('did-start-loading',cancel);window.webContents.on('render-process-gone',cancel);
 return{call(operation,args={},signal){
  if(closed||window.isDestroyed()||window.webContents.isDestroyed())return Promise.reject(Error('The MuseBench window is closed.'));
  if(signal?.aborted)return Promise.reject(Error('UI request was cancelled.'));
  if(pending.size)return Promise.reject(Error('Another native UI request is still running.'));
  return new Promise((resolve,reject)=>{
   const id=randomUUID(),deadline=Date.now()+8000;
   const abort=()=>finish(Error('UI request expired. Inspect the current state before continuing.'));
   const timer=setTimeout(abort,8000);
   const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);pending.delete(id);if(error)reject(error);else resolve(result);};
   pending.set(id,{finish,deadline,signal,claimed:false});signal?.addEventListener('abort',abort,{once:true});
   window.webContents.send('musebench:native-request',{id,operation,args,deadline});
  });
 },close(){closed=true;cancel();ipcMain.removeHandler('musebench:native-claim');ipcMain.removeListener('musebench:native-reply',receive);window.webContents.removeListener('did-start-loading',cancel);window.webContents.removeListener('render-process-gone',cancel);}};
}
export function createNativeControlService({app,window,controller,personal,renderer,isBlocked=()=>false}){
 const events=[];let unresponsive=false;const record=kind=>{events.push({kind,at:new Date().toISOString()});if(events.length>50)events.shift();};
 const consoleEvent=(event,legacyLevel)=>{if(event?.level==='error'||legacyLevel===3)record('renderer-console-error');};
 const crash=()=>record('renderer-process-gone');
 const stalled=()=>{unresponsive=true;record('renderer-unresponsive');},recovered=()=>{unresponsive=false;record('renderer-responsive');};
 window.on('unresponsive',stalled);window.on('responsive',recovered);
 window.webContents.on('console-message',consoleEvent);window.webContents.on('render-process-gone',crash);
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
   const screenshot=await window.capturePage();if(screenshot.isEmpty())throw Error('The app did not produce a screenshot.');
   const size=screenshot.getSize(),ratio=Math.min(1,1400/size.width,1200/size.height),data=screenshot.resize({width:Math.round(size.width*ratio),height:Math.round(size.height*ratio)}).toJPEG(80);
   return{content:[{type:'image',mimeType:'image/jpeg',data:data.toString('base64')}]};
  }
  if(name==='diagnostics')return textResult({responsive:!unresponsive&&!window.webContents.isDestroyed(),visible:window.isVisible(),minimized:window.isMinimized(),events:[...events],controllerHasError:!!controller.getState().error});
  if(name==='read_chat'){
   const page=await controller.readChatHistory({...args,limit:args.limit??20});
   return textResult({taskId:args.taskId,before:page.before,total:page.total,messages:page.messages.map(m=>({id:m.id,role:m.role,text:clean(m.text,3000),truncated:(m.textLength??m.text?.length??0)>3000,at:m.at}))});
  }
 },close(){window.removeListener('unresponsive',stalled);window.removeListener('responsive',recovered);window.webContents.removeListener('console-message',consoleEvent);window.webContents.removeListener('render-process-gone',crash);renderer.close();}};
}
