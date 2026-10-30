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
 // Range rectangles include clipped text and closed-details descendants.
 // Intersect every clipping ancestor, then admit only fully visible glyphs.
 const visibleBounds=node=>{
  const bounds={left:0,top:0,right:width,bottom:height};let parent=node;
  for(let depth=0;parent&&depth<64;depth++,parent=parent.parentElement){
   if(parent.hidden||parent.getAttribute('aria-hidden')==='true')return null;
   const style=win.getComputedStyle(parent);
   if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0||style.contentVisibility==='hidden')return null;
   if(parent.tagName==='DETAILS'&&!parent.open&&parent!==node&&!parent.querySelector(':scope > summary')?.contains(node))return null;
   // Nonrectangular/legacy clipping cannot be proved visible with DOM bounds.
   if(style.clip!=='auto'||style.clipPath!=='none'||style.maskImage!=='none')return null;
   if([style.overflowX,style.overflowY].some(value=>['hidden','clip','auto','scroll'].includes(value))){
    const rect=parent.getBoundingClientRect(),sx=parent.offsetWidth?rect.width/parent.offsetWidth:1,sy=parent.offsetHeight?rect.height/parent.offsetHeight:1;
    const left=rect.left+parent.clientLeft*sx,top=rect.top+parent.clientTop*sy;
    if(style.overflowX!=='visible'){bounds.left=Math.max(bounds.left,left);bounds.right=Math.min(bounds.right,left+parent.clientWidth*sx);}
    if(style.overflowY!=='visible'){bounds.top=Math.max(bounds.top,top);bounds.bottom=Math.min(bounds.bottom,top+parent.clientHeight*sy);}
   }
  }
  return !parent&&bounds.right>bounds.left&&bounds.bottom>bounds.top?bounds:null;
 };
 const intersects=box=>box.width>0&&box.height>0&&box.right>0&&box.bottom>0&&box.left<width&&box.top<height;
 if(!visibleBounds(element))return null;
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
 let text='',characters=0;
 if(!element.closest(excluded)){
  const walker=doc.createTreeWalker(element,0xffffffff);let node=walker.currentNode,visited=0;
  while(node&&visited++<500&&text.length<600&&characters<4000){
   if(node.nodeType===3&&node.parentElement&&!node.parentElement.closest(excluded)){
    const bounds=visibleBounds(node.parentElement);
    if(bounds){
     const range=doc.createRange(),value=node.textContent??'';let part='',space=false;
     for(let offset=0;offset<value.length&&characters<4000&&text.length+part.length<600;characters++){
      const glyph=String.fromCodePoint(value.codePointAt(offset));range.setStart(node,offset);offset+=glyph.length;range.setEnd(node,offset);
      if(/\s/.test(glyph)){space=true;continue;}
      const rects=Array.from(range.getClientRects());
      const shown=rects.length&&rects.every(rect=>rect.width>0&&rect.height>0&&rect.left>=bounds.left&&rect.top>=bounds.top&&rect.right<=bounds.right&&rect.bottom<=bounds.bottom&&doc.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2)===node.parentElement);
      if(shown){if(space&&part)part+=' ';part+=glyph;space=false;}else space=true;
     }
     if(part)text+=(text?' ':'')+part;
    }
   }
   node=walker.nextNode();
  }
 }
 const left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(width,box.right),bottom=Math.min(height,box.bottom);
 return {selector,tag:element.tagName.toLowerCase(),title:(doc.title??'').slice(0,160),text:text.slice(0,600),rect:{x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height}};
}
