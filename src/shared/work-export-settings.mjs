/** Serializable UI export settings use the same integer timebase as the saved timeline. */
export function workVideoExportExtent(data){
 const timebase=data?.timebase;if(!Number.isSafeInteger(timebase)||timebase<1)throw Error('The video timeline has an invalid timebase');
 const endTick=Math.max(0,...(data.tracks||[]).flatMap(track=>(track.clips||[]).map(clip=>clip.start+clip.duration)),...(data.captions||[]).map(caption=>caption.end));
 if(!Number.isSafeInteger(endTick)||endTick<0)throw Error('The video timeline has an invalid time range');return{timebase,endTick,seconds:endTick/timebase};
}
export function workVideoRangeFromSeconds(data,startSeconds,endSeconds){
 const{timebase,endTick}=workVideoExportExtent(data);if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds)||startSeconds<0||endSeconds<=startSeconds)throw Error('Choose a time range with an end after its start');
 const start=Math.round(startSeconds*timebase),end=Math.round(endSeconds*timebase);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end> endTick||start>=end||endSeconds>endTick/timebase)throw Error('The export time range must stay within the video timeline');
 if((end-start)/timebase>7200)throw Error('Video export time ranges are limited to two hours');return{start,end};
}
export function normalizeWorkPageRange(range,count){
 if(range===undefined||range==='')return'';if(typeof range!=='string'||range.length>1000||!Number.isSafeInteger(count)||count<1||count>10000||! /^[1-9]\d*(?:\s*-\s*[1-9]\d*)?(?:\s*,\s*[1-9]\d*(?:\s*-\s*[1-9]\d*)?)*$/.test(range))throw Error('Choose a valid page range such as 1-3, 5');
 const pages=new Set();for(const part of range.split(',')){const[start,end=start]=part.split('-').map(Number);if(start>end||end>count)throw Error(`Choose page numbers within 1-${count}`);for(let page=start;page<=end;page++)pages.add(page);}const sorted=[...pages].sort((a,b)=>a-b),parts=[];for(let i=0;i<sorted.length;){const start=sorted[i];let end=start;while(i+1<sorted.length&&sorted[i+1]===end+1)end=sorted[++i];parts.push(start===end?String(start):`${start}-${end}`);i++;}return parts.join(',');
}
export function validateWorkPrintSetup(surfaces,{dpi=144,bleed=0,margin=0,cropMarks=false}={}){
 if(!Number.isFinite(dpi)||dpi<36||dpi>1200)throw Error('Print resolution must be between 36 and 1200 DPI');for(const value of[bleed,margin])if(!Number.isFinite(value)||value<0||value>2048)throw Error('Print bleed and margin must be between 0 and 2048 pixels');if(typeof cropMarks!=='boolean')throw Error('Crop marks must be enabled or disabled');if(cropMarks&&bleed+margin<=0)throw Error('Add bleed or margin to make crop marks visible');
 return surfaces.map(surface=>{const width=Math.round(surface.width+2*(bleed+margin)),height=Math.round(surface.height+2*(bleed+margin));if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>16384||height>16384||width*height>64_000_000)throw Error(`${surface.name||'Artboard'} print dimensions exceed 16384 pixels or 64 megapixels`);return{width,height,widthInches:width/dpi,heightInches:height/dpi};});
}
