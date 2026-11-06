import {createVideoClip,applyVideoOperation} from '../shared/work-video-operations.mjs';
import {validateVideoCaptions} from '../shared/work-video-schema.mjs';
const fail=code=>Object.assign(Error(code==='STALE_RESULT'?'The timeline changed. Review against the original revision.':'Invalid generated media result.'),{code});
export function inspectGeneratedMedia(asset,{kind,targetDuration,requireAudio=false}={}){
 const types=kind==='audio'?['audio/wav','audio/mpeg','audio/ogg','audio/mp4']:['video/mp4','video/webm'];
 if(!asset?.id||!types.includes(asset.mediaType)||!Number.isFinite(asset.duration)||asset.duration<=0||asset.duration>3600)throw fail('INVALID_MEDIA');
 return{kind,duration:asset.duration,durationMismatch:Number.isFinite(targetDuration)&&Math.abs(asset.duration-targetDuration)>.1,deltaSeconds:Number.isFinite(targetDuration)?asset.duration-targetDuration:0,audioUnverified:kind==='video'&&requireAudio&&asset.hasAudio!==true};
}
export function acceptGeneratedMedia(document,job,{assetId,trackId,clipId,start=0}){
 if(document.id!==job.itemId||document.revision!==job.revision)throw fail('STALE_RESULT');
 if(document.kind!=='video'||job.status!=='completed')throw fail('INVALID_RESULT');
 const asset=job.assets.find(a=>a.id===assetId);if(!asset)throw fail('INVALID_MEDIA');const kind=asset.mediaType.startsWith('audio/')?'audio':'video';inspectGeneratedMedia(asset,{kind});
 if(!Number.isSafeInteger(start)||start<0||!clipId||document.assets.some(a=>a.id===asset.id))throw fail('INVALID_INSERT');
 const next=structuredClone(document);next.data=applyVideoOperation(next.data,{type:'addClip',trackId,clip:createVideoClip({id:clipId,kind,assetId:asset.id,start,duration:Math.max(1,Math.round(asset.duration*document.data.timebase))})});next.assets.push(structuredClone(asset));return next;
}
/** One immutable editor change: attach managed asset metadata and insert an ordinary editable object.
 * The native caller validates document+asset catalog and commits with expectedRevision once. */
export function insertGeneratedAsset(document,asset,{surfaceId,nodeId=crypto.randomUUID(),trackId,clipId=crypto.randomUUID(),start=0}={}){
 if(document.kind==='video'){
  const kind=asset.mediaType.startsWith('audio/')?'audio':asset.mediaType.startsWith('video/')?'video':asset.mediaType.startsWith('image/')?'image':null;if(!kind)throw fail('INVALID_MEDIA');
  if(kind!=='image')inspectGeneratedMedia(asset,{kind});const track=document.data.tracks.find(t=>t.id===trackId)??(!trackId?document.data.tracks.find(t=>t.type===(kind==='audio'?'audio':'video')):null);if(!track)throw fail('INVALID_TRACK');
  const next=structuredClone(document),existing=next.assets.find(a=>a.id===asset.id);if(existing&&existing.hash!==asset.hash)throw fail('INVALID_MEDIA');if(!existing)next.assets.push(structuredClone(asset));
  next.data=applyVideoOperation(next.data,{type:'addClip',trackId:track.id,clip:createVideoClip({id:clipId,kind,assetId:asset.id,start,duration:Math.max(1,Math.round((asset.duration??5)*document.data.timebase))})});return next;
 }
 if(!['image','design','slides'].includes(document.kind)||!['image/png','image/jpeg','image/webp'].includes(asset.mediaType)||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0)throw fail('UNSUPPORTED_INSERT');
 const next=structuredClone(document),surfaces=document.kind==='slides'?next.data.slides:next.data.artboards;
 const surface=surfaces.find(s=>s.id===(surfaceId??next.data.activeArtboardId))??(!surfaceId?surfaces[0]:null);if(!surface)throw fail('INVALID_SURFACE');
 if(surfaces.some(s=>s.nodes.some(n=>n.id===nodeId)))throw fail('DUPLICATE_ID');const existing=next.assets.find(a=>a.id===asset.id);if(existing&&existing.hash!==asset.hash)throw fail('INVALID_MEDIA');if(!existing)next.assets.push(structuredClone(asset));
 const width=surface.width??next.data.width,height=surface.height??next.data.height,scale=Math.min(1,width*.8/asset.width,height*.8/asset.height),nodeWidth=asset.width*scale,nodeHeight=asset.height*scale;
 surface.nodes.push({id:nodeId,type:'image',assetId:asset.id,x:(width-nodeWidth)/2,y:(height-nodeHeight)/2,width:nodeWidth,height:nodeHeight,rotation:0,opacity:1,locked:false,hidden:false,image:{fit:'contain',crop:{x:0,y:0,width:1,height:1}}});return next;
}
export function acceptGeneratedAsset(document,job,{assetId,...options}){
 if(document.id!==job.itemId||document.revision!==job.revision)throw fail('STALE_RESULT');if(job.status!=='completed')throw fail('INVALID_RESULT');const asset=job.assets.find(a=>a.id===assetId);if(!asset)throw fail('INVALID_MEDIA');return insertGeneratedAsset(document,asset,options);
}
export function transcriptToCaptions(transcript,{timebase,offset=0,idPrefix='transcript'}={}){
 if(!Number.isSafeInteger(timebase)||timebase<1||timebase>1000000||!Number.isSafeInteger(offset)||offset<0||!Array.isArray(transcript)||transcript.length>10000)throw fail('INVALID_TRANSCRIPT');
 const captions=transcript.map((t,i)=>{if(!Number.isFinite(t.start)||!Number.isFinite(t.end)||t.start<0||t.end<=t.start||typeof t.text!=='string'||!t.text.trim())throw fail('INVALID_TRANSCRIPT');return{id:`${idPrefix}-${i}`,start:offset+Math.round(t.start*timebase),end:offset+Math.round(t.end*timebase),text:t.text,style:{fontSize:42,color:'#ffffff',background:'#000000',position:'bottom',safeArea:.08}};});
 return validateVideoCaptions(captions);
}
