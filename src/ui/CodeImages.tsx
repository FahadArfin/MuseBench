import {useEffect,useRef,useState} from 'react';
import type {CodeImage,ImageMark,MuseBenchBridge} from '../shared/types';
import {MAX_IMAGE_BYTES} from '../shared/code-images.mjs';
import './code-images.css';
import {ImageAnnotationEditor,type AnnotateImage} from './ImageAnnotationEditor';

export function CodeImages({images,projectId,onRemove,onAnnotate}:{images:CodeImage[];projectId:string;onRemove?:(id:string)=>void;onAnnotate?:AnnotateImage}){
 return <div className="code-images">{images.map(image=><CodeImageView key={image.id} image={image} projectId={projectId} onRemove={onRemove} onAnnotate={onAnnotate}/>)}</div>;
}
function CodeImageView({image,projectId,onRemove,onAnnotate}:{image:CodeImage;projectId:string;onRemove?:(id:string)=>void;onAnnotate?:AnnotateImage}){
 const [annotating,setAnnotating]=useState(false);
 const [src,setSrc]=useState(''),[error,setError]=useState(''),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{let active=true;void window.musebench?.readCodeImage({projectId,image}).then(value=>{if(active)setSrc(value);},()=>{if(active)setError('Screenshot unavailable');});return()=>{active=false;};},[image.id,projectId]);
 return <div className="code-image"><button type="button" title={onAnnotate?`Annotate ${image.name}`:image.name} aria-label={onAnnotate?`Annotate ${image.name}`:`View ${image.name}`} onClick={()=>onAnnotate?setAnnotating(true):dialog.current?.showModal()} disabled={!src}>{src?<img src={src} alt={image.name}/>:<span>{error||'Loading screenshot…'}</span>}</button>{onRemove&&<button type="button" className="remove-image" aria-label={`Remove ${image.name}`} onClick={()=>onRemove(image.id)}>×</button>}{!!image.annotation?.marks.length&&<span className="image-annotation-count">{image.annotation.marks.length} annotations</span>}{annotating&&onAnnotate&&<ImageAnnotationEditor image={image} projectId={projectId} onApply={onAnnotate} onClose={()=>setAnnotating(false)}/>}<dialog className="image-preview" ref={dialog} onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}><button type="button" aria-label="Close screenshot" onClick={()=>dialog.current?.close()}>×</button>{src&&<img src={src} alt={image.name}/>}<ol className="image-comment-list">{image.annotation?.marks.filter(mark=>mark.kind==='comment').map((mark,index)=><li key={index}>{mark.kind==='comment'?mark.text:''}</li>)}</ol></dialog></div>;
}
export function useImageUploads(bridge:MuseBenchBridge|undefined,projectId:string|undefined,taskId:string|null,images:CodeImage[],onChange:(images:CodeImage[])=>void,onError:(message:string)=>void,canMutate:()=>boolean=()=>true){
 const binding=`${projectId}:${taskId}`,current=useRef(binding);current.current=binding;
 const liveImages=useRef(images);liveImages.current=images;
 const lock=useRef(false),[uploading,setUploading]=useState(false);
 async function add(files:File[]){
  if(!bridge||!projectId||lock.current||!canMutate())return;
  if(images.length+files.length>4){onError('Attach up to four screenshots.');return;}
  lock.current=true;setUploading(true);
  try{
   const next=[...images];
   for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_IMAGE_BYTES)throw Error('Choose PNG, JPEG or WebP images up to 8 MB each.');
    const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read screenshot.'));reader.readAsDataURL(file);});
    if(current.current!==binding||!canMutate())return;
    const ref=await bridge.importCodeImage({projectId,taskId,name:file.name,dataUrl});
    if(current.current!==binding||!canMutate())return;
    if(!next.some(item=>item.id===ref.id))next.push(ref);
   }
   onChange(next);
  }catch(error){if(current.current===binding)onError(String(error));}finally{lock.current=false;setUploading(false);}
 }
 async function annotate(image:CodeImage,dataUrl:string,marks:ImageMark[]){
  const snapshot=JSON.stringify(images);
  const valid=()=>current.current===binding&&canMutate()&&JSON.stringify(liveImages.current)===snapshot;
  if(!bridge||!projectId||lock.current||!valid()||JSON.stringify(images.find(item=>item.id===image.id))!==JSON.stringify(image))throw Error('The draft changed. Reopen the image in the current prompt.');
  lock.current=true;setUploading(true);
  try{
   const source=image.annotation?.source??{id:image.id,name:image.name,mime:image.mime,bytes:image.bytes};
   const imported=marks.length?await bridge.importCodeImage({projectId,taskId,name:image.name,dataUrl}):source;
   if(!valid())throw Error('The draft changed. Your annotations were not applied to another prompt.');
   if(images.some(item=>item.id!==image.id&&item.id===imported.id))throw Error('This annotated image is already attached.');
   const ref:CodeImage={...imported,...(marks.length?{annotation:{source,marks}}:{})};
   onChange(images.map(item=>item.id===image.id?ref:item));
  }finally{lock.current=false;setUploading(false);}
 }
 return{add,annotate,uploading};
}
