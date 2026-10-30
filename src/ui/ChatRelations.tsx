import {ArrowUpLeft,GitBranch,MoreHorizontal} from 'lucide-react';
import type {Action,Task,TaskSummary} from '../shared/types';
import {relationParent} from '../shared/chat-relations.mjs';
import {useChatActions} from './useChatActions';
import './chat-sidebar.css';

export function CurrentChatOptions({task,tasks,busy,active,act}:{task:Task;tasks:TaskSummary[];busy:boolean;active:boolean;act:(action:Action)=>Promise<unknown>}){
 const {open,isOpen,overlay}=useChatActions({tasks,busy,active,act});
 return <><button className="icon-button current-chat-options" aria-label="Current chat options" title="Chat options" aria-haspopup="menu" aria-expanded={isOpen(task.id)} disabled={busy} onClick={event=>open(task,event)}><MoreHorizontal size={17}/></button>{overlay}</>;
}

export function ChatRelation({task,tasks,busy,onParent}:{task:Task;tasks:TaskSummary[];busy:boolean;onParent:(id:string)=>void}){
 const parent=relationParent(task,tasks),relation=task.chatRelation;
 const unresolved=(task.forkReceipts??[]).filter(receipt=>['unknown','submitting','verifying','releasing'].includes(receipt.status));
 if(!relation&&!unresolved.length)return null;
 return <div className="chat-relation" aria-label="Chat relationship">
  {relation&&<>{parent?<button disabled={busy} title={parent.title} aria-label={relation.kind==='side'?'Back to main chat':`Forked from ${parent.title}`} onClick={()=>onParent(parent.id)}>{relation.kind==='side'?<ArrowUpLeft size={13}/>:<GitBranch size={13}/>}<span>{relation.kind==='side'?'Back to main chat':`Forked from ${parent.title}`}</span></button>:<span className="relation-unavailable">{relation.kind==='side'?'Main chat unavailable':`Forked from ${relation.parentTitle} · Unavailable`}</span>}{relation.kind==='fork'&&<span className="relation-context">{relation.context==='retained'?'Saved conversation':'Native conversation'}</span>}</>}
  {!!unresolved.length&&<details className="fork-recovery"><summary>Native fork needs inspection</summary><p>Inspect the saved native command and any child session before another fork. This operation will not be repeated automatically.</p>{unresolved.map(receipt=><div key={receipt.commandId}><p>{receipt.reason??'Independent release has not been confirmed.'}</p><dl><dt>Source session</dt><dd>{receipt.sessionId}</dd><dt>Command</dt><dd>{receipt.commandId}</dd>{receipt.childSessionId&&<><dt>Child session</dt><dd>{receipt.childSessionId}</dd></>}{receipt.leaveCommandId&&<><dt>Release command</dt><dd>{receipt.leaveCommandId}</dd></>}</dl></div>)}</details>}
 </div>;
}
