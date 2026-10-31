import type {ImageMark} from '../shared/types';

export async function compositeImage(src:string,marks:ImageMark[]):Promise<string>{
 const image=new Image();image.src=src;await image.decode();
 const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
 if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>64000000)throw Error('This image is too large to annotate.');
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image drawing is unavailable.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const w=canvas.width,h=canvas.height,line=Math.max(2,w/300),radius=Math.max(10,w/60);let number=0;
 for(const mark of marks){
  ctx.lineWidth=line;ctx.lineJoin='round';ctx.lineCap='round';
  if(mark.kind==='comment'){
   ctx.beginPath();ctx.arc(mark.x*w,mark.y*h,radius,0,Math.PI*2);ctx.fillStyle='#2563eb';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,line/2);ctx.stroke();ctx.fillStyle='#fff';ctx.font=`bold ${radius}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(++number),mark.x*w,mark.y*h);continue;
  }
  ctx.strokeStyle=mark.color;const first=mark.points[0],last=mark.points.at(-1)!;ctx.beginPath();
  if(mark.kind==='rect')ctx.rect(Math.min(first.x,last.x)*w,Math.min(first.y,last.y)*h,Math.abs(first.x-last.x)*w,Math.abs(first.y-last.y)*h);
  else{ctx.moveTo(first.x*w,first.y*h);for(const point of mark.points.slice(1))ctx.lineTo(point.x*w,point.y*h);}
  ctx.stroke();if(mark.kind==='arrow'){const angle=Math.atan2((last.y-first.y)*h,(last.x-first.x)*w),size=line*5;ctx.beginPath();ctx.moveTo(last.x*w-size*Math.cos(angle-.5),last.y*h-size*Math.sin(angle-.5));ctx.lineTo(last.x*w,last.y*h);ctx.lineTo(last.x*w-size*Math.cos(angle+.5),last.y*h-size*Math.sin(angle+.5));ctx.stroke();}
 }
 const value=canvas.toDataURL('image/png');if(value.length>11200000)throw Error('The annotated image exceeds 8 MB. Try fewer marks.');return value;
}
