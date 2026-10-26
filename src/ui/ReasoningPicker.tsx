import {useId,useLayoutEffect,useRef,type CSSProperties} from 'react';
import {Check,RotateCcw,Sparkles} from 'lucide-react';
import {REASONING_LEVELS} from '../shared/run-options.mjs';
import type {RunOptions} from '../shared/types';

export const reasoningLabels:Record<RunOptions['reasoning'],string>={none:'None',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max',ultra:'Ultra'};
const moods:Record<RunOptions['reasoning'],{title:string;description:string}>={
 none:{title:'Straight to it',description:'Skip extra reasoning for direct answers.'},
 minimal:{title:'Quick spark',description:'A little thought for simple requests.'},
 low:{title:'Warming up',description:'Light reasoning for everyday tasks.'},
 medium:{title:'Finding the flow',description:'Room to think through the moving parts.'},
 high:{title:'Deep dive',description:'More room for tricky code and decisions.'},
 xhigh:{title:'Connecting the dots',description:'Extra thought for problems with many layers.'},
 max:{title:'Big brain energy',description:'An extended thinking budget for demanding work.'},
 ultra:{title:'To the moon',description:'The largest thinking budget for your hardest tasks.'},
};

export function ReasoningPicker({value,onChange}:{value:RunOptions['reasoning'];onChange:(value:RunOptions['reasoning'])=>void}){
 const id=useId(),index=REASONING_LEVELS.indexOf(value),mood=moods[value];
 const panel=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const position=()=>{const element=panel.current,anchor=element?.parentElement;if(!element||!anchor)return;const rect=anchor.getBoundingClientRect(),above=rect.top-20,below=innerHeight-rect.bottom-20;const down=above<element.scrollHeight&&below>above;element.dataset.placement=down?'below':'above';element.style.setProperty('--thinking-max-height',`${Math.max(120,down?below:above)}px`);};
  position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[]);
 return <div ref={panel} className="composer-popover reasoning-popover" role="dialog" aria-label="Reasoning controls" style={{'--thinking-fill':`${index/7*100}%`,'--thinking-glow':.12+index*.045} as CSSProperties}>
  <div className="reasoning-heading"><span><Sparkles size={14}/>Thinking energy</span><button type="button" className="icon-button" aria-label="Reset reasoning to High" title="Reset to High" onClick={()=>onChange('high')}><RotateCcw size={14}/></button></div>
  <div className="thinking-scene" aria-hidden="true"><span className="thinking-orbit"/><span className="thinking-spark spark-one">✦</span><span className="thinking-spark spark-two">✧</span><span className="thinking-face" key={value}><i/><i/><b/></span><div className="thinking-bars">{REASONING_LEVELS.map((level,i)=><span key={level} className={i<=index?'lit':''} style={{height:12+i*4}}/>)}</div></div>
  <div className="thinking-caption" aria-live="polite"><strong>{mood.title}</strong><span className="thinking-level">{reasoningLabels[value]}</span><p id={`${id}-description`}>{mood.description}</p></div>
  <input type="range" aria-label="Reasoning level" aria-describedby={`${id}-description`} aria-valuetext={reasoningLabels[value]} min={0} max={7} step={1} value={index} onChange={event=>onChange(REASONING_LEVELS[Number(event.target.value)])}/>
  <div className="effort-scale"><span>Quick & light</span><span>Slow & thoughtful</span></div>
  <fieldset className="thinking-options"><legend className="sr-only">Select reasoning effort</legend>{REASONING_LEVELS.map(level=><label className={`thinking-option ${value===level?'selected':''}`} key={level}><input type="radio" name={`${id}-effort`} value={level} checked={value===level} onChange={()=>onChange(level)}/><span>{reasoningLabels[level]}</span>{value===level&&<Check size={11} aria-hidden="true"/>}</label>)}</fieldset>
  <p className="popover-help">More thinking can take longer and use more tokens.</p>
 </div>;
}
