import type {PersonalState} from '../shared/types';
export type SnapshotKey='bot'|'ideas'|'goals'|'chat'|'media'|'artifacts'|'scheduled'|'vibes'|'search';
export type DesktopSnapshot={file:string;capturedAt:string;width:number;height:number;origin:string;personal?:Pick<PersonalState,'agentProfile'|'library'|'schedules'>};
type Manifest={version:1;pages:Partial<Record<SnapshotKey,DesktopSnapshot>>};
let manifest:Manifest={version:1,pages:{}},selection:SnapshotKey='bot',revision=0;
const listeners=new Set<()=>void>();
const emit=()=>{revision++;for(const listener of listeners)listener();};
export const subscribeSnapshots=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const snapshotRevision=()=>revision;
export const selectedSnapshot=()=>({key:selection,snapshot:manifest.pages[selection]});
export function selectSnapshot(key:SnapshotKey){selection=key;emit();return manifest.pages[key];}
export async function loadSnapshots(){
 try{const response=await fetch('/__musebench_snapshots/manifest.json',{cache:'no-store'});if(!response.ok)return;const value=await response.json();if(value.version!==1||!value.pages)return;
  const pages:Manifest['pages']={};
  for(const key of ['bot','ideas','goals','chat','media','artifacts','scheduled','vibes','search'] as const){const item=value.pages[key];if(item&&item.file===`${key}.png`&&Number.isFinite(item.width)&&Number.isFinite(item.height)&&item.width>0&&item.height>0&&typeof item.capturedAt==='string')pages[key]=item;}
  manifest={version:1,pages};emit();
 }catch{/* A clean checkout has no private desktop captures. */}
}
