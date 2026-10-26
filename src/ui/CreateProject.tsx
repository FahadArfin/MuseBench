import {useRef,useState} from 'react';
import {Plus,Paperclip} from 'lucide-react';
import {Modal} from './WorkspacePanels';
import {projectDetails} from '../shared/create-project.mjs';
import './create-project.css';

export function CreateProject({root,onCreate,onExisting,close}:{root:string;onCreate:(details:{name:string;goals:string;context:string})=>Promise<void>;onExisting:()=>Promise<void>;close:()=>void}){
 const [name,setName]=useState(''),[goals,setGoals]=useState(''),[context,setContext]=useState(''),[addingContext,setAddingContext]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),file=useRef<HTMLInputElement>(null);
 async function submit(){if(lock.current)return;try{projectDetails({name,goals,context});lock.current=true;setBusy(true);setError('');await onCreate({name:name.trim(),goals,context});}catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}}
 return <Modal title="Create a project" className="create-project-modal" close={()=>{if(!lock.current)close();}}><form onSubmit={e=>{e.preventDefault();void submit();}}>
  <label>What are you working on?<input data-autofocus autoComplete="off" aria-label="Project name" placeholder="Name your project" maxLength={80} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setError('');}}/></label>
  <label>What are you trying to achieve?<textarea aria-label="Project goals" placeholder="Describe your project, goals, subject, etc…" maxLength={1500} value={goals} disabled={busy} onChange={e=>setGoals(e.target.value)}/></label>
  <section className="create-project-context"><div>Context <span>optional</span></div>{addingContext?<><textarea aria-label="Project context" autoFocus placeholder="Add background, requirements, or useful links…" maxLength={2000} value={context} disabled={busy} onChange={e=>setContext(e.target.value)}/><button type="button" className="text-link" disabled={busy} onClick={()=>file.current?.click()}><Paperclip size={14}/>Attach a text file</button></>:<button type="button" className="button" onClick={()=>setAddingContext(true)} disabled={busy}><Plus size={15}/>Add context</button>}
   <input ref={file} type="file" accept=".txt,.md" hidden aria-label="Attach project context" onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;try{if(selected.size>8000||! /\.(txt|md)$/i.test(selected.name))throw Error('Choose a small .txt or .md file.');const content=await selected.text();if(content.includes('\0'))throw Error('Choose a plain text file.');const next=[context,content].filter(Boolean).join('\n\n');if(next.length>2000)throw Error('Project context can contain up to 2,000 characters.');setContext(next);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}/>
  </section>
  <p className="create-project-location">Saved in <span>{root.replace(/[\\/]$/,'')}{root.includes('\\')?'\\':'/'}{name.trim()||'<project name>'}</span></p>
  {error&&<p className="create-project-error" role="alert">{error}</p>}
  <footer><button className="text-link create-project-existing" type="button" disabled={busy} onClick={()=>void onExisting().catch(e=>setError(String(e)))}>Open an existing folder</button><button className="button" type="button" disabled={busy} onClick={close}>Cancel</button><button className="button primary" type="submit" disabled={busy||!name.trim()}>{busy?'Creating…':'Create project'}</button></footer>
 </form></Modal>;
}
