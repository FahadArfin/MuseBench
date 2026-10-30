import {useEffect,useRef,useState} from 'react';
import {FileInput,Search} from 'lucide-react';
import type {ConversationImportPreview,ImportConversation,HistoryPage} from '../shared/types';
import {IMPORT_LIMITS} from '../shared/conversation-import.mjs';
import {Modal} from './WorkspacePanels';
import {useLatestRead} from './useLatestRead';
import {HistoryMessages,type HistoryCursor} from './HistoryMessages';
import './conversation-import.css';

function InspectExport({preview,row,back}:{preview:ConversationImportPreview;row:ImportConversation;back:()=>void}){
 const [cursor,setCursor]=useState<HistoryCursor>({});
 const {value:page,pending,error}=useLatestRead<HistoryPage>({owner:`${preview.token}:${row.id}`,key:JSON.stringify(cursor),read:()=>window.musebench!.readImportPreview({token:preview.token,id:row.id,...cursor})});
 return <div className="import-inspection"><button className="text-link" onClick={back}>Back to selection</button><h3>{row.title}</h3><p className="import-meta">{row.format} · {row.messageCount} messages · {row.omittedMessages+row.omittedBlocks} non-chat items omitted</p>{error&&<p role="alert">{error}</p>}{pending&&<p role="status">Reading export…</p>}{page&&<HistoryMessages page={page} pending={pending} onPage={setCursor}/>}</div>;
}

export function ConversationImportDialog({back,close,onImported}:{back:()=>void;close:()=>void;onImported:()=>void}){
 const [preview,setPreview]=useState<ConversationImportPreview|null>(null),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[limit,setLimit]=useState(80),[inspection,setInspection]=useState<ImportConversation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const alive=useRef(true),token=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(token.current)void window.musebench!.discardConversationImport(token.current).catch(()=>{});};},[]);
 const {value:matches=[],pending,error:searchError}=useLatestRead<ImportConversation[]>({owner:preview?.token??'no-import',key:query,revision,read:()=>preview?window.musebench!.searchImportPreview({token:preview.token,query}):Promise.resolve([])});
 const bytes=preview?.conversations.filter(row=>selected.includes(row.id)).reduce((sum,row)=>sum+row.textBytes,0)??0;
 const overLimit=selected.length>IMPORT_LIMITS.selectedConversations||bytes>IMPORT_LIMITS.selectedBytes;
 async function choose(){
  setBusy(true);setError('');setNotice('');setPreview(null);setSelected([]);setInspection(null);
  try{const previous=token.current;token.current=null;if(previous)await window.musebench!.discardConversationImport(previous);if(!alive.current)return;const next=await window.musebench!.previewConversationImport();if(!alive.current){if(next)await window.musebench!.discardConversationImport(next.token);return;}token.current=next?.token??null;setPreview(next);setQuery('');setLimit(80);}
  catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}
 }
 async function confirm(){
  if(!preview||busy||!selected.length||overLimit)return;setBusy(true);setError('');
  try{const saved=await window.musebench!.confirmConversationImport({token:preview.token,ids:selected});onImported();if(alive.current){setPreview(saved.preview);setSelected([]);setNotice(`Imported ${saved.imported} ${saved.imported===1?'chat':'chats'}${saved.skipped?` · ${saved.skipped} already saved`:''}.`);setRevision(value=>value+1);}}
  catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}
 }
 const chooseVisible=()=>{const ids=matches.slice(0,limit).filter(row=>!row.duplicate).map(row=>row.id);setSelected(before=>[...new Set([...before,...ids])]);};
 return <Modal title="Import chats" className="chat-library-modal conversation-import-modal" close={close}>
  <div className="import-toolbar"><button className="text-link" onClick={back}>Back to library</button><button className="import-file-button" onClick={()=>void choose()} disabled={busy}><FileInput size={16}/>{preview?'Choose another export':'Choose export'}</button></div>
  {!preview&&!busy&&<p className="context-description">Choose a ChatGPT or Claude export, a MuseBench conversation JSON, or a Markdown/text file. Preview the text, then save selected chats to your library.</p>}
  {busy&&!preview&&<p className="context-description" role="status">Reading export…</p>}
  {preview&&<>
   <p className="import-meta" title={`SHA-256: ${preview.sourceDigest}`}>{preview.sourceName} · {preview.conversations.length} chats{preview.skippedConversations?` · ${preview.skippedConversations} without text omitted`:''}</p>
   {preview.simulation&&<p className="import-sample">Preview sample · Reload clears these imports.</p>}
   {inspection?<InspectExport key={`${preview.token}:${inspection.id}`} preview={preview} row={inspection} back={()=>setInspection(null)}/>:<>
    <div className="import-search-row"><label className="context-search"><Search size={16}/><input aria-label="Search export" placeholder="Search every chat in this export…" value={query} maxLength={200} onChange={e=>{setQuery(e.target.value);setLimit(80);}}/></label><button className="text-link" disabled={busy||pending} onClick={chooseVisible}>Select visible</button><button className="text-link" disabled={!selected.length||busy} onClick={()=>setSelected([])}>Clear</button></div>
    <div className="import-conversations" aria-label="Conversations in export" aria-busy={pending} onScroll={e=>{if(e.currentTarget.scrollTop+e.currentTarget.clientHeight>=e.currentTarget.scrollHeight-120)setLimit(value=>Math.min(matches.length,value+80));}}>
     {matches.slice(0,limit).map(row=><div className="import-conversation" key={row.id}><input type="checkbox" aria-label={`Select ${row.title}`} checked={selected.includes(row.id)} disabled={busy||pending||row.duplicate} onChange={e=>setSelected(before=>e.target.checked?[...before,row.id]:before.filter(id=>id!==row.id))}/><button aria-label={`Preview ${row.title}`} disabled={busy||pending} onClick={()=>setInspection(row)}><strong>{row.title}</strong><small>{row.duplicate?'Already imported':`${row.messageCount} messages · ${row.format}`}</small>{query&&<span>{row.snippet}</span>}</button></div>)}
     {!matches.length&&!pending&&<p className="context-description">No matching conversations.</p>}
     {matches.length>limit&&<button className="text-link import-more" onClick={()=>setLimit(value=>value+80)}>Show next conversations</button>}
    </div>
    <div className="import-confirm"><span>{selected.length} selected · {(bytes/1024).toFixed(0)} KiB{overLimit&&<small role="alert">Select up to 100 chats and 2 MiB per import.</small>}</span><button className="primary-button" disabled={busy||!selected.length||overLimit} onClick={()=>void confirm()}>{busy?'Importing…':`Import ${selected.length} ${selected.length===1?'chat':'chats'}`}</button></div>
   </>}
  </>}
  {(error||searchError)&&<p className="context-error" role="alert">{error||searchError}</p>}{notice&&<p className="context-description" role="status">{notice}</p>}
  <p className="import-footnote">Local, read-only history. Your original export stays unchanged.</p>
 </Modal>;
}
