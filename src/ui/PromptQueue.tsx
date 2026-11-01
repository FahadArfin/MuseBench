import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {GripVertical,Pencil,Trash2,CornerDownRight,Pause,Play,MoreHorizontal,MessageCirclePlus,ListEnd} from 'lucide-react';
import type {QueuedPrompt} from '../shared/types';
import './prompt-queue.css';

function QueuePromptMenu({index,disabled,queuingEnabled,sideUnavailable,onEdit,onSideChat,onToggleQueuing}:{index:number;disabled:boolean;queuingEnabled:boolean;sideUnavailable?:string;onEdit:()=>void;onSideChat:()=>void;onToggleQueuing:()=>void}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,bottom:0});
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),id=useId();
 const close=(restore=false)=>{setOpen(false);if(restore)trigger.current?.focus();};
 useLayoutEffect(()=>{
  if(!open)return;
  const rect=trigger.current?.getBoundingClientRect();
  if(rect)setPosition({left:Math.max(8,Math.min(rect.right-180,innerWidth-188)),bottom:Math.max(8,innerHeight-rect.top+6)});
  menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
 },[open]);
 useEffect(()=>{
  if(disabled)setOpen(false);
 },[disabled]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))close();};
  const dismiss=()=>close();
  document.addEventListener('pointerdown',outside);window.addEventListener('blur',dismiss);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('blur',dismiss);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};
 },[open]);
 return <><button ref={trigger} type="button" className="icon-button queue-more" aria-label={`More actions for queued prompt ${index+1}`} title="More actions" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} onClick={()=>setOpen(!open)} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true);}}}><MoreHorizontal size={15}/></button>
  {open&&createPortal(<div ref={menu} id={id} className="queue-action-menu" style={position} role="menu" aria-label={`Queued prompt ${index+1} actions`} onKeyDown={event=>{
   if(['Escape','Tab'].includes(event.key)){event.preventDefault();event.stopPropagation();close(true);}
   else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),current=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  }}><button type="button" role="menuitem" aria-label={`Edit queued prompt ${index+1}`} onClick={()=>{close();onEdit();}}><Pencil size={14}/>Edit message</button><button type="button" role="menuitem" disabled={!!sideUnavailable} title={sideUnavailable??'Move this prompt into an unsent side-chat draft'} onClick={()=>{close();onSideChat();}}><MessageCirclePlus size={14}/>Open in side chat</button><button type="button" role="menuitem" onClick={()=>{close(true);onToggleQueuing();}}><ListEnd size={14}/>{queuingEnabled?'Turn off queuing':'Turn on queuing'}</button></div>,document.body)}
 </>;
}

