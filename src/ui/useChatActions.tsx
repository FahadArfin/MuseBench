import {useEffect,useLayoutEffect,useRef,useState,type MouseEvent,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Archive,ArchiveRestore,Pin,Trash2} from 'lucide-react';
import type {Action,TaskSummary} from '../shared/types';
import {Modal} from './WorkspacePanels';
import './chat-sidebar.css';

export function useChatActions({tasks,busy,active,act}:{tasks:TaskSummary[];busy:boolean;active:boolean;act:(action:Action)=>Promise<unknown>}){
 const [context,setContext]=useState<{id:string;x:number;y:number;trigger:HTMLElement}|null>(null),[deleting,setDeleting]=useState<TaskSummary|null>(null);
 const menu=useRef<HTMLDivElement>(null);const target=tasks.find(t=>t.id===context?.id);
 const closeMenu=(restore=false)=>{if(restore&&context?.trigger.isConnected)context.trigger.focus();setContext(null);};
 useEffect(()=>{if(!active||busy){setContext(null);setDeleting(null);}},[active,busy]);
 useEffect(()=>{if(context&&!target)setContext(null);},[context,target]);
 useLayoutEffect(()=>{if(!context||!menu.current)return;const el=menu.current,rect=el.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(context.x,innerWidth-rect.width-8))}px`;el.style.top=`${Math.max(8,Math.min(context.y,innerHeight-rect.height-8))}px`;el.querySelector<HTMLButtonElement>('button')?.focus();},[context]);
 useEffect(()=>{if(!context)return;const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))closeMenu();};const dismiss=()=>setContext(null);document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};},[context]);
 const open=(chat:TaskSummary,event:MouseEvent<HTMLElement>|KeyboardEvent<HTMLElement>)=>{event.preventDefault();event.stopPropagation();if(busy)return;const rect=event.currentTarget.getBoundingClientRect(),pointer='clientX'in event&&!(event.type==='click'&&event.detail===0);setContext({id:chat.id,trigger:event.currentTarget,x:pointer?event.clientX:rect.left+16,y:pointer?event.clientY:rect.bottom});};
 const change=(action:Action)=>{closeMenu(true);void act(action);};
 const key=(event:KeyboardEvent)=>{if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();closeMenu(true);return;}if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button')],at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();};
 return {open,overlay:<>
 {context&&target&&active&&createPortal(<div ref={menu} className="chat-context-menu" role="menu" aria-label={`Options for ${target.title}`} style={{left:context.x,top:context.y}} onKeyDown={key}>
 {target.archived?<><p className="chat-menu-retention">{target.archivedAt?`Deletes ${new Date(Date.parse(target.archivedAt)+30*86400000).toLocaleDateString()}`:'Deleted after 30 days in archive'}</p><button role="menuitem" onClick={()=>change({type:'setTaskFlags',id:target.id,archived:false})}><ArchiveRestore size={16}/>Restore chat</button><button role="menuitem" className="danger" onClick={()=>{setDeleting(target);closeMenu();}}><Trash2 size={16}/>Delete permanently</button></>:<><button role="menuitem" onClick={()=>change({type:'setTaskFlags',id:target.id,pinned:!target.pinned})}><Pin size={16} className={target.pinned?'chat-pinned-icon':''}/>{target.pinned?'Unpin chat':'Pin this chat'}</button><button role="menuitem" onClick={()=>change({type:'setTaskFlags',id:target.id,archived:true})}><Archive size={16}/>Archive chat</button></>}
 </div>,document.body)}
 {deleting&&active&&<Modal title="Delete chat permanently?" close={()=>setDeleting(null)}><p>Delete “{deleting.title}” and its saved messages, context, drafts, and checkpoints? This cannot be undone. Project files will stay on disk.</p><div className="chat-delete-actions"><button className="button" onClick={()=>setDeleting(null)}>Cancel</button><button className="button danger" disabled={busy} onClick={()=>{const id=deleting.id;setDeleting(null);void act({type:'deleteTask',id});}}>Delete chat</button></div></Modal>}
 </>};
}
