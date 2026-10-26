import {useLayoutEffect,useRef,type ReactNode,type CSSProperties} from 'react';
import {RotateCcw} from 'lucide-react';
import {REASONING_LEVELS} from '../shared/run-options.mjs';
import type {RunOptions} from '../shared/types';

export const reasoningLabels:Record<RunOptions['reasoning'],string>={none:'None',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max',ultra:'Ultra'};

export function ReasoningPicker({value,onChange,levels=REASONING_LEVELS,children}:{value:RunOptions['reasoning'];onChange:(value:RunOptions['reasoning'])=>void;levels?:readonly RunOptions['reasoning'][];children?:ReactNode}){
 const index=Math.max(0,levels.indexOf(value)),last=Math.max(0,levels.length-1),reset=levels.includes('high')?'high':levels[0];
 const panel=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const position=()=>{const element=panel.current,anchor=element?.parentElement;if(!element||!anchor)return;const rect=anchor.getBoundingClientRect(),above=rect.top-20,below=innerHeight-rect.bottom-20;const down=above<element.scrollHeight&&below>above;element.dataset.placement=down?'below':'above';element.style.setProperty('--reasoning-max-height',`${Math.max(120,down?below:above)}px`);};
  position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[children,levels]);
 return <div ref={panel} className="composer-popover reasoning-popover" role="dialog" aria-label="Reasoning controls" style={{'--reasoning-position':index/Math.max(1,last)} as CSSProperties}>
  {children}<div className="reasoning-heading"><span>Reasoning effort</span><select aria-label="Select reasoning effort" value={value} onChange={event=>onChange(event.target.value as RunOptions['reasoning'])}>{levels.map(level=><option value={level} key={level}>{reasoningLabels[level]}</option>)}</select><button type="button" className="icon-button" aria-label={`Reset reasoning to ${reasoningLabels[reset]}`} title={`Reset to ${reasoningLabels[reset]}`} disabled={!reset} onClick={()=>reset&&onChange(reset)}><RotateCcw size={13}/></button></div>
  <div className="reasoning-slider"><div className="reasoning-track" aria-hidden="true"><span/>{levels.map(level=><i key={level}/>)}</div><input type="range" aria-label="Reasoning level" aria-valuetext={reasoningLabels[value]} min={0} max={last} disabled={levels.length<2} step={1} value={index} title={`${reasoningLabels[value]} reasoning effort`} onChange={event=>{const next=levels[Number(event.target.value)];if(next)onChange(next);}}/></div>
  <div className="effort-scale" aria-hidden="true"><span>{reasoningLabels[levels[0]]}</span><span>{reasoningLabels[levels.at(-1)!]}</span></div>
 </div>;
}
