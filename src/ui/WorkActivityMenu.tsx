import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,Check,Mail,Square,X} from 'lucide-react';
import type {ActivityEvent,WorkActivity} from '../shared/types';
import {ACTIVITY_LABELS} from '../shared/activity-inbox.mjs';
import './work-activity.css';

export function WorkActivityMenu({rows,events=[],busy=false,obscured=false,onOpen,onStop,onRead}:{rows:WorkActivity[];events?:ActivityEvent[];busy?:boolean;obscured?:boolean;onOpen:(id:string)=>Promise<unknown>;onStop:(row:WorkActivity)=>Promise<unknown>;onRead:(ids:string[],read:boolean)=>Promise<unknown>}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState<'running'|'recent'>('running'),[pending,setPending]=useState<string|null>(null),[error,setError]=useState('');
 const unread=events.filter(event=>!event.readAt),disabled=busy||pending!==null;
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
 async function historyAction(key:string,action:()=>Promise<unknown>,closeAfter=false){
  if(locked.current||busy)return;locked.current=true;setPending(key);setError('');
  try{await action();if(closeAfter)close(true);}
  catch(e){setError(e instanceof Error?e.message:'Could not update this activity.');}
  finally{locked.current=false;setPending(null);}
 }
 return <div className="work-activity" ref={root} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))close();}}>
  <button ref={trigger} className="toolbar-button" aria-label={`Work activity${rows.length?`: ${rows.length} active`:''}${unread.length?`, ${unread.length} unread`:''}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setError('');if(!open)setTab(rows.length||!events.length?'running':'recent');setOpen(value=>!value);}}><Activity size={16}/><span>Activity</span>{rows.length>0&&<span className="count">{rows.length}</span>}{unread.length>0&&<i className="activity-unread-dot" aria-hidden="true"/>}</button>
  {open&&!obscured&&<div ref={panel} className="work-activity-menu" role="dialog" aria-label="Work activity"><header><strong>Work activity</strong><button className="icon-button" aria-label="Close work activity" onClick={()=>close(true)}><X size={15}/></button></header>
   <div className="activity-inbox-toolbar"><div role="group" aria-label="Activity view"><button aria-pressed={tab==='running'} onClick={()=>setTab('running')}>Running</button><button aria-pressed={tab==='recent'} onClick={()=>setTab('recent')}>Recent</button></div>{tab==='recent'&&<button className="activity-mark-all" disabled={disabled||!unread.length} onClick={()=>{const ids=unread.map(event=>event.id);void historyAction('all',()=>onRead(ids,true));}}>Mark all read</button>}</div>
   {tab==='running'?(rows.length===0?<p className="work-activity-empty">No work is running. Your drafts stay in their chats.</p>:<ul>{rows.map(row=><li key={row.id}><div><strong title={row.title}>{row.title}</strong><small title={row.projectName}>{row.projectName}</small><span className={row.label.startsWith('Needs')?'attention':''}>{row.label}</span></div><button className="icon-button" aria-label={`Open ${row.title}`} disabled={disabled} onClick={()=>void perform(row,false)}><ArrowUpRight size={16}/></button>{row.canStop&&<button className="icon-button" aria-label={`Stop ${row.title}`} disabled={disabled} onClick={()=>void perform(row,true)}><Square size={13}/></button>}</li>)}</ul>):<>
    {events.length===0?<p className="work-activity-empty">Completed work and requests for attention will appear here.</p>:<ul>{events.map(event=><li key={event.id} className={!event.readAt?'activity-event-unread':undefined}><div><strong title={event.title}>{event.title}</strong><small title={event.projectName}>{event.projectName}</small><span className={['run_attention','response_requested','approval_requested'].includes(event.kind)?'attention':''}>{ACTIVITY_LABELS[event.kind]??'Activity recorded'}</span><time dateTime={event.at} title={new Date(event.at).toLocaleString()}>{new Date(event.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div><button className="icon-button" aria-label={`Mark ${event.title} as ${event.readAt?'unread':'read'}`} disabled={disabled} onClick={()=>void historyAction(event.id,()=>onRead([event.id],!event.readAt))}>{event.readAt?<Mail size={15}/>:<Check size={15}/>}</button><button className="icon-button" aria-label={`Open ${event.title}`} disabled={disabled} onClick={()=>void historyAction(event.id,async()=>{await onOpen(event.taskId);if(!event.readAt)await onRead([event.id],true);},true)}><ArrowUpRight size={16}/></button></li>)}</ul>}
    <p className="activity-inbox-retention">Recent events · Kept for 30 days</p>
   </>}
   {pending&&<p role="status">Updating activity…</p>}{error&&<p role="alert">{error}</p>}
  </div>}
 </div>;
}
