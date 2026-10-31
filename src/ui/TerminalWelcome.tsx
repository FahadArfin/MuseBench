import {useLayoutEffect,useState} from 'react';
import {reducedMotion} from './motion.mjs';
import './typed-text.css';

const greeting=' What would you like to Build?';

export function TerminalWelcome({active}:{active:boolean}){
 const [count,setCount]=useState(()=>reducedMotion()?greeting.length:0);
 useLayoutEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined,index=0;
  const stop=()=>clearTimeout(timer);
  const finish=()=>{if(reducedMotion()){stop();setCount(greeting.length);}};
  setCount(reducedMotion()?greeting.length:0);
  if(active&&!reducedMotion()){
   const type=()=>{setCount(++index);if(index<greeting.length)timer=setTimeout(type,42);};
   timer=setTimeout(type,1100);
  }
  const media=matchMedia('(prefers-reduced-motion: reduce)'),observer=new MutationObserver(finish);
  media.addEventListener('change',finish);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced-motion']});
  return()=>{stop();observer.disconnect();media.removeEventListener('change',finish);};
 },[active]);
 return <h1 className="typed-welcome terminal-prompt" aria-label="What would you like to build?">
  <span className="terminal-reserve" aria-hidden="true">&gt;{greeting}_</span>
  <span className="terminal-reveal" aria-hidden="true"><span className="typed-text">&gt;{greeting.slice(0,count)}</span><span className="terminal-cursor">_</span></span>
 </h1>;
}
