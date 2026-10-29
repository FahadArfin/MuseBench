import type {MuseBenchBridge} from '../shared/types';

// Load the serializer only for a copy, not during chat rendering or startup.
export async function copyReply(text:string,bridge:Pick<MuseBenchBridge,'copyReply'|'copyText'>|undefined=window.musebench):Promise<void>{
 if(typeof text!=='string'||text.length>100000)throw Error('Invalid clipboard text.');
 if(bridge?.copyReply){try{await bridge.copyReply(text);return;}catch{/* Preserve plain copying if rich formatting is unsupported. */}}
 if(bridge?.copyText){await bridge.copyText(text);return;}
 if(typeof ClipboardItem!=='undefined'&&navigator.clipboard?.write){
  try{
   // A promised HTML payload preserves the original user gesture in WebKit.
   const html=import('../shared/reply-copy.mjs').then(({replyClipboard})=>new Blob([replyClipboard(text).html],{type:'text/html'}));
   void html.catch(()=>{}); // A browser can reject ClipboardItem before consuming it.
   await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':html})]);return;
  }catch{/* A denied/unsupported rich write can still support plain copying. */}
 }
 await navigator.clipboard.writeText(text);
}
