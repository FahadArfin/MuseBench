import {useRef,useState} from 'react';
import {Check,Upload} from 'lucide-react';
import type {AccountProfile} from '../shared/types';
import {ProfileAvatar} from './ProfileMenu';
import './avatar-picker.css';

export const avatarColors=['Ocean','Violet','Rose','Coral','Amber','Mint','Teal','Sky','Indigo','Plum','Slate','Sand'];
export function AvatarPicker({value,onChange}:{value:AccountProfile;onChange:(value:AccountProfile)=>void}) {
 const input=useRef<HTMLInputElement>(null),generation=useRef(0);
 const [image,setImage]=useState<HTMLImageElement|null>(null),[zoom,setZoom]=useState(1),[x,setX]=useState(50),[y,setY]=useState(50),[error,setError]=useState('');
 const cancel=()=>{generation.current++;setImage(null);setError('');};
 async function upload(file?:File){
  const current=++generation.current;setError('');setImage(null);
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){setError('Choose a PNG, JPG or WebP image under 8 MB.');return;}
  const img=new Image();
  try{img.src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});await img.decode();if(current!==generation.current)return;if(img.naturalWidth*img.naturalHeight>40000000)throw Error();setImage(img);setZoom(1);setX(50);setY(50);}catch{setError('This image could not be opened. Try a smaller image.');}
 }
 function save(){if(!image)return;const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');if(!context)return;const side=Math.min(image.naturalWidth,image.naturalHeight)/zoom;context.drawImage(image,(image.naturalWidth-side)*x/100,(image.naturalHeight-side)*y/100,side,side,0,0,256,256);onChange({...value,avatarImage:canvas.toDataURL('image/png'),avatarSeed:'upload'});cancel();}
 return <fieldset className="avatar-picker"><legend>Choose your profile picture</legend>
  <div className="profile-avatar-options">{avatarColors.map((name,i)=><button type="button" key={name} aria-label={`${name} mascot`} aria-pressed={!value.avatarImage&&value.avatarSeed===`mascot-${i}`} onClick={()=>{cancel();onChange({...value,avatarSeed:`mascot-${i}`,avatarImage:undefined});}}><ProfileAvatar profile={{...value,avatarImage:undefined,avatarSeed:`mascot-${i}`}} size={30}/>{!value.avatarImage&&value.avatarSeed===`mascot-${i}`&&<Check size={12}/>}</button>)}</div>
  <button className="button avatar-upload" type="button" onClick={()=>input.current?.click()}><Upload size={15}/>Upload photo</button><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
  {image&&<div className="avatar-stage"><div className="avatar-crop" role="img" aria-label="Profile picture crop preview" style={{backgroundImage:`url("${image.src}")`,backgroundSize:`${image.naturalWidth/Math.min(image.naturalWidth,image.naturalHeight)*zoom*100}% ${image.naturalHeight/Math.min(image.naturalWidth,image.naturalHeight)*zoom*100}%`,backgroundPosition:`${x}% ${y}%`}}/>{[['Zoom',zoom,setZoom,1,3,.01],['Horizontal position',x,setX,0,100,1],['Vertical position',y,setY,0,100,1]].map(([label,v,set,min,max,step])=><label key={String(label)}>{String(label)}<input type="range" aria-label={String(label)} min={Number(min)} max={Number(max)} step={Number(step)} value={Number(v)} onChange={e=>(set as (v:number)=>void)(Number(e.target.value))}/></label>)}<div className="avatar-stage-actions"><button type="button" className="button" onClick={cancel}>Cancel crop</button><button type="button" className="button primary" onClick={save}>Use photo</button></div></div>}
  {!image&&value.avatarImage&&<div className="avatar-chosen"><ProfileAvatar profile={value} size={48}/><span>Photo ready to save</span></div>}{error&&<p role="alert">{error}</p>}
 </fieldset>;
}
