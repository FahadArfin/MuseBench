import type {VideoData,VideoClip,VideoTrack} from './work-video-schema.mjs';
export type VideoOperation = {type:'addTrack';track:VideoTrack}|{type:'track';trackId:string;patch:Partial<Pick<VideoTrack,'name'|'gain'|'muted'|'locked'>>}|{type:'addClip';trackId:string;clip:VideoClip}|{type:'project';patch:Partial<Pick<VideoData,'width'|'height'|'timebase'|'frameRate'>>}|{type:'replaceMedia';clipId:string;assetId:string;kind:'video'|'audio'|'image'}|{type:'delete';clipId:string;ripple?:boolean}|{type:'split';clipId:string;tick:number;id:string}|{type:'trim';clipId:string;start:number;end:number;ripple?:boolean}|{type:'speed';clipId:string;speed:number;ripple?:boolean}|{type:'move';clipId:string;start:number;trackId?:string}|{type:'duplicate';clipId:string;id:string}|{type:'update';clipId:string;patch:Partial<Pick<VideoClip,'text'|'duration'>> & {transform?:Partial<VideoClip['transform']>;audio?:Partial<VideoClip['audio']>;transition?:Partial<VideoClip['transition']>}};
export function createVideoClip(input?:Partial<VideoClip>):VideoClip;
export function videoDuration(data:VideoData):number;
export function frameTick(data:VideoData,tick:number):number;
export function snapTick(data:VideoData,tick:number,options?:{excludeIds?:string[];threshold?:number}):number;
export function applyVideoOperation(data:VideoData,operation:VideoOperation):VideoData;
export function audioGainAtTick(data:VideoData,track:VideoTrack,clip:VideoClip,tick:number):number;
export function sampleVideoAtTick(data:VideoData,tick:number):{trackId:string;trackIndex:number;track:VideoTrack;clip:VideoClip;sourceTick:number;opacity:number;gain:number}[];
