import {useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {ArrowLeft,Check,ChevronRight,RefreshCw,RotateCcw,Zap} from 'lucide-react';
import {REASONING_LEVELS} from '../shared/run-options.mjs';
import type {RunOptions} from '../shared/types';
import type {NativeModelCatalog} from '../shared/models.mjs';

export const reasoningLabels:Record<RunOptions['reasoning'],string>={none:'None',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max',ultra:'Ultra'};

type Props={value:RunOptions['reasoning'];onChange:(value:RunOptions['reasoning'])=>void;levels?:readonly RunOptions['reasoning'][];disabled?:boolean;model?:string;catalog?:NativeModelCatalog;onModelChange:(model:string)=>void;onRefreshModels:()=>void|Promise<void>};

export function ReasoningPicker({value,onChange,levels=REASONING_LEVELS,disabled=false,model,catalog,onModelChange,onRefreshModels}:Props){
 const [modelsOpen,setModelsOpen]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 const index=Math.max(0,levels.indexOf(value)),last=Math.max(0,levels.length-1),reset=levels.includes('high')?'high':levels[0];
 const panel=useRef<HTMLDivElement>(null),modelButton=useRef<HTMLButtonElement>(null),previousView=useRef(false),refreshPending=useRef(false);
 const helpId=useId(),selected=catalog?.models.find(row=>model?row.id===model:row.isDefault),modelLabel=model?selected?.label??model:'Default';
 const missing=!!model&&!!catalog&&!selected,unsupported=!!selected&&!selected.efforts.includes(value),locked=disabled||refreshing;
 const refresh=async()=>{if(disabled||refreshPending.current)return;refreshPending.current=true;setRefreshing(true);setError('');try{await onRefreshModels();}catch{setError('Couldn’t load models. Try refreshing.');}finally{refreshPending.current=false;setRefreshing(false);}};
 useLayoutEffect(()=>{
  const position=()=>{const element=panel.current,anchor=element?.parentElement;if(!element||!anchor)return;const rect=anchor.getBoundingClientRect(),above=rect.top-20,below=innerHeight-rect.bottom-20;const down=above<element.scrollHeight&&below>above;element.style.top=down?'calc(100% + 8px)':'auto';element.style.bottom=down?'auto':'calc(100% + 8px)';element.style.setProperty('--reasoning-max-height',`${Math.max(80,down?below:above)}px`);element.style.right='0px';const bounds=element.getBoundingClientRect();element.style.right=`${bounds.left<12?bounds.left-12:Math.max(0,bounds.right-innerWidth+12)}px`;};
  position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[modelsOpen,catalog,levels,disabled,error,refreshing]);
 useLayoutEffect(()=>{
  if(modelsOpen){const menu=panel.current?.querySelector('[role="menu"]');(menu?.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled)')??menu?.querySelector<HTMLElement>('button:not(:disabled)')??panel.current?.querySelector<HTMLElement>('[aria-label="Back to effort"]'))?.focus();}
  else if(previousView.current)modelButton.current?.focus();
  previousView.current=modelsOpen;
 },[modelsOpen]);
 const menuKeys=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));if(!items.length)return;
  const current=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
 };
 return <div ref={panel} tabIndex={-1} className={`composer-popover reasoning-popover ${modelsOpen?'model-list-popover':''}`} role="dialog" aria-label="Reasoning controls" aria-describedby={helpId} style={{'--reasoning-position':index/Math.max(1,last)} as CSSProperties}>
  <p id={helpId} className="sr-only">Model and effort for your next request. Queued prompts keep their saved settings.</p>
  {modelsOpen?<>
   <div className="model-list-heading"><button type="button" className="icon-button" aria-label="Back to effort" title="Back to effort" onClick={()=>setModelsOpen(false)}><ArrowLeft size={14}/></button><span>Select model</span><button type="button" className="icon-button" aria-label={catalog?'Refresh models':'Load installed models'} title={catalog?'Refresh models':'Load installed models'} disabled={locked} onClick={()=>void refresh()}><RefreshCw size={14} className={refreshing?'model-refreshing':undefined}/></button></div>
   <div role="menu" aria-label="Muse models" onKeyDown={menuKeys}>
    <button type="button" className="model-option" role="menuitemradio" tabIndex={-1} aria-checked={!model} disabled={locked} onClick={()=>{onModelChange('');setModelsOpen(false);}}><span>Default<small>Let Muse choose</small></span>{!model&&<Check size={15}/>}</button>
    {missing&&<button type="button" className="model-option" role="menuitemradio" tabIndex={-1} aria-checked="true" disabled><span>{model}<small>Unavailable</small></span><Check size={15}/></button>}
    {catalog?.models.map(row=><button key={row.id} type="button" className="model-option" role="menuitemradio" tabIndex={-1} aria-label={row.label} aria-checked={model===row.id} disabled={locked||!row.efforts.length} title={row.efforts.length?row.description:'No supported effort levels'} onClick={()=>{onModelChange(row.id);setModelsOpen(false);}}><span>{row.label}{!row.efforts.length&&<small>Unavailable</small>}</span>{model===row.id&&<Check size={15}/>}</button>)}
   </div>
   {!catalog?.models.length&&<p className="model-picker-note">{refreshing?'Loading models…':'Load models using the refresh button.'}</p>}
   {error&&<p className="model-picker-note" role="alert">{error}</p>}
  </>:<>
   <div className="reasoning-heading"><Zap size={15} aria-hidden="true"/><select aria-label="Select reasoning effort" title="Reasoning effort" value={value} disabled={locked||missing||!levels.length} onChange={event=>onChange(event.target.value as RunOptions['reasoning'])}>{!levels.includes(value)&&<option value={value} disabled>{reasoningLabels[value]} (unavailable)</option>}{levels.map(level=><option value={level} key={level}>{reasoningLabels[level]}</option>)}</select><button type="button" className="icon-button" aria-label={`Reset reasoning to ${reasoningLabels[reset]??'default'}`} title={`Reset to ${reasoningLabels[reset]??'default'}`} disabled={locked||missing||!reset} onClick={()=>reset&&onChange(reset)}><RotateCcw size={14}/></button></div>
   <button ref={modelButton} type="button" className="reasoning-model" aria-label="Change model" aria-haspopup="menu" title={`Next request: ${modelLabel}`} onClick={()=>setModelsOpen(true)}><span>{modelLabel}</span><ChevronRight size={12}/></button>
   <div className="reasoning-slider"><div className="reasoning-track" aria-hidden="true"><span/>{levels.map(level=><i key={level}/>)}</div><input type="range" aria-label="Reasoning level" aria-valuetext={reasoningLabels[value]} min={0} max={last} disabled={locked||missing||levels.length<2} step={1} value={index} title={`${reasoningLabels[value]} reasoning effort`} onChange={event=>{const next=levels[Number(event.target.value)];if(next)onChange(next);}}/></div>
   {(missing||unsupported)&&<p className="model-picker-note">{missing?'This model is unavailable. Choose another model.':'Choose a supported effort for this model.'}</p>}
  </>}
  {disabled&&!refreshing&&<p className="model-picker-note">Available after active work finishes.</p>}
 </div>;
}
