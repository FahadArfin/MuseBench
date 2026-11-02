import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUp,Bot,Check,ChevronRight,LoaderCircle} from 'lucide-react';
import {childActions,CHILD_ACTION_LABELS} from '../shared/child-actions.mjs';
import {childGroup,childTargetPending,matchingChildReceipt} from '../shared/child-messaging.mjs';
import type {Action,AppState,NativeChild,RuntimeState,Task} from '../shared/types';
import {ChildActivity} from './ChildActivity';
import {Controls} from './NativeChildrenPanel';
import './subagent-browser.css';

type Act=(action:Action)=>Promise<AppState|null>;
export const agentTitle=(item:NativeChild)=>item.label||item.objective||item.fallbackText||'Subagent';
const duration=(item:NativeChild)=>item.durationMs===undefined?'':item.durationMs<60000?`${Math.floor(item.durationMs/1000)}s`:`${Math.floor(item.durationMs/60000)}m ${Math.floor(item.durationMs/1000)%60}s`;
const statusLabel=(item:NativeChild)=>({resultReady:'Completed',inProgress:'Working',running:'Working',accepted:'Starting',starting:'Starting',closed:'Closed',completed:'Completed',failed:'Failed',cancelled:'Stopped',interrupted:'Interrupted'}[item.controlStatus||item.status]||item.controlStatus||item.status);

