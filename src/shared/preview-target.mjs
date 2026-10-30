// Self-contained: the desktop evaluates only this fixed function in the
// sandboxed project frame. All returned page data is untrusted and revalidated.
export function capturePreviewTarget(doc,request){
 const win=doc.defaultView,width=win?.innerWidth,height=win?.innerHeight;
 if(!width||!height)return null;
 const structural=/^html(?: > [a-z][a-z0-9-]*(?::nth-of-type\([1-9]\d{0,5}\))?){1,15}$/;
 let element;
 if(typeof request.selector==='string'){
  if(request.selector.length>1024||!structural.test(request.selector))return null;
  element=doc.querySelector(request.selector);
 }else{
  if(![request.x,request.y].every(n=>Number.isFinite(n)&&n>=0&&n<1))return null;
  element=doc.elementFromPoint(request.x*width,request.y*height);
 }
 if(!element||element===doc.documentElement)return null;
 const excluded='input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),script,style,template,noscript,iframe';
 const visible=node=>{
  let parent=node;
  for(let depth=0;parent&&depth<64;depth++,parent=parent.parentElement){
   if(parent.hidden||parent.getAttribute('aria-hidden')==='true')return false;
   const style=win.getComputedStyle(parent);
   if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return false;
  }
  return !parent;
 };
 const intersects=box=>box.width>0&&box.height>0&&box.right>0&&box.bottom>0&&box.left<width&&box.top<height;
 if(!visible(element))return null;
 const box=element.getBoundingClientRect();if(!intersects(box))return null;
 const path=[];let ancestor=element;
 for(let depth=0;ancestor&&ancestor!==doc.documentElement&&depth<15;depth++,ancestor=ancestor.parentElement){
  const tag=ancestor.tagName.toLowerCase();if(!/^[a-z][a-z0-9-]{0,31}$/.test(tag))return null;
  let index=1,sibling=ancestor.previousElementSibling,visited=0;
  while(sibling&&visited++<1000){if(sibling.tagName===ancestor.tagName)index++;sibling=sibling.previousElementSibling;}
  if(sibling)return null;
  path.unshift(tag+':nth-of-type('+index+')');
 }
 if(ancestor!==doc.documentElement)return null;
 const selector='html > '+path.join(' > ');if(selector.length>1024)return null;
 let text='';
 if(!element.closest(excluded)){
  const walker=doc.createTreeWalker(element,0xffffffff);let node=walker.currentNode,visited=0;
  while(node&&visited++<500&&text.length<600){
   if(node.nodeType===3&&node.parentElement&&!node.parentElement.closest(excluded)&&visible(node.parentElement)){
    const range=doc.createRange();range.selectNodeContents(node);
    if([...range.getClientRects()].some(intersects))text+=(text?' ':'')+(node.textContent??'').replace(/\s+/g,' ').trim().slice(0,600-text.length-(text?1:0));
   }
   node=walker.nextNode();
  }
 }
 const left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(width,box.right),bottom=Math.min(height,box.bottom);
 return {selector,tag:element.tagName.toLowerCase(),title:(doc.title??'').slice(0,160),text:text.slice(0,600),rect:{x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height}};
}
