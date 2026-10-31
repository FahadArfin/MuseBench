import {useEffect,useRef,useState,type RefObject} from 'react';
import {Search,MessageCircle,Globe,X,ChevronUp,ChevronDown} from 'lucide-react';
import {useLatestRead} from './useLatestRead';
import type {HistoryFindResult,HistoryFindInput} from '../shared/types';
import './chat-find.css';

type VisibleHit={range:Range;messageId:string;occurrence:number};
// Ranges leave React's message DOM intact, including text split across formatting nodes.
function findRanges(container:HTMLElement,query:string){
 const hits:VisibleHit[]=[];
 for(const [bodyIndex,body] of [...container.querySelectorAll('.user-message > p, .assistant-message > .markdown')].entries()){
  const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT),nodes:Text[]=[];let text='',node:Node|null,occurrence=0;
  while((node=walker.nextNode())){nodes.push(node as Text);text+=node.textContent??'';}
  const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');let match:RegExpExecArray|null;
  while((match=pattern.exec(text))){
   const start=match.index,end=start+match[0].length,range=document.createRange();let offset=0;
   for(const node of nodes){const next=offset+node.length;if(start>=offset&&start<next)range.setStart(node,start-offset);if(end>offset&&end<=next){range.setEnd(node,end-offset);break;}offset=next;}
   hits.push({range,messageId:body.closest('[data-transcript-anchor]')?.getAttribute('data-transcript-anchor')??`body:${bodyIndex}`,occurrence:occurrence++});
  }
 }
 return hits;
}
export function ChatFind({active,context,projectId,taskId,transcript,onNavigate}:{active:boolean;context:string;projectId?:string;taskId?:string;transcript:RefObject<HTMLDivElement|null>;onNavigate?:()=>void}){
 const [open,setOpen]=useState(false),[mode,setMode]=useState<'chat'|'web'>('chat'),[scope,setScope]=useState<'visible'|'saved'>('visible'),[query,setQuery]=useState(''),[result,setResult]=useState<{hits:VisibleHit[];index:number}>({hits:[],index:0}),[error,setError]=useState('');
 const [request,setRequest]=useState<{cursor?:HistoryFindInput['cursor'];direction:'next'|'previous';serial:number}>({direction:'next',serial:0});
 const input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),selected=useRef<{messageId:string;occurrence:number;index:number}|null>(null),reveal=useRef(false),navigate=useRef(onNavigate);navigate.current=onNavigate;
 const enabled=active&&open&&mode==='chat'&&scope==='saved'&&!!query&&!!projectId&&!!taskId;
 const saved=useLatestRead<HistoryFindResult|null>({owner:`${context}:${projectId}:${taskId}:${enabled}`,key:JSON.stringify({query,...request}),read:()=>enabled?window.musebench!.findChatHistory({projectId:projectId!,taskId:taskId!,query,...request}):Promise.resolve(null)});
 const savedReveal=useRef<HistoryFindResult|null>(null);
 useEffect(()=>{if(enabled&&!saved.pending&&saved.value&&saved.value!==savedReveal.current){savedReveal.current=saved.value;if(saved.value.hit)navigate.current?.();}},[enabled,saved.pending,saved.value]);
 const close=()=>{setOpen(false);trigger.current?.focus();};
 const reset=()=>{selected.current=null;reveal.current=true;setRequest({direction:'next',serial:0});setError('');};
 useEffect(()=>{if(!active)setOpen(false);},[active]);
 useEffect(()=>{setQuery('');setResult({hits:[],index:0});selected.current=null;reveal.current=false;setRequest({direction:'next',serial:0});setError('');},[context,projectId,taskId]);
 useEffect(()=>{if(open)input.current?.focus();},[open,mode]);
 useEffect(()=>{if(!active)return;const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();setOpen(true);input.current?.focus();input.current?.select();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active]);
 const revealRange=(range:Range)=>{const box=range.getBoundingClientRect(),container=transcript.current;if(container&&box.height){navigate.current?.();const bounds=container.getBoundingClientRect();container.scrollBy({top:box.top-bounds.top-bounds.height/2,behavior:'instant'});}};
 useEffect(()=>{
  if(!active||!open||mode!=='chat'||scope!=='visible'||!query||!transcript.current){setResult({hits:[],index:0});return;}
  const container=transcript.current;let frame=0;
  const update=()=>{
   const hits=findRanges(container,query),prior=selected.current,retained=prior?hits.findIndex(h=>h.messageId===prior.messageId&&h.occurrence===prior.occurrence):-1;
   const index=retained>=0?retained:Math.min(prior?.index??0,Math.max(0,hits.length-1)),hit=hits[index];
   selected.current=hit?{...hit,index}:null;setResult({hits,index});
   if(reveal.current&&hit)revealRange(hit.range);reveal.current=false;
  };update();
  const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);});observer.observe(container,{subtree:true,childList:true,characterData:true});
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[active,open,mode,scope,query,context,transcript]);
 useEffect(()=>{
  CSS.highlights.delete('chat-find');CSS.highlights.delete('chat-find-current');
  if(!open||mode!=='chat'||scope!=='visible'||!result.hits.length)return;
  CSS.highlights.set('chat-find',new Highlight(...result.hits.map(h=>h.range)));
  const current=result.hits[result.index];if(current)CSS.highlights.set('chat-find-current',new Highlight(current.range));
  return()=>{CSS.highlights.delete('chat-find');CSS.highlights.delete('chat-find-current');};
 },[open,mode,scope,result]);
 const step=(direction:number)=>{
  if(scope==='saved'){if(!saved.pending&&saved.value?.hit){const {messageId,offset}=saved.value.hit;setRequest(r=>({cursor:{messageId,offset},direction:direction>0?'next':'previous',serial:r.serial+1}));}return;}
  if(!result.hits.length)return;const index=(result.index+direction+result.hits.length)%result.hits.length,hit=result.hits[index];selected.current={...hit,index};setResult({...result,index});revealRange(hit.range);
 };
 const searchWeb=async()=>{if(!query.trim())return;try{await window.musebench!.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query.trim())}`);setError('');}catch(e){setError(String(e));}};
 const hit=!saved.pending?saved.value?.hit:null,canStep=scope==='visible'?!!result.hits.length:!!hit;
 const coverage=saved.value?.coverage==='preview-sample'?'Preview sample · Reload clears sample changes':saved.value?.coverage==='retained-legacy'?'Retained legacy capture · Earlier text may be missing':'App-received capture · Earlier or unseen text may be missing';
 return <div className="chat-find-anchor">
  <button ref={trigger} className={`icon-button ${open?'active':''}`} aria-label="Search this chat" title="Search this chat · Ctrl+F" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setMode('chat');}}><Search size={16}/></button>
  {open&&<section className="chat-find-popover" aria-label="Quick search" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
   <form className="chat-find-pill" role="search" onSubmit={e=>{e.preventDefault();if(mode==='web')void searchWeb();else step(1);}}>
    <Search size={15} aria-hidden="true"/>
    <input ref={input} aria-label={mode==='chat'?'Search this chat':'Search the web'} placeholder={mode==='chat'?'Search chat…':'Search the web…'} value={query} maxLength={500} onChange={e=>{reset();setQuery(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&e.shiftKey&&mode==='chat'){e.preventDefault();step(-1);}}}/>
    <button type="button" aria-label="Search in chat" title="Search in chat" aria-pressed={mode==='chat'} onClick={()=>{reset();setMode('chat');}}><MessageCircle size={16}/></button>
    <button type="button" aria-label="Search on the web" title="Search on the web" aria-pressed={mode==='web'} onClick={()=>{setMode('web');setError('');}}><Globe size={16}/></button>
    <span className="chat-find-divider"/>
    <button type="button" aria-label="Close search" title="Close · Esc" onClick={close}><X size={15}/></button>
   </form>
   {mode==='chat'&&<div className="chat-find-scopes" role="group" aria-label="Search scope"><button aria-pressed={scope==='visible'} onClick={()=>{reset();setScope('visible');}}>Visible</button><button aria-pressed={scope==='saved'} disabled={!projectId||!taskId} onClick={()=>{reset();setScope('saved');}}>Saved history</button></div>}
   {query&&<div className="chat-find-status"><span role="status">{mode==='web'?'Press Enter to search Google':scope==='visible'?result.hits.length?`${result.index+1} of ${result.hits.length} visible`:'No visible matches':saved.pending?'Searching saved history…':saved.error?'Saved search unavailable':hit?`Saved match${saved.value?.wrapped?' · Wrapped':''}`:'No matches in captured history'}</span>{mode==='chat'&&<><button aria-label="Previous match" title="Previous · Shift+Enter" disabled={!canStep} onClick={()=>step(-1)}><ChevronUp size={14}/></button><button aria-label="Next match" title="Next · Enter" disabled={!canStep} onClick={()=>step(1)}><ChevronDown size={14}/></button></>}</div>}
   {enabled&&!saved.pending&&saved.value&&<section className="chat-find-reader" aria-label="Saved text match"><small>{coverage}{hit?.captureTruncated?' · This message capture was truncated':''}</small>{hit&&<><div className="chat-find-source">{hit.role} · Message {hit.messageId} · Offset {hit.offset}</div><pre>{hit.excerpt.slice(0,hit.offset-hit.excerptOffset)}<mark>{hit.excerpt.slice(hit.offset-hit.excerptOffset,hit.offset-hit.excerptOffset+hit.length)}</mark>{hit.excerpt.slice(hit.offset-hit.excerptOffset+hit.length)}</pre></>}</section>}
   {(error||enabled&&saved.error)&&<p className="chat-find-error" role="alert">{error||saved.error}</p>}
  </section>}
 </div>;
}
