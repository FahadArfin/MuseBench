import {createMotionData,validateMotionData,MOTION_PROPERTIES} from './work-motion-schema.mjs';
const copy=value=>structuredClone(value);
const uid=()=>globalThis.crypto.randomUUID();
export function applyMotionOperation(input,op){
 const data=validateMotionData(input);const scene=data.scenes.find(s=>s.id===op.sceneId);
 if(op.type==='replaceData')return validateMotionData(op.data);
 if(op.type==='settings')return validateMotionData({...data,...Object.fromEntries(['width','height','fps','durationTicks','loop'].filter(k=>op[k]!==undefined).map(k=>[k,op[k]]))});
 if(!scene)throw new Error('Motion scene not found.');
 if(op.type==='sceneDuration'){const delta=op.durationTicks-scene.durationTicks;for(const later of data.scenes)if(later.id!==scene.id&&later.startTicks>=scene.startTicks+scene.durationTicks)later.startTicks+=delta;scene.durationTicks=op.durationTicks;data.durationTicks+=delta;}
 else if(op.type==='replaceNodes'){scene.nodes=copy(op.nodes);scene.tracks=scene.tracks.filter(t=>scene.nodes.some(n=>n.id===t.nodeId));}
 else if(op.type==='setKeyframe'){
  if(!scene.nodes.some(n=>n.id===op.nodeId)||!MOTION_PROPERTIES.includes(op.property))throw new Error('Motion keyframe target or property not found.');
  let track=scene.tracks.find(t=>t.nodeId===op.nodeId&&t.property===op.property);
  if(!track){track={id:uid(),nodeId:op.nodeId,property:op.property,keyframes:[]};scene.tracks.push(track);}
  const old=track.keyframes.find(k=>k.tick===op.tick);
  const key={id:old?.id||op.id||uid(),tick:op.tick,value:op.value,easing:op.easing||old?.easing||'linear'};
  track.keyframes=track.keyframes.filter(k=>k.tick!==op.tick).concat(key);
 }else if(op.type==='moveKeyframe'||op.type==='deleteKeyframe'){
  const track=scene.tracks.find(t=>t.id===op.trackId);const key=track?.keyframes.find(k=>k.id===op.keyframeId);
  if(!track||!key)throw new Error('Motion keyframe not found.');
  if(op.type==='deleteKeyframe')track.keyframes=track.keyframes.filter(k=>k.id!==key.id);else key.tick=op.tick;
 }else if(op.type==='preset'){
  const node=scene.nodes.find(n=>n.id===op.nodeId);if(!node)throw new Error('Motion preset target not found.');
  const duration=Math.min(op.durationTicks??1000,scene.durationTicks);let pairs;
  if(op.preset==='fade')pairs=[['opacity',0,node.opacity]];
  else if(op.preset==='slide')pairs=[['x',node.x-160,node.x],['opacity',0,node.opacity]];
  else if(op.preset==='scale')pairs=[['scaleX',.5,1],['scaleY',.5,1],['opacity',0,node.opacity]];
  else throw new Error('Unknown motion preset.');
  let next=data;for(const [property,start,end] of pairs){next=applyMotionOperation(next,{type:'setKeyframe',sceneId:scene.id,nodeId:node.id,property,tick:0,value:start,easing:'ease-out'});next=applyMotionOperation(next,{type:'setKeyframe',sceneId:scene.id,nodeId:node.id,property,tick:duration,value:end,easing:'linear'});}return next;
 }else throw new Error('Unsupported motion operation.');
 return validateMotionData(data);
}
export function interpolateMotionTrack(track,tick,base){
 const keys=track.keyframes;if(!keys.length)return base;if(tick<=keys[0].tick)return keys[0].value;if(tick>=keys.at(-1).tick)return keys.at(-1).value;
 const end=keys.findIndex(k=>k.tick>tick),a=keys[end-1],b=keys[end];let t=(tick-a.tick)/(b.tick-a.tick);
 if(a.easing==='step')t=0;else if(a.easing==='ease-in')t=t*t;else if(a.easing==='ease-out')t=1-(1-t)**2;else if(a.easing==='ease-in-out')t=t<.5?2*t*t:1-(-2*t+2)**2/2;
 return a.value+(b.value-a.value)*t;
}
export function sampleMotionScene(input,tick,{loop=input.loop}={}){
 const data=input;let time=Math.max(0,Number.isFinite(tick)?tick:0);time=loop?time%data.durationTicks:Math.min(time,data.durationTicks);
 const scene=data.scenes.find(s=>time>=s.startTicks&&time<s.startTicks+s.durationTicks)||(time===data.durationTicks?data.scenes.find(s=>s.startTicks+s.durationTicks===time):undefined);
 if(!scene)return {id:'empty',name:'Empty',width:data.width,height:data.height,background:'#000000',nodes:[],localTick:time};
 const localTick=Math.min(time-scene.startTicks,scene.durationTicks);
 return {...scene,width:data.width,height:data.height,localTick,nodes:scene.nodes.map(source=>{
  const n=copy(source);let sx=1,sy=1;for(const t of scene.tracks.filter(t=>t.nodeId===n.id)){const value=interpolateMotionTrack(t,localTick,t.property.startsWith('scale')?1:n[t.property]);if(t.property==='scaleX')sx=value;else if(t.property==='scaleY')sy=value;else n[t.property]=value;}n.width*=sx;n.height*=sy;if(n.type==='text'&&sy!==1)n.style={...n.style,fontSize:(n.style?.fontSize||32)*sy};return n;
 })};
}
export function motionFrameTimes(data){validateMotionData(data);const count=Math.ceil(data.durationTicks*data.fps/data.timebase);return Array.from({length:count},(_,i)=>i*data.timebase/data.fps);}
export function convertToMotionData(source,{surfaceId,makeId=uid,durationTicks=5000}={}){
 let surfaces,width,height;
 if(source.version===2&&['design','image','slides'].includes(source.kind)){
  surfaces=source.kind==='slides'?source.data.slides:source.data.artboards;
  const surface=surfaces.find(s=>s.id===surfaceId)||surfaces[0];if(!surface)throw new Error('Source surface not found.');
  width=surface.width||source.data.width;height=surface.height||source.data.height;
  const scene={id:makeId(),sourceId:surface.id,name:surface.name||source.title||'Animated design',startTicks:0,durationTicks,background:surface.background,nodes:surface.nodes.map(n=>({...copy(n),id:makeId(),sourceId:n.id})),tracks:[]};
  return validateMotionData({width,height,timebase:1000,durationTicks,fps:30,loop:false,scenes:[scene]});
 }
 if(source.version===1&&source.kind==='motion'){
  let startTicks=0;const scenes=source.scenes.map((s,i)=>{const durationTicks=Math.round(s.duration*1000),chart=source.charts?.length?source.charts[i%source.charts.length]:null,scene={id:makeId(),sourceId:`legacy-scene-${i}`,name:s.title,startTicks,durationTicks,background:'#102036',tracks:[],nodes:[{id:makeId(),type:'text',x:80,y:100,width:1120,height:150,rotation:0,opacity:1,locked:false,hidden:false,text:s.title,style:{fontSize:56,color:'#ffffff'}},{id:makeId(),type:'text',x:80,y:290,width:chart?560:1120,height:300,rotation:0,opacity:1,locked:false,hidden:false,text:s.body,style:{fontSize:30,color:'#ffffff'}}]};
   if(s.kicker)scene.nodes.push({id:makeId(),type:'text',x:80,y:40,width:1120,height:40,rotation:0,opacity:1,locked:false,hidden:false,text:s.kicker,style:{fontSize:18,color:'#b9c8ed'}});
   if(chart)scene.nodes.push({id:makeId(),type:'chart',x:700,y:280,width:500,height:330,rotation:0,opacity:1,locked:false,hidden:false,chart:{type:chart.type,labels:copy(chart.labels),values:copy(chart.values),title:chart.title},style:{color:'#ffffff'}});
   startTicks+=durationTicks;return scene;});
  return validateMotionData({width:1280,height:720,timebase:1000,durationTicks:startTicks,fps:30,loop:false,scenes});
 }
 throw new Error('Motion conversion supports a design, image, slide, or legacy motion artifact.');
}
export function createMotionDocumentFromSource(source,{makeId=uid,title=source.title,now=new Date().toISOString(),...settings}={}){return {version:2,id:makeId(),kind:'motion',title,revision:0,createdAt:now,updatedAt:now,assets:copy(source.assets||[]),data:convertToMotionData(source,{...settings,makeId})};}
