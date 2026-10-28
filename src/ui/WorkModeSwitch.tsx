import {useLayoutEffect,useRef} from 'react';
import {Files,MessageSquare} from 'lucide-react';
import {animateMotion} from './motion.mjs';

type Mode='chat'|'work';
export type WorkModeTransition={mode:Mode;fraction:number};
const position=(mode:Mode)=>mode==='work'?'translateX(calc(100% + 2px))':'translateX(0)';

/** Each mounted workspace keeps the same selection, including while hidden. */
export function WorkModeSwitch({mode,origin,onChange}:{mode:Mode;origin?:WorkModeTransition;onChange:(mode:Mode,fraction:number)=>void}){
 const indicator=useRef<HTMLSpanElement>(null),previous=useRef<Mode|null>(null);
 const stop=useRef<(()=>void)|undefined>(undefined);
 useLayoutEffect(()=>{
  const from=previous.current;previous.current=mode;
  const element=indicator.current;
  if(!element||((from===null||from===mode)&&origin?.mode!==mode))return;
  // Sample before cancelling so quick reversals continue from the visible position.
  const transform=origin?.mode===mode?`translateX(calc(${origin.fraction*100}% + ${origin.fraction*2}px))`:element.getAnimations().some(a=>a.playState==='running')?getComputedStyle(element).transform:position(from??mode);
  stop.current=animateMotion(element,[{transform},{transform:position(mode)}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});
 },[mode,origin]);
 useLayoutEffect(()=>()=>stop.current?.(),[]);
 const select=(next:Mode)=>{
  if(next===mode)return;
  // Capture before React hides this workspace. The arriving workspace continues
  // from this fraction, even when the person reverses a half-finished movement.
  const element=indicator.current;
  let fraction=mode==='work'?1:0;
  if(element){try{fraction=Math.max(0,Math.min(1,new DOMMatrixReadOnly(getComputedStyle(element).transform).m41/(element.getBoundingClientRect().width+2)));}catch{/* Use the selected endpoint when geometry is unavailable. */}}
  onChange(next,fraction);
 };
 return <div className="work-mode-switch" role="group" aria-label="Chat or Work">
  <span ref={indicator} className="work-mode-indicator" aria-hidden="true" style={{transform:position(mode)}}/>
  <button type="button" aria-label="Chat" title="Meta AI chat" aria-pressed={mode==='chat'} onClick={()=>select('chat')}><MessageSquare size={14}/><span>Chat</span></button>
  <button type="button" aria-label="Work" title="Documents, spreadsheets, and presentations" aria-pressed={mode==='work'} onClick={()=>select('work')}><Files size={14}/><span>Work</span></button>
 </div>;
}
