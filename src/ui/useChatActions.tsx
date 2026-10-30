import {useEffect,useLayoutEffect,useRef,useState,type MouseEvent,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Archive,ArchiveRestore,GitBranch,MessageSquarePlus,Pencil,Pin,PinOff,Trash2} from 'lucide-react';
import type {Action,TaskSummary} from '../shared/types';
import {Modal} from './WorkspacePanels';
import './chat-sidebar.css';

export function useChatActions({tasks,busy,active,act}:{tasks:TaskSummary[];busy:boolean;active:boolean;act:(action:Action)=>Promise<unknown>}){
 const [context,setContext]=useState<{id:string;x:number;y:number;trigger:HTMLElement}|null>(null);
 const [dialog,setDialog]=useState<{kind:'edit'|'delete';task:TaskSummary}|null>(null),[title,setTitle]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const menu=useRef<HTMLDivElement>(null);const target=tasks.find(t=>t.id===context?.id);
 const closeMenu=(restore=false)=>{if(restore&&context?.trigger.isConnected)context.trigger.focus();setContext(null);};
 useEffect(()=>{if(!active){setContext(null);setDialog(null);setError('');}else if(busy)setContext(null);},[active,busy]);
 useEffect(()=>{if(dialog&&!tasks.some(task=>task.id===dialog.task.id))setDialog(null);},[tasks,dialog]);
 useEffect(()=>{if(context&&!target)setContext(null);},[context,target]);
 useLayoutEffect(()=>{if(!context||!menu.current)return;const el=menu.current,rect=el.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(context.x,innerWidth-rect.width-8))}px`;el.style.top=`${Math.max(8,Math.min(context.y,innerHeight-rect.height-8))}px`;el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[context]);
 useEffect(()=>{if(!context)return;const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))closeMenu();};const dismiss=()=>setContext(null);document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};},[context]);
 const open=(chat:TaskSummary,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>{event.preventDefault();event.stopPropagation();if(busy)return;const rect=event.currentTarget.getBoundingClientRect(),pointer='clientX'in event&&!(event.type==='click'&&event.detail===0);setContext({id:chat.id,trigger:event.currentTarget,x:pointer?event.clientX:rect.left+16,y:pointer?event.clientY:rect.bottom});};
 const change=(action:Action)=>{closeMenu(true);void act(action);};
 const showDialog=(kind:'edit'|'delete')=>{if(!target)return;setDialog({kind,task:target});setTitle(target.title);setError('');closeMenu(true);};
 const closeDialog=()=>{if(!saving){setDialog(null);setError('');}};
 const submit=async()=>{
   if(!dialog||busy||saving)return;
   if(dialog.kind==='edit'&&(!title.trim()||title.length>100)){setError('Use a chat name up to 100 characters.');return;}
   setSaving(true);setError('');
   try{
     const action:Action=dialog.kind==='edit'?{type:'renameTask',id:dialog.task.id,title:title.trim()}:{type:'deleteTask',id:dialog.task.id,allowUnarchived:true};
     const result=await act(action) as {error?:string|null}|null|undefined;
     if(!result||result.error)setError(result?.error||'Could not save this change. Please try again.');
     else setDialog(null);
   }catch(error){setError(error instanceof Error?error.message:String(error));}
   finally{setSaving(false);}
 };
 const key=(event:KeyboardEvent)=>{if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();closeMenu(true);return;}if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();};
 return {open,isOpen:(id:string)=>context?.id===id,overlay:<>
 {context&&target&&active&&createPortal(<div ref={menu} className="chat-context-menu" role="menu" aria-label={`Options for ${target.title}`} style={{left:context.x,top:context.y}} onKeyDown={key}>
 {!target.archived&&<><button role="menuitem" disabled={target.runtimeBusy} title="Carry conversation context into an independent chat" onClick={()=>change({type:'forkTask',taskId:target.id})}><GitBranch size={16}/>Fork chat</button><button role="menuitem" title="Fresh context linked to the main chat" onClick={()=>change({type:'createSideChat',taskId:target.id})}><MessageSquarePlus size={16}/>New side chat</button><div className="chat-menu-separator" role="separator"/></>}
 {target.archived?<button role="menuitem" onClick={()=>change({type:'setTaskFlags',id:target.id,archived:false})}><ArchiveRestore size={16}/>Restore</button>:<button role="menuitem" onClick={()=>change({type:'setTaskFlags',id:target.id,pinned:!target.pinned})}>{target.pinned?<PinOff size={16}/>:<Pin size={16}/>} {target.pinned?'Unpin':'Pin'}</button>}
 <button role="menuitem" onClick={()=>showDialog('edit')}><Pencil size={16}/>Edit details</button>
 <div className="chat-menu-separator" role="separator"/>
 {!target.archived&&<button role="menuitem" onClick={()=>change({type:'setTaskFlags',id:target.id,archived:true})}><Archive size={16}/>Archive</button>}
 <button role="menuitem" className="danger" onClick={()=>showDialog('delete')}><Trash2 size={16}/>Delete</button>
 </div>,document.body)}
 {dialog?.kind==='edit'&&active&&<Modal title="Edit chat details" close={closeDialog} className="chat-details-dialog"><form onSubmit={event=>{event.preventDefault();void submit();}}><label className="chat-name-field">Chat name<input data-autofocus value={title} maxLength={100} disabled={saving} onFocus={event=>event.currentTarget.select()} onChange={event=>{setTitle(event.target.value);setError('');}}/></label>{error&&<p className="chat-action-error" role="alert">{error}</p>}<div className="chat-dialog-actions"><button type="button" className="button" disabled={saving} onClick={closeDialog}>Cancel</button><button type="submit" className="button primary" disabled={busy||saving||!title.trim()||title.trim()===dialog.task.title}>{saving?'Saving…':'Save changes'}</button></div></form></Modal>}
 {dialog?.kind==='delete'&&active&&<Modal title="Delete chat permanently?" close={closeDialog} className="chat-delete-dialog"><p>Delete “{dialog.task.title}” and its saved messages, context, drafts, and checkpoints? This cannot be undone. Project files will stay on disk.</p>{error&&<p className="chat-action-error" role="alert">{error}</p>}<div className="chat-delete-actions chat-dialog-actions"><button className="button" disabled={saving} onClick={closeDialog}>Cancel</button><button className="button danger" disabled={busy||saving} onClick={()=>void submit()}>{saving?'Deleting…':'Delete chat'}</button></div></Modal>}
 </>};
}
