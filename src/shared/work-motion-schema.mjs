import {validateSceneNodes} from './work-documents.mjs';
import {WORK_MOTION_LIMITS as L,WORK_LIMITS} from './work-limits.mjs';
export const MOTION_PROPERTIES = Object.freeze(['x','y','scaleX','scaleY','rotation','opacity']);
export const MOTION_EASINGS = Object.freeze(['linear','ease-in','ease-out','ease-in-out','step']);
const fail=(path,message)=>{throw new Error(`motion.${path} ${message}.`);};
const number=(v,path,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))fail(path,`must be ${integer?'an integer':'a number'} from ${min} to ${max}`);return v;};
const str=(v,path,max=160)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(path,'must be nonempty bounded text');return v;};
const array=(v,path,max)=>{if(!Array.isArray(v)||v.length>max)fail(path,`must be an array of at most ${max} entries`);return v;};
const unique=(list,path)=>{if(new Set(list).size!==list.length)fail(path,'contains duplicate IDs');};
const fields=(value,keys,path)=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(`${path}.${key}`,'is not supported');};
const color=(v,path)=>{str(v,path,128);if(!/^(?:#[a-f\d]{3,8}|[a-z]{1,32}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-]+\))$/i.test(v))fail(path,'must be a safe color');return v;};
export function createMotionData({makeId=()=>globalThis.crypto.randomUUID()}={}){return {width:1280,height:720,timebase:1000,durationTicks:5000,fps:30,loop:false,scenes:[{id:makeId(),name:'Scene 1',startTicks:0,durationTicks:5000,background:'#ffffff',nodes:[],tracks:[]}]};}
export function validateMotionData(input,context={}){
 if(!input||typeof input!=='object')fail('data','must be an object');
 fields(input,['width','height','timebase','durationTicks','fps','loop','scenes'],'data');
 const ids=context.ids||new Set();const claim=(id,path)=>{if(ids.has(id))fail(path,'contains duplicate ID');ids.add(id);return id;};
 const data={width:number(input.width,'width',L.minDimension,L.maxDimension,true),height:number(input.height,'height',L.minDimension,L.maxDimension,true),timebase:L.timebase,durationTicks:number(input.durationTicks,'durationTicks',1,L.maxDurationTicks,true),fps:number(input.fps,'fps',1,L.maxFps,true),loop:input.loop};
 if(input.timebase!==L.timebase)fail('timebase',`must be ${L.timebase}`);if(typeof data.loop!=='boolean')fail('loop','must be boolean');
 let nodeCount=0;data.scenes=array(input.scenes,'scenes',L.maxScenes).map((s,i)=>{
  const p=`scenes[${i}]`;if(!s||typeof s!=='object')fail(p,'must be an object');
  fields(s,['id','name','sourceId','startTicks','durationTicks','background','nodes','tracks'],p);
  const nodes=array(s.nodes,`${p}.nodes`,WORK_LIMITS.maxNodesPerSurface).map(n=>{const result={...n};delete result.sourceId;return result;});nodeCount+=nodes.length;if(nodeCount>WORK_LIMITS.maxNodes)fail('nodes','exceeds total node limit');
  const scene={id:claim(str(s.id,`${p}.id`),`${p}.id`),name:str(s.name,`${p}.name`),startTicks:number(s.startTicks,`${p}.startTicks`,0,data.durationTicks-1,true),durationTicks:number(s.durationTicks,`${p}.durationTicks`,1,data.durationTicks,true),background:color(s.background,`${p}.background`),nodes:validateSceneNodes(nodes,{...context,ids,path:`motion.${p}.nodes`})};
  if(scene.startTicks+scene.durationTicks>data.durationTicks)fail(p,'extends beyond duration');
  // Source identifiers are provenance only and never serve as editable target IDs.
  if(s.sourceId!==undefined)scene.sourceId=str(s.sourceId,`${p}.sourceId`);
  scene.nodes=scene.nodes.map((n,j)=>s.nodes[j]?.sourceId===undefined?n:{...n,sourceId:str(s.nodes[j].sourceId,`${p}.nodes[${j}].sourceId`)});
  const targets=new Set(scene.nodes.map(n=>n.id));
  scene.tracks=array(s.tracks,`${p}.tracks`,L.maxTracksPerScene).map((t,j)=>{
   const q=`${p}.tracks[${j}]`;if(!t||typeof t!=='object')fail(q,'must be an object');
   fields(t,['id','nodeId','property','keyframes'],q);
   if(!targets.has(t.nodeId))fail(`${q}.nodeId`,'must reference a scene node');if(!MOTION_PROPERTIES.includes(t.property))fail(`${q}.property`,'is unsupported');
   const track={id:claim(str(t.id,`${q}.id`),`${q}.id`),nodeId:t.nodeId,property:t.property,keyframes:array(t.keyframes,`${q}.keyframes`,L.maxKeyframesPerTrack).map((k,h)=>{
    const r=`${q}.keyframes[${h}]`;if(!k||typeof k!=='object')fail(r,'must be an object');if(!MOTION_EASINGS.includes(k.easing))fail(`${r}.easing`,'is unsupported');
    fields(k,['id','tick','value','easing'],r);
    return {id:claim(str(k.id,`${r}.id`),`${r}.id`),tick:number(k.tick,`${r}.tick`,0,scene.durationTicks,true),value:number(k.value,`${r}.value`,t.property==='opacity'?0:t.property.startsWith('scale')?.001:-100000,t.property==='opacity'?1:t.property.startsWith('scale')?100:100000),easing:k.easing};
   }).sort((a,b)=>a.tick-b.tick)};
   unique(track.keyframes.map(k=>k.id),`${q}.keyframes`);unique(track.keyframes.map(k=>k.tick),`${q}.ticks`);return track;
  });
  unique(scene.tracks.map(t=>t.id),`${p}.tracks`);unique(scene.tracks.map(t=>`${t.nodeId}:${t.property}`),`${p}.properties`);return scene;
 });
 if(!data.scenes.length)fail('scenes','needs a scene');unique(data.scenes.map(s=>s.id),'scenes');
 const ordered=[...data.scenes].sort((a,b)=>a.startTicks-b.startTicks);for(let i=1;i<ordered.length;i++)if(ordered[i].startTicks<ordered[i-1].startTicks+ordered[i-1].durationTicks)fail('scenes','must not overlap');
 if(new TextEncoder().encode(JSON.stringify(data)).length>L.maxDataBytes)fail('data','exceeds motion byte limit');return data;
}
