import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpRight,MessageCircle,Pencil,Square,Undo2,Trash2,X} from 'lucide-react';
import type {CodeImage,ImageMark} from '../shared/types';
import {MARK_COLORS,imageMarks} from '../shared/image-annotations.mjs';
import {compositeImage} from './image-markup';
import {useDictation} from './useDictation';
import {AnnotationVoice} from './AnnotationVoice';
import './preview-annotations.css';
import './image-annotations.css';

type Tool='comment'|'pen'|'arrow'|'rect';
export type AnnotateImage=(image:CodeImage,dataUrl:string,marks:ImageMark[])=>Promise<void>;
export function ImageAnnotationEditor({image,projectId,onApply,onClose}:{image:CodeImage;projectId:string;onApply:AnnotateImage;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),drawing=useRef<Extract<ImageMark,{points:unknown}>|null>(null),alive=useRef(true),inputs=useRef(new Map<number,HTMLTextAreaElement>());
 const [src,setSrc]=useState(''),[size,setSize]=useState({width:1000,height:700}),[marks,setMarks]=useState<ImageMark[]>(()=>structuredClone(image.annotation?.marks??[])),[tool,setTool]=useState<Tool>('comment'),[color,setColor]=useState(MARK_COLORS[0]),[draft,setDraft]=useState<ImageMark|null>(null),[active,setActive]=useState<number|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const source=image.annotation?.source??image;
 const voice=useDictation(active!==null&&!saving,projectId+':image:'+image.id+':comment:'+active,value=>setMarks(before=>before.map((mark,index)=>index===active&&mark.kind==='comment'?{...mark,text:typeof value==='function'?value(mark.text):value}:mark)),1000);
 useEffect(()=>{if(active!==null)inputs.current.get(active)?.focus();},[active]);
 useEffect(()=>{alive.current=true;dialog.current?.showModal();void window.musebench?.readCodeImage({projectId,image:source}).then(value=>{if(alive.current)setSrc(value);},()=>{if(alive.current)setError('The original screenshot is unavailable.');});return()=>{alive.current=false;};},[]);
 const point=(event:PointerEvent<SVGSVGElement>)=>{const box=event.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};};
 const start=(event:PointerEvent<SVGSVGElement>)=>{
  if(saving||event.button!==0||marks.length>=40)return;event.preventDefault();setError('');const p=point(event);
  if(tool==='comment'){setMarks([...marks,{kind:'comment',...p,text:''}]);setActive(marks.length);return;}
  event.currentTarget.setPointerCapture(event.pointerId);drawing.current={kind:tool,color,points:[p,p]};setDraft(drawing.current);
 };
 const move=(event:PointerEvent<SVGSVGElement>)=>{const value=drawing.current;if(!value)return;const p=point(event);drawing.current={...value,points:value.kind==='pen'?[...value.points.slice(0,499),p]:[value.points[0],p]};setDraft(drawing.current);};
 const finish=()=>{if(drawing.current){const value=drawing.current;setMarks(before=>before.length<40?[...before,value]:before);}drawing.current=null;setDraft(null);};
 const save=async()=>{if(saving||!src||drawing.current||voice.recording)return;setSaving(true);setError('');try{const valid=imageMarks(marks);const dataUrl=await compositeImage(src,valid);if(!alive.current)return;await onApply(image,dataUrl,valid);if(alive.current)onClose();}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setSaving(false);}};
 const radius=Math.max(10,size.width/60),line=Math.max(2,size.width/300);let number=0;
 const comments=marks.map((mark,index)=>({mark,index})).filter((entry):entry is {mark:Extract<ImageMark,{kind:'comment'}>;index:number}=>entry.mark.kind==='comment');
 return createPortal(<dialog ref={dialog} className="annotation-editor" aria-label={`Annotate ${image.name}`} onCancel={event=>{event.preventDefault();onClose();}}>
  <header><strong>Annotate image</strong><span>{image.name}</span><button type="button" className="icon-button" aria-label="Close annotation editor" onClick={onClose}><X size={18}/></button></header>
  <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">{([['comment','Comment',MessageCircle],['pen','Draw',Pencil],['arrow','Arrow',ArrowUpRight],['rect','Rectangle',Square]] as const).map(([id,label,Icon])=><button type="button" key={id} aria-pressed={tool===id} disabled={saving} onClick={()=>setTool(id)}><Icon size={16}/>{label}</button>)}<span className="annotation-colors">{MARK_COLORS.map((value,index)=><button type="button" key={value} style={{background:value}} aria-label={['Red ink','Blue ink','Yellow ink'][index]} aria-pressed={color===value} disabled={saving} onClick={()=>setColor(value)}/>)}</span><button type="button" disabled={saving||!marks.length} onClick={()=>{setMarks(marks.slice(0,-1));setActive(null);}}><Undo2 size={16}/>Undo</button><button type="button" disabled={saving||!marks.length} onClick={()=>{setMarks([]);setActive(null);}}><Trash2 size={16}/>Clear</button></div>
  <div className="annotation-body"><div className="annotation-canvas-scroll">{src?<div className="annotation-stage"><img draggable={false} src={src} alt={image.name} onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/><svg viewBox={`0 0 ${size.width} ${size.height}`} aria-label="Image annotation canvas" role="img" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{drawing.current=null;setDraft(null);}}>
   {[...marks,...(draft?[draft]:[])].map((mark,index)=>{
    if(mark.kind==='comment'){const n=++number;return <g key={index} onPointerDown={event=>{event.stopPropagation();setActive(index);}}><circle cx={mark.x*size.width} cy={mark.y*size.height} r={radius} fill="#2563eb" stroke="white" strokeWidth={line/2}/><text x={mark.x*size.width} y={mark.y*size.height} dominantBaseline="central" textAnchor="middle" fill="white" fontSize={radius} fontFamily="sans-serif" fontWeight="bold">{n}</text></g>;}
    const first=mark.points[0],last=mark.points.at(-1)!;const angle=Math.atan2((last.y-first.y)*size.height,(last.x-first.x)*size.width),arrow=line*5;
    return <g key={index} fill="none" stroke={mark.color} strokeWidth={line} strokeLinejoin="round" strokeLinecap="round">{mark.kind==='rect'?<rect x={Math.min(first.x,last.x)*size.width} y={Math.min(first.y,last.y)*size.height} width={Math.abs(last.x-first.x)*size.width} height={Math.abs(last.y-first.y)*size.height}/>:<polyline points={mark.points.map(p=>`${p.x*size.width},${p.y*size.height}`).join(' ')}/>} {mark.kind==='arrow'&&<polyline points={`${last.x*size.width-arrow*Math.cos(angle-.5)},${last.y*size.height-arrow*Math.sin(angle-.5)} ${last.x*size.width},${last.y*size.height} ${last.x*size.width-arrow*Math.cos(angle+.5)},${last.y*size.height-arrow*Math.sin(angle+.5)}`}/>}</g>;
   })}</svg></div>:<p>Loading screenshot…</p>}</div>
   <aside aria-label="Image comments"><p>Click the image to add a comment, or choose a drawing tool.</p>{comments.map(({mark,index},n)=><div className={`annotation-comment ${active===index?'active':''}`} key={index}><label><span>{n+1}</span><textarea ref={node=>{if(node)inputs.current.set(index,node);else inputs.current.delete(index);}} aria-label={`Comment ${n+1}`} placeholder="Add a comment…" maxLength={1000} rows={3} disabled={saving} value={mark.text} onFocus={()=>setActive(index)} onChange={event=>setMarks(marks.map((value,i)=>i===index?{...mark,text:event.target.value}:value))}/></label><button type="button" className="icon-button" aria-label={`Delete comment ${n+1}`} disabled={saving} onClick={()=>{setMarks(marks.filter((_,i)=>i!==index));setActive(null);}}><Trash2 size={14}/></button>{active===index&&<AnnotationVoice voice={voice} label={`image comment ${n+1}`} disabled={saving}/>}</div>)}<button type="button" className="text-link" disabled={saving||marks.length>=40||voice.recording} onClick={()=>{setMarks([...marks,{kind:'comment',x:.5,y:.5,text:''}]);setActive(marks.length);}}>Add comment at center</button></aside>
  </div><footer>{error?<span role="alert">{error}</span>:<span>{marks.length}/40 annotations · Nothing is sent until you send the prompt.</span>}<button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={saving||!src||!!drawing.current||voice.recording} onClick={()=>void save()}>{saving?'Applying…':'Apply to prompt'}</button></footer>
 </dialog>,document.body);
}
