import {useState,type ReactNode} from 'react';
import { Archive, ArrowUpRight, Check, ChevronDown, GitBranch, Github, MapPin, MessageSquare, MoreHorizontal, Terminal } from 'lucide-react';
import type { Action, Project, TaskSummary } from '../shared/types';
import {useChatActions} from './useChatActions';
import './project-overview.css';

const dateLabel = (date: string) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function ProjectOverview({ project, chats, busy, onOpenChat, composer, onRepository, act }: {
  act:(action:Action)=>Promise<unknown>;
  composer:ReactNode;
  onRepository:(url:string)=>void;
  project: Project;
  chats: TaskSummary[];
  busy: boolean;
  onOpenChat: (id: string) => void;
}) {
  const scripts = Object.entries(project.scripts);
  const [archived,setArchived]=useState(false);
  const {open,overlay}=useChatActions({tasks:chats,busy,active:true,act});
  const visibleChats=chats.filter(chat=>Boolean(chat.archived)===archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return <main className="project-overview" aria-label="Project overview">
    <div className="project-overview-inner">
      <header className="project-overview-heading">
        <h1>{project.name.replace(' · tutorial', '')}</h1>
      </header>
      <dl className="project-location-details">
        <div><dt><MapPin size={14}/>Local folder</dt><dd title={project.root}>{project.root}</dd></div>
        <div><dt><Github size={14}/>GitHub</dt><dd>{project.repositoryUrl?<button className="project-repository-link" onClick={()=>onRepository(project.repositoryUrl!)}>{project.repositoryUrl.replace('https://github.com/','')}<ArrowUpRight size={13}/></button>:<span className="muted">Not linked</span>}</dd></div>
        {project.branch&&<div><dt><GitBranch size={14}/>Branch</dt><dd>{project.branch}</dd></div>}
      </dl>
      {scripts.length > 0 && <details className="project-details" key={project.id}><summary><Terminal size={15} /><span>Project commands</span><span className="project-command-count">{scripts.length}</span><ChevronDown size={14} /></summary><p>Scripts from this project’s package.json.</p><dl>{scripts.map(([name, command]) => <div key={name}><dt>{name}</dt><dd><code>{command}</code></dd></div>)}</dl></details>}
      <section className="project-new-conversation" aria-label="New project chat">{composer}</section>
      <section className="project-conversations" aria-label="Project chats">
        <div className="project-section-heading"><div className="project-chat-tabs" role="group" aria-label={`${project.name} chat sections`}>{[false,true].map(value=><button key={String(value)} aria-label={value?'Archived':'Chats'} aria-pressed={archived===value} onClick={()=>setArchived(value)}>{value?'Archived':'Chats'}<span aria-hidden="true">{chats.filter(chat=>Boolean(chat.archived)===value).length}</span></button>)}</div><span>{archived?'Archived chats':'Recent activity'}</span></div>
        {archived&&<p className="archive-retention">Archived chats are permanently deleted after 30 days. Restore them or delete them sooner from the chat menu.</p>}
        <div role="region" aria-label={`${project.name} ${archived?'archived':'active'} chats`}>
        {visibleChats.length ? <div className="project-conversation-list">{visibleChats.map(chat => <div className="project-conversation-row" key={chat.id}><button className="project-conversation" aria-label={chat.title} disabled={busy} onClick={() => onOpenChat(chat.id)} onContextMenu={event=>open(chat,event)} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')open(chat,event);}}>
          <span className="project-chat-icon"><MessageSquare size={18} strokeWidth={1.5} /></span>
          <span className="project-chat-copy"><strong>{chat.title}</strong><small>{chat.mode === 'muse' ? 'Muse' : chat.mode === 'demo' ? 'Sample chat' : 'Manual workspace'}{chat.acceptedRevision && <><span>·</span><Check size={12} />Checkpoint saved</>}</small></span>
          <time dateTime={chat.updatedAt}>{dateLabel(chat.updatedAt)}</time><ArrowUpRight className="project-chat-arrow" size={16} />
        </button><button className="icon-button project-conversation-options" aria-label={`Chat options for ${chat.title}`} disabled={busy} onClick={event=>open(chat,event)}><MoreHorizontal size={17}/></button></div>)}</div> : archived ? <div className="project-empty"><Archive size={27} strokeWidth={1.3}/><h3>No archived chats</h3></div> : <div className="project-empty"><MessageSquare size={27} strokeWidth={1.3} /><h3>No chats yet</h3><p>Start a conversation above.</p></div>}
        </div>
      </section>

    </div>
    {overlay}
  </main>;
}