export function PromptQueue({items,busy,running,paused,queuingEnabled=true,onMove,onBeginEdit,onEdit,onRemove,onSend,onPause,onRun,onSideChat,onQueuingChange}:{
 items:QueuedPrompt[];busy:boolean;running:boolean;paused:boolean;queuingEnabled?:boolean;
 onMove:(id:string,beforeId:string|null)=>Promise<boolean>;
 onBeginEdit:(item:QueuedPrompt)=>Promise<boolean>;onEdit:(item:QueuedPrompt,text:string,mode:'chat'|'plan')=>Promise<boolean>;onRemove:(item:QueuedPrompt)=>Promise<boolean>;
 onSend:(item:QueuedPrompt)=>Promise<boolean>;onPause:()=>Promise<boolean>;onRun:()=>Promise<boolean>;
 onSideChat:(item:QueuedPrompt)=>Promise<boolean>;onQueuingChange:(enabled:boolean)=>Promise<boolean>;
}){
 const drag=useRef<string|null>(null);
 const pending=useRef(false),editorInput=useRef<HTMLTextAreaElement|null>(null);
 const [acting,setActing]=useState(false),[editing,setEditing]=useState<{item:QueuedPrompt;text:string;mode:'chat'|'plan'}|null>(null);
 const [dragging,setDragging]=useState<string|null>(null),[target,setTarget]=useState<string|null|undefined>(),[notice,setNotice]=useState('');
 const locked=busy||acting;
 const run=async(action:()=>Promise<boolean>,success?:()=>void)=>{if(pending.current||busy)return;pending.current=true;setActing(true);setNotice('');try{if(await action())success?.();else setNotice('The queue changed or could not be updated. Any unsaved edit is still here.');}catch{setNotice('Could not confirm this change. Refresh the session before trying again.');}finally{pending.current=false;setActing(false);}};
 const edit=(item:QueuedPrompt)=>void run(()=>onBeginEdit(item),()=>{setEditing({item,text:item.text,mode:item.mode});requestAnimationFrame(()=>editorInput.current?.focus());});
 const reset=()=>{drag.current=null;setDragging(null);setTarget(undefined);};
 const move=async(id:string,beforeId:string|null)=>{reset();await run(()=>onMove(id,beforeId),()=>setNotice('Queue order updated.'));};
 const position=(event:React.DragEvent,id:string)=>{
  const box=event.currentTarget.getBoundingClientRect();
  return event.clientY<box.y+box.height/2?id:items[items.findIndex(item=>item.id===id)+1]?.id??null;
 };
 return <section className="prompt-queue" aria-label="Queued prompts">
  <div className="queue-heading"><button type="button" className="icon-button" aria-label={paused?'Run queue':'Pause queue'} title={paused?'Run queue':'Pause queue'} disabled={locked||!!editing||(paused&&(running||items[0]?.delivery==='unknown'))} onClick={()=>void run(paused?onRun:onPause)}>{paused?<Play size={12}/>:<Pause size={12}/>}</button></div>
  <ol className="queue-list">
   {items.map((item,index)=><li key={item.id} className={`queued-prompt ${dragging===item.id?'queue-dragging':''} ${target===item.id?'queue-drop-before':''} ${index===items.length-1&&target===null?'queue-drop-after':''}`}
    onDragOver={event=>{if(locked||editing||!drag.current)return;event.preventDefault();event.dataTransfer.dropEffect='move';setTarget(position(event,item.id));}}
    onDrop={event=>{event.preventDefault();if(!locked&&!editing&&drag.current)void move(drag.current,position(event,item.id));else reset();}}>
    <button className="icon-button queue-grip" draggable={!locked&&!editing} disabled={locked||!!editing} aria-label={`Reorder queued prompt ${index+1}`} title="Drag to reorder · Alt+Up/Down"
     onDragStart={event=>{if(locked||editing){event.preventDefault();return;}drag.current=item.id;setDragging(item.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}}
     onDragEnd={reset}
     onKeyDown={event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowUp'&&index>0)void move(item.id,items[index-1].id);if(event.key==='ArrowDown'&&index<items.length-1)void move(item.id,items[index+2]?.id??null);}}><GripVertical size={14}/></button>
    <span className="queued-text" title={item.text}>{item.workflow?`${item.workflow.title} · ${item.workflow.index+1}/${item.workflow.total} ${item.workflow.phase}`:item.handoff?`Context from ${item.handoff.sourceTitle}`:item.text}{!!item.images?.length&&` · ${item.images.length} screenshot${item.images.length===1?'':'s'}`}{item.recentContext&&<small>Reviewed recent excerpts included</small>}{item.delivery==='unknown'&&<small>Outcome unknown · Check the session</small>}{item.delivery==='sending'&&<small>Sending…</small>}</span>
    <button type="button" className="queue-send" aria-label={`Send queued prompt ${index+1} now`} title="Send as the next turn; keep the rest paused" disabled={locked||running||!!editing||['sending','unknown'].includes(item.delivery??'')} onClick={()=>void run(()=>onSend(item))}><CornerDownRight size={13}/><span>Send</span></button>
    <button type="button" className="icon-button" aria-label={`Remove queued prompt ${index+1}`} title="Remove prompt" disabled={locked||!!editing||item.delivery==='sending'} onClick={()=>void run(()=>onRemove(item))}><Trash2 size={14}/></button>
    <QueuePromptMenu index={index} disabled={locked||!!editing||['sending','unknown'].includes(item.delivery??'')} queuingEnabled={queuingEnabled} sideUnavailable={item.recentContext||item.workflow||item.requiredChecks?.length?'Keep reviewed context and workflow checks in the original chat.':undefined} onEdit={()=>edit(item)} onSideChat={()=>void run(()=>onSideChat(item))} onToggleQueuing={()=>void run(()=>onQueuingChange(!queuingEnabled))}/>
   </li>)}
  </ol>
  {editing&&<div className="queue-editor"><label>Queued message<textarea ref={editorInput} aria-label="Edit queued message" rows={3} value={editing.text} maxLength={16000} disabled={locked} onChange={e=>setEditing({...editing,text:e.target.value})} onKeyDown={e=>{if(e.key==='Escape'&&!locked){e.preventDefault();setEditing(null);}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.nativeEvent.isComposing&&!locked&&editing.text.trim()){e.preventDefault();void run(()=>onEdit(editing.item,editing.text,editing.mode),()=>setEditing(null));}}}/></label><div className="queue-editor-footer"><small>{editing.item.files.length} files · {editing.item.images?.length??0} screenshots{editing.item.recentContext?' · Reviewed recent excerpts':''} · Draft unchanged</small><select aria-label="Queued conversation mode" disabled={locked} value={editing.mode} onChange={e=>setEditing({...editing,mode:e.target.value as 'chat'|'plan'})}><option value="chat">Chat</option><option value="plan">Plan</option></select><button type="button" className="button" disabled={locked} onClick={()=>setEditing(null)}>Cancel</button><button type="button" className="button primary" disabled={locked||!editing.text.trim()} onClick={()=>void run(()=>onEdit(editing.item,editing.text,editing.mode),()=>setEditing(null))}>Save</button></div></div>}
  <span className={notice?'queue-notice':'queue-announcement'} role="status">{notice}</span>
 </section>;
}
