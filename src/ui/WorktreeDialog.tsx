import {useEffect,useRef,useState} from 'react';
import {GitBranch,X} from 'lucide-react';
import type {Action,AppState,Project,WorktreeState} from '../shared/types';
import './worktrees.css';
export function WorktreeDialog({project,busy,act,onClose,onOpened}:{project:Project;busy:boolean;act:(action:Action)=>Promise<AppState|null>;onClose:()=>void;onOpened:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[state,setState]=useState<WorktreeState|null>(null),[error,setError]=useState(''),[branch,setBranch]=useState(''),[base,setBase]=useState('HEAD'),[working,setWorking]=useState(false);
 useEffect(()=>{dialog.current?.showModal();let active=true;void window.musebench?.inspectWorktrees({projectId:project.id}).then(value=>{if(active)setState(value);},error=>{if(active)setError(String(error));});return()=>{active=false;dialog.current?.close();};},[project.id]);
 const run=async(action:Action)=>{setWorking(true);setError('');try{const next=await act(action);if(next&&!next.error)onOpened();else setError(next?.error||'Worktree operation did not finish.');}finally{setWorking(false);}};
 return <dialog ref={dialog} className="worktree-dialog" aria-label="Project worktrees" onCancel={e=>{if(working)e.preventDefault();else onClose();}}>
  <header><GitBranch size={18}/><strong>Worktrees</strong><button type="button" className="icon-button" aria-label="Close worktrees" disabled={working} onClick={onClose}><X size={16}/></button></header>
  <p>Keep using this folder, or start an isolated copy on a new branch.</p>
  {state&&<><div className="worktree-current"><strong>{project.name}</strong><small>{state.branch||'Detached HEAD'} · {state.head.slice(0,8)}</small><button type="button" disabled={working} onClick={onClose}>Use current folder</button></div>
   <form onSubmit={e=>{e.preventDefault();void run({type:'createWorktree',projectId:project.id,branch:branch.trim(),base:base.trim()});}}>
    <label>New branch<input aria-label="New worktree branch" placeholder="muse/my-task" value={branch} maxLength={100} onChange={e=>setBranch(e.target.value)} disabled={working}/></label>
    <label>Start from<input aria-label="Worktree base" value={base} maxLength={200} onChange={e=>setBase(e.target.value)} disabled={working}/></label>
    <small>{state.dirty?'Your uncommitted changes stay in the current folder. ':''}The worktree starts from the committed base. Dependencies are not installed automatically.</small>
    <button type="submit" className="primary-button" disabled={busy||working||!branch.trim()||!base.trim()}>{working?'Creating worktree…':'Create and open worktree'}</button>
   </form>
   {state.items.length>0&&<section aria-label="Retained worktrees"><h3>Saved worktrees</h3>{state.items.map(item=><div className="worktree-item" key={item.id}><div><strong>{item.branch}</strong><small>{item.path}</small><small>{item.available?item.locked?'Locked · retained':'Retained':item.status==='needs-attention'?'Creation needs attention':'Unavailable'}</small></div><button type="button" disabled={!item.available||working||busy} onClick={()=>void run({type:'openWorktree',projectId:project.id,id:item.id})}>Open</button></div>)}</section>}
  </>}{!state&&!error&&<p role="status">Reading repository…</p>}{error&&<p role="alert">{error}</p>}
 </dialog>;
}