function MessageAgent({item,task,runtime,busy,act,value,onChange}:{item:NativeChild;task:Task;runtime:RuntimeState;busy:boolean;act:Act;value:string;onChange:(value:string,expected?:string)=>void}){
 const [sending,setSending]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),lock=useRef(false);
 const actions=childActions(item),earlier=!!runtime.ownedTurnIds&&!runtime.ownedTurnIds.includes(item.turnId??'');
 const action=actions.includes('sendMessage')?'sendMessage':!earlier&&actions.includes('followupTask')?'followupTask':null;
 const pending=childTargetPending(runtime,item.itemId);
 const enabled=!!action&&!!runtime.childControlsSupported&&!!runtime.permissionVerified&&!!runtime.sessionId&&!runtime.operationBusy&&!runtime.pending&&!pending&&!busy&&!sending;
 const send=async()=>{
  if(!enabled||!value.trim()||lock.current||!action)return;
  lock.current=true;setSending(true);setError('');setNotice('');
  const input:Extract<Action,{type:'childControl'}>={type:'childControl',taskId:task.id,sessionId:runtime.sessionId!,itemId:item.itemId,revision:item.revision,action,body:value};
  const ids=[...(runtime.childReceipts??[]),...(task.childControlReceipts??[])].map(r=>r.commandId);
  try{
   const result=await act(input),receipt=matchingChildReceipt(result,input,ids);
   if(receipt?.status==='accepted'){onChange('',input.body);setNotice('Accepted by Muse. Check activity for the agent’s response.');}
   else setError(result?.error||receipt?.reason||'Delivery was not confirmed. Your message is kept; check the receipt before retrying.');
  }catch{setError('Delivery was not confirmed. Your message is kept; check the receipt before retrying.');}
  finally{lock.current=false;setSending(false);}
 };
 const reason=!runtime.childControlsSupported?'This connection does not support messaging native subagents.':!runtime.permissionVerified||!runtime.sessionId?'Reconnect this chat to message its observed agents.':pending?'The last command is pending or uncertain. Inspect activity before retrying.':!action?earlier?'This agent belongs to an earlier request. New follow-up work is unavailable here.':item.workflowRunId?'This workflow owns the agent’s next steps. Follow-up is unavailable here.':'Messaging is unavailable in this agent’s current state.':runtime.pending?'Answer the pending Muse question or approval first.':undefined;
 return <section className="subagent-message" aria-label="Message selected subagent">
  <label htmlFor="subagent-message-input">{action==='followupTask'?'Follow up with this agent':'Message this agent'}</label>
  <div className="subagent-message-box"><textarea id="subagent-message-input" aria-label="Message this agent" placeholder="Add context or change direction…" value={value} maxLength={8000} disabled={!enabled} onChange={e=>{onChange(e.target.value);setNotice('');setError('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();void send();}}}/><button type="button" aria-label={action==='followupTask'?'Send follow-up to agent':'Send message to agent'} title={action==='followupTask'?'Start a follow-up task':'Send context to the running agent'} disabled={!enabled||!value.trim()} onClick={()=>void send()}>{sending?<LoaderCircle size={16} className="work-spin"/>:<ArrowUp size={17}/>}</button></div>
  <p className="popover-help">{reason|| (action==='followupTask'?'Starts another task with this agent.':'Sent to this agent on its current connection. Delivery does not guarantee an immediate change of direction.')}</p>
  {runtime.simulation&&<p className="popover-help">Preview sample · no agent commands execute.</p>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}

export function SubagentBrowser({task,runtime,busy,act,selectedId,onSelect,drafts,onDraft,active=true}:{active?:boolean;task:Task;runtime:RuntimeState;busy:boolean;act:Act;selectedId?:string|null;onSelect:(id:string|null)=>void;drafts:Record<string,string>;onDraft:(id:string,value:string,expected?:string)=>void}){
 const root=useRef<HTMLDivElement>(null),rowButtons=useRef(new Map<string,HTMLButtonElement>()),lastSelected=useRef<string|null>(null);
 const items=(runtime.children?.items??[]).filter(item=>item.kind==='subagent'),item=items.find(item=>item.itemId===selectedId);
 useEffect(()=>{if(!active)return;if(item){lastSelected.current=item.itemId;root.current?.querySelector<HTMLButtonElement>('button')?.focus();}else if(lastSelected.current)rowButtons.current.get(lastSelected.current)?.focus();},[selectedId,active]);
 if(item){
  const receipts=(task.childControlReceipts??runtime.childReceipts??[]).filter(r=>r.sessionId===runtime.sessionId&&r.itemId===item.itemId);
  return <div ref={root} className="subagent-detail" aria-label="Selected subagent">
   <button type="button" className="work-text-button" onClick={()=>onSelect(null)}><ArrowLeft size={14}/>All subagents</button>
   <header><Bot size={20}/><div><h2>{agentTitle(item)}</h2><span className="subagent-status">{statusLabel(item)}{duration(item)&&` · ${duration(item)}`}</span></div></header>
   {item.objective&&item.objective!==item.label&&item.label&&<p className="subagent-objective">{item.objective}</p>}
   {item.result&&<section className="subagent-result"><h3>Result</h3><pre>{item.result.summary||item.result.text||item.result.errorKind||'No result text reported.'}</pre>{item.truncated&&<p className="popover-help">Reported text is shortened.</p>}</section>}
   <ChildActivity defaultOpen autoRefresh={active&&childGroup(item)==='Active'} key={`${runtime.sessionId}:${item.itemId}:${item.childSessionId}`} item={item} task={task} runtime={runtime} act={act}/>
   <MessageAgent key={`${runtime.sessionId}:${item.itemId}`} item={item} task={task} runtime={runtime} busy={busy} act={act} value={drafts[item.itemId]??''} onChange={(value,expected)=>onDraft(item.itemId,value,expected)}/>
   {!!receipts.length&&<details className="subagent-receipts"><summary>Messages & controls ({receipts.length})</summary><ol>{receipts.slice(-10).map(r=><li key={r.commandId}><strong>{CHILD_ACTION_LABELS[r.action]??r.action}</strong><span>{r.status} · {new Date(r.at).toLocaleTimeString()}</span>{r.body&&<p>{r.body}</p>}{r.reason&&<p>{r.reason}</p>}</li>)}</ol><p className="popover-help">Accepted confirms admission by Muse, not that the agent has read the message.</p></details>}
   <details className="subagent-more"><summary>Agent controls</summary><Controls key={`${runtime.sessionId}:${item.itemId}`} item={item} task={task} runtime={runtime} busy={busy} act={act} hideMessages/></details>
  </div>;
 }
 return <div ref={root} className="subagent-browser" aria-label="Native subagents">
  {!items.length&&<p className="subagent-empty">{runtime.childControlsSupported?'No native subagents have been reported on this connection yet.':'This connection does not expose native subagents or direct messaging. Reported request activity is available in Tasks.'}</p>}
  {(['Active','Done'] as const).map(group=>{const rows=items.filter(item=>childGroup(item)===group);return rows.length>0&&<section key={group}><h3>{group} · {rows.length}</h3>{rows.map(item=><button type="button" className="subagent-row" ref={node=>{if(node)rowButtons.current.set(item.itemId,node);else rowButtons.current.delete(item.itemId);}} key={item.itemId} onClick={()=>onSelect(item.itemId)}><span className={`subagent-avatar ${group==='Active'?'is-active':''}`}>{group==='Active'?<LoaderCircle size={19} className="work-spin"/>:<Check size={18}/>}</span><span><strong>{agentTitle(item)}</strong><small>{item.result?.summary||statusLabel(item)}{duration(item)&&` · ${duration(item)}`}</small></span><ChevronRight size={14}/></button>)}</section>;})}
  {runtime.children?.truncated&&<p className="popover-help">Some earlier native children are outside this connection’s retained list.</p>}
 </div>;
}
