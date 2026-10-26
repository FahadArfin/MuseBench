import {useRef,useState} from 'react';
import {GripVertical,Pencil,Trash2} from 'lucide-react';
import type {QueuedPrompt} from '../shared/types';
import './prompt-queue.css';

export function PromptQueue({items,busy,onMove,onEdit,onRemove}:{
 items:QueuedPrompt[];busy:boolean;
 onMove:(id:string,beforeId:string|null)=>Promise<boolean>;
 onEdit:(item:QueuedPrompt)=>void;onRemove:(id:string)=>void;
}){
 const drag=useRef<string|null>(null);
 const [dragging,setDragging]=useState<string|null>(null),[target,setTarget]=useState<string|null|undefined>(),[notice,setNotice]=useState('');
 const reset=()=>{drag.current=null;setDragging(null);setTarget(undefined);};
 const move=async(id:string,beforeId:string|null)=>{reset();if(await onMove(id,beforeId))setNotice('Queue order updated.');};
 const position=(event:React.DragEvent,id:string)=>{
  const box=event.currentTarget.getBoundingClientRect();
  return event.clientY<box.y+box.height/2?id:items[items.findIndex(item=>item.id===id)+1]?.id??null;
 };
 return <section className="prompt-queue" aria-label="Queued prompts">
  <ol className="queue-list">
   {items.map((item,index)=><li key={item.id} className={`queued-prompt ${dragging===item.id?'queue-dragging':''} ${target===item.id?'queue-drop-before':''} ${index===items.length-1&&target===null?'queue-drop-after':''}`}
    onDragOver={event=>{if(busy||!drag.current)return;event.preventDefault();event.dataTransfer.dropEffect='move';setTarget(position(event,item.id));}}
    onDrop={event=>{event.preventDefault();if(!busy&&drag.current)void move(drag.current,position(event,item.id));else reset();}}>
    <button className="icon-button queue-grip" draggable={!busy} disabled={busy} aria-label={`Reorder queued prompt ${index+1}`} title="Drag to reorder · Alt+Up/Down"
     onDragStart={event=>{if(busy){event.preventDefault();return;}drag.current=item.id;setDragging(item.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}}
     onDragEnd={reset}
     onKeyDown={event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowUp'&&index>0)void move(item.id,items[index-1].id);if(event.key==='ArrowDown'&&index<items.length-1)void move(item.id,items[index+2]?.id??null);}}><GripVertical size={14}/></button>
    <span className="queued-text" title={item.text}>{item.text}{!!item.images?.length&&` · ${item.images.length} screenshot${item.images.length===1?'':'s'}`}</span>
    <button className="icon-button" aria-label={`Edit queued prompt ${index+1}`} title="Edit prompt" disabled={busy} onClick={()=>onEdit(item)}><Pencil size={14}/></button>
    <button className="icon-button" aria-label={`Remove queued prompt ${index+1}`} title="Remove prompt" disabled={busy} onClick={()=>onRemove(item.id)}><Trash2 size={14}/></button>
   </li>)}
  </ol>
  <span className="queue-announcement" role="status">{notice}</span>
 </section>;
}
