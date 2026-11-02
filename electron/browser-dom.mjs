import {capturePreviewTarget} from '../src/shared/preview-target.mjs';
// Only this fixed operation set runs in a private isolated world. Page data
// never becomes JavaScript source or a native capability.
function browserDom(doc,request,capture){
 const win=doc.defaultView;
 if(request.type==='guard'||request.type==='insert'){
  const element=request.selector?doc.querySelector(request.selector):doc.activeElement;
  if(!element||element.closest('input[type="file"],input[type="password"],input[type="hidden"],iframe,object,embed'))return null;
  if(request.edit&&!element.matches('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),textarea,[contenteditable="true"]'))return null;
  const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  if(!r.width||!r.height||x<0||y<0||x>=win.innerWidth||y>=win.innerHeight||!element.contains(doc.elementFromPoint(x,y)))return null;
  if(request.type==='insert'){
   // A focus handler can move focus into a password or another frame. Mutate
   // only this verified target, synchronously, rather than typing into whichever
   // element happens to hold focus after an asynchronous native round trip.
   if(!element.matches('textarea,input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],input:not([type])')||element.disabled||element.readOnly)return null;
   const proto=element.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
   const descriptor=Object.getOwnPropertyDescriptor(proto,'value'),before=descriptor.get.call(element),start=element.selectionStart??before.length,end=element.selectionEnd??before.length;
   if(element.maxLength>=0&&before.length-(end-start)+request.text.length>element.maxLength)return null;
   descriptor.set.call(element,before.slice(0,start)+request.text+before.slice(end));
   try{element.setSelectionRange(start+request.text.length,start+request.text.length);}catch{}
   element.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:request.text}));
   element.focus();
   return {completed:true};
  }
  return {x,y};
 }
 if(request.type==='dom'){
  const targets=[];let visited=0;
  for(const element of doc.querySelectorAll('a,button,input,textarea,select,[role="button"],h1,h2,h3,p,label,summary,[contenteditable="true"]')){
   if(visited++>=250||targets.length>=40)break;
   const r=element.getBoundingClientRect(),x=(Math.max(0,r.left)+Math.min(win.innerWidth,r.right))/2/win.innerWidth,y=(Math.max(0,r.top)+Math.min(win.innerHeight,r.bottom))/2/win.innerHeight;
   if(x<0||y<0||x>=1||y>=1||r.right<=0||r.bottom<=0||r.left>=win.innerWidth||r.top>=win.innerHeight)continue;
   const target=capture(doc,{x,y});if(target&&!targets.some(t=>t.selector===target.selector))targets.push(target);
  }
  return targets;
 }
 return capture(doc,request);
}
export function browserDomScript(request){return `(${browserDom.toString()})(document,${JSON.stringify(request)},${capturePreviewTarget.toString()})`;}
export async function readBrowserDom(contents,request){
 const script=browserDomScript(request);
 return typeof contents.executeJavaScriptInIsolatedWorld==='function'?contents.executeJavaScriptInIsolatedWorld(999,[{code:script}]):contents.executeJavaScript(script);
}
