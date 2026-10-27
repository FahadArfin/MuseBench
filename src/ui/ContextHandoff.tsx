import {useRef,useState} from 'react';
import type {Action,AppState,ContextFile,TaskSummary} from '../shared/types';
import {Modal} from './WorkspacePanels';
export function ContextHandoff({source,tasks,initialText,files,busy,act,close}:{source:TaskSummary;tasks:TaskSummary[];initialText:string;files:ContextFile[];busy:boolean;act:(action:Action)=>Promise<AppState|null>;close:()=>void}){
 const [text,setText]=useState(initialText),[target,setTarget]=useState(''),[error,setError]=useState(''),[sent,setSent]=useState('');const requestId=useRef(crypto.randomUUID());
 const recipients=tasks.filter(t=>t.id!==source.id&&!t.archived&&t.mode==='muse');
 return <Modal title="Send context to another chat" close={close} className="handoff-dialog"><p className="modal-intro">Queue an attributed handoff for another chat’s next run.</p><form onSubmit={async e=>{e.preventDefault();setError('');const result=await act({type:'handoffContext',id:requestId.current,sourceTaskId:source.id,targetTaskId:target,text,files});if(result?.error)setError(result.error);else if(result)setSent(recipients.find(t=>t.id===target)?.title??'the selected chat');}}>
 <label>Recipient<select aria-label="Handoff recipient" value={target} onChange={e=>setTarget(e.target.value)} disabled={busy||!!sent}><option value="">Choose a chat</option>{recipients.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
 <p className="popover-help">{text.length.toLocaleString()} / 8,000 characters. {text.length>8000?'Shorten this draft before queuing; nothing has been silently removed.':'Review the objective, constraints and unfinished checks before sending.'}</p><label>Context<textarea aria-label="Handoff context" value={text} onChange={e=>setText(e.target.value)} maxLength={8000} rows={6} disabled={busy||!!sent}/></label>
 <p className="popover-help">From {source.title}. {files.length?`${files.length} selected text file snapshot${files.length===1?'':'s'} will be included.`:'No file attachments.'} Recipient permissions stay unchanged.</p>
 {files.length>0&&<ul>{files.map(f=><li key={f.path}>{f.path}</li>)}</ul>}
 {!recipients.length&&<p>Create another Muse chat to receive a handoff.</p>}{error&&<p role="alert">{error}</p>}{sent?<p role="status">Queued in {sent}. Your draft is unchanged.</p>:<button className="button primary" type="submit" disabled={busy||!target||!text.trim()||text.length>8000}>Queue context</button>}
 </form></Modal>;
}
