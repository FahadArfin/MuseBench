import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MessageSquarePlus,X} from 'lucide-react';
import type {PreviewSelection} from '../shared/preview-annotations.mjs';
import './preview-annotations.css';
const previewError=(error:unknown)=>String(error).replace(/^Error: /,'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');

export function ProjectPreview({projectId,taskId,url,onDraft,logButton}:{projectId:string;taskId:string;url:string;onDraft:(key:string,text:string)=>void;logButton?:ReactNode}){
 const bridge=window.musebench,owner=projectId+':'+taskId;
 const [frameName]=useState(()=>'musebench-project-preview-'+crypto.randomUUID());
 const [enabled,setEnabled]=useState(false),[selection,setSelection]=useState<PreviewSelection|null>(null),[note,setNote]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState(''),[pending,setPending]=useState(false),[point,setPoint]=useState({x:.5,y:.5});
 const current=useRef(owner+':'+url),alive=useRef(false),serial=useRef(0),selected=useRef(selection),locked=useRef(false),overlay=useRef<HTMLButtonElement>(null),commentButton=useRef<HTMLButtonElement>(null),comment=useRef<HTMLTextAreaElement>(null);
 const enabledRef=useRef(enabled);enabledRef.current=enabled;
 current.current=owner+':'+url;selected.current=selection;
 const valid=(version:number)=>alive.current&&current.current===owner+':'+url&&serial.current===version;
 const forget=()=>{const token=selected.current?.token;selected.current=null;setSelection(null);if(token)void bridge?.discardPreviewTarget(token).catch(()=>{});};
 const invalidate=()=>{serial.current++;locked.current=false;setPending(false);forget();setStatus('The preview changed. Select the element again.');};
 const cancel=()=>{invalidate();setEnabled(false);setNote('');setError('');setStatus('');commentButton.current?.focus();};
 useEffect(()=>{
  alive.current=true;const unsubscribe=bridge?.onPreviewInvalidated(()=>{if(enabledRef.current||selected.current||locked.current)invalidate();});
  return()=>{alive.current=false;serial.current++;const token=selected.current?.token;if(token)void bridge?.discardPreviewTarget(token).catch(()=>{});unsubscribe?.();};
 },[bridge,owner,url]);
 useEffect(()=>{
  if(!enabled)return;
  overlay.current?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}};
  window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);
 },[enabled]);
 const pick=async(next:{x:number;y:number})=>{
  if(!bridge||locked.current)return;
  const version=++serial.current;locked.current=true;setPending(true);setError('');setStatus('');forget();setPoint(next);
  try{const result=await bridge.inspectPreviewTarget({projectId,taskId,frameName,...next});if(!valid(version)){void bridge.discardPreviewTarget(result.token).catch(()=>{});return;}if(result.projectId!==projectId||result.taskId!==taskId)throw Error('The selected chat changed.');setSelection(result);requestAnimationFrame(()=>{if(valid(version))comment.current?.focus();});}
  catch(error){if(valid(version))setError(previewError(error));}
  finally{if(valid(version)){locked.current=false;setPending(false);}}
 };
 const add=async()=>{
  if(!bridge||!selection||locked.current)return;
  const version=serial.current;locked.current=true;setPending(true);setError('');let prepared=false;
  try{const result=await bridge.preparePreviewFeedback({token:selection.token,note});if(!valid(version))return;prepared=true;onDraft(owner,result.text);forget();setNote('');setEnabled(false);setStatus('Added to your draft. Send it when ready.');commentButton.current?.focus();}
  catch(error){if(valid(version)){if(!prepared)forget();setError(previewError(error));}}
  finally{if(valid(version)){locked.current=false;setPending(false);}}
 };
 const rect=selection?.target.rect;
 return <section className="project-preview" aria-label="Annotatable project preview">
  <div className="preview-browserbar"><span className="tiny-dot running-dot"/><span className="preview-location" title={url}>{url}</span><button ref={commentButton} type="button" className="preview-comment-toggle" disabled={!bridge?.inspectPreviewTarget} aria-pressed={enabled} onClick={()=>{if(enabled)cancel();else{setEnabled(true);setError('');setStatus('');}}}><MessageSquarePlus size={14}/>Comment on preview</button>{logButton}{enabled&&<button type="button" className="icon-button" aria-label="Cancel preview comment" onClick={cancel}><X size={14}/></button>}</div>
  <div className="project-preview-viewport">
   <iframe name={frameName} title="Project preview" src={url} sandbox="allow-scripts allow-forms allow-same-origin" onLoad={()=>{if(enabled||selected.current)invalidate();}}/>
   {enabled&&<button ref={overlay} type="button" className="preview-select-overlay" aria-label="Select preview element" aria-describedby="preview-select-help" disabled={pending} onClick={event=>{const bounds=event.currentTarget.getBoundingClientRect();void pick(event.detail===0?point:{x:Math.min(.999,Math.max(0,(event.clientX-bounds.left)/bounds.width)),y:Math.min(.999,Math.max(0,(event.clientY-bounds.top)/bounds.height))});}} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const bounds=event.currentTarget.getBoundingClientRect(),step=event.shiftKey?48:12;setPoint(before=>({x:Math.max(.001,Math.min(.999,before.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)/bounds.width)),y:Math.max(.001,Math.min(.999,before.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)/bounds.height))}));}}>{rect?<span className="preview-target-outline" style={{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.width*100+'%',height:rect.height*100+'%'}}/>:<span className="preview-select-cursor" style={{left:point.x*100+'%',top:point.y*100+'%'}}>+</span>}</button>}
  </div>
  {enabled&&<p id="preview-select-help" className="preview-select-help">{pending?'Reading selection…':'Click an element, or use arrow keys and Enter. Escape cancels.'}</p>}
  {error&&<p className="preview-comment-error" role="alert">{error}</p>}{status&&<p className="preview-comment-status" role="status">{status}</p>}
  {enabled&&(selection||note)&&<form className="preview-comment-form" onSubmit={event=>{event.preventDefault();void add();}}>
   {selection&&<div role="region" aria-label="Selected preview element" className="preview-selected-target"><strong>{selection.target.tag}</strong><span>{selection.target.text||'Element without visible text'}</span><code title={selection.target.selector}>{selection.target.selector}</code></div>}
   <textarea ref={comment} aria-label="Preview comment" placeholder="What should change?" maxLength={4000} value={note} disabled={pending} onChange={event=>setNote(event.target.value)}/>
   <div className="preview-comment-actions"><small>Editable feedback. Nothing is sent yet.</small><button type="submit" className="button primary" disabled={pending||!selection||!note.trim()}>Add to draft</button></div>
  </form>}
 </section>;
}
