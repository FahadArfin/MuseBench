import { validateVideoData } from './work-video-schema.mjs';

/** Pure deterministic plan; paths and filter syntax are never document fields. */
export function compileWorkRenderPlan(document, settings={}) {
  if(document?.kind!=='video'||document.version!==2) throw Error('A version 2 video document is required.');
  const data=validateVideoData(document.data); const tb=data.timebase;
  const allowed=['aspectRatio','resolution','fps','range','quality','burnCaptions'];
  if(Object.keys(settings).some(k=>!allowed.includes(k))) throw Error('Unsupported video export setting.');
  const fps=settings.fps??data.frameRate.numerator/data.frameRate.denominator;
  if(![24,30].includes(fps)) throw Error('Video export supports 24 or 30 fps.');
  const resolution=settings.resolution??720; if(![720,1080].includes(resolution)) throw Error('Video export supports 720p or 1080p.');
  const aspect=settings.aspectRatio??(data.width===data.height?'1:1':data.width>data.height?'16:9':'9:16');
  if(!['16:9','9:16','1:1'].includes(aspect)) throw Error('Unsupported export aspect ratio.');
  const quality=settings.quality??'balanced'; if(!['draft','balanced','high'].includes(quality)) throw Error('Unsupported video quality.');
  if(settings.burnCaptions!==undefined&&typeof settings.burnCaptions!=='boolean')throw Error('Caption export setting must be boolean.');
  const endTick=Math.max(0,...data.tracks.flatMap(t=>t.clips.map(c=>c.start+c.duration)),...data.captions.map(c=>c.end));
  const range=settings.range??{start:0,end:endTick};
  if(!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end> endTick||range.end<=range.start) throw Error('Export range must be within the timeline in integer ticks.');
  if((range.end-range.start)/tb>7200) throw Error('Video exports are limited to two hours.');
  const [width,height]=aspect==='16:9'?[resolution*16/9,resolution]:aspect==='9:16'?[resolution,resolution*16/9]:[resolution,resolution];
  const clips=data.tracks.flatMap((t,trackOrder)=>t.clips.map((c,clipOrder)=>({...c,trackId:t.id,trackOrder,clipOrder,trackGain:t.gain,trackMuted:t.muted,start:c.start/tb,duration:c.duration/tb,sourceIn:c.sourceIn/tb,audio:{...c.audio,fadeIn:c.audio.fadeIn/tb,fadeOut:c.audio.fadeOut/tb,ducking:c.audio.ducking?{...c.audio.ducking,attack:c.audio.ducking.attack/tb,release:c.audio.ducking.release/tb}:undefined},transition:{...c.transition,duration:c.transition.duration/tb}}))).filter(c=>!c.trackMuted&&c.start+c.duration>range.start/tb&&c.start<range.end/tb);
  if(clips.length>256) throw Error('An export supports at most 256 clips per range. Split this sequence into shorter exports.');
  if(clips.some(c=>c.kind==='placeholder')) throw Error('Replace all storyboard placeholders before exporting.');
  const duckingIntervals=data.tracks.filter(t=>!t.muted&&t.gain>0).flatMap(t=>t.clips.filter(c=>!c.audio.muted&&c.audio.gain>0&&['audio','video'].includes(c.kind)).map(c=>({trackId:t.id,start:c.start/tb,duration:c.duration/tb})));
  return {version:1,itemId:document.id,revision:document.revision,width:Math.round(width/2)*2,height:Math.round(height/2)*2,projectWidth:data.width,projectHeight:data.height,fps,duration:(range.end-range.start)/tb,rangeStart:range.start/tb,rangeEnd:range.end/tb,quality,crf:{draft:28,balanced:22,high:18}[quality],assetIds:[...new Set(clips.filter(c=>c.assetId).map(c=>c.assetId))],clips,duckingIntervals,captions:settings.burnCaptions===false?[]:data.captions.filter(c=>c.end>range.start&&c.start<range.end).map(c=>({...c,start:c.start/tb,end:c.end/tb}))};
}
