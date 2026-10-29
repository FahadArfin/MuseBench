import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,Square,X} from 'lucide-react';
import type {WorkActivity} from '../shared/types';
import './work-activity.css';

export function WorkActivityMenu({rows,busy=false,obscured=false,onOpen,onStop}:{rows:WorkActivity[];busy?:boolean;obscured?:boolean;onOpen:(id:string)=>Promise<unknown>;onStop:(row:WorkActivity)=>Promise<unknown>}){
 const [open,setOpen]=useState(false),[pending,setPending]=useState<string|null>(null),[error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),locked=useRef(false);
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
 useEffect(()=>{if(obscured)setOpen(false);},[obscured]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const rect=trigger.current?.getBoundingClientRect(),el=panel.current;if(!rect||!el)return;el.style.setProperty('--activity-right',`${Math.max(8,innerWidth-rect.right)}px`);el.style.top=`${rect.bottom+8}px`;el.style.maxHeight=`${Math.max(80,innerHeight-rect.bottom-24)}px`;};
  place();panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const click=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();},key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}};
  document.addEventListener('pointerdown',click);document.addEventListener('keydown',key,true);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 async function perform(row:WorkActivity,stop:boolean){
  if(locked.current||busy)return;locked.current=true;setPending(row.id);setError('');
  try{await(stop?onStop(row):onOpen(row.taskId));if(!stop)close(true);else panel.current?.querySelector<HTMLButtonElement>('button')?.focus();}
  catch(e){setError(e instanceof Error?e.message:'Could not update this activity.');}
  finally{locked.current=false;setPending(null);}
 }
 return <div className="work-activity" ref={root} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))close();}}>
  <button ref={trigger} className="toolbar-button" aria-label={`Work activity${rows.length?`: ${rows.length} active`:''}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setError('');setOpen(value=>!value);}}><Activity size={16}/><span>Activity</span>{rows.length>0&&<span className="count">{rows.length}</span>}</button>
  {open&&!obscured&&<div ref={panel} className="work-activity-menu" role="dialog" aria-label="Work activity"><header><strong>Work activity</strong><button className="icon-button" aria-label="Close work activity" onClick={()=>close(true)}><X size={15}/></button></header>
   {rows.length===0?<p className="work-activity-empty">No work is running. Your drafts stay in their chats.</p>:<ul>{rows.map(row=><li key={row.id}><div><strong title={row.title}>{row.title}</strong><small title={row.projectName}>{row.projectName}</small><span className={row.label.startsWith('Needs')?'attention':''}>{row.label}</span></div><button className="icon-button" aria-label={`Open ${row.title}`} disabled={busy||pending!==null} onClick={()=>void perform(row,false)}><ArrowUpRight size={16}/></button>{row.canStop&&<button className="icon-button" aria-label={`Stop ${row.title}`} disabled={busy||pending!==null} onClick={()=>void perform(row,true)}><Square size={13}/></button>}</li>)}</ul>}
   {pending&&<p role="status">Updating activity…</p>}{error&&<p role="alert">{error}</p>}
  </div>}
 </div>;
}
