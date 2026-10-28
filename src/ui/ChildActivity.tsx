import {useId,useState} from 'react';
import {ChevronDown,RefreshCw} from 'lucide-react';
import {MotionDisclosure} from './MotionDisclosure';
import type {Action,AppState,NativeChild,RuntimeState,Task} from '../shared/types';

const label=(kind:string,tool?:string)=>kind==='userMessage'?'You':kind==='agentMessage'?'Muse':kind==='toolCall'?tool??'Tool':kind==='userShell'?'Shell':kind;
export function ChildActivity({item,task,runtime,act}:{item:NativeChild;task:Task;runtime:RuntimeState;act:(a:Action)=>Promise<AppState|null>}){
 const id=useId(),[open,setOpen]=useState(false),[reading,setReading]=useState(false),[visible,setVisible]=useState(25),[error,setError]=useState('');
 const entry=runtime.childInspections?.find(i=>i.itemId===item.itemId&&i.childSessionId===item.childSessionId&&i.sessionId===runtime.sessionId);
 const available=!!runtime.permissionVerified&&!!runtime.sessionId&&!!item.childSessionId;
 const loading=reading||entry?.status==='loading',data=entry?.data,history=data?.history;
 const read=async()=>{
  if(!available||loading)return;setOpen(true);setReading(true);setError('');
  try{const result=await act({type:'inspectChild',taskId:task.id,sessionId:runtime.sessionId!,itemId:item.itemId,revision:item.revision});if(result?.error)setError('Could not read this child activity. Refresh to try again.');}
  catch{setError('Could not read this child activity. Refresh to try again.');}
  finally{setReading(false);}
 };
 const toggle=()=>{if(open)setOpen(false);else if(!entry)void read();else setOpen(true);};
 if(!item.childSessionId)return <p className="popover-help">Muse has not reported a readable child session.</p>;
 return <div className="child-activity">
  <button type="button" className="child-activity-toggle" aria-expanded={open} aria-controls={id} disabled={!available&&!entry} onClick={toggle}><ChevronDown size={14} aria-hidden className={open?'expanded':''}/>{open?'Hide activity':entry?'Show activity':'Read activity'}</button>
  <MotionDisclosure id={id} open={open} innerClassName="child-activity-content">
   <div className="child-activity-toolbar"><span>{loading?'Reading activity…':entry?.readAt?`Snapshot · ${new Date(entry.readAt).toLocaleTimeString()}`:'Child activity'}</span><button type="button" aria-label="Refresh child activity" title="Refresh child activity" disabled={!available||loading} onClick={()=>void read()}><RefreshCw size={14} aria-hidden/></button></div>
   {loading&&<p role="status">Reading from Muse…</p>}
   {(error||entry?.error)&&<p role="alert">{error||entry?.error}</p>}
   {entry&&entry.revision!==item.revision&&<p className="popover-help">The child changed since this read. Refresh for its latest activity.</p>}
   {!available&&<p className="popover-help">Connect to read this child again.</p>}
   {data&&<>
    <dl className="child-activity-facts"><dt>Status</dt><dd>{data.session.status??'Not reported'}</dd>{data.session.modelId&&<><dt>Model</dt><dd>{data.session.modelId}</dd></>}{data.session.workspaceRoot&&<><dt>Workspace</dt><dd>{data.session.workspaceRoot}</dd></>}</dl>
    <h4>Activity</h4>
    {!history?.available?<p>{history?.reason??'Activity unavailable.'}</p>:<>
     {!!history.omittedItems&&<p className="popover-help">{history.omittedItems.toLocaleString()} earlier or unsupported items are outside this view.</p>}
     {history.shortened&&<p className="popover-help">Some text or stored output is shortened in this view.</p>}
     {history.items.length>visible&&<button type="button" onClick={()=>setVisible(n=>n+25)}>Show earlier activity ({history.items.length-visible})</button>}
     {history.items.length===0?<p>No activity was returned.</p>:<ol className="child-activity-list" aria-label="Child activity items">{history.items.slice(-visible).map(i=><li key={i.itemId}><div><strong>{label(i.kind,i.tool)}</strong><span>{i.status??'Status not reported'}</span></div><pre>{i.text||'No text reported.'}</pre>{i.shortened&&<small>Shortened output</small>}</li>)}</ol>}
    </>}
    <h4>Worktree</h4>
    {data.worktree?<><dl className="child-activity-facts">{Object.entries(data.worktree).map(([key,value])=><div key={key}><dt>{{worktreeRoot:'Folder',baseCommit:'Base commit',headCommit:'Recorded head',ownership:'Ownership',cleanupPolicy:'Cleanup policy',cleanupState:'Cleanup state',parentDirtyExcluded:'Parent uncommitted changes excluded'}[key]??key}</dt><dd>{typeof value==='boolean'?value?'Yes':'No':value}</dd></div>)}</dl><p className="popover-help">Recorded by Muse; folder existence has not been checked.</p></>:<p className="popover-help">Worktree details not reported.</p>}
    <h4>Tokens</h4>
    {data.tokens?<p>{data.tokens.totalTokens.toLocaleString()} total · {data.tokens.promptTokens.toLocaleString()} input · {data.tokens.outputTokens.toLocaleString()} output</p>:<p className="popover-help">Token totals not reported in this read.</p>}
   </>}
  </MotionDisclosure>
 </div>;
}
