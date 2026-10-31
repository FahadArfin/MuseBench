import {memo,useEffect,useRef,useState} from 'react';
import {Check,Copy,Files,GitBranch,Square,ThumbsUp,Volume2} from 'lucide-react';
import './response-actions.css';
import {copyReply} from './copy-reply';

export const ResponseActions=memo(function ResponseActions({messageId,text,at,chatId,branchDisabled,onBranch,runId,onChanges}:{messageId:string;text:string;at:string;chatId:string;branchDisabled:boolean;onBranch:(messageId:string,taskId:string)=>void;runId?:string;onChanges?:(runId:string)=>void}){
 const [status,setStatus]=useState(''),[speaking,setSpeaking]=useState(false);
 const key=`musebench-response-feedback:${chatId}:${messageId}`;
 const [feedback,setFeedback]=useState<string|null>(()=>{try{return localStorage.getItem(key);}catch{return null;}});
 const utterance=useRef<SpeechSynthesisUtterance|null>(null),speechTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const stop=()=>{clearTimeout(speechTimer.current);if(utterance.current){utterance.current.onend=null;utterance.current.onerror=null;utterance.current.onstart=null;utterance.current=null;window.speechSynthesis?.cancel();}setSpeaking(false);};
 useEffect(()=>{window.speechSynthesis?.getVoices();},[]);
 useEffect(()=>()=>{clearTimeout(speechTimer.current);if(utterance.current){utterance.current.onend=null;utterance.current.onerror=null;utterance.current.onstart=null;window.speechSynthesis?.cancel();}},[]);
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),3500);return()=>clearTimeout(timer);},[status]);
 const read=()=>{if(speaking){stop();return;}const speech=window.speechSynthesis;if(!speech||!window.SpeechSynthesisUtterance){setStatus('Read aloud is unavailable on this device.');return;}
  const voices=speech.getVoices().filter(voice=>voice.localService);const voice=voices.find(v=>v.lang.startsWith(navigator.language.split('-')[0]))??voices[0];if(!voice){setStatus('No local reading voice is available on this device.');return;}
  speech.cancel();const item=new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g,' Code block. ').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*#`_]/g,''));item.voice=voice;utterance.current=item;setSpeaking(true);
  const done=()=>{clearTimeout(speechTimer.current);utterance.current=null;setSpeaking(false);};item.onstart=()=>clearTimeout(speechTimer.current);item.onend=done;item.onerror=event=>{done();if(!['canceled','interrupted'].includes(event.error))setStatus('Read aloud could not start. Try again.');};speech.speak(item);speechTimer.current=setTimeout(()=>{stop();setStatus('Read aloud could not start on this device.');},5000);
 };
 const rate=(value:string)=>{const next=feedback===value?null:value;try{if(next)localStorage.setItem(key,next);else localStorage.removeItem(key);setFeedback(next);setStatus(next?'Feedback saved on this device.':'Feedback removed.');}catch{setStatus('Feedback could not be saved.');}};
 const date=new Date(at),valid=Number.isFinite(date.getTime());
 return <div className="response-actions" role="group" aria-label="Response actions">
  <button className="icon-button" aria-label={status==='Copied'?'Copied':'Copy message'} title="Copy message" onClick={async()=>{try{await copyReply(text);setStatus('Copied');}catch{setStatus('Copy unavailable. Select the response to copy it.');}}}>{status==='Copied'?<Check size={15}/>:<Copy size={15}/>}</button>
  <button className={`icon-button ${speaking?'selected':''}`} aria-label={speaking?'Stop reading':'Read aloud'} title={speaking?'Stop reading':'Read aloud'} aria-pressed={speaking} onClick={read}>{speaking?<Square size={14}/>:<Volume2 size={16}/>}</button>
  <button className={`icon-button ${feedback==='helpful'?'selected':''}`} aria-label="Like response" title={feedback==='helpful'?'Remove like':'Like response'} aria-pressed={feedback==='helpful'} onClick={()=>rate('helpful')}><ThumbsUp size={15}/></button>
  <button className="icon-button" aria-label="Fork from here" title="Fork from here" disabled={branchDisabled} onClick={()=>{stop();onBranch(messageId,chatId);}}><GitBranch size={15}/></button>
  {runId&&onChanges&&<button className="icon-button" aria-label="Review changes from this reply" title="Review changes from this reply" onClick={()=>onChanges(runId)}><Files size={15}/></button>}
  {valid&&<time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time>}
  {status&&<span className="response-action-status" role="status">{status}</span>}
 </div>;
});
