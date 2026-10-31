import {useEffect,useRef} from 'react';

const AREA='[data-workspace-area]';
const FOCUSABLE='button,input,textarea,select,a[href],summary,[tabindex],[contenteditable="true"]';
const order=['sidebar','conversation','composer','details'];

export function workspaceLaidOut(element:HTMLElement){
 return element.isConnected&&!element.closest('[hidden],[inert],[aria-hidden="true"]')&&element.checkVisibility({checkVisibilityCSS:true})&&element.getClientRects().length>0;
}
export function workspaceVisible(element:HTMLElement){
 if(!workspaceLaidOut(element))return false;
 const rect=element.getBoundingClientRect();
 return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
}
export function workspaceFocusBlocked(){
 return [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"],[role="menu"],#muse-slash-options')].some(workspaceVisible)||document.activeElement?.matches('webview,iframe');
}
const valid=(element:HTMLElement)=>workspaceVisible(element)&&!element.matches(':disabled,[aria-disabled="true"]');

// Focus is purely a renderer concern. In particular, never scroll a transcript
// or change its follow intent when moving between these areas.
export function useWorkspaceFocus(active:boolean,context:string){
 const memory=useRef(new Map<string,HTMLElement>());
 useEffect(()=>{
  if(!active)return;
  let lastFocus:HTMLElement|null=null,suspended:HTMLElement|null=null;
  const remember=(event:FocusEvent)=>{suspended=null;const target=event.target;lastFocus=target instanceof HTMLElement&&target.closest(AREA)?target:null;if(!lastFocus||!valid(lastFocus))return;const area=lastFocus.closest<HTMLElement>(AREA)!;memory.current.set(area.dataset.workspaceArea!,lastFocus);};
  const cancel=()=>{suspended=null;if(document.activeElement===document.body)lastFocus=null;};
  // A canonical busy snapshot temporarily disables controls. Chromium blurs a
  // disabled button to body; restore only that same control after reenable,
  // provided no newer input, focus, boundary or destination superseded it.
  const updates=new MutationObserver(records=>{
   if(document.activeElement!==document.body&&document.activeElement!==lastFocus){suspended=null;return;}
   if(lastFocus&&records.some(record=>record.target===lastFocus&&record.oldValue===null))suspended=lastFocus;
   if(!suspended)return;
   if(!suspended.isConnected||!workspaceVisible(suspended)||workspaceFocusBlocked()){suspended=null;return;}
   if(valid(suspended)){const target=suspended;suspended=null;if(document.activeElement===document.body)target.focus({preventScroll:true});}
  });
  updates.observe(document.body,{subtree:true,attributes:true,attributeFilter:['disabled'],attributeOldValue:true});
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.isComposing||event.key!=='F6'||event.altKey||event.metaKey||workspaceFocusBlocked())return;
   const targetFor=(area:HTMLElement)=>{
    const saved=memory.current.get(area.dataset.workspaceArea!);
    if(saved&&area.contains(saved)&&valid(saved))return saved;
    if(area.matches('[data-workspace-default]')&&valid(area))return area;
    const candidates=[...area.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(valid);
    return candidates.find(node=>node.matches('[data-workspace-default]'))??candidates.find(node=>node.tabIndex>=0)??(area.hasAttribute('tabindex')?area:null);
   };
   const areas=order.flatMap(name=>[...document.querySelectorAll<HTMLElement>(`[data-workspace-area="${name}"]`)].filter(area=>workspaceVisible(area)&&targetFor(area)));
   if(!areas.length)return;
   const current=areas.findIndex(area=>area.contains(document.activeElement)),step=event.shiftKey?-1:1;
   const area=areas[current<0?(event.shiftKey?areas.length-1:0):(current+step+areas.length)%areas.length];
   event.preventDefault();targetFor(area)?.focus({preventScroll:true});
  };
  document.addEventListener('focusin',remember);window.addEventListener('keydown',key);window.addEventListener('keydown',cancel,true);window.addEventListener('pointerdown',cancel,true);
  return()=>{updates.disconnect();document.removeEventListener('focusin',remember);window.removeEventListener('keydown',key);window.removeEventListener('keydown',cancel,true);window.removeEventListener('pointerdown',cancel,true);};
 },[active,context]);
}
