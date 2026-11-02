import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,CheckCheck,ChevronRight,Code2,Copy,Files,FolderOpen,Globe,History,Image,Layers,MessageCircle,MessageSquare,PanelRightClose,Maximize2,Minimize2,Play,Terminal,X} from 'lucide-react';
import {childGroup} from '../shared/child-messaging.mjs';
import type {AppState,ChatToolResult} from '../shared/types';
import {toolCategory,workLogItemLabel} from '../shared/work-log.mjs';
import {TemporaryChat} from './TemporaryChat';
import {SessionBrowser} from './SessionBrowser';
import {SessionImages} from './SessionImages';
import './session-tools.css';
export type SessionTool='changes'|'agents'|'preview'|'checks'|'context'|'checkpoints'|'session'|'output';
type ChatToolApp=NonNullable<ChatToolResult['apps']>[number];
type Page='overview'|'browser'|'images'|'side';
function Group({id,label,count,children}:{id:string;label:string;count?:number;children:ReactNode}){
 const [open,setOpen]=useState(()=>{try{return localStorage.getItem('musebench.session-tools.'+id)==='true';}catch{return false;}});
 return <section className="session-tool-group"><button className="session-group-toggle" aria-expanded={open} onClick={()=>setOpen(value=>{const next=!value;try{localStorage.setItem('musebench.session-tools.'+id,String(next));}catch{}return next;})}><span>{label}</span>{count!==undefined&&<small>{count}</small>}<ChevronRight size={12} className={open?'is-open':''}/></button>{open&&<div className="session-group-content">{children}</div>}</section>;
}
export function SessionTools({state,active,onOpen,onClose,onAnnotations,onAgent}:{onAgent?:(id:string)=>void;onAnnotations?:(key:string,items:import('../shared/browser-annotations.mjs').BrowserAnnotation[])=>void;state:AppState;active:boolean;onOpen:(tool:SessionTool)=>void;onClose:()=>void}){
 const task=state.task!,[page,setPage]=useState<Page>('overview'),[expanded,setExpanded]=useState(false),[apps,setApps]=useState<ChatToolApp[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),panel=useRef<HTMLElement>(null);
 useEffect(()=>{if(active&&matchMedia('(max-width:1050px)').matches)panel.current?.querySelector<HTMLButtonElement>('button')?.focus();},[page,active]);
 useEffect(()=>{let live=true;void window.musebench?.chatTools({type:'apps',taskId:task.id}).then(result=>{if(live)setApps(result.apps??[]);},()=>{});return()=>{live=false;};},[task.id]);
 const launch=async(app:ChatToolApp['id']|'copy')=>{setBusy(true);setError('');try{const result=await window.musebench!.chatTools(app==='copy'?{type:'copy',format:'directory',taskId:task.id}:{type:'open',app,taskId:task.id});if(result.status!=='cancelled')setNotice(app==='copy'?'Working directory copied':`Opened ${apps.find(row=>row.id===app)?.label??app}`);}catch(e){setError(String(e));}finally{setBusy(false);}};
 const changes=task.changes??[],added=changes.reduce((n,f)=>n+f.additions,0),removed=changes.reduce((n,f)=>n+f.deletions,0);
 const nativeAgents=state.runtime.children?.items.filter(item=>item.kind==='subagent')??[];
 const agents=nativeAgents.length?nativeAgents.map(item=>({id:item.itemId,label:item.label||item.objective||'Subagent',status:childGroup(item)==='Active'?'Working':'Done',native:true})):(task.runs??[]).flatMap(run=>run.activities.filter(item=>item.kind==='agent').map(item=>({id:item.id,label:item.title,status:item.status,native:false})));
 const commands=(task.runs??[]).flatMap(run=>run.activities.filter(item=>item.kind==='tool'&&toolCategory(item.tool)==='command'&&['working','waiting','queued'].includes(item.status)));
 const sources=[...new Set((task.messages??[]).flatMap(message=>[...(message.files??[]).map(file=>file.path),...(message.sources??[]).map(file=>file.path)]))].slice(0,20);
 const title=page==='browser'?'Browser':page==='images'?'Images':page==='side'?'Temporary side chat':state.activeProject?.name||'Session';
 const row=(label:string,icon:ReactNode,action:()=>void,extra?:ReactNode)=><button type="button" className="session-tool-row" onClick={action}>{icon}<span>{label}</span>{extra}</button>;
 return <aside ref={panel} className={`session-tools-panel session-tools-${page} ${expanded&&page==='browser'?'session-tools-expanded':''}`} aria-label="Chat session tools" onKeyDown={e=>{if(e.key==='Tab'&&active&&matchMedia('(max-width:1050px)').matches){const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,a[href]')??[]).filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}}}>
  <div className="session-tools-heading">{page!=='overview'&&<button className="icon-button" aria-label="Back to session tools" onClick={()=>setPage('overview')}><ArrowLeft size={15}/></button>}<strong title={title}>{title}</strong>{page==='browser'&&<button type="button" className="icon-button" aria-label={expanded?'Restore browser panel':'Expand browser panel'} onClick={()=>setExpanded(value=>!value)}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>}<button type="button" className="icon-button" aria-label="Close session tools" onClick={onClose}><PanelRightClose size={16}/></button></div>
  {page==='side'?<TemporaryChat key={task.id} taskId={task.id}/>:page==='browser'?<SessionBrowser onAnnotations={items=>onAnnotations?.(task.projectId+':'+task.id,items)} key={task.id} taskId={task.id} initialUrl={state.preview.url??''} active={active}/>:page==='images'?<SessionImages key={task.id} taskId={task.id}/>:<div className="session-tools-overview">
   {row('Changes',<Files size={15}/>,()=>onOpen('changes'),<span className="session-change-count"><small>+{added}</small><small>−{removed}</small></span>)}
   <Group id="agents" label="Subagents" count={agents.length}><p className="session-agent-summary">{agents.filter(agent=>['Working','working','inProgress','queued'].includes(agent.status)).length} working · {agents.filter(agent=>['Done','completed','failed','cancelled','interrupted'].includes(agent.status)).length} done</p>{agents.slice(0,8).map(agent=><button className="session-detail-row" key={agent.id} onClick={()=>agent.native&&onAgent?onAgent(agent.id):onOpen('agents')} title={agent.label}><MessageSquare size={13}/><span>{agent.label}</span><small>{agent.status}</small></button>)}{!agents.length&&<p>No subagents in this session.</p>}{row('View all activity',<Layers size={13}/>,()=>onOpen('agents'))}</Group>
   <Group id="processes" label="Processes" count={commands.length+(state.preview.status==='running'?1:0)+(task.validationRun?.status==='running'?1:0)}>
    {state.preview.status==='running'&&row(state.preview.script||'Project preview',<Play size={13}/>,()=>onOpen('preview'),<small>running</small>)}
    {task.validationRun?.status==='running'&&row('Project checks',<CheckCheck size={13}/>,()=>onOpen('checks'),<small>running</small>)}
    {commands.slice(-8).map(item=><button key={item.id} className="session-detail-row" title={item.subject||item.title} onClick={()=>onOpen('output')}><Terminal size={13}/><span>{workLogItemLabel(item)}</span></button>)}
    {!commands.length&&state.preview.status!=='running'&&task.validationRun?.status!=='running'&&<p>No observed processes running.</p>}{row('Captured output',<Terminal size={13}/>,()=>onOpen('output'))}
   </Group>
   <Group id="sources" label="Sources" count={sources.length}>{sources.map(source=><button className="session-detail-row" key={source} title={source} onClick={()=>onOpen('context')}><Files size={13}/><span>{source}</span></button>)}{!sources.length&&<p>No attached source files.</p>}{row('View context & sources',<Layers size={13}/>,()=>onOpen('context'))}</Group>
   <div className="session-tool-links">{row('Browser',<Globe size={15}/>,()=>setPage('browser'))}{row('Images',<Image size={15}/>,()=>setPage('images'))}{row('Temporary side chat',<MessageCircle size={15}/>,()=>setPage('side'))}{row('Project preview',<Play size={15}/>,()=>onOpen('preview'))}{row('Checks',<CheckCheck size={15}/>,()=>onOpen('checks'))}{row('Checkpoints',<History size={15}/>,()=>onOpen('checkpoints'))}{row('Native session',<Layers size={15}/>,()=>onOpen('session'))}</div>
   <Group id="workspace" label="Open workspace">{(['terminal','vscode','explorer'] as const).map(id=><button key={id} className="session-tool-row" disabled={busy||!apps.find(app=>app.id===id)?.available} title={apps.find(app=>app.id===id)?.available?'Open the current project folder':'Application unavailable'} onClick={()=>void launch(id)}>{id==='terminal'?<Terminal size={15}/>:id==='vscode'?<Code2 size={15}/>:<FolderOpen size={15}/>}<span>{id==='terminal'?'Terminal':id==='vscode'?'VS Code':'File Explorer'}</span></button>)}<button className="session-tool-row" disabled={busy} onClick={()=>void launch('copy')}><Copy size={15}/><span>Copy working directory</span></button></Group>
   {(error||notice)&&<p className="session-notice" role={error?'alert':'status'}>{error||notice}</p>}
  </div>}
 </aside>;
}
