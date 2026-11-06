import React from 'react';
import type {MotionScene} from '../../../shared/work-motion-schema.mjs';
export interface KeyframeTimelineProps {scene:MotionScene;tick:number;selectedNodeId?:string;onSeek:(tick:number)=>void;onMove:(trackId:string,keyframeId:string,tick:number)=>void;onDelete:(trackId:string,keyframeId:string)=>void;}
export function KeyframeTimeline({scene,tick,selectedNodeId,onSeek,onMove,onDelete}:KeyframeTimelineProps){
 const [selected,setSelected]=React.useState<{trackId:string;id:string}|null>(null);
 const track=scene.tracks.find(t=>t.id===selected?.trackId),key=track?.keyframes.find(k=>k.id===selected?.id);
 return <section aria-label="Keyframe timeline" style={{padding:12,flexShrink:0,borderTop:'1px solid var(--border-color, #444)'}}>
  <label>Playhead (seconds) <input aria-label="Motion playhead" type="range" min={0} max={scene.durationTicks} step={1} value={tick} onChange={e=>onSeek(Number(e.target.value))}/></label>
  <input aria-label="Playhead seconds" type="number" min={0} max={scene.durationTicks/1000} step={.001} value={tick/1000} onChange={e=>onSeek(Math.round(Number(e.target.value)*1000))}/>
  <div style={{maxHeight:180,overflow:'auto'}}>{scene.tracks.filter(t=>!selectedNodeId||t.nodeId===selectedNodeId).map(t=><div key={t.id} style={{display:'flex',alignItems:'center',gap:8}}><span style={{minWidth:75}}>{t.property}</span><div style={{position:'relative',height:30,flex:1,background:'var(--surface-2,#242a35)'}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();onSeek(Math.round((e.clientX-rect.left)/rect.width*scene.durationTicks));}}}>
   <span aria-hidden style={{position:'absolute',left:`${tick/scene.durationTicks*100}%`,height:'100%',borderLeft:'1px solid #8bacef'}}/>
   {t.keyframes.map(k=><button key={k.id} type="button" draggable aria-label={`${t.property} keyframe at ${k.tick/1000} seconds`} aria-pressed={selected?.id===k.id} title={`${k.value} · ${k.easing}. Arrow keys move 10 ms; Shift moves 100 ms; Delete removes.`} style={{position:'absolute',left:`${k.tick/scene.durationTicks*100}%`,transform:'translateX(-50%)',padding:'3px 6px'}} onClick={()=>{setSelected({trackId:t.id,id:k.id});onSeek(k.tick);}} onKeyDown={e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onDelete(t.id,k.id);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onMove(t.id,k.id,Math.max(0,Math.min(scene.durationTicks,k.tick+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?100:10))));}}} onDragEnd={e=>{if(!e.clientX)return;const rect=e.currentTarget.parentElement!.getBoundingClientRect();onMove(t.id,k.id,Math.max(0,Math.min(scene.durationTicks,Math.round((e.clientX-rect.left)/rect.width*scene.durationTicks))));}}>◆</button>)}
  </div></div>)}</div>
  {key&&track&&<div><label>Selected keyframe seconds <input type="number" min={0} max={scene.durationTicks/1000} step={.001} value={key.tick/1000} onChange={e=>onMove(track.id,key.id,Math.round(Number(e.target.value)*1000))}/></label><button type="button" onClick={()=>{onDelete(track.id,key.id);setSelected(null);}}>Delete keyframe</button></div>}
 </section>;
}
