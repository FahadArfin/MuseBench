import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronRight,LoaderCircle,Pencil,Play,Plus,RefreshCw,Terminal,X} from 'lucide-react';
import type {Action,AppState} from '../shared/types';
import type {ActionPlatform,ProjectActionDefinition,ProjectActionRow,ProjectActionsSnapshot} from '../shared/project-actions.mjs';
import './project-actions.css';

const platforms:Record<ActionPlatform,string>={win32:'Windows',darwin:'macOS',linux:'Linux'};
const definitionOf=({id,name,cwd,commands,timeoutSeconds}:ProjectActionDefinition):ProjectActionDefinition=>({id,name,cwd,commands:{...commands},timeoutSeconds});
const errorText=(error:unknown)=>error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': Error: /,''):String(error);

export function ProjectActions({state,busy,act}:{state:AppState;busy:boolean;act:(action:Action)=>Promise<AppState|null>}){
 const projectId=state.activeProject?.id,taskId=state.task?.id,owner=`${projectId}:${taskId}`;
 const currentOwner=useRef(owner);currentOwner.current=owner;
 const serial=useRef(0),operation=useRef(false),reviewRef=useRef<HTMLElement>(null);
 const [view,setView]=useState<ProjectActionsSnapshot|null>(null),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
 const [selected,setSelected]=useState<ProjectActionRow|null>(null),[edit,setEdit]=useState<ProjectActionDefinition|null>(null);
 const load=useCallback(async()=>{
  const ticket=++serial.current;if(!projectId||!taskId)return;setLoading(true);
  try{if(!window.musebench?.inspectProjectActions)throw Error('Project actions are available in the latest desktop app.');const result=await window.musebench.inspectProjectActions({projectId,taskId});if(ticket!==serial.current||currentOwner.current!==owner)return;if(result.projectId!==projectId||result.taskId!==taskId)throw Error('The selected chat changed. Refresh project actions.');setView(result);}
  catch(error){if(ticket===serial.current&&currentOwner.current===owner)setError(errorText(error));}
  finally{if(ticket===serial.current&&currentOwner.current===owner)setLoading(false);}
 },[projectId,taskId,owner]);
 useEffect(()=>{setView(null);setSelected(null);setEdit(null);setError('');setWorking(false);void load();return()=>{serial.current++;};},[load]);
 useEffect(()=>{if(selected)reviewRef.current?.focus();},[selected]);
 if(!projectId||!taskId)return null;
 const bound=view?.projectId===projectId&&view?.taskId===taskId;
 const locked=busy||working||loading||state.task?.check?.status==='running'||state.task?.archived===true||!!state.task?.reviewContract;
 const run=async(action:Action,save=false)=>{
  if(operation.current||!bound||locked)return;operation.current=true;setWorking(true);setError('');const ownerAtStart=owner;
  try{const result=await act(action);if(!result)throw Error('The action could not be completed. Try again.');if(result.error)throw Error(result.error);if(currentOwner.current!==ownerAtStart)return;setSelected(null);if(save){setEdit(null);await load();}}
  catch(error){if(currentOwner.current===ownerAtStart)setError(errorText(error));}
  finally{operation.current=false;if(currentOwner.current===ownerAtStart)setWorking(false);}
 };
 const beginEdit=(row?:ProjectActionRow)=>{setSelected(null);setError('');setEdit(row?definitionOf(row):{id:'action-'+crypto.randomUUID(),name:'',cwd:'.',commands:{},timeoutSeconds:120});};
 const commandField=(platform:ActionPlatform)=>edit&&<label key={platform}>{platforms[platform]} command<textarea aria-label={`${platforms[platform]} command`} value={edit.commands[platform]??''} maxLength={4000} placeholder={platform==='win32'?'npm run build':'npm run build'} onChange={event=>{const commands={...edit.commands};if(event.target.value.trim())commands[platform]=event.target.value;else delete commands[platform];setEdit({...edit,commands});}} disabled={working}/></label>;
 const recent=state.task?.checkReceipts?.filter(check=>check.action).slice(-5).reverse()??[];
 return <section className="project-actions" aria-label="Project actions">
  <div className="project-actions-heading"><div><Terminal size={15}/><h3>Project actions</h3>{view?.sample&&<span className="project-actions-sample">Preview sample</span>}</div><div><button type="button" className="icon-button" aria-label="Refresh project actions" title="Refresh project actions" disabled={working||loading} onClick={()=>{setSelected(null);setEdit(null);setError('');void load();}}><RefreshCw size={14} className={loading?'spin':''}/></button><button type="button" className="button" aria-label="Add project action" disabled={locked||!bound} onClick={()=>beginEdit()}><Plus size={14}/>Add action</button></div></div>
  {error&&<p role="alert" className="project-actions-error">{error}</p>}
  {!view&&loading&&<p className="empty-copy">Loading actions…</p>}
  {bound&&!view.actions.length&&!edit&&<p className="empty-copy">Save commands you use in this project. Review each one before running.</p>}
  {bound&&!!view.actions.length&&<ul className="project-action-list">{view.actions.map(row=><li key={row.id}><span className="project-action-icon"><Terminal size={15}/></span><div><strong>{row.name}</strong><span>{row.supported?row.command:`No ${platforms[view.platform]} command`}</span></div><button type="button" className="icon-button" aria-label={`Edit ${row.name}`} title={`Edit ${row.name}`} disabled={locked} onClick={()=>beginEdit(row)}><Pencil size={14}/></button><button type="button" className="button project-action-review-button" aria-label={`Review ${row.name}`} disabled={locked||!row.supported} onClick={()=>{setError('');setEdit(null);setSelected(row);}}><Play size={13}/>Review</button></li>)}</ul>}
  {selected&&bound&&<section ref={reviewRef} tabIndex={-1} className="project-action-review" aria-label="Review project action"><div className="project-action-review-heading"><strong>{selected.name}</strong><button type="button" className="icon-button" aria-label="Close review" disabled={working} onClick={()=>setSelected(null)}><X size={14}/></button></div><pre>{selected.command}</pre><dl><div><dt>Folder</dt><dd>{selected.folder}</dd></div><div><dt>Shell</dt><dd>{selected.shell} · {selected.timeoutSeconds}s limit</dd></div></dl><div className="project-action-review-footer"><span>Runs locally with your account’s permissions.</span><button type="button" className="button primary" disabled={locked} onClick={()=>void run({type:'runProjectAction',projectId,taskId,actionId:selected.id,revision:view.revision})}>{working?<LoaderCircle size={14} className="spin"/>:<Play size={14}/>}Run action</button></div></section>}
  {edit&&bound&&<form className="project-action-editor" aria-label="Edit project action" onSubmit={event=>{event.preventDefault();void run({type:'saveProjectAction',projectId,taskId,revision:view.revision,definition:edit},true);}}><label>Action name<input autoFocus aria-label="Action name" value={edit.name} maxLength={80} required disabled={working} placeholder="Build site" onChange={event=>setEdit({...edit,name:event.target.value})}/></label>{commandField(view.platform)}<div className="project-action-editor-options"><label>Working folder<input aria-label="Working folder" value={edit.cwd} maxLength={1000} required disabled={working} onChange={event=>setEdit({...edit,cwd:event.target.value})}/></label><label>Time limit (seconds)<input aria-label="Time limit (seconds)" type="number" min={1} max={600} value={edit.timeoutSeconds} disabled={working} onChange={event=>setEdit({...edit,timeoutSeconds:Number(event.target.value)})}/></label></div><details><summary>Other platforms</summary>{(Object.keys(platforms) as ActionPlatform[]).filter(platform=>platform!==view.platform).map(commandField)}</details><div className="project-action-editor-footer"><span>Saved to .musebench/actions.json</span><button type="button" className="button" aria-label="Cancel editing" disabled={working} onClick={()=>setEdit(null)}>Cancel</button><button type="submit" className="button primary" disabled={locked||!edit.name.trim()||!Object.keys(edit.commands).length}>{working?<LoaderCircle size={14} className="spin"/>:null}Save action</button></div></form>}
  {!!recent.length&&<details className="project-action-history"><summary><ChevronRight size={13}/>Recent action runs</summary>{recent.map(check=><details key={check.id}><summary>{check.action?.name} <span>{check.status} · {new Date(check.startedAt).toLocaleString()}</span></summary><pre>{check.command}{'\n'}{check.action?.cwd}{'\n\n'}{check.log||'No output.'}</pre></details>)}</details>}
 </section>;
}
