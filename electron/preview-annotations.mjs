import {createPreviewAnnotations,previewPageUrl} from '../src/shared/preview-annotations.mjs';
import {capturePreviewTarget} from '../src/shared/preview-target.mjs';

export function createDesktopPreviewAnnotations({contents,getState,onInvalidate}){
 let selectedFrame=null;
 const service=createPreviewAnnotations({
  onInvalidate,
  resolve(input){
   const state=getState();
   if(state.task?.id!==input.taskId||state.activeProject?.id!==input.projectId||state.task?.archived||state.preview?.status!=='running')throw Error('Open the current chat and start its preview first.');
   previewPageUrl(state.preview.url);
   const frames=contents.mainFrame.frames.filter(frame=>frame.name===input.frameName&&frame.parent===contents.mainFrame);
   if(frames.length!==1||frames[0].isDestroyed()||new URL(frames[0].url).origin!==new URL(state.preview.url).origin)throw Error('The project preview is no longer available.');
   selectedFrame=frames[0];
   return {key:selectedFrame,url:selectedFrame.url,projectId:input.projectId,taskId:input.taskId};
  },
  read(context,request){
   return context.key.executeJavaScript('('+capturePreviewTarget.toString()+')(document,'+JSON.stringify(request)+')');
  },
 });
 const navigation=(event,_url,_inPlace,isMainFrame,processId,routingId)=>{
  if(!selectedFrame)return;
  if(selectedFrame.isDestroyed()){selectedFrame=null;service.invalidate();return;}
  if(event.isMainFrame??isMainFrame){service.invalidate();return;}
  const frame=event.frame;
  if(frame===selectedFrame||frame?.name===selectedFrame.name||processId===selectedFrame.processId&&routingId===selectedFrame.routingId||!frame&&processId===undefined)service.invalidate();
 };
 const gone=()=>service.invalidate();
 contents.on('did-start-navigation',navigation);contents.on('render-process-gone',gone);
 return {...service,close(){service.invalidate();contents.removeListener('did-start-navigation',navigation);contents.removeListener('render-process-gone',gone);selectedFrame=null;}};
}
