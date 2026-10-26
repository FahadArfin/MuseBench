import {NativeUsageView} from './NativeUsageView';
import {useEffect,useRef,useState} from 'react';
import type {Action,AppState,Task} from '../shared/types';
export function SessionDialog({task,busy,act,onClose}:{task:Task;busy:boolean;act:(action:Action)=>Promise<AppState|null>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const session=task.nativeSession;
 const recover=async(choice:'continue'|'fresh')=>{const next=await act({type:'recoverSession',choice});if(next?.error)setError(next.error);else onClose();};
 return <dialog ref={dialog} className="worktree-dialog" aria-label="Chat session" onCancel={onClose}><header><strong>Session</strong><button type="button" className="icon-button" aria-label="Close session" onClick={onClose}>×</button></header>
  {session?<><p>{session.status==='needs-recovery'?'The last run was interrupted or could not be verified. Review partial changes before continuing.':session.status==='running'?'Muse is using this chat’s saved native session.':'Your next message resumes this native session.'}</p><code style={{fontSize:12,overflowWrap:'anywhere'}}>{session.id}</code><p>{session.root}</p>{session.status==='needs-recovery'&&!session.seeded&&<p>Input receipt could not be confirmed. Start fresh to recover safely.</p>}{session.status==='needs-recovery'&&session.seeded&&<button type="button" disabled={busy} onClick={()=>void recover('continue')}>Continue saved session</button>}<p>Starting fresh keeps your chat history and project files. It creates a new native session on your next message.</p><button type="button" disabled={busy} onClick={()=>void recover('fresh')}>Start fresh session</button><p>Muse also retains native session logs locally.</p></>:<p>This chat will create a native session on its next Muse request when the connection supports it. Existing conversation history supplies the initial context.</p>}
  <NativeUsageView usage={task.nativeUsage}/><p className="popover-help">Native compaction is unavailable on the exec connection. A recap prompt summarizes the conversation; it does not compact the native session.</p>
  {error&&<p role="alert">{error}</p>}
 </dialog>;
}
