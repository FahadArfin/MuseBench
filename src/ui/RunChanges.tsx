import {useEffect,useRef,useState} from 'react';
import {MessageSquarePlus,RefreshCw} from 'lucide-react';
import {Diff} from './WorkspacePanels';
import type {Action,AppState} from '../shared/types';
import type {RunChangeView,RunChangeFile} from '../shared/run-changes.mjs';
import './run-changes.css';

export function RunChanges({taskId,runId,act,onDraft}:{taskId:string;runId:string;act:(action:Action)=>Promise<AppState|null>;onDraft:(text:string)=>void}){
 const owner=taskId+':'+runId,current=useRef(owner),alive=useRef(false),serial=useRef(0),operation=useRef(false);current.current=owner;
 const [view,setView]=useState<RunChangeView|null>(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [comment,setComment]=useState<string|null>(null),[side,setSide]=useState<'before'|'after'>('after'),[start,setStart]=useState(1),[end,setEnd]=useState(1),[note,setNote]=useState('');
 const valid=()=>alive.current&&current.current===owner;
 const load=async()=>{const request=++serial.current;setLoading(true);setError('');try{const result=await window.musebench!.inspectRunChanges({taskId,runId});if(valid()&&request===serial.current&&result.taskId===taskId&&result.runId===runId)setView(result);}catch(error){if(valid()&&request===serial.current){setView(null);setError(String(error));}}finally{if(valid()&&request===serial.current)setLoading(false);}};
 useEffect(()=>{alive.current=true;operation.current=false;setWorking(false);setView(null);setComment(null);setNote('');setStatus('');void load();return()=>{alive.current=false;serial.current++;};},[owner]);
 const action=async(work:()=>Promise<void>)=>{if(operation.current)return;operation.current=true;setWorking(true);setError('');setStatus('');try{await work();}catch(error){if(valid())setError(String(error));}finally{if(valid()){operation.current=false;setWorking(false);}}};
 const mark=(file:RunChangeFile)=>void action(async()=>{const result=await act({type:'setRunFileReviewed',taskId,runId,revision:view!.revision!,path:file.path,reviewed:!file.reviewed});if(!valid())return;if(!result||result.error)throw Error(result?.error??'Review could not be saved.');await load();});
 const add=()=>void action(async()=>{const result=await window.musebench!.prepareRunFeedback({taskId,runId,revision:view!.revision!,path:comment!,side,start,end,note});if(!valid())return;onDraft(result.text);if(valid()){setNote('');setStatus('Added to your draft.');}});
 const selected=view?.files.find(file=>file.path===comment),locked=loading||working;
 return <section className="run-changes" aria-label="Changes observed during this run">
  <div className="run-changes-summary"><div><strong>Observed during this run</strong><small>{view?.sample?'Sample review · ':''}{view?.status==='complete'?`${view.files.length} files · ${view.files.filter(file=>file.reviewed&&!file.stale).length} reviewed`:'Source review'}{view?.capturedAt?' · '+new Date(view.capturedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}</small></div><button className="icon-button" aria-label="Refresh run changes" disabled={locked} onClick={()=>void load()}><RefreshCw size={15}/></button></div>
  <p className="run-changes-caption">Includes edits observed in the workspace. Other tools or people may also have changed these files.</p>
  {error&&<p role="alert" className="run-changes-error">{error}</p>}{status&&<p role="status">{status}</p>}
  {loading&&<p role="status">Loading captured changes…</p>}
  {view?.status!=='complete'&&!loading&&view&&<p className="empty-copy">{view.reason??'No source capture is available.'}</p>}
  {view?.status==='complete'&&!loading&&<>
   {!view.files.length&&<p className="empty-copy">No source changes were observed during this run.</p>}
   {view.files.map(file=><article className="run-change-file" key={file.path}>
    {file.omitted||file.binary?<div className="run-change-unavailable"><strong>{file.path}</strong><span>{file.binary?'Binary file':'Text omitted by capture limits'}</span></div>:<Diff file={file} taskId={taskId}/>}
    <div className="run-change-controls"><label><input type="checkbox" aria-label={`Reviewed ${file.path}`} checked={file.reviewed&&!file.stale} disabled={locked||file.stale} onChange={()=>mark(file)}/>Reviewed</label>{file.stale&&<span>Changed since this run</span>}<button disabled={locked||file.stale||file.binary||file.omitted} aria-label={`Comment on ${file.path}`} onClick={()=>{setComment(comment===file.path?null:file.path);setSide(file.afterHash?'after':'before');setStart(1);setEnd(1);setNote('');setStatus('');}}><MessageSquarePlus size={14}/>Comment</button></div>
    {comment===file.path&&<form className="run-change-comment" onSubmit={event=>{event.preventDefault();add();}}>
     <div className="run-change-range"><label>Side<select aria-label="Captured side" value={side} disabled={locked||file.stale} onChange={e=>setSide(e.target.value as 'before'|'after')}><option value="after" disabled={!file.afterHash}>After</option><option value="before" disabled={!file.beforeHash}>Before</option></select></label><label>From<input aria-label="Start line" type="number" min={1} value={start} disabled={locked||file.stale} onChange={e=>setStart(Number(e.target.value))}/></label><label>To<input aria-label="End line" type="number" min={start} value={end} disabled={locked||file.stale} onChange={e=>setEnd(Number(e.target.value))}/></label></div>
     <textarea aria-label="Review comment" placeholder="What should change?" value={note} maxLength={4000} disabled={locked||file.stale} onChange={e=>setNote(e.target.value)}/><div><small>Added as editable feedback. Send it when ready.</small><button className="primary-button" type="submit" disabled={locked||!!selected?.stale||!note.trim()||start<1||end<start}>Add to draft</button></div>
    </form>}
   </article>)}
   {view.omittedFiles>0&&<p className="run-changes-caption">{view.omittedFiles} additional files exceed the capture limit.</p>}
  </>}
 </section>;
}
