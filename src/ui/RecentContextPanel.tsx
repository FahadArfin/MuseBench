import {useState} from 'react';
import type {Action,AppState,RuntimeState,Task} from '../shared/types';
import './recent-context.css';
export function RecentContextPanel({task,runtime,busy,act}:{task:Task;runtime:RuntimeState;busy:boolean;act:(action:Action)=>Promise<AppState|null>}){
 const saved=task.recentContext,sessionId=runtime.nativeSessionId??task.nativeSession?.id,observed=task.contextCompactions?.some(row=>row.status==='compacted'&&row.sessionId===sessionId);
 const [count,setCount]=useState(saved?.count??4),[error,setError]=useState('');
 if(!observed||task.mode!=='muse')return null;
 const binding={projectId:task.projectId,taskId:task.id},prepared=saved?.prepared,included=!!saved?.stagedDigest,locked=busy||task.archived;
 const run=async(action:Action)=>{setError('');try{const next=await act(action);if(next?.error)setError(next.error);}catch(e){setError(e instanceof Error?e.message:'Could not update recent excerpts.');}};
 return <details className="recent-context" role="group" aria-label="Recent excerpts"><summary>Recent excerpts <small>{included?'Included':prepared?'Ready to review':'Local only'}</small></summary>
  <p>Review saved local chat text after compaction. These excerpts are not evidence of what Muse retained.</p>
  {runtime.simulation&&<p className="popover-help">Preview sample · No model requests.</p>}
  <div className="recent-context-controls"><label>Messages <select aria-label="Recent message count" value={count} disabled={locked||included} onChange={e=>setCount(Number(e.target.value))}>{[2,4,8].map(n=><option key={n} value={n}>{n} recent messages</option>)}</select></label><button type="button" disabled={locked||included} onClick={()=>void run({type:'prepareRecentContext',...binding,count})}>Prepare excerpts</button></div>
  <label className="recent-context-preference"><input type="checkbox" checked={saved?.autoPrepare===true} disabled={locked} onChange={e=>void run({type:'setRecentContextPreference',...binding,enabled:e.target.checked})}/>Prepare locally after completed turns</label>
  <p className="popover-help">Local preparation makes no model request and never sends a message. Up to 8,000 characters; text only, with known outcomes and explicit truncation.</p>
  {prepared&&<><pre aria-label="Reviewed local excerpts" tabIndex={0}>{prepared.section}</pre><p className="popover-help">{prepared.sources.length} messages · {prepared.section.length.toLocaleString()} characters · Prepared after compaction</p>{included?<div className="recent-context-controls"><span role="status">Included with your next message</span><button type="button" disabled={locked} onClick={()=>void run({type:'removeRecentContext',...binding})}>Remove inclusion</button></div>:<button type="button" disabled={locked} onClick={()=>void run({type:'stageRecentContext',...binding,digest:prepared.digest})}>Include with next message</button>}<p className="popover-help">Included only when you later send or queue a message. Earlier actions remain history and grant no permissions.</p></>}
  {error&&<p role="alert">{error}</p>}
 </details>;
}
