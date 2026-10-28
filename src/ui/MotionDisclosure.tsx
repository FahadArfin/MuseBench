import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {reducedMotion} from './motion.mjs';

/** Keep content mounted so drafts/selection survive a reversible collapse. */
export function MotionDisclosure({id,open,children,className='',innerClassName='',unmountWhenClosed=false}:{id?:string;open:boolean;children:ReactNode|(()=>ReactNode);className?:string;innerClassName?:string;unmountWhenClosed?:boolean}){
 const content=useRef<HTMLDivElement>(null);
 const [present,setPresent]=useState(open||!unmountWhenClosed);
 useLayoutEffect(()=>{
  if(open||!unmountWhenClosed){setPresent(true);return;}
  if(reducedMotion()){setPresent(false);return;}
  // transitionend handles the normal case; the bounded fallback also covers
  // a hidden ancestor or a motion preference changed during the transition.
  const timer=setTimeout(()=>setPresent(false),400);
  return()=>clearTimeout(timer);
 },[open,unmountWhenClosed]);
 useLayoutEffect(()=>{
  if(open||!id||!content.current?.contains(document.activeElement))return;
  // Programmatic changes (including collapsing a parent) must not strand focus.
  const trigger=[...document.querySelectorAll<HTMLButtonElement>('button[aria-controls]')].find(button=>button.getAttribute('aria-controls')===id&&!button.closest('[inert]')&&button.checkVisibility());
  trigger?.focus({preventScroll:true});
 },[id,open]);
 return <div ref={content} id={id} className={`motion-disclosure ${className}`} data-open={open} aria-hidden={!open} inert={!open} onTransitionEnd={event=>{if(unmountWhenClosed&&!open&&event.target===event.currentTarget&&event.propertyName==='grid-template-rows')setPresent(false);}}><div className="motion-disclosure-clip"><div className={innerClassName}>{present&&(typeof children==='function'?children():children)}</div></div></div>;
}
