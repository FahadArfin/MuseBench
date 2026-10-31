import {useEffect,useRef,useState} from 'react';
import type {HistoryPage} from '../shared/types';
import {useLatestRead} from './useLatestRead';
export type QuoteCapture={taskId:string;messageId:string;displayedText:string;selection:string|null;sourceText:string;draftKey:string};
export function QuoteSource({capture}:{capture:QuoteCapture}){
 const [open,setOpen]=useState(false),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),trigger=useRef<HTMLButtonElement>(null);
 const region=useRef<HTMLElement>(null);useEffect(()=>{if(open)region.current?.focus({preventScroll:true});},[open]);
 const saved=useLatestRead<HistoryPage|null>({owner:`${capture.taskId}:${capture.messageId}:${open}`,key:String(offset),revision,read:()=>open?window.musebench!.readChatHistory({taskId:capture.taskId,messageId:capture.messageId,offset,limit:1}):Promise.resolve(null)});
 const page=open&&!saved.pending&&!saved.error?saved.value:null,source=page?.messages.find(message=>message.id===capture.messageId);
 const differs=source&&(source.textLength!==capture.sourceText.length||source.text!==capture.sourceText.slice(source.offset,source.offset+source.text.length));
 const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true});};
 return <div className="quote-staging"><button ref={trigger} type="button" className="context-chip" aria-label="Inspect quote source" aria-expanded={open} onClick={()=>{setOpen(value=>!value);setOffset(0);}}>Quote source · {capture.messageId}</button>
 {open&&<section ref={region} className="quote-source" aria-label="Quote source" tabIndex={-1} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
  <header><strong>Quote source</strong><button type="button" className="text-link" onClick={()=>setRevision(value=>value+1)} disabled={saved.pending}>Refresh source</button><button type="button" className="text-link" aria-label="Close quote source" onClick={close}>Close</button></header>
  <small>Chat {capture.taskId} · Message {capture.messageId}</small><p>Captured {capture.selection===null?'reply':'selection'} · Saved quote text stays as captured.</p><pre>{capture.selection??capture.displayedText}</pre>
  {saved.pending&&<p role="status">Reading saved source…</p>}{saved.error&&<p role="status">Source unavailable. The captured quote is unchanged.</p>}
  {page&&!source&&<p role="status">Source is no longer available. The captured quote is unchanged.</p>}
  {source&&<><strong>Current saved excerpt</strong><small>{page?.coverage==='preview-sample'?'Preview sample':page?.coverage==='retained-legacy'?'Retained legacy capture':'App-received capture'} · Earlier or unseen text may be missing{source.captureTruncated?' · Message capture was truncated':''}</small>{differs&&<p role="status">Saved source differs from the captured reply. The quote is unchanged.</p>}<pre>{source.text}</pre><div className="quote-source-pages">{source.offset>0&&<button type="button" onClick={()=>setOffset(Math.max(0,source.offset-12000))}>Previous excerpt</button>}{source.offset+source.text.length<source.textLength&&<button type="button" onClick={()=>setOffset(source.offset+source.text.length)}>Next excerpt</button>}</div></>}
 </section>}
 </div>;
}
