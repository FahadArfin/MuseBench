import {useEffect,useRef,useState} from 'react';
import type {CodeImage,MuseBenchBridge} from '../shared/types';
import {MAX_IMAGE_BYTES} from '../shared/code-images.mjs';
import './code-images.css';

export function CodeImages({images,projectId,onRemove}:{images:CodeImage[];projectId:string;onRemove?:(id:string)=>void}){
 return <div className="code-images">{images.map(image=><CodeImageView key={image.id} image={image} projectId={projectId} onRemove={onRemove}/>)}</div>;
}
function CodeImageView({image,projectId,onRemove}:{image:CodeImage;projectId:string;onRemove?:(id:string)=>void}){
 const [src,setSrc]=useState(''),[error,setError]=useState(''),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{let active=true;void window.musebench?.readCodeImage({projectId,image}).then(value=>{if(active)setSrc(value);},()=>{if(active)setError('Screenshot unavailable');});return()=>{active=false;};},[image.id,projectId]);
 return <div className="code-image"><button type="button" title={image.name} onClick={()=>dialog.current?.showModal()} disabled={!src}>{src?<img src={src} alt={image.name}/>:<span>{error||'Loading screenshot…'}</span>}</button>{onRemove&&<button type="button" className="remove-image" aria-label={`Remove ${image.name}`} onClick={()=>onRemove(image.id)}>×</button>}<dialog className="image-preview" ref={dialog} onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}><button type="button" aria-label="Close screenshot" onClick={()=>dialog.current?.close()}>×</button>{src&&<img src={src} alt={image.name}/>}</dialog></div>;
}
export function useImageUploads(bridge:MuseBenchBridge|undefined,projectId:string|undefined,taskId:string|null,images:CodeImage[],onChange:(images:CodeImage[])=>void,onError:(message:string)=>void,canMutate:()=>boolean=()=>true){
 const binding=`${projectId}:${taskId}`,current=useRef(binding);current.current=binding;
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
 return{add,uploading};
}
