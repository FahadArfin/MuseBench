import {useEffect,useRef,useState} from 'react';
import {ChevronDown,SlidersHorizontal} from 'lucide-react';
import {validateRunSettings,runSettingsChanges} from '../shared/integration-panel.mjs';
import type {IntegrationPanelState,IntegrationReview,RunSettings} from '../shared/integration-panel.mjs';
import type {CustomizeResult} from '../shared/customize-types';

type Draft={required:boolean;startupTimeout:string;toolTimeout:string};
const asDraft=(values:RunSettings):Draft=>({required:values.required,startupTimeout:String(values.startupTimeout),toolTimeout:String(values.toolTimeout)});
const display=(value:number|boolean)=>typeof value==='boolean'?(value?'On':'Off'):`${value} s`;
export function IntegrationPanel({name,revision,disabled,onChanged}:{name:string;revision:string;disabled:boolean;onChanged:(result:CustomizeResult)=>void}){
 const [panel,setPanel]=useState<IntegrationPanelState>(),[draft,setDraft]=useState<Draft>(),[review,setReview]=useState<IntegrationReview>(),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),request=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
 const blocked=disabled||busy;
 async function operate(action:()=>Promise<void>){const ticket=++request.current;setBusy(true);setError('');try{await action();}catch(e){if(alive.current&&request.current===ticket){setReview(undefined);setAccepted(false);setError(String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,''));}}finally{if(alive.current&&request.current===ticket)setBusy(false);}}
 async function inspect(){await operate(async()=>{const result=await window.musebench!.customize({type:'inspectIntegrationPanel',name,revision});if(!alive.current)return;const next=result.integrationPanel;if(!next||next.schemaVersion!==1||next.kind!=='mcp-run-settings'||next.name!==name||next.revision!==revision)throw Error('This integration panel is unavailable. Refresh its details.');setPanel(next);setDraft(next.values?asDraft(next.values):undefined);});}
 let parsed:RunSettings|undefined;try{if(draft)parsed=validateRunSettings({...draft,startupTimeout:Number(draft.startupTimeout),toolTimeout:Number(draft.toolTimeout)});}catch{/* Invalid drafts stay local; Review is disabled. */}
 const changed=!!parsed&&!!panel?.values&&runSettingsChanges(panel.values,parsed).length>0;
 const edit=(next:Draft)=>{setDraft(next);setReview(undefined);setAccepted(false);setError('');};
 return <details className="integration-panel" onToggle={event=>{if(event.currentTarget.open&&!panel&&!busy)void inspect();}}>
  <summary><SlidersHorizontal size={15}/><span>Run settings</span><ChevronDown size={14}/></summary>
  {busy&&!panel&&<p role="status" className="extension-meta">Loading settings…</p>}
  {error&&<p role="alert" className="extensions-alert error">{error}</p>}
  {panel?.simulation&&<p className="extension-meta">Preview only · configuration changes are simulated.</p>}
  {panel&&!panel.editable&&<p className="extension-meta">{panel.reason}</p>}
  {panel?.editable&&draft&&!review&&<form onSubmit={event=>{event.preventDefault();if(!parsed||blocked||!changed)return;const values=parsed;void operate(async()=>{const result=await window.musebench!.customize({type:'prepareIntegrationPanel',name,revision,values});if(!alive.current)return;const prepared=result.integrationReview;if(!prepared||prepared.schemaVersion!==1||prepared.name!==name||prepared.revision!==revision)throw Error('Review could not be prepared. Refresh these settings.');setReview(prepared);setAccepted(false);});}}>
   <div className="integration-fields">{panel.fields.map(field=>field.type==='boolean'?<label key={field.key} className="integration-required"><input type="checkbox" aria-label={field.label} checked={draft.required} disabled={blocked} onChange={event=>edit({...draft,required:event.target.checked})}/><span>{field.label}<small>{field.description}</small></span></label>:<label key={field.key}>{field.label}<input type="number" aria-label={field.label} min={field.min} max={field.max} step="any" required value={draft[field.key]} disabled={blocked} onChange={event=>edit({...draft,[field.key]:event.target.value})}/><small>{field.description}</small></label>)}</div>
   <div className="extension-controls"><button className="button primary" disabled={blocked||!changed}>Review changes</button><button type="button" className="button" disabled={blocked||!panel.values} onClick={()=>edit(asDraft(panel.values!))}>Discard changes</button></div>
  </form>}
  {review&&<div className="integration-review"><h4>Review run settings</h4><dl>{review.changes.map(change=><div key={change.key}><dt>{change.label}</dt><dd>{display(change.before)} → {display(change.after)}</dd></div>)}</dl><p className="extension-meta">Reconnect Muse after saving. Existing connections keep their previous settings.</p><label className="extensions-consent"><input type="checkbox" checked={accepted} disabled={blocked} onChange={event=>setAccepted(event.target.checked)}/>I reviewed these changes.</label><div className="extension-controls"><button className="button" disabled={blocked} onClick={()=>{setReview(undefined);setAccepted(false);}}>Edit settings</button><button className="button primary" disabled={blocked||!accepted} onClick={()=>void operate(async()=>{const result=await window.musebench!.customize({type:'applyIntegrationPanel',token:review.token,reviewed:true});if(alive.current)onChanged(result);})}>Apply changes</button></div></div>}
 </details>;
}
