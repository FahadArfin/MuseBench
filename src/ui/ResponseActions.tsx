import {memo,useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {Check,Copy,Files,GitBranch,Quote,Square,ThumbsDown,ThumbsUp,Volume2} from 'lucide-react';
import type {QuoteCapture} from './QuoteSource';
import './response-actions.css';
import {copyReply} from './copy-reply';

export const ResponseActions=memo(function ResponseActions({messageId,text,at,chatId,branchDisabled,onBranch,runId,onChanges,draftKey,quoteDisabled,onQuote}:{messageId:string;text:string;at:string;chatId:string;branchDisabled:boolean;onBranch:(messageId:string,taskId:string)=>void;runId?:string;onChanges?:(runId:string)=>void;draftKey?:string;quoteDisabled?:boolean;onQuote?:(capture:QuoteCapture)=>void}){
 const [status,setStatus]=useState(''),[menu,setMenu]=useState<'feedback'|null>(null),[speaking,setSpeaking]=useState(false);
 const key=`musebench-response-feedback:${chatId}:${messageId}`;
 const [feedback,setFeedback]=useState<string|null>(()=>{try{return localStorage.getItem(key);}catch{return null;}});
 const root=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null),utterance=useRef<SpeechSynthesisUtterance|null>(null),speechTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const pressedQuote=useRef<QuoteCapture|Error|null>(null);
 const captureQuote=():QuoteCapture=>{
  const body=root.current?.closest('article')?.querySelector<HTMLElement>('.markdown');if(!body||!draftKey)throw Error('The quote source is unavailable.');
  const selected=window.getSelection();let selection:string|null=null;
  if(selected&&!selected.isCollapsed){if(selected.rangeCount!==1)throw Error('Select text wholly within one response.');const range=selected.getRangeAt(0);if(!body.contains(range.startContainer)||!body.contains(range.endContainer)||[...body.querySelectorAll('.markdown-code > div')].some(element=>element.contains(range.startContainer)||element.contains(range.endContainer)))throw Error('Select text wholly within one response, starting and ending in its text.');selection=selected.toString();}
  // Read rendered text with layout so list/code/link selections have the same meaning.
  // Exclude the code toolbar, whose labels are not part of the assistant reply.
  const clone=body.cloneNode(true) as HTMLElement;clone.querySelectorAll('.markdown-code > div').forEach(element=>element.remove());clone.style.cssText=`position:fixed;left:-100000px;top:0;width:${body.getBoundingClientRect().width}px;pointer-events:none`;clone.setAttribute('aria-hidden','true');document.body.append(clone);let displayedText:string;try{displayedText=clone.innerText;}finally{clone.remove();}
  return{taskId:chatId,messageId,displayedText,selection,sourceText:text,draftKey};
 };
 const stop=()=>{clearTimeout(speechTimer.current);if(utterance.current){utterance.current.onend=null;utterance.current.onerror=null;utterance.current.onstart=null;utterance.current=null;window.speechSynthesis?.cancel();}setSpeaking(false);};
 useEffect(()=>{window.speechSynthesis?.getVoices();},[]);
 useEffect(()=>()=>{clearTimeout(speechTimer.current);if(utterance.current){utterance.current.onend=null;utterance.current.onerror=null;utterance.current.onstart=null;window.speechSynthesis?.cancel();}},[]);
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),3500);return()=>clearTimeout(timer);},[status]);
 useEffect(()=>{if(!menu)return;popup.current?.querySelector<HTMLButtonElement>('button')?.focus();const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(null);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[menu]);
 const close=()=>{setMenu(null);trigger.current?.focus();};
 const navigate=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){setMenu(null);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
 const read=()=>{if(speaking){stop();return;}const speech=window.speechSynthesis;if(!speech||!window.SpeechSynthesisUtterance){setStatus('Read aloud is unavailable on this device.');return;}
  const voices=speech.getVoices().filter(voice=>voice.localService);const voice=voices.find(v=>v.lang.startsWith(navigator.language.split('-')[0]))??voices[0];if(!voice){setStatus('No local reading voice is available on this device.');return;}
  speech.cancel();const item=new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g,' Code block. ').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*#`_]/g,''));item.voice=voice;utterance.current=item;setSpeaking(true);
  const done=()=>{clearTimeout(speechTimer.current);utterance.current=null;setSpeaking(false);};item.onstart=()=>clearTimeout(speechTimer.current);item.onend=done;item.onerror=event=>{done();if(!['canceled','interrupted'].includes(event.error))setStatus('Read aloud could not start. Try again.');};speech.speak(item);speechTimer.current=setTimeout(()=>{stop();setStatus('Read aloud could not start on this device.');},5000);
 };
 const rate=(value:string)=>{const next=feedback===value?null:value;try{if(next)localStorage.setItem(key,next);else localStorage.removeItem(key);setFeedback(next);setStatus(next?'Feedback saved on this device.':'Feedback removed.');}catch{setStatus('Feedback could not be saved.');}close();};
 const date=new Date(at),valid=Number.isFinite(date.getTime());
 return <div ref={root} className="response-actions" role="group" aria-label="Response actions">
  <button className="icon-button" aria-label={status==='Copied'?'Copied':'Copy message'} title="Copy message" onClick={async()=>{try{await copyReply(text);setStatus('Copied');}catch{setStatus('Copy unavailable. Select the response to copy it.');}}}>{status==='Copied'?<Check size={15}/>:<Copy size={15}/>}</button>
  {onQuote&&<button className="icon-button" aria-label="Quote response" title={quoteDisabled?'Quote available when this chat is settled and its draft is editable':'Quote response'} disabled={quoteDisabled} onPointerCancel={()=>{pressedQuote.current=null;}} onBlur={()=>{pressedQuote.current=null;}} onKeyDown={()=>{pressedQuote.current=null;}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();try{pressedQuote.current=captureQuote();}catch(error){pressedQuote.current=error instanceof Error?error:Error(String(error));}}} onClick={()=>{try{const capture=pressedQuote.current??captureQuote();pressedQuote.current=null;if(capture instanceof Error)throw capture;onQuote(capture);setStatus('Quote added to draft. Nothing was sent.');}catch(error){setStatus(error instanceof Error?error.message:String(error));}}}><Quote size={15}/></button>}
  <button className={`icon-button ${speaking?'selected':''}`} aria-label={speaking?'Stop reading':'Read aloud'} title={speaking?'Stop reading':'Read aloud'} aria-pressed={speaking} onClick={read}>{speaking?<Square size={14}/>:<Volume2 size={16}/>}</button>
  <button className={`icon-button ${feedback?'selected':''}`} aria-label="Response feedback" title={feedback?`${feedback==='helpful'?'Helpful':'Not helpful'} · Saved on this device`:'Response feedback'} aria-haspopup="menu" aria-expanded={menu==='feedback'} onClick={event=>{trigger.current=event.currentTarget;setMenu(menu==='feedback'?null:'feedback');}}>{feedback==='unhelpful'?<ThumbsDown size={15}/>:<ThumbsUp size={15}/>}</button>
  <button className="icon-button" aria-label="Fork from here" title="Fork from here" disabled={branchDisabled} onClick={()=>{setMenu(null);stop();onBranch(messageId,chatId);}}><GitBranch size={15}/></button>
  {runId&&onChanges&&<button className="icon-button" aria-label="Review changes from this reply" title="Review changes from this reply" onClick={()=>onChanges(runId)}><Files size={15}/></button>}
  {valid&&<time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time>}
  {menu&&<div ref={popup} className="response-action-menu" role="menu" aria-label="Response feedback" onKeyDown={navigate}><button role="menuitemradio" aria-checked={feedback==='helpful'} onClick={()=>rate('helpful')}><ThumbsUp size={15}/>Helpful</button><button role="menuitemradio" aria-checked={feedback==='unhelpful'} onClick={()=>rate('unhelpful')}><ThumbsDown size={15}/>Not helpful</button><small>Saved on this device</small></div>}
  {status&&<span className="response-action-status" role="status">{status}</span>}
 </div>;
});
