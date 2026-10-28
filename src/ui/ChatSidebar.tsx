import {useEffect,useRef,useState,type DragEvent,type KeyboardEvent} from 'react';
import {ChevronRight,FolderOpen,MoreHorizontal,Pin,Plus,Search} from 'lucide-react';
import type {Action,Project,TaskSummary} from '../shared/types';
import {sidebarKey,sidebarSort} from '../shared/sidebar-order.mjs';
import {SidebarSection} from './SidebarSection';
import {useChatActions} from './useChatActions';
import './chat-sidebar.css';

type Move=Extract<Action,{type:'moveSidebarItem'}>;
type Props={orders?:Record<string,string[]>;projects:Project[];tasks:TaskSummary[];selectedId?:string;projectId?:string;overview:boolean;busy:boolean;active:boolean;onProject:(id:string)=>void;onChat:(id:string)=>void;onNew:(id:string)=>void;onFolder:()=>void;onSearch:()=>void;act:(action:Action)=>Promise<unknown>};
export function ChatSidebar({orders,projects,tasks,selectedId,projectId,overview,busy,active,onProject,onChat,onNew,onFolder,onSearch,act}:Props){
 const [closed,setClosed]=useState<Set<string>>(new Set());
 const {open,isOpen,overlay}=useChatActions({tasks,busy,active,act});
 const selected=tasks.find(t=>t.id===selectedId);
 useEffect(()=>{const id=selected?.projectId??projectId;if(id)setClosed(before=>{const next=new Set(before);next.delete(id);return next;});},[selectedId,projectId]);
 const dragging=useRef<{kind:'project'|'chat';id:string}|null>(null),suppressClick=useRef(false);
 const [dropTarget,setDropTarget]=useState(''),[dragKind,setDragKind]=useState<'project'|'chat'|null>(null),[announcement,setAnnouncement]=useState('');
 const sorted=[...tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const pinned=sidebarSort(sorted.filter(t=>t.pinned&&!t.archived),orders?.pinned),recents=sidebarSort(sorted.filter(t=>!t.archived&&!t.pinned),orders?.recents);
 const projectList=sidebarSort(projects,orders?.projects);
 const move=async(action:Move)=>{const result=await act(action) as {error?:string}|undefined;setAnnouncement(result?.error??'Sidebar arrangement saved.');};
 const finish=()=>{dragging.current=null;setDragKind(null);setDropTarget('');setTimeout(()=>{suppressClick.current=false;},0);};
 const start=(event:DragEvent,kind:'project'|'chat',id:string)=>{if(busy){event.preventDefault();return;}event.stopPropagation();dragging.current={kind,id};setDragKind(kind);suppressClick.current=true;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);};
 const dropProps=(section:Move['section'],destinationId?:string,beforeId?:string)=>{
   const key=`${sidebarKey(section,destinationId)}:${beforeId??'end'}`;
   const valid=()=>dragging.current&&!busy&&(dragging.current.kind==='project'?section==='projects':section!=='projects');
   return {
     'data-drop-target':key,
     className:dropTarget===key?'sidebar-drop-target':'',
     onDragOver:(event:DragEvent<HTMLElement>)=>{if(!valid())return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setDropTarget(key);const scroll=event.currentTarget.closest('.sidebar-scroll');if(scroll){const bounds=scroll.getBoundingClientRect();if(event.clientY<bounds.top+36)scroll.scrollTop-=12;else if(event.clientY>bounds.bottom-36)scroll.scrollTop+=12;}},
     onDrop:(event:DragEvent)=>{if(!valid())return;event.preventDefault();event.stopPropagation();const source=dragging.current!;finish();void move({type:'moveSidebarItem',...source,section,projectId:destinationId,beforeId});},
   };
 };
 const keyboardMove=(event:KeyboardEvent,kind:'project'|'chat',id:string,section:Move['section'],items:{id:string}[],destinationId?:string)=>{
   if(!event.altKey||!event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||busy)return false;
   event.preventDefault();event.stopPropagation();const index=items.findIndex(item=>item.id===id),next=index+(event.key==='ArrowUp'?-1:1);
   if(next>=0&&next<items.length)void move({type:'moveSidebarItem',kind,id,section,projectId:destinationId,beforeId:items[event.key==='ArrowUp'?next:next+1]?.id});
   return true;
 };
 const row=(chat:TaskSummary,section:Move['section'],items:TaskSummary[],destinationId?:string)=>{
   const props=dropProps(section,destinationId,chat.id);
   return <div {...props} className={`sidebar-chat ${props.className}`} key={chat.id} draggable={!busy} onDragStart={event=>start(event,'chat',chat.id)} onDragEnd={finish}>
     <button className={`chat-row ${chat.id===selectedId&&!overview?'selected':''}`} title={`${chat.title}${chat.pinned?' · Pinned':''} · Drag to move, or Alt+Shift+Up/Down to reorder`} aria-label={chat.title} aria-description={chat.pinned?'Pinned chat. Drag to move or Alt+Shift+arrows to reorder.':'Drag to move or Alt+Shift+arrows to reorder.'} disabled={busy} onClick={()=>{if(!suppressClick.current)onChat(chat.id);}} onContextMenu={event=>open(chat,event)} onKeyDown={event=>{if(keyboardMove(event,'chat',chat.id,section,items,destinationId))return;if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')open(chat,event);}}>
       {chat.pinned&&!chat.archived&&<Pin size={12} className="chat-pinned-icon" aria-hidden="true"/>}<span>{chat.title}</span>{chat.runtimeStatus&&['running','starting','submitting','connecting','checking-permissions'].includes(chat.runtimeStatus)&&<span className="chat-running" role="status" aria-label="Chat running">●</span>}
     </button>
     <button className="chat-options icon-button" aria-label={`Chat options for ${chat.title}`} aria-haspopup="menu" aria-expanded={isOpen(chat.id)} disabled={busy} onClick={event=>open(chat,event)}><MoreHorizontal size={14}/></button>
   </div>;
 };
 return <>
 <SidebarSection title="Projects" fullRow actions={<button className="icon-button" aria-label="Add project" title="Create a project" disabled={busy} onClick={onFolder}><Plus size={14}/></button>}>
 {projectList.map(project=>{
   const chats=sidebarSort(sorted.filter(t=>t.projectId===project.id&&!t.archived),orders?.[sidebarKey('project',project.id)]);
   const props=dropProps(dragKind==='project'?'projects':'project',dragKind==='project'?undefined:project.id,dragKind==='project'?project.id:undefined);
   return <div className="project-group" key={project.id}>
     <div {...props} draggable={!busy} onDragStart={event=>start(event,'project',project.id)} onDragEnd={finish} className={`project-row ${props.className} ${projectId===project.id?'current':''} ${projectId===project.id&&overview?'overview-selected':''}`}>
       <button className="project-toggle" aria-label={`${closed.has(project.id)?'Expand':'Collapse'} ${project.name}`} aria-expanded={!closed.has(project.id)} onClick={()=>setClosed(before=>{const next=new Set(before);if(next.has(project.id))next.delete(project.id);else next.add(project.id);return next;})}><ChevronRight size={12} className={closed.has(project.id)?'':'rotated'}/></button>
       <button title={`${project.root} · Drag to reorder, or Alt+Shift+Up/Down`} disabled={busy} onKeyDown={event=>keyboardMove(event,'project',project.id,'projects',projectList)} onClick={()=>{if(!suppressClick.current)onProject(project.id);}}><FolderOpen size={15}/><span>{project.name.replace(' · tutorial','')}</span></button>
       <button className="project-new-chat" aria-label={`New chat in ${project.name.replace(' · tutorial','')}`} disabled={busy} onClick={()=>onNew(project.id)}><Plus size={14}/></button>
     </div>
     {!closed.has(project.id)&&<div className="project-chats"><div {...dropProps('project',project.id)} role="region" aria-label={`${project.name} active chats`}>{chats.map(chat=>row(chat,'project',chats,project.id))}{!chats.length&&<span className="no-chats">No chats yet</span>}<div className={`sidebar-drop-end ${dragKind==='chat'?'visible':''}`} aria-label={`Place chat last in ${project.name}`}/></div></div>}
   </div>;
 })}
 <div {...dropProps('projects')} className={`sidebar-drop-end ${dragKind==='project'?'visible':''} ${dropTarget==='projects:end'?'sidebar-drop-target':''}`} aria-label="Place project last"/>
 {!projects.length&&<button className="navigation-row add-folder" disabled={busy} onClick={onFolder}><FolderOpen size={15}/><span>Create a project</span></button>}</SidebarSection>
 <div {...dropProps('pinned')} className={`sidebar-drop-section ${dropTarget==='pinned:end'?'sidebar-drop-target':''}`}><SidebarSection title="Pinned chats">{pinned.map(chat=>row(chat,'pinned',pinned))}</SidebarSection></div>
 <div {...dropProps('recents')} className={`sidebar-drop-section ${dropTarget==='recents:end'?'sidebar-drop-target':''}`}><SidebarSection title="Recents" actions={<button className="icon-button" aria-label="Search chats" title="Search · Ctrl+K" onClick={onSearch}><Search size={15}/></button>}>{recents.slice(0,8).map(chat=>row(chat,'recents',recents))}{!recents.length&&<p className="sidebar-empty">Your recent chats will appear here.</p>}{recents.length>8&&<button className="sidebar-view-all" onClick={onSearch}>View all</button>}</SidebarSection></div>
 <span className="sidebar-move-announcement" role="status">{announcement}</span>
 {overlay}
 </>;
}
