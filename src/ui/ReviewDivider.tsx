import {useEffect,useRef,useState} from 'react';
export function ReviewDivider({width,full,onWidth,onFull,onClose}:{width:number;full:boolean;onWidth:(width:number)=>void;onFull:(full:boolean)=>void;onClose:()=>void}){
 const handle=useRef<HTMLDivElement>(null),[maximum,setMaximum]=useState(10000);
 useEffect(()=>{const area=handle.current?.closest('.work-area');if(!area)return;const measure=()=>{if(area.clientWidth)setMaximum(area.clientWidth);};const observer=new ResizeObserver(measure);observer.observe(area);measure();return()=>observer.disconnect();},[]);
 const move=(element:HTMLElement,x:number)=>{
  const area=element.closest('.work-area')?.getBoundingClientRect();if(!area)return;
  if(x>=area.right-24){onFull(false);onClose();return;}
  if(x<=area.left+24){onFull(true);return;}
  onFull(false);onWidth(Math.max(260,Math.min(area.width-240,area.right-x)));
 };
 return <div ref={handle} className="review-resizer" role="separator" aria-label="Resize details panel" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={full?maximum:Math.min(maximum,Math.round(width))} aria-valuetext={full?'Details full width':`Details ${Math.round(width)} pixels wide`} tabIndex={0}
  onDoubleClick={()=>{onFull(false);onWidth(460);}}
  onKeyDown={event=>{if(event.key==='Home'){event.preventDefault();onFull(true);}else if(event.key==='End'){event.preventDefault();onFull(false);onClose();}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();if(full&&event.key==='ArrowRight'){onFull(false);return;}const area=event.currentTarget.closest('.work-area')?.getBoundingClientRect();if(!area)return;const current=full?area.width:width;move(event.currentTarget,area.right-(current+(event.key==='ArrowLeft'?24:-24)));}}}
  onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);}}
  onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))move(event.currentTarget,event.clientX);}}
  onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
 />;
}
