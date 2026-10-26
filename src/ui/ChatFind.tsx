import {useEffect,useRef,useState,type RefObject} from 'react';
import {Search,MessageCircle,Globe,X,ChevronUp,ChevronDown} from 'lucide-react';
import './chat-find.css';

// Ranges leave React's message DOM intact, including formatted text and code.
function findRanges(container:HTMLElement,query:string){
 const ranges:Range[]=[];
 for(const body of container.querySelectorAll('.user-message > p, .assistant-message > .markdown')){
  const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT),nodes:Text[]=[];let text='',node:Node|null;
  while((node=walker.nextNode())){nodes.push(node as Text);text+=node.textContent??'';}
  const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');let match:RegExpExecArray|null;
  while((match=pattern.exec(text))){
   const start=match.index,end=start+match[0].length,range=document.createRange();let offset=0;
   for(const node of nodes){const next=offset+node.length;if(start>=offset&&start<next)range.setStart(node,start-offset);if(end>offset&&end<=next){range.setEnd(node,end-offset);break;}offset=next;}
   ranges.push(range);
  }
 }
 return ranges;
}
export function ChatFind({active,context,transcript}:{active:boolean;context:string;transcript:RefObject<HTMLDivElement|null>}){
 const [open,setOpen]=useState(false),[mode,setMode]=useState<'chat'|'web'>('chat'),[query,setQuery]=useState(''),[ranges,setRanges]=useState<Range[]>([]),[index,setIndex]=useState(0),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>{setOpen(false);trigger.current?.focus();};
 useEffect(()=>{if(!active)setOpen(false);},[active]);
 useEffect(()=>{setQuery('');setIndex(0);setError('');},[context]);
 useEffect(()=>{if(open)input.current?.focus();},[open,mode]);
 useEffect(()=>{if(!active)return;const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();setOpen(true);input.current?.focus();input.current?.select();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active]);
 useEffect(()=>{
  if(!open||mode!=='chat'||!query||!transcript.current){setRanges([]);return;}
  const container=transcript.current;let frame=0;
  const update=()=>{setRanges(findRanges(container,query));setIndex(0);};update();
  const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);});observer.observe(container,{subtree:true,childList:true,characterData:true});
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[open,mode,query,context,transcript]);
 useEffect(()=>{
  CSS.highlights.delete('chat-find');CSS.highlights.delete('chat-find-current');
  if(!open||mode!=='chat'||!ranges.length)return;
  CSS.highlights.set('chat-find',new Highlight(...ranges));
  const current=ranges[index];if(current){CSS.highlights.set('chat-find-current',new Highlight(current));const box=current.getBoundingClientRect(),container=transcript.current;if(container&&box.height){const bounds=container.getBoundingClientRect();container.scrollBy({top:box.top-bounds.top-bounds.height/2,behavior:'instant'});}}
  return()=>{CSS.highlights.delete('chat-find');CSS.highlights.delete('chat-find-current');};
 },[open,mode,ranges,index,transcript]);
 const step=(direction:number)=>setIndex(i=>ranges.length?(i+direction+ranges.length)%ranges.length:0);
 const searchWeb=async()=>{if(!query.trim())return;try{await window.musebench!.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query.trim())}`);setError('');}catch(e){setError(String(e));}};
 return <div className="chat-find-anchor">
  <button ref={trigger} className={`icon-button ${open?'active':''}`} aria-label="Search this chat" title="Search this chat · Ctrl+F" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setMode('chat');}}><Search size={16}/></button>
  {open&&<section className="chat-find-popover" aria-label="Quick search" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
   <form className="chat-find-pill" role="search" onSubmit={e=>{e.preventDefault();if(mode==='web')void searchWeb();else step(1);}}>
    <Search size={15} aria-hidden="true"/>
    <input ref={input} aria-label={mode==='chat'?'Search this chat':'Search the web'} placeholder={mode==='chat'?'Search chat…':'Search the web…'} value={query} maxLength={500} onChange={e=>{setQuery(e.target.value);setIndex(0);setError('');}} onKeyDown={e=>{if(e.key==='Enter'&&e.shiftKey&&mode==='chat'){e.preventDefault();step(-1);}}}/>
    <button type="button" aria-label="Search in chat" title="Search in chat" aria-pressed={mode==='chat'} onClick={()=>{setMode('chat');setError('');}}><MessageCircle size={16}/></button>
    <button type="button" aria-label="Search on the web" title="Search on the web" aria-pressed={mode==='web'} onClick={()=>{setMode('web');setError('');}}><Globe size={16}/></button>
    <span className="chat-find-divider"/>
    <button type="button" aria-label="Close search" title="Close · Esc" onClick={close}><X size={15}/></button>
   </form>
   {query&&<div className="chat-find-status"><span role="status">{mode==='web'?'Press Enter to search Google':ranges.length?`${index+1} of ${ranges.length}`:'No matches in this chat'}</span>{mode==='chat'&&<><button aria-label="Previous match" title="Previous · Shift+Enter" disabled={!ranges.length} onClick={()=>step(-1)}><ChevronUp size={14}/></button><button aria-label="Next match" title="Next · Enter" disabled={!ranges.length} onClick={()=>step(1)}><ChevronDown size={14}/></button></>}</div>}
   {error&&<p className="chat-find-error" role="alert">{error}</p>}
  </section>}
 </div>;
}
