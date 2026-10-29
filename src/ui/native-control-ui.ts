import {useEffect,useRef} from 'react';
import type {NativeNavigation,NativeRequest} from '../shared/native-control-types';

/** Only the app-owned document is inspected. Embedded provider frames and form values stay out. */
export function inspectNativeUI(){
 const visible=(el:Element)=>{if(!(el instanceof HTMLElement)||el.closest('[hidden],[inert],[aria-hidden="true"]')||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;};
 const label=(el:Element)=>(el.getAttribute('aria-label')||(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)?el.getAttribute('placeholder')||'':el.textContent)||'').replace(/\s+/g,' ').trim().slice(0,160);
 const controls=[...document.querySelectorAll('button,summary,a,[role="tab"],input,textarea,select')].filter(visible).slice(0,160).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('role')||el.tagName.toLowerCase(),label:label(el),disabled:el.hasAttribute('disabled'),expanded:el.getAttribute('aria-expanded'),selected:el.getAttribute('aria-selected')??el.getAttribute('aria-pressed')??el.getAttribute('aria-checked'),bounds:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}};});
 return{source:'MuseBench shell; embedded provider pages excluded',viewport:{width:innerWidth,height:innerHeight},theme:document.documentElement.dataset.theme,headings:[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).slice(0,40).map(label),controls};
}
function settleNativeNavigation(deadline:number){
 return new Promise<void>((resolve,reject)=>{
  let frame=0,settled=false;
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);cancelAnimationFrame(frame);if(error)reject(error);else resolve();};
  const timer=setTimeout(()=>finish(Error('UI request expired before navigation finished.')),Math.max(0,deadline-Date.now()));
  const inspect=()=>{
   if(settled)return;
   if(Date.now()>=deadline){finish(Error('UI request expired.'));return;}
   // The shell document excludes provider WebContentsViews. Infinite cursors
   // and loading spinners must not hold a navigation response open.
   const animations=document.getAnimations().filter(animation=>(animation.pending||animation.playState==='running')&&Number.isFinite(animation.effect?.getComputedTiming().endTime));
   if(animations.length)void Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{if(!settled)paint();});
   else finish();
  };
  // React commits and CSS animations can be scheduled on different frames.
  const paint=()=>{frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(inspect);});};
  paint();
 });
}
export function useNativeControl(navigate:(input:NativeNavigation)=>Promise<void>|void,ready:boolean){
 const current=useRef({navigate,ready});current.current={navigate,ready};
 useEffect(()=>window.musebench?.onNativeRequest?.(async(request:NativeRequest)=>{
  if(Date.now()>request.deadline||!current.current.ready)throw Error('UI request expired or app is not ready.');
  if(request.operation==='navigate')await current.current.navigate(request.args);
  else if(request.operation!=='inspect_ui')throw Error('Unsupported UI operation.');
  if(request.operation==='navigate')await settleNativeNavigation(request.deadline);
  if(Date.now()>request.deadline)throw Error('UI request expired.');
  return inspectNativeUI();
 }),[]);
}
