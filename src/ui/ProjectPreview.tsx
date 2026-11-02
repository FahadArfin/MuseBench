import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {MessageSquarePlus,X} from 'lucide-react';
import type {BrowserAnnotation} from '../shared/browser-annotations.mjs';
import {BrowserAnnotationEditor,type BrowserAnnotationAdapter} from './BrowserAnnotationEditor';
import './preview-annotations.css';

export function ProjectPreview({projectId,taskId,url,onDraft,onAnnotations,logButton}:{projectId:string;taskId:string;url:string;onDraft:(key:string,text:string)=>void;onAnnotations?:(key:string,annotations:BrowserAnnotation[])=>void;logButton?:ReactNode}){
 const bridge=window.musebench,owner=projectId+':'+taskId;
 const [frameName]=useState(()=>'musebench-project-preview-'+crypto.randomUUID());
 const [enabled,setEnabled]=useState(false),[invalidationKey,setInvalidationKey]=useState(0),[status,setStatus]=useState('');
 const commentButton=useRef<HTMLButtonElement>(null);
 const cancel=useCallback(()=>{setEnabled(false);setStatus('');commentButton.current?.focus();},[]);
 useEffect(()=>bridge?.onPreviewInvalidated(()=>setInvalidationKey(value=>value+1)),[bridge,owner,url]);
 const adapter:BrowserAnnotationAdapter={
  inspect:point=>bridge!.inspectPreviewTarget({projectId,taskId,frameName,...point}),
  prepare:input=>bridge!.preparePreviewFeedback(input),
  discard:token=>bridge?.discardPreviewTarget(token),
 };
 return <section className="project-preview" aria-label="Annotatable project preview">
  <div className="preview-browserbar"><span className="tiny-dot running-dot"/><span className="preview-location" title={url}>{url}</span><button ref={commentButton} type="button" className="preview-comment-toggle" disabled={!bridge?.inspectPreviewTarget} aria-pressed={enabled} onClick={()=>{if(enabled)cancel();else{setEnabled(true);setStatus('');}}}><MessageSquarePlus size={14}/>Comment on preview</button>{logButton}{enabled&&<button type="button" className="icon-button" aria-label="Cancel preview comment" onClick={cancel}><X size={14}/></button>}</div>
  <BrowserAnnotationEditor key={owner+':'+url} adapter={adapter} context={owner+':'+url} enabled={enabled} invalidationKey={invalidationKey} legacySingle={!onAnnotations} onCancel={cancel} onAnnotations={annotations=>{onAnnotations?.(owner,annotations);setEnabled(false);setStatus('Added to your prompt. Send it when ready.');commentButton.current?.focus();}} onLegacyDraft={text=>{onDraft(owner,text);setEnabled(false);setStatus('Added to your draft. Send it when ready.');commentButton.current?.focus();}}>
   <iframe name={frameName} title="Project preview" src={url} inert={enabled} tabIndex={enabled?-1:undefined} sandbox="allow-scripts allow-forms allow-same-origin" onLoad={()=>setInvalidationKey(value=>value+1)}/>
  </BrowserAnnotationEditor>
  {status&&<p className="preview-comment-status" role="status">{status}</p>}
 </section>;
}
