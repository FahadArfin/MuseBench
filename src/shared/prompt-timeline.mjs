// DOM-only navigation, shared by the local renderer and guarded service pages.
// This function is also serialized into remote pages; keep it self-contained.
export function mountPromptTimeline({host,root,userSelector,answerSelector,scrollElement,reducedMotion=false}) {
 const shadow=host.attachShadow({mode:'open'}),doc=host.ownerDocument;
 const style=doc.createElement('style');style.textContent=`
 :host{position:fixed;z-index:30;width:30px;pointer-events:none;font:13px/1.55 "Segoe UI",sans-serif;color:var(--text,#ececec)}
 *{box-sizing:border-box}nav{pointer-events:auto;width:30px;max-height:100%;overflow:auto;scrollbar-width:none;padding:6px 0}nav::-webkit-scrollbar{display:none}nav[hidden],[hidden]{display:none!important}
 button{display:flex;align-items:center;width:28px;height:12px;min-height:12px;padding:0 5px;background:none;border:0;cursor:pointer;color:var(--muted,#999)}
 button::before{content:"";display:block;width:6px;height:2px;background:currentColor;opacity:.45;transition:width .12s,opacity .12s}
 button.near::before{width:13px;opacity:.65}button[aria-current=step]::before{width:17px;opacity:.85}button:hover::before,button:focus-visible::before,button.preview::before{width:24px;opacity:1;color:var(--text,#ececec)}
 button:focus-visible{outline:1px solid var(--muted,#999);outline-offset:-1px;border-radius:3px}
 [role=tooltip]{position:fixed;pointer-events:none;width:322px;max-width:calc(100vw - 58px);padding:10px 12px;border-radius:13px;background:var(--surface-hover,#303030);box-shadow:0 8px 24px #0003;color:var(--text,#ececec);overflow-wrap:anywhere;text-align:left}
 strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:600}p{margin:5px 0 0;color:var(--muted,#999);font-size:13px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
 @media(pointer:coarse){button{height:26px;min-height:26px}}@media(prefers-reduced-motion:reduce){button::before{transition:none}}
 `;
 const nav=doc.createElement('nav');nav.setAttribute('aria-label','Conversation timeline');
 const tip=doc.createElement('div');tip.setAttribute('role','tooltip');tip.id='prompt-preview';tip.hidden=true;
 const title=doc.createElement('strong'),excerpt=doc.createElement('p');tip.append(title,excerpt);shadow.append(style,nav,tip);
 let entries=[],buttons=[],preview=-1,active=-1,disposed=false,timer=null,frame=null;
 const text=node=>(node?.innerText??node?.textContent??'').replace(/\s+/g,' ').trim().slice(0,800);
 const viewport=()=>{
  if(scrollElement?.isConnected)return scrollElement;
  for(let node=entries[0]?.node?.parentElement??root;node&&node!==doc.body;node=node.parentElement)if(/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1)return node;
  return doc.scrollingElement;
 };
 function geometry(){const scroll=viewport();return scroll===doc.scrollingElement?{left:0,top:0,width:innerWidth,height:innerHeight,bottom:innerHeight}:scroll.getBoundingClientRect();}
 function hide(){preview=-1;tip.hidden=true;for(const button of buttons){button.classList.remove('preview','near');button.removeAttribute('aria-describedby');}}
 function show(index){
  if(!entries[index]||nav.hidden)return;preview=index;const entry=entries[index];title.textContent=entry.prompt||`Prompt ${index+1}`;excerpt.textContent=entry.answer||'Jump to this prompt';tip.hidden=false;
  buttons.forEach((b,i)=>{b.classList.toggle('preview',i===index);b.classList.toggle('near',Math.abs(i-index)===1);if(i===index)b.setAttribute('aria-describedby',tip.id);else b.removeAttribute('aria-describedby');});
  const rect=buttons[index].getBoundingClientRect();tip.style.left=Math.max(8,Math.min(rect.right+12,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(rect.top-tip.offsetHeight/2+6,innerHeight-tip.offsetHeight-8))+'px';
 }
 function position(){
  frame=null;if(disposed||!entries.length)return;
  const rect=geometry(),height=Math.max(0,Math.min(360,rect.height-48));host.style.left=Math.max(0,rect.left+7)+'px';host.style.top=Math.max(8,rect.top+(rect.height-height)/2)+'px';host.style.height=height+'px';
  nav.hidden=entries.length<2||rect.width===0||rect.height<100;
  const scroll=viewport();let index=entries.length-1;
  if(scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight>3){
   // Prompts follow vertical DOM order. Read live geometry so streaming text,
   // expanded content and viewport changes cannot leave cached positions stale.
   let low=0,high=entries.length;
   while(low<high){const middle=Math.floor((low+high)/2);if(entries[middle].node.getBoundingClientRect().top<=rect.top+50)low=middle+1;else high=middle;}
   index=Math.max(0,low-1);
  }
  if(active!==index){buttons[active]?.removeAttribute('aria-current');active=index;buttons[index]?.setAttribute('aria-current','step');if(preview<0&&!shadow.activeElement&&buttons[index])nav.scrollTop=Math.max(0,buttons[index].offsetTop-nav.clientHeight/2);}
  if(preview>=0)show(preview);
 }
 const schedulePosition=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(position);};
 function jump(index){
  const entry=entries[index];if(!entry?.node.isConnected){refresh();return;}
  const scroll=viewport(),rect=geometry(),top=scroll.scrollTop+entry.node.getBoundingClientRect().top-rect.top-20;
  scroll.scrollTo({top:Math.max(0,top),behavior:'instant'}); // Never race streaming auto-follow with a smooth animation.
  position();
 }
 function refresh(){
  timer=null;if(disposed||!root.isConnected)return;
  const next=[];let current;
  for(const node of root.querySelectorAll(`${userSelector},${answerSelector}`)){
   if(!node.getClientRects().length||node.closest('[hidden],[aria-hidden="true"]'))continue;
   if(node.matches(userSelector)){current={node,prompt:text(node.querySelector('[data-timeline-text],.hatch-chat-groupable-bubble')??node),answer:''};next.push(current);}
   else if(current&&!current.answer)current.answer=text(node.querySelector('[data-timeline-text],.prose,.markdown')??node);
  }
  const changed=next.length!==entries.length||next.some((entry,i)=>entry.node!==entries[i]?.node);
  entries=next;
  if(changed){hide();nav.replaceChildren();buttons=entries.map((entry,index)=>{const button=doc.createElement('button');button.type='button';button.setAttribute('aria-label',`Prompt ${index+1}: ${entry.prompt.slice(0,100)}`);button.tabIndex=index===0?0:-1;button.dataset.index=String(index);nav.append(button);return button;});active=-1;}
  else entries.forEach((entry,i)=>buttons[i].setAttribute('aria-label',`Prompt ${i+1}: ${entry.prompt.slice(0,100)}`));
  nav.hidden=entries.length<2;position();
 }
 const scheduleRefresh=()=>{if(timer===null&&!disposed)timer=setTimeout(refresh,100);};
 const indexOf=event=>Number(event.target.closest('button')?.dataset.index??-1);
 nav.addEventListener('pointerover',e=>{const i=indexOf(e);if(i>=0)show(i);});nav.addEventListener('pointerleave',hide);
 nav.addEventListener('focusin',e=>{const i=indexOf(e);if(i>=0)show(i);});nav.addEventListener('focusout',e=>{if(!nav.contains(e.relatedTarget))hide();});
 nav.addEventListener('click',e=>{const i=indexOf(e);if(i>=0){buttons.forEach((b,n)=>b.tabIndex=n===i?0:-1);jump(i);}});
 nav.addEventListener('keydown',e=>{const i=indexOf(e);if(e.key==='Escape'){e.preventDefault();hide();return;}const delta={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5}[e.key];if(delta!==undefined||e.key==='Home'||e.key==='End'){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?entries.length-1:Math.max(0,Math.min(entries.length-1,i+delta));buttons.forEach((b,j)=>b.tabIndex=j===n?0:-1);buttons[n]?.focus({preventScroll:true});buttons[n]?.scrollIntoView({block:'nearest'});show(n);}});
 const observer=new MutationObserver(scheduleRefresh);observer.observe(root,{subtree:true,childList:true,characterData:true});
 const resize=new ResizeObserver(schedulePosition);resize.observe(scrollElement??root);
 doc.addEventListener('scroll',schedulePosition,true);window.addEventListener('resize',schedulePosition);refresh();
 return()=>{disposed=true;clearTimeout(timer);cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();doc.removeEventListener('scroll',schedulePosition,true);window.removeEventListener('resize',schedulePosition);shadow.replaceChildren();host.removeAttribute('style');};
}
