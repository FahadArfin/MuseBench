import {useEffect,useRef,useState} from 'react';
import {BookOpen,X} from 'lucide-react';
import type {MuseSkill} from '../shared/slash-commands.mjs';
import './skill-picker.css';
const shortcuts:Record<string,string>={plan:'Plan',grill:'Challenge requirements','browser-app-delivery':'Build frontend','visual-coding':'Refine UI',git:'Git workflow','create-skill':'Create skill','workflow-authoring':'Author workflow',blender:'Blender'};
export function SkillPicker({skills,status,onChoose,onClose,onManage}:{skills:MuseSkill[];status:string;onChoose:(skill:MuseSkill)=>void;onClose:()=>void;onManage:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[query,setQuery]=useState(''),[selection,setSelection]=useState<string|null>(null);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const visible=skills.filter(s=>`${s.title} ${s.name} ${s.description} ${s.scope}`.toLowerCase().includes(query.toLowerCase()));
 const selected=skills.find(s=>s.id===selection),featured=skills.filter(s=>s.available!==false&&shortcuts[s.name]);
 return <dialog ref={dialog} className="skill-picker" aria-label="Muse skills" onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}>
  <header><BookOpen size={18}/><strong>Skills</strong><button type="button" className="icon-button" aria-label="Close skills" onClick={onClose}><X size={16}/></button></header>
  <input autoFocus aria-label="Search skills" placeholder="Find a skill…" value={query} onChange={e=>setQuery(e.target.value)}/>
  {!query&&featured.length>0&&<div className="skill-shortcuts">{featured.map(s=><button type="button" key={s.id} onClick={()=>setSelection(s.id)}>{shortcuts[s.name]}</button>)}</div>}
  <div className="skill-browser"><div className="skill-list">{status==='loading'?<p role="status">Loading installed skills…</p>:status==='unavailable'?<p>Connect the official Muse CLI to load its skills.</p>:visible.length===0?<p>No matching skills.</p>:visible.map(s=><button type="button" className={s.id===selection?'selected':''} key={s.id} onClick={()=>setSelection(s.id)}><strong>{s.title}</strong><small>{s.scope} · {s.available===false?'Unavailable':s.activation==='user-only'?'On request':'Enabled'}</small></button>)}</div>
   <div className="skill-detail">{selected?<><h3>{selected.title}</h3><p>{selected.description}</p><dl><dt>Skill</dt><dd>{selected.id}</dd><dt>Source</dt><dd>{selected.source||selected.scope}</dd>{selected.estimatedTokens!==undefined&&<><dt>Catalog context</dt><dd>About {selected.estimatedTokens} tokens</dd></>}</dl>{selected.diagnostics?.map((d,i)=><p key={i} className="skill-warning">{d}</p>)}{selected.available===false?<p>{selected.unavailableReason}</p>:<button type="button" className="primary-button" onClick={()=>onChoose(selected)}>Use skill</button>}</>:<p>Select a skill to see its instructions summary and source.</p>}</div>
  </div><footer><small>Adds a request to your draft. Muse confirms loading the skill when it runs.</small><button type="button" onClick={onManage}>Manage skills</button></footer>
 </dialog>;
}
