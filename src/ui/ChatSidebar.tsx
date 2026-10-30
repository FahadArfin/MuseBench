import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type DragEvent,type KeyboardEvent} from 'react';
import {ChevronRight,FolderOpen,MoreHorizontal,Pin,Plus,Search} from 'lucide-react';
import type {Action,Project,TaskSummary} from '../shared/types';
import {sidebarKey} from '../shared/sidebar-order.mjs';
import {sameSidebarData,sidebarCollections,projectChatRelations} from '../shared/sidebar-model.mjs';
import {createChatRelationIndex} from '../shared/chat-relations.mjs';
import {SidebarSection} from './SidebarSection';
import {MotionDisclosure} from './MotionDisclosure';
import {useChatActions} from './useChatActions';
import './chat-sidebar.css';

type Move=Extract<Action,{type:'moveSidebarItem'}>;
type Props={orders?:Record<string,string[]>;projects:Project[];tasks:TaskSummary[];selectedId?:string;projectId?:string;overview:boolean;busy:boolean;active:boolean;onProject:(id:string)=>void;onChat:(id:string)=>void;onNew:(id:string)=>void;onFolder:()=>void;onSearch:()=>void;act:(action:Action)=>Promise<unknown>};
export function ChatSidebar(props:Props){
 const committed=useRef(props);
 useLayoutEffect(()=>{committed.current=props;});
 const handlers=useMemo(()=>({
  onProject:(id:string)=>committed.current.onProject(id),onChat:(id:string)=>committed.current.onChat(id),onNew:(id:string)=>committed.current.onNew(id),
  onFolder:()=>committed.current.onFolder(),onSearch:()=>committed.current.onSearch(),act:(action:Action)=>committed.current.act(action),
 }),[]);
 return <MemoSidebar {...props} {...handlers}/>;
}
const MemoSidebar=memo(SidebarContents,(a,b)=>a.selectedId===b.selectedId&&a.projectId===b.projectId&&a.overview===b.overview&&a.busy===b.busy&&a.active===b.active&&sameSidebarData(a,b));
function SidebarContents({orders,projects,tasks,selectedId,projectId,overview,busy,active,onProject,onChat,onNew,onFolder,onSearch,act}:Props){
 const [closed,setClosed]=useState<Set<string>>(new Set());
 const [closedSides,setClosedSides]=useState<Set<string>>(new Set());
 const {open,isOpen,overlay}=useChatActions({tasks,busy,active,act});
 const selected=tasks.find(t=>t.id===selectedId);
 const relationIndex=useMemo(()=>createChatRelationIndex(tasks),[tasks]);
 const selectedMainId=selected?.chatRelation?.kind==='side'?relationIndex.main(selected).id:null;
 useEffect(()=>{if(!selectedMainId)return;setClosedSides(before=>{if(!before.has(selectedMainId))return before;const next=new Set(before);next.delete(selectedMainId);return next;});},[selectedId,selectedMainId]);
 useEffect(()=>{const id=selected?.projectId??projectId;if(id)setClosed(before=>{if(!before.has(id))return before;const next=new Set(before);next.delete(id);return next;});},[selectedId,projectId,selected?.projectId]);
 const dragging=useRef<{kind:'project'|'chat';id:string}|null>(null),suppressClick=useRef(false);
 const [dropTarget,setDropTarget]=useState(''),[dragKind,setDragKind]=useState<'project'|'chat'|null>(null),[announcement,setAnnouncement]=useState('');
 const {projects:projectList,byProject,pinned,recents}=useMemo(()=>sidebarCollections(projects,tasks,orders),[projects,tasks,orders]);
 const relationsByProject=useMemo(()=>new Map([...byProject].map(([id,rows])=>[id,projectChatRelations(rows,tasks,relationIndex)])),[byProject,tasks,relationIndex]);
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
 const row=(chat:TaskSummary,section:Move['section'],items:TaskSummary[],destinationId?:string,sideCount=0)=>{
   const props=dropProps(section,destinationId,chat.id);
   return <div {...props} className={`sidebar-chat ${sideCount?'has-side-chats':''} ${props.className}`} key={chat.id} draggable={!busy} onDragStart={event=>start(event,'chat',chat.id)} onDragEnd={finish}>
     {!!sideCount&&<button className="side-chat-toggle" aria-label={`${closedSides.has(chat.id)?'Expand':'Collapse'} side chats of ${chat.title}`} aria-expanded={!closedSides.has(chat.id)} aria-controls={`side-chats-${chat.id}`} onClick={()=>setClosedSides(before=>{const next=new Set(before);if(next.has(chat.id))next.delete(chat.id);else next.add(chat.id);return next;})}><ChevronRight size={12} className={closedSides.has(chat.id)?'':'rotated'}/></button>}
     <button className={`chat-row ${chat.id===selectedId&&!overview?'selected':''}`} title={`${chat.title}${chat.pinned?' · Pinned':''} · Drag to move, or Alt+Shift+Up/Down to reorder`} aria-label={chat.title} aria-description={chat.pinned?'Pinned chat. Drag to move or Alt+Shift+arrows to reorder.':'Drag to move or Alt+Shift+arrows to reorder.'} disabled={busy} onClick={()=>{if(!suppressClick.current)onChat(chat.id);}} onContextMenu={event=>open(chat,event)} onKeyDown={event=>{if(keyboardMove(event,'chat',chat.id,section,items,destinationId))return;if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')open(chat,event);}}>
       {chat.pinned&&!chat.archived&&<Pin size={12} className="chat-pinned-icon" aria-hidden="true"/>}<span>{chat.title}</span>{chat.runtimeStatus&&['running','starting','submitting','connecting','checking-permissions'].includes(chat.runtimeStatus)&&<span className="chat-running" role="status" aria-label="Chat running">●</span>}
     </button>
     <button className="chat-options icon-button" aria-label={`Chat options for ${chat.title}`} aria-haspopup="menu" aria-expanded={isOpen(chat.id)} disabled={busy} onClick={event=>open(chat,event)}><MoreHorizontal size={14}/></button>
   </div>;
 };
 return <>
 <SidebarSection title="Projects" fullRow actions={<button className="icon-button" aria-label="Add project" title="Create a project" disabled={busy} onClick={onFolder}><Plus size={14}/></button>}>
 {projectList.map(project=>{
   const chats=byProject.get(project.id)!;
   const relations=relationsByProject.get(project.id)!;
   const props=dropProps(dragKind==='project'?'projects':'project',dragKind==='project'?undefined:project.id,dragKind==='project'?project.id:undefined);
   return <div className="project-group" key={project.id}>
     <div {...props} draggable={!busy} onDragStart={event=>start(event,'project',project.id)} onDragEnd={finish} className={`project-row ${props.className} ${projectId===project.id?'current':''} ${projectId===project.id&&overview?'overview-selected':''}`}>
       <button className="project-toggle" aria-label={`${closed.has(project.id)?'Expand':'Collapse'} ${project.name}`} aria-expanded={!closed.has(project.id)} aria-controls={`project-chats-${project.id}`} onClick={()=>setClosed(before=>{const next=new Set(before);if(next.has(project.id))next.delete(project.id);else next.add(project.id);return next;})}><ChevronRight size={12} className={closed.has(project.id)?'':'rotated'}/></button>
       <button title={`${project.root} · Drag to reorder, or Alt+Shift+Up/Down`} disabled={busy} onKeyDown={event=>keyboardMove(event,'project',project.id,'projects',projectList)} onClick={()=>{if(!suppressClick.current)onProject(project.id);}}><FolderOpen size={15}/><span>{project.name.replace(' · tutorial','')}</span></button>
       <button className="project-new-chat" aria-label={`New chat in ${project.name.replace(' · tutorial','')}`} disabled={busy} onClick={()=>onNew(project.id)}><Plus size={14}/></button>
     </div>
     <MotionDisclosure unmountWhenClosed id={`project-chats-${project.id}`} open={!closed.has(project.id)} innerClassName="project-chats">{()=><div {...dropProps('project',project.id)} role="region" aria-label={`${project.name} active chats`}>{relations.roots.map(chat=>{const sides=relations.children.get(chat.id)??[];return <div key={chat.id}>{row(chat,'project',chats,project.id,sides.length)}{!!sides.length&&<MotionDisclosure unmountWhenClosed id={`side-chats-${chat.id}`} open={!closedSides.has(chat.id)} innerClassName="side-chats">{()=><div role="region" aria-label={`Side chats of ${chat.title}`}>{sides.map(side=>row(side,'project',chats,project.id))}</div>}</MotionDisclosure>}</div>;})}{!chats.length&&<span className="no-chats">No chats yet</span>}<div className={`sidebar-drop-end ${dragKind==='chat'?'visible':''}`} aria-label={`Place chat last in ${project.name}`}/></div>}</MotionDisclosure>
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
