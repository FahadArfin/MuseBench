import {useEffect,useState} from 'react';
import {HOOK_EVENTS,type NativeHook} from '../shared/native-hooks.mjs';
import type {CustomizeCommand,CustomizeState} from '../shared/customize-types';
export function ProjectHooks({config,presets,starter,onStarterConsumed,disabled,save}:{config:CustomizeState['hooks'];presets?:CustomizeState['hookPresets'];starter?:{id:string;name:string;hooks:NativeHook[]};onStarterConsumed?:()=>void;disabled:boolean;save:(command:CustomizeCommand)=>void}){
 const [items,setItems]=useState<NativeHook[]>(config?.items??[]),[reviewed,setReviewed]=useState(false);
 const [presetId,setPresetId]=useState(''),[presetName,setPresetName]=useState(''),[loaded,setLoaded]=useState('');
 useEffect(()=>{setItems(config?.items??[]);setReviewed(false);setLoaded('');},[config?.root,config?.revision]);
 useEffect(()=>{if(starter&&config){setItems(structuredClone(starter.hooks));setReviewed(false);setLoaded(starter.name);onStarterConsumed?.();}},[starter?.id,config?.root]);
 const change=(next:NativeHook[])=>{setItems(next);setReviewed(false);};
 if(!config)return <p>Open a project to configure its hooks.</p>;
 const dirty=JSON.stringify(items)!==JSON.stringify(config.items);
 const selected=presets?.items.find(item=>item.id===presetId);
 return <div className="project-hooks"><p className="extensions-path">{config.root}</p>
 {starter&&loaded===starter.name&&<p className="extensions-help" role="status">Loaded {loaded} as an editable draft. Review the command for this project before saving.</p>}
 {presets&&<details><summary>Reusable presets</summary><fieldset disabled={disabled}><legend>Hook preset</legend><p className="extensions-help">Presets are local templates. Loading one replaces this draft; review and save below to use it in this project.</p>
 <label>Saved preset<select aria-label="Saved hook preset" value={selected?.id??''} onChange={e=>{const preset=presets.items.find(item=>item.id===e.target.value);setPresetId(preset?.id??'');setPresetName(preset?.name??'');}}><option value="">New preset</option>{presets.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
 <button className="button" disabled={!selected} onClick={()=>{if(selected){change(structuredClone(selected.hooks));setLoaded(selected.name);}}}>Load into draft</button>
 <label>Preset name<input aria-label="Hook preset name" maxLength={80} value={presetName} onChange={e=>setPresetName(e.target.value)}/></label>
 <button className="button" disabled={!presetName.trim()||presets.items.length>=20} onClick={()=>save({type:'saveHookPreset',revision:presets.revision,name:presetName,hooks:items})}>Save draft as new preset</button>
 {selected&&<><button className="button" disabled={!presetName.trim()} onClick={()=>save({type:'saveHookPreset',revision:presets.revision,id:selected.id,name:presetName,hooks:items})}>Update preset from draft</button><button className="text-link" onClick={()=>save({type:'deleteHookPreset',revision:presets.revision,id:selected.id})}>Delete preset</button></>}
 {loaded&&<p className="extensions-help" role="status">Loaded {loaded} into the draft. Project hooks have not changed.</p>}
 </fieldset></details>}
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
