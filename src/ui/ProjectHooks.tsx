import {useEffect,useState} from 'react';
import {HOOK_EVENTS,type NativeHook} from '../shared/native-hooks.mjs';
import type {CustomizeCommand,CustomizeState} from '../shared/customize-types';
export function ProjectHooks({config,disabled,save}:{config:CustomizeState['hooks'];disabled:boolean;save:(command:CustomizeCommand)=>void}){
 const [items,setItems]=useState<NativeHook[]>(config?.items??[]),[reviewed,setReviewed]=useState(false);
 useEffect(()=>{setItems(config?.items??[]);setReviewed(false);},[config?.root,config?.revision]);
 const change=(next:NativeHook[])=>{setItems(next);setReviewed(false);};
 if(!config)return <p>Open a project to configure its hooks.</p>;
 const dirty=JSON.stringify(items)!==JSON.stringify(config.items);
 return <div className="project-hooks"><p className="extensions-path">{config.root}</p>
 <p>Hooks run as your Windows account, outside the agent sandbox and tool approval flow. Commands may change files or send data. Do not put credentials in commands. Review any scripts they call.</p>
 <p className="extensions-help">Before prompt runs when you submit; Before finish runs when Muse tries to finish and can block completion. Muse enforces hook timeouts; process cleanup can take longer. Failures may allow the turn to continue. Hooks are not a security boundary.</p>
 {items.map((item,index)=><fieldset key={index} disabled={disabled}><legend>Hook {index+1}</legend>
 <label>Name<input aria-label={`Hook ${index+1} name`} value={item.id} maxLength={80} onChange={e=>change(items.map((row,i)=>i===index?{...row,id:e.target.value}:row))}/></label>
 <label>Event<select aria-label={`Hook ${index+1} event`} value={item.event} onChange={e=>change(items.map((row,i)=>i===index?{...row,event:e.target.value as NativeHook['event']}:row))}>{HOOK_EVENTS.map(event=><option key={event} value={event}>{event==='Stop'?'Before finish':'Before prompt'}</option>)}</select></label>
 <label>Windows shell command<textarea aria-label={`Hook ${index+1} command`} value={item.command} maxLength={1500} rows={2} onChange={e=>change(items.map((row,i)=>i===index?{...row,command:e.target.value}:row))}/></label>
 <label>Timeout (seconds)<input aria-label={`Hook ${index+1} timeout`} type="number" min={1} max={30} value={item.timeout} onChange={e=>change(items.map((row,i)=>i===index?{...row,timeout:Number(e.target.value)}:row))}/></label>
 <label className="extensions-consent"><input type="checkbox" checked={item.enabled} onChange={e=>change(items.map((row,i)=>i===index?{...row,enabled:e.target.checked}:row))}/>Enabled</label><button className="text-link" onClick={()=>change(items.filter((_,i)=>i!==index))}>Remove hook {index+1}</button>
 </fieldset>)}
 <button className="button" disabled={disabled||items.length>=6} onClick={()=>change([...items,{id:'hook-'+crypto.randomUUID().slice(0,8),event:'UserPromptSubmit',command:'',timeout:5,enabled:true}])}>Add hook</button>
 {dirty&&<><label className="extensions-consent"><input type="checkbox" disabled={disabled} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed these commands and approve their access as my Windows account.</label><button className="button primary" disabled={disabled||!reviewed} onClick={()=>save({type:'saveHooks',root:config.root,revision:config.revision,hooks:items,reviewed:true})}>Save reviewed hooks</button></>}
 <p className="extensions-help">Applies only to future MuseBench Code runs in this project. Existing native project, global and managed hook files are not enabled by this setting.</p>
 </div>;
}
