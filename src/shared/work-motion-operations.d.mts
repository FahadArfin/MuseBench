import type {WorkDocument,SceneNode} from './work-document-types';
import type {MotionData,MotionTrack,MotionEasing,MotionProperty,MotionScene} from './work-motion-schema.mjs';
export type MotionOperation={type:'replaceData';data:MotionData}|{type:'settings';width?:number;height?:number;fps?:number;durationTicks?:number;loop?:boolean}|{type:'sceneDuration';sceneId:string;durationTicks:number}|{type:'replaceNodes';sceneId:string;nodes:SceneNode[]}|{type:'setKeyframe';sceneId:string;nodeId:string;property:MotionProperty;tick:number;value:number;easing?:MotionEasing;id?:string}|{type:'moveKeyframe';sceneId:string;trackId:string;keyframeId:string;tick:number}|{type:'deleteKeyframe';sceneId:string;trackId:string;keyframeId:string}|{type:'preset';sceneId:string;nodeId:string;preset:'fade'|'slide'|'scale';durationTicks?:number};
export function applyMotionOperation(input:MotionData,operation:MotionOperation):MotionData;
export function interpolateMotionTrack(track:MotionTrack,tick:number,base:number):number;
export function sampleMotionScene(data:MotionData,tick:number,options?:{loop?:boolean}):MotionScene&{width:number;height:number;localTick:number};
export function motionFrameTimes(data:MotionData):number[];
export function convertToMotionData(source:unknown,options?:{surfaceId?:string;makeId?:()=>string;durationTicks?:number}):MotionData;
export function createMotionDocumentFromSource(source:any,options?:{makeId?:()=>string;title?:string;now?:string;surfaceId?:string;durationTicks?:number}):WorkDocument;
