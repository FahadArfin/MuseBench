import type {PersonalState,PersonalWarmTarget} from '../shared/types';
export type SnapshotKey='bot'|'ideas'|'goals'|'chat'|'media'|'artifacts'|'scheduled'|'vibes'|'search';
export type DesktopSnapshot={file:string;capturedAt:string;width:number;height:number;origin:string;personal?:Pick<PersonalState,'agentProfile'|'library'|'schedules'>};
type Manifest={version:1;pages:Partial<Record<SnapshotKey,DesktopSnapshot>>};
let manifest:Manifest={version:1,pages:{}},selection:SnapshotKey='bot',revision=0;
const listeners=new Set<()=>void>();
const emit=()=>{revision++;for(const listener of listeners)listener();};
const snapshotKeys=['bot','ideas','goals','chat','media','artifacts','scheduled','vibes','search'] as const;
const warmSnapshots:Partial<Record<PersonalWarmTarget,SnapshotKey>>={bot:'bot',ideas:'ideas',goals:'goals','meta-chat':'chat','meta-search':'search','meta-media':'media','meta-artifacts':'artifacts','meta-scheduled':'scheduled','meta-vibes':'vibes'};
type DecodedSnapshot={url:string;status:'queued'|'loading'|'ready'|'failed';image?:HTMLImageElement};
// Retain at most the current manifest's nine images, plus two obsolete in-flight decodes.
const decodedSnapshots=new Map<string,DecodedSnapshot>();
let decodeQueue:DecodedSnapshot[]=[],activeDecodes=0;
const snapshotURL=(snapshot:DesktopSnapshot)=>`/__musebench_snapshots/${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`;
function pumpDecodes(){
 if(typeof Image==='undefined')return;
 while(activeDecodes<2&&decodeQueue.length){
  const entry=decodeQueue.shift()!;
  if(decodedSnapshots.get(entry.url)!==entry)continue;
  entry.status='loading';activeDecodes++;
  void(async()=>{
   try{const image=new Image();entry.image=image;image.decoding='async';image.src=entry.url;await image.decode();entry.status='ready';}
   catch{entry.status='failed';entry.image=undefined;}
   finally{activeDecodes--;pumpDecodes();}
  })();
 }
}
function queueSnapshot(snapshot:DesktopSnapshot,prioritize=false){
 const url=snapshotURL(snapshot);let entry=decodedSnapshots.get(url);
 if(!entry){entry={url,status:'queued'};decodedSnapshots.set(url,entry);decodeQueue.push(entry);}
 if(prioritize&&entry.status==='queued'){decodeQueue=decodeQueue.filter(item=>item!==entry);decodeQueue.unshift(entry);}
}
function predecodeManifest(){
 const snapshots=Object.values(manifest.pages),currentURLs=new Set(snapshots.map(snapshotURL));
 for(const url of decodedSnapshots.keys())if(!currentURLs.has(url))decodedSnapshots.delete(url);
 decodeQueue=decodeQueue.filter(entry=>decodedSnapshots.get(entry.url)===entry);
 for(const snapshot of snapshots)queueSnapshot(snapshot);
 pumpDecodes();
}
// A hint warms an existing capture only; it never selects a snapshot or emits UI state.
export function prewarmSnapshot(target:PersonalWarmTarget){
 const key=warmSnapshots[target];if(typeof key!=='string')return;
 const snapshot=manifest.pages[key];if(!snapshot)return;
 queueSnapshot(snapshot,true);pumpDecodes();
}
export const subscribeSnapshots=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const snapshotRevision=()=>revision;
export const selectedSnapshot=()=>({key:selection,snapshot:manifest.pages[selection]});
export function selectSnapshot(key:SnapshotKey){selection=key;emit();return manifest.pages[key];}
export async function loadSnapshots(){
 try{const response=await fetch('/__musebench_snapshots/manifest.json',{cache:'no-store'});if(!response.ok)return;const value=await response.json();if(value.version!==1||!value.pages)return;
  const pages:Manifest['pages']={};
  for(const key of snapshotKeys){const item=value.pages[key];if(item&&item.file===`${key}.png`&&Number.isFinite(item.width)&&Number.isFinite(item.height)&&item.width>0&&item.height>0&&typeof item.capturedAt==='string')pages[key]=item;}
  manifest={version:1,pages};predecodeManifest();emit();
 }catch{/* A clean checkout has no private desktop captures. */}
}
