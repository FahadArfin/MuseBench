export const VIDEO_TIMELINE_LAYOUT=Object.freeze({trackHeight:70,rulerHeight:25,labelWidth:150,overscanPixels:120,overscanTracks:2,maxRenderedClips:240});
/** Visible view of validated data. Pinned clips retain focus through scrolling;
 * dense overlap is bounded explicitly and remains reachable by clip search. */
export function timelineViewport(data,{scrollLeft=0,scrollTop=0,width=900,height=300,zoom=75,pinnedIds=[]}={}){
 const layout=VIDEO_TIMELINE_LAYOUT,pinned=new Set(pinnedIds.filter(Boolean));const first=Math.max(0,Math.floor((scrollTop-layout.rulerHeight)/layout.trackHeight)-layout.overscanTracks);const last=Math.min(data.tracks.length-1,Math.ceil((scrollTop+height-layout.rulerHeight)/layout.trackHeight)+layout.overscanTracks);const left=Math.max(0,scrollLeft-layout.overscanPixels),right=scrollLeft+Math.max(1,width-layout.labelWidth)+layout.overscanPixels;
 const tracks=[];let totalClipCount=0,visibleCount=0,pinnedCount=0;
 data.tracks.forEach((track,index)=>{totalClipCount+=track.clips.length;const rowVisible=index>=first&&index<=last;const clips=track.clips.filter(clip=>{if(pinned.has(clip.id)){pinnedCount++;return true;}if(!rowVisible)return false;const x=clip.start/data.timebase*zoom,w=Math.max(10,clip.duration/data.timebase*zoom);return x<right&&x+w>left;});if(rowVisible||clips.length){visibleCount+=clips.length;tracks.push({track,index,clips});}});
 let available=Math.max(0,layout.maxRenderedClips-pinnedCount),renderedClipCount=0;for(const row of tracks){row.clips=row.clips.filter(clip=>{if(pinned.has(clip.id))return true;if(available>0){available--;return true;}return false;});renderedClipCount+=row.clips.length;}
 return {tracks,totalClipCount,renderedClipCount,densityHiddenCount:visibleCount-renderedClipCount,totalHeight:layout.rulerHeight+data.tracks.length*layout.trackHeight};
}
