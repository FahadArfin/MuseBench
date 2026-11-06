import type {SceneNode} from './work-document-types';
export type MotionProperty='x'|'y'|'scaleX'|'scaleY'|'rotation'|'opacity';
export type MotionEasing='linear'|'ease-in'|'ease-out'|'ease-in-out'|'step';
export interface MotionKeyframe{id:string;tick:number;value:number;easing:MotionEasing;}
export interface MotionTrack{id:string;nodeId:string;property:MotionProperty;keyframes:MotionKeyframe[];}
export interface MotionScene{id:string;sourceId?:string;name:string;startTicks:number;durationTicks:number;background:string;nodes:(SceneNode&{sourceId?:string})[];tracks:MotionTrack[];}
export interface MotionData{width:number;height:number;timebase:1000;durationTicks:number;fps:number;loop:boolean;scenes:MotionScene[];}
export const MOTION_PROPERTIES:readonly MotionProperty[];
export const MOTION_EASINGS:readonly MotionEasing[];
export function createMotionData(options?:{makeId?:()=>string}):MotionData;
export function validateMotionData(value:unknown,context?:{assetIds?:Set<string>;ids?:Set<string>}):MotionData;
