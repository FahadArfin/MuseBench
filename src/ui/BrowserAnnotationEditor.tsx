import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Trash2} from 'lucide-react';
import {normalizePreviewStyles,PREVIEW_STYLE_PROPERTIES,type PreviewSelection,type PreviewStyles,type PreviewTarget} from '../shared/preview-annotations.mjs';
import type {BrowserAnnotation} from '../shared/browser-annotations.mjs';
import {useDictation} from './useDictation';
import {AnnotationVoice} from './AnnotationVoice';
import './preview-annotations.css';

export interface BrowserAnnotationAdapter {
 inspect(point:{x:number;y:number}):Promise<PreviewSelection>;
 prepare(input:{token:string;note:string;styleChanges?:PreviewStyles}):Promise<{text:string;annotation?:BrowserAnnotation}>;
 discard(token:string):Promise<void>|void;
}
interface Props {adapter:BrowserAnnotationAdapter;context:string;children:ReactNode;onAnnotations:(annotations:BrowserAnnotation[])=>void;onCancel:()=>void;initialAnnotations?:BrowserAnnotation[];invalidationKey?:number;legacySingle?:boolean;onLegacyDraft?:(text:string)=>void;enabled?:boolean}
const message=(error:unknown)=>String(error).replace(/^Error: /,'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
const styleLabels:Record<string,string>={color:'Text color',backgroundColor:'Background',opacity:'Opacity',fontFamily:'Font family',fontSize:'Font size',fontWeight:'Font weight',lineHeight:'Line height',letterSpacing:'Letter spacing',padding:'Padding',margin:'Margin',borderRadius:'Corner radius',width:'Width',height:'Height'};

export function BrowserAnnotationEditor({adapter,context,children,onAnnotations,onCancel,initialAnnotations=[],invalidationKey=0,legacySingle=false,onLegacyDraft,enabled=true}:Props){
 const [annotations,setAnnotations]=useState<BrowserAnnotation[]>(()=>structuredClone(initialAnnotations));
 const [pinIds,setPinIds]=useState<Set<string>>(()=>new Set(initialAnnotations.map(value=>value.id)));
 const [selection,setSelection]=useState<PreviewSelection|null>(null),[editing,setEditing]=useState<string|null>(null),[note,setNote]=useState(''),[styles,setStyles]=useState<PreviewStyles>({}),[pending,setPending]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[point,setPoint]=useState({x:.5,y:.5});
 const selected=useRef(selection),alive=useRef(false),serial=useRef(0),locked=useRef(false),overlay=useRef<HTMLButtonElement>(null),input=useRef<HTMLTextAreaElement>(null),liveAdapter=useRef(adapter),liveContext=useRef(context),cancelRef=useRef(onCancel);selected.current=selection;liveAdapter.current=adapter;liveContext.current=context;cancelRef.current=onCancel;
 const appendNote=(value:string|((before:string)=>string))=>setNote(before=>typeof value==='function'?value(before):value);
 const voice=useDictation(enabled&&!!(selection||editing)&&!pending,context+':annotation:'+(editing??selection?.token??'none'),appendNote,4000);
 const discard=()=>{const token=selected.current?.token;selected.current=null;setSelection(null);if(token)void Promise.resolve(liveAdapter.current.discard(token)).catch(()=>{});};
 const reset=()=>{voice.cancel();discard();setEditing(null);setNote('');setStyles({});};
 const valid=(version:number,owner:string)=>alive.current&&version===serial.current&&owner===liveContext.current;
 useEffect(()=>{alive.current=true;overlay.current?.focus();return()=>{alive.current=false;serial.current++;const token=selected.current?.token;if(token)void Promise.resolve(liveAdapter.current.discard(token)).catch(()=>{});};},[context]);
 useEffect(()=>{serial.current++;locked.current=false;setPending(false);setPinIds(new Set());if(selected.current){discard();setStatus('The preview changed. Select the element again. Saved comments are kept.');}},[invalidationKey]);
 useEffect(()=>{if(!enabled){serial.current++;locked.current=false;setPending(false);reset();setError('');setStatus('');return;}overlay.current?.focus();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelRef.current();}};window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);},[enabled]);
 const pick=async(next:{x:number;y:number})=>{
  if(locked.current||voice.recording)return;
  if((selection||editing)&&(note.trim()||Object.keys(styles).length)){setError('Save this comment or cancel it before selecting another element.');return;}
  const version=++serial.current,owner=context;locked.current=true;setPending(true);setError('');setStatus('');discard();setEditing(null);setPoint(next);
  try{const value=await adapter.inspect(next);if(!valid(version,owner)){void Promise.resolve(adapter.discard(value.token)).catch(()=>{});return;}setSelection(value);requestAnimationFrame(()=>{if(valid(version,owner))input.current?.focus();});}
  catch(error){if(valid(version,owner))setError(message(error));}
  finally{if(valid(version,owner)){locked.current=false;setPending(false);}}
 };
 const save=async()=>{
  if(locked.current||voice.recording||!note.trim()||(!selection&&!editing))return;
  const version=serial.current,owner=context;locked.current=true;setPending(true);setError('');
  try{
   const styleChanges=normalizePreviewStyles(styles);
   if(editing){setAnnotations(before=>before.map(value=>value.id===editing?{...value,note:note.trim(),styleChanges}:value));reset();setStatus('Comment updated.');return;}
   const result=await adapter.prepare({token:selection!.token,note,styleChanges});if(!valid(version,owner))return;
   if(legacySingle){onLegacyDraft?.(result.text);return;}
   if(annotations.length>=20)throw Error('A bundle can contain up to 20 comments.');
   const value=result.annotation??{id:crypto.randomUUID(),page:selection!.page,target:selection!.target,note:note.trim(),...(Object.keys(styleChanges).length?{styleChanges}:{})};
   setAnnotations(before=>[...before,value]);setPinIds(before=>new Set([...before,value.id]));reset();setStatus('Comment saved. Select another element or attach your comments.');overlay.current?.focus();
  }catch(error){if(valid(version,owner))setError(message(error));}
  finally{if(valid(version,owner)){locked.current=false;setPending(false);}}
 };
 const edit=(annotation:BrowserAnnotation)=>{if(pending||voice.recording)return;if((selection||editing)&&(note.trim()||Object.keys(styles).length)){setError('Save this comment or cancel it before editing another.');return;}reset();setEditing(annotation.id);setNote(annotation.note);setStyles(annotation.styleChanges??{});setError('');requestAnimationFrame(()=>input.current?.focus());};
 const target:PreviewTarget|undefined=selection?.target??annotations.find(value=>value.id===editing)?.target;
 const rect=target?.rect,hasDraft=!!note.trim()||Object.keys(styles).length>0;
 return <div className="browser-annotation-editor">
  <div className="project-preview-viewport browser-annotation-viewport">{children}
   {enabled&&<button ref={overlay} type="button" className="preview-select-overlay" aria-label="Select preview element" aria-describedby="preview-select-help" disabled={pending||voice.recording||(!editing&&annotations.length>=20)} onClick={event=>{const bounds=event.currentTarget.getBoundingClientRect();void pick(event.detail===0?point:{x:Math.min(.999,Math.max(0,(event.clientX-bounds.left)/bounds.width)),y:Math.min(.999,Math.max(0,(event.clientY-bounds.top)/bounds.height))});}} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const bounds=event.currentTarget.getBoundingClientRect(),step=event.shiftKey?48:12;setPoint(before=>({x:Math.max(.001,Math.min(.999,before.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)/bounds.width)),y:Math.max(.001,Math.min(.999,before.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)/bounds.height))}));}}>{rect?<span className="preview-target-outline" style={{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.width*100+'%',height:rect.height*100+'%'}}/>:<span className="preview-select-cursor" style={{left:point.x*100+'%',top:point.y*100+'%'}}>+</span>}</button>}
   {enabled&&!legacySingle&&annotations.map((value,index)=>pinIds.has(value.id)&&<button type="button" key={value.id} className={`preview-annotation-pin ${editing===value.id?'active':''}`} aria-label={`Edit annotation ${index+1}`} title={value.note} style={{left:Math.min(.98,value.target.rect.x+value.target.rect.width/2)*100+'%',top:Math.max(.025,value.target.rect.y)*100+'%'}} disabled={pending||voice.recording} onClick={()=>edit(value)}>{index+1}</button>)}
  </div>
  {enabled&&<><p id="preview-select-help" className="preview-select-help">{pending?'Reading selection…':'Click an element, or use arrow keys and Enter. Escape cancels.'}</p>
  {error&&<p className="preview-comment-error" role="alert">{error}</p>}{status&&<p className="preview-comment-status" role="status">{status}</p>}
  {(selection||editing||note)&&<form className="preview-comment-form" onSubmit={event=>{event.preventDefault();void save();}}>
   {target&&<div role="region" aria-label="Selected preview element" className="preview-selected-target"><strong>{target.tag}</strong><span>{target.text||'Element without visible text'}</span><code title={target.selector}>{target.selector}</code></div>}
   <textarea ref={input} aria-label="Preview comment" placeholder="What should change?" maxLength={4000} value={note} disabled={pending} onChange={event=>setNote(event.target.value)}/>
   <AnnotationVoice voice={voice} label="preview comment" disabled={pending}/>
   {!legacySingle&&<details className="preview-style-controls"><summary>Requested styles <small>Optional · describes the change</small></summary><div>{PREVIEW_STYLE_PROPERTIES.map(key=><label key={key}>{styleLabels[key]}<input aria-label={`Requested ${styleLabels[key].toLowerCase()}`} maxLength={200} placeholder={target?.styles?.[key]||'No change'} disabled={pending||voice.recording} value={styles[key]??''} onChange={event=>setStyles(before=>{const next={...before};if(event.target.value)next[key]=event.target.value;else delete next[key];return next;})}/></label>)}</div></details>}
   <div className="preview-comment-actions"><small>Nothing is sent yet. {note.length.toLocaleString()}/4,000</small><span><button type="button" className="button" disabled={pending} onClick={()=>{reset();setError('');}}>Cancel comment</button><button type="submit" className="button primary" disabled={pending||voice.recording||!note.trim()||(!selection&&!editing)}>{legacySingle?'Add to draft':editing?'Update comment':'Save comment'}</button></span></div>
  </form>}
  {!legacySingle&&<section className="preview-annotation-batch" aria-label="Saved annotations"><header><strong>Comments ({annotations.length}/20)</strong><button type="button" className="text-link" disabled={pending||voice.recording||!annotations.length} onClick={()=>{reset();setAnnotations([]);setStatus('Comments cleared.');}}>Clear all</button></header>{annotations.length>0?<ol>{annotations.map((value,index)=><li key={value.id}><button type="button" className="preview-annotation-edit" disabled={pending||voice.recording} onClick={()=>edit(value)}><span>{index+1}</span><span><strong>{value.target.tag}</strong>{value.note}<small>{value.page}{value.styleChanges&&Object.keys(value.styleChanges).length>0?' · '+Object.keys(value.styleChanges).length+' style changes':''}</small></span></button><button type="button" className="icon-button" aria-label={`Delete annotation ${index+1}`} disabled={pending||voice.recording} onClick={()=>{if(editing===value.id)reset();setAnnotations(before=>before.filter(item=>item.id!==value.id));}}><Trash2 size={14}/></button></li>)}</ol>:<p>Save comments on several elements, then attach them together.</p>}<footer><small>Element details are page references. Requested styles do not change the page.</small><button type="button" className="button primary" disabled={pending||voice.recording||!annotations.length||hasDraft} onClick={()=>{try{onAnnotations(annotations);}catch(error){setError(message(error));}}}>Attach {annotations.length||''} {annotations.length===1?'comment':'comments'}</button></footer>{hasDraft&&annotations.length>0&&<small>Save or cancel your current comment before attaching.</small>}</section>}
  </>}
 </div>;
}
