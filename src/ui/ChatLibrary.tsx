import {useEffect,useRef,useState} from 'react';
import {useLatestRead} from './useLatestRead';
import {Archive,ArchiveRestore,Pin,Search,MessageSquare,Folder,FileInput} from 'lucide-react';
import type {Action,ChatSearchResult,Project,HistoryPage} from '../shared/types';
import {importExcerpt} from '../shared/conversation-import.mjs';
import {Modal} from './WorkspacePanels';
import {ConversationImportDialog} from './ConversationImportDialog';
import {HistoryMessages,type HistoryCursor} from './HistoryMessages';
import './code-context.css';
import './conversation-import.css';

type DraftTarget={key:string;label:string};
type DraftProps={draftTarget?:DraftTarget|null;onExcerpt?:(key:string,text:string)=>void};

function SavedConversation({source,initialCursor,back,close,onOpen,onRemoved,draftTarget,onExcerpt}:{source:ChatSearchResult;initialCursor:HistoryCursor;back:()=>void;close:()=>void;onOpen:(id:string)=>void;onRemoved:()=>void}&DraftProps){
 const [cursor,setCursor]=useState(initialCursor),[error,setError]=useState(''),[notice,setNotice]=useState(''),[remove,setRemove]=useState(false),[removing,setRemoving]=useState(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const {value:history,pending,error:readError}=useLatestRead<HistoryPage>({owner:source.id,key:JSON.stringify(cursor),read:()=>window.musebench!.readChatHistory({taskId:source.id,...cursor})});
 async function useExcerpt(message:HistoryPage['messages'][number]){
  setError('');setNotice('');
  try{
   const excerpt=source.imported?importExcerpt(source.title,message):`Saved conversation excerpt (${source.title}; message ${message.id}; ${message.at??'date unavailable'}):\n${message.text}`;
   if(source.imported||draftTarget?.key===source.projectId+':'+source.id){
    if(!draftTarget||!onExcerpt)throw Error('Open a Muse Code project or chat to choose a destination draft.');
    onExcerpt(draftTarget.key,excerpt);setNotice('Excerpt added to '+draftTarget.label+'’s draft. Nothing was sent.');return;
   }
   const state=await window.musebench!.getState();if(!alive.current)return;
   const draft=state.drafts?.[source.projectId+':'+source.id],text=[draft?.text,excerpt].filter(Boolean).join('\n\n');
   if(text.length>16000)throw Error('This excerpt and draft exceed 16,000 characters. Copy a smaller selection instead.');
   await window.musebench!.saveCodeDraft({projectId:source.projectId,taskId:source.id,text,files:draft?.files??[],images:draft?.images??[],mode:draft?.mode??'chat'});
   if(alive.current)setNotice('Excerpt added to this chat’s draft. Nothing was sent.');
  }catch(e){if(alive.current)setError(String(e));}
 }
 async function removeCopy(){setRemoving(true);try{await window.musebench!.removeImportedConversation(source.id);onRemoved();}catch(e){if(alive.current){setError(String(e));setRemoving(false);}}}
 const imported=source.imported;
 return <Modal title={imported?'Imported conversation':'Saved conversation'} className="chat-library-modal" close={close}><div className="library-history">
  <button className="text-link" onClick={back}>Back to search</button><h3>{source.title}</h3>
  {imported?<><p className="context-description">{imported.format} · {imported.messageCount} messages · Read-only{imported.simulation?' · Preview sample':''}</p><details className="library-provenance"><summary>Import details</summary><p>{imported.sourceName} · Imported {new Date(imported.importedAt).toLocaleString()}</p><p>{imported.omittedMessages+imported.omittedBlocks} non-chat items omitted. Your original export is unchanged.</p><p>Source SHA-256: {imported.sourceDigest}</p></details>{!draftTarget&&<p className="context-description">Open a Muse Code project to add an excerpt to a draft.</p>}</>:history&&<p className="context-description">{history.total} saved messages · {history.coverage==='retained-legacy'?'Older history contains only messages retained before this update.':history.coverage==='preview-sample'?'Preview sample history.':'App-received history.'} Native tool transcripts are not included.</p>}
  {(error||readError)&&<p role="alert">{error||readError}</p>}{notice&&<p role="status">{notice}</p>}{pending&&<p role="status">Reading conversation…</p>}
  {history&&<HistoryMessages page={history} pending={pending} onPage={setCursor} onExcerpt={!imported||draftTarget&&onExcerpt?message=>void useExcerpt(message):undefined} excerptLabel={imported&&draftTarget?'Add excerpt to '+draftTarget.label:undefined}/>}
  {imported?<div className="library-remove">{remove?<><span>Remove only this imported copy?</span><button disabled={removing} onClick={()=>void removeCopy()}>Confirm remove</button><button disabled={removing} onClick={()=>setRemove(false)}>Keep it</button></>:<button className="text-link" onClick={()=>setRemove(true)}>Remove imported copy</button>}</div>:<button onClick={()=>onOpen(source.id)}>Open chat</button>}
 </div></Modal>;
}

export function ChatLibrary({projects,onProject,onOpen,act,busy,close,draftTarget,onExcerpt}:{projects:Project[];onProject:(id:string)=>void;onOpen:(id:string)=>void;act:(action:Action)=>Promise<unknown>;busy:boolean;close:()=>void}&DraftProps){
 const [query,setQuery]=useState(''),[archived,setArchived]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[importing,setImporting]=useState(false);
 const {value:results=[],error:searchError,pending}=useLatestRead<ChatSearchResult[]>({owner:'chat-library',key:JSON.stringify([query,archived]),revision,read:()=>window.musebench!.searchChats({query,includeArchived:archived})});
 const [source,setSource]=useState<{chat:ChatSearchResult;cursor:HistoryCursor}|null>(null);
 const read=(chat:ChatSearchResult)=>setSource({chat,cursor:query&&chat.messageId?{messageId:chat.messageId,offset:chat.offset??0}:{}});
 async function change(action:Action){try{await act(action);setRevision(r=>r+1);}catch(e){setError(String(e));}}
 if(importing)return <ConversationImportDialog back={()=>setImporting(false)} close={close} onImported={()=>setRevision(value=>value+1)}/>;
 if(source)return <SavedConversation key={source.chat.id} source={source.chat} initialCursor={source.cursor} back={()=>setSource(null)} close={close} onOpen={onOpen} onRemoved={()=>{setSource(current=>current?.chat.id===source.chat.id?null:current);setRevision(value=>value+1);}} draftTarget={draftTarget} onExcerpt={onExcerpt}/>;
 return <Modal title="Search MuseBench" className="chat-library-modal" close={close}>
  <div className="context-search"><Search size={18}/><input data-autofocus aria-label="Search projects and chats" placeholder="Search names and messages…" value={query} onChange={e=>{setQuery(e.target.value);setError('');}} maxLength={200}/></div>
  <div className="library-toolbar"><label className="archive-filter"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setError('');}}/>Include archived chats</label><button className="import-file-button" onClick={()=>setImporting(true)}><FileInput size={16}/>Import chats</button></div>
  {(error||searchError)&&<p role="alert">{error||searchError}</p>}{pending&&<p className="context-description" role="status">Searching chats…</p>}
  <div className="chat-library-results" aria-busy={pending}>{results.map(chat=><div className="library-chat" key={chat.id}>
   <button className="library-open" aria-label={chat.imported?'Read '+chat.title:undefined} disabled={!chat.imported&&busy} onClick={()=>chat.imported?read(chat):onOpen(chat.id)}><MessageSquare size={17}/><span><strong>{chat.title}</strong><small>{chat.projectName}{chat.archived?' · Archived':''}</small>{query&&<p>{chat.snippet}</p>}</span></button>
   <button className="text-link" onClick={()=>read(chat)}>History</button>
   {!chat.imported&&<><button className={'icon-button '+(chat.pinned?'active':'')} aria-label={(chat.pinned?'Unpin':'Pin')+' '+chat.title} disabled={busy} onClick={()=>void change({type:'setTaskFlags',id:chat.id,pinned:!chat.pinned})}><Pin size={15}/></button><button className="icon-button" aria-label={(chat.archived?'Restore':'Archive')+' '+chat.title} disabled={busy} onClick={()=>void change({type:'setTaskFlags',id:chat.id,archived:!chat.archived})}>{chat.archived?<ArchiveRestore size={15}/>:<Archive size={15}/>}</button></>}
  </div>)}{!pending&&!searchError&&!results.length&&<p className="context-description">No matching chats.</p>}
  <h3>Projects</h3>{projects.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).map(project=><button key={project.id} className="library-open library-project" disabled={busy} onClick={()=>onProject(project.id)}><Folder size={17}/><span><strong>{project.name}</strong><small>{project.root}</small></span></button>)}</div>
  <footer className="context-description">Searches saved messages and imported history. Archived MuseBench chats are permanently deleted after 30 days.</footer>
 </Modal>;
}
