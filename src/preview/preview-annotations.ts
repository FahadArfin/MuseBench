import {createPreviewAnnotations,type PreviewContext,type PreviewPoint} from '../shared/preview-annotations.mjs';
import {capturePreviewTarget} from '../shared/preview-target.mjs';

export function createBrowserPreviewAnnotations({getState}:{getState:()=>{activeProject:{id:string}|null;task:{id:string;archived?:boolean}|null;preview:{status:string;url:string|null}}}){
 const listeners=new Set<()=>void>();let unwatch=()=>{},documentKey:Document|null=null;
 const service=createPreviewAnnotations({
  onInvalidate:()=>{unwatch();documentKey=null;for(const listener of listeners)listener();},
  resolve(input:PreviewPoint){
   const state=getState();
   if(state.activeProject?.id!==input.projectId||state.task?.id!==input.taskId||state.task?.archived||state.preview.status!=='running'||!state.preview.url||new URL(state.preview.url).origin!==location.origin)throw Error('Open a running sample preview first.');
   const frame=document.getElementsByName(input.frameName)[0];
   if(!(frame instanceof HTMLIFrameElement)||!frame.contentDocument||!frame.contentWindow||new URL(frame.src).origin!==location.origin)throw Error('Select an element in the local sample preview.');
   const doc=frame.contentDocument,win=frame.contentWindow;
   if(documentKey!==doc){
    unwatch();documentKey=doc;
    const changed=()=>service.invalidate();
    const navigation=(win as Window&{navigation?:EventTarget}).navigation;
    navigation?.addEventListener('navigate',changed);win.addEventListener('hashchange',changed);win.addEventListener('popstate',changed);
    unwatch=()=>{navigation?.removeEventListener('navigate',changed);win.removeEventListener('hashchange',changed);win.removeEventListener('popstate',changed);};
   }
   return {key:doc,url:win.location.href,projectId:input.projectId,taskId:input.taskId};
  },
  read:async(context:PreviewContext,point)=>capturePreviewTarget(context.key as Document,point),
 });
 return {
  inspectPreviewTarget:service.inspect,
  preparePreviewFeedback:service.feedback,
  discardPreviewTarget:async(token:string)=>{service.discard(token);},
  onPreviewInvalidated:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);if(!listeners.size){unwatch();documentKey=null;service.invalidate();}};},
 };
}
