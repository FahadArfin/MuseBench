const active=new Map();
export const reducedMotion=()=>document.documentElement.dataset.reducedMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionScrollBehavior=()=>reducedMotion()?'instant':'smooth';

// Only navigation identities use this. Streaming, loading and draft updates do not.
export function enterSurface(element){
 if(!element)return()=>{};
 const from=active.has(element)?Number(getComputedStyle(element).opacity):.72;
 return animateMotion(element,[{opacity:from},{opacity:1}],{duration:160,easing:'cubic-bezier(.22,1,.36,1)'});
}

export function animateMotion(element,keyframes,options){
 if(!element)return()=>{};
 active.get(element)?.cancel();active.delete(element);
 if(reducedMotion()||!element.checkVisibility()||typeof element.animate!=='function')return()=>{};
 let animation;
 try{animation=element.animate(keyframes,options);}
 catch{return()=>{};} // Cosmetic motion must never prevent navigation.
 active.set(element,animation);
 const forget=()=>{if(active.get(element)===animation)active.delete(element);};
 animation.finished.then(forget,forget);
 return()=>{animation.cancel();forget();};
}

export function observeMotionPreference(){
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const settle=()=>{if(reducedMotion()){for(const animation of active.values())animation.cancel();active.clear();}};
 const observer=new MutationObserver(settle);
 observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced-motion']});
 media.addEventListener('change',settle);
 return()=>{observer.disconnect();media.removeEventListener('change',settle);for(const animation of active.values())animation.cancel();active.clear();};
}

// CSS keeps native details painted while their height closes. Remove that
// content from keyboard navigation immediately, without measuring each row.
export function observeDetailsMotion(root){
 const owned=new WeakSet();
 const restore=element=>{if(owned.has(element)){element.inert=false;owned.delete(element);}};
 const update=details=>{
  if(!details.closest('.app')||details.matches('.diff-editor-menu'))return;
  const summary=details.querySelector(':scope > summary');
  if(!details.open&&summary&&details.contains(document.activeElement)&&!summary.contains(document.activeElement))summary.focus({preventScroll:true});
  for(const child of details.children){
   if(!(child instanceof HTMLElement)||child===summary)continue;
   if(details.open)restore(child);
   else if(!child.inert){child.inert=true;owned.add(child);}
  }
 };
 const observer=new MutationObserver(records=>{
  const changed=new Set();
  for(const record of records){
   if(!(record.target instanceof HTMLDetailsElement))continue;
   for(const removed of record.removedNodes)if(removed.parentElement!==record.target)restore(removed);
   changed.add(record.target);
  }
  for(const details of changed)update(details);
 });
 observer.observe(root,{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
 return()=>{observer.disconnect();for(const element of root.querySelectorAll('[inert]'))restore(element);};
}
