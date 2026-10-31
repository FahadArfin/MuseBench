import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createNavigationCommitGate,settleNavigationVisuals,type NativeCommitState} from './native-navigation.mjs';
import type {NativeNavigation,NativeRequest} from '../shared/native-control-types';

/** Only the app-owned document is inspected. Embedded provider frames and form values stay out. */
export function inspectNativeUI(){
 const visible=(el:Element)=>{if(!(el instanceof HTMLElement)||el.closest('[hidden],[inert],[aria-hidden="true"]')||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;};
 const label=(el:Element)=>(el.getAttribute('aria-label')||(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)?el.getAttribute('placeholder')||'':el.textContent)||'').replace(/\s+/g,' ').trim().slice(0,160);
 const controls=[...document.querySelectorAll('button,summary,a,[role="tab"],input,textarea,select')].filter(visible).slice(0,160).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('role')||el.tagName.toLowerCase(),label:label(el),disabled:el.hasAttribute('disabled'),expanded:el.getAttribute('aria-expanded'),selected:el.getAttribute('aria-selected')??el.getAttribute('aria-pressed')??el.getAttribute('aria-checked'),bounds:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}};});
 return{source:'MuseBench shell; embedded provider pages excluded',viewport:{width:innerWidth,height:innerHeight},theme:document.documentElement.dataset.theme,headings:[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).slice(0,40).map(label),controls};
}
export type NativeCommitDestination={state:NativeCommitState;selector:string};
function readDestination(expected:NativeCommitDestination,snapshot:NativeCommitState){
 const root=document.querySelector(expected.selector),actual={...snapshot};
 if(expected.state.modal==='settings')actual.section=root?.querySelector('.settings-nav [aria-current="page"]')?.id.replace('settings-nav-','');
 if(expected.state.modal==='extensions')actual.section=root?.querySelector('[role="tab"][aria-selected="true"]')?.id.replace('customize-tab-','');
 return {root,actual};
}
export function useNativeControl(navigate:(input:NativeNavigation)=>Promise<NativeCommitDestination>|NativeCommitDestination,ready:boolean,snapshot:NativeCommitState){
 const current=useRef({navigate,ready,snapshot});current.current={navigate,ready,snapshot};
 const gate=useRef(createNavigationCommitGate()),destination=useRef<NativeCommitDestination|null>(null),controllers=useRef(new Map<string,AbortController>());
 const committedSnapshot=useRef(snapshot);
 const [token,setToken]=useState('');
 useLayoutEffect(()=>{
  committedSnapshot.current=snapshot;
  const expected=destination.current;if(!expected||!token)return;
  const {root,actual}=readDestination(expected,snapshot);
  gate.current.commit(token,actual,root);
 });
 useEffect(()=>{
  const bridge=window.musebench;
  const cancel=bridge?.onNativeCancel?.(id=>{controllers.current.get(id)?.abort();gate.current.cancel(id);});
  const unsubscribe=bridge?.onNativeRequest?.(async(request:NativeRequest)=>{
   if(Date.now()>=request.deadline||!current.current.ready)throw Error('UI request expired or app is not ready.');
   if(request.operation==='inspect_ui')return inspectNativeUI();
   if(request.operation!=='navigate')throw Error('Unsupported UI operation.');
   const controller=new AbortController();controllers.current.set(request.id,controller);
   try{
    const expected=await current.current.navigate(request.args);
    if(controller.signal.aborted||Date.now()>=request.deadline)throw Error('UI request expired.');
    destination.current=expected;
    const committed=gate.current.begin(request,expected.state);setToken(request.id);
    const root=await committed;
    if(controller.signal.aborted||Date.now()>=request.deadline)throw Error('UI request expired.');
    const phase=(phase:'committed'|'visual-settled'|'visual-unsettled')=>bridge?.nativeNavigationPhase?.({id:request.id,target:request.args.target,section:request.args.section,phase});
    phase('committed');
    const visualSettled=await settleNavigationVisuals(root,request.deadline,controller.signal);
    if(controller.signal.aborted||Date.now()>=request.deadline)throw Error('UI request expired.');
    const latest=readDestination(expected,committedSnapshot.current);
    if(latest.root!==root||!Object.entries(expected.state).every(([key,value])=>latest.actual[key]===value))throw Error('The requested destination changed before completion.');
    phase(visualSettled?'visual-settled':'visual-unsettled');
    return {...inspectNativeUI(),navigation:{committed:true as const,visualSettled}};
   }finally{controllers.current.delete(request.id);}
  });
  return()=>{unsubscribe?.();cancel?.();for(const controller of controllers.current.values())controller.abort();controllers.current.clear();gate.current.cancel();};
 },[]);
}
