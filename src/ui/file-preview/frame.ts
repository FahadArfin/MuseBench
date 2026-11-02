import {renderFile,type FileRenderer} from './renderers';
import type {PreviewFile} from '../../shared/file-preview-types';

const nonce=location.hash.slice(1),root=document.getElementById('file-root')!;
let renderer:FileRenderer|undefined,abort:AbortController|undefined,epoch=0,annotating=false,page=1;
let pins:Array<{page:number;x:number;y:number}>=[];
const pinLayer=document.createElement('div');pinLayer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden';document.body.append(pinLayer);
const pageRect=()=>Array.from(root.querySelectorAll<HTMLElement>('[data-preview-page]')).find(item=>Number(item.dataset.previewPage)===page&&item.getClientRects().length)?.getBoundingClientRect();
const drawPins=()=>{pinLayer.replaceChildren();const rect=pageRect();if(!rect)return;pins.forEach((pin,index)=>{if(pin.page!==page)return;const marker=document.createElement('span');marker.textContent=String(index+1);marker.style.cssText=`position:absolute;left:${rect.left+pin.x*rect.width}px;top:${rect.top+pin.y*rect.height}px;transform:translate(-50%,-50%);background:#2188ff;color:white;border:1px solid white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font:600 12px/24px system-ui;box-shadow:0 1px 6px #0005`;pinLayer.append(marker);});};
window.addEventListener('resize',drawPins);document.addEventListener('scroll',drawPins,true);
const send=(type:string,extra:Record<string,unknown>={})=>parent.postMessage({type,nonce,...extra},'*');
window.addEventListener('message',async event=>{
 if(event.source!==parent||!nonce||event.data?.nonce!==nonce)return;
 const message=event.data;
 let serial=epoch;
 try{
  if(message.type==='render'){
   serial=++epoch;abort?.abort();renderer?.destroy();renderer=undefined;abort=new AbortController();
   const file=message.file as PreviewFile;
   root.textContent='Opening file…';
   const result=await renderFile(file,root,{signal:abort.signal,onPage:value=>{if(serial!==epoch)return;page=value;send('page',{page});}});
   if(serial!==epoch){result.destroy();return;}renderer=result;send('loaded',{pages:result.pages});
  }else if(message.type==='view'&&renderer){
   const active=renderer;
   if(typeof message.page==='number')await active.setPage(message.page);
   if(serial!==epoch||active!==renderer)return;
   if(typeof message.zoom==='number')await active.setZoom(message.zoom);
   if(serial!==epoch||active!==renderer)return;
   drawPins();
  }else if(message.type==='annotate'){
   annotating=message.enabled===true;document.body.classList.toggle('annotating',annotating);
  }else if(message.type==='pins'&&Array.isArray(message.comments)){pins=message.comments.slice(0,50);drawPins();}
 }catch(error){if(serial!==epoch||(error as Error)?.name==='AbortError')return;root.textContent=error instanceof Error?error.message:'This file could not be rendered.';send('error',{message:root.textContent});}
});
// A parent-owned overlay captures clicks even when the rendered document contains an iframe.
const overlay=document.getElementById('comment-layer')!;
overlay.addEventListener('click',event=>{
 const rect=pageRect();if(!rect||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
 send('selection',{page,x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)),quote:getSelection()?.toString().slice(0,2000)||undefined});
});
send('ready');
