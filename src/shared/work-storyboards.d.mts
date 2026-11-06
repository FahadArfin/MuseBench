import type {VideoData,VideoStoryScene} from './work-video-schema.mjs';
export function validateStoryboard(value:unknown):VideoStoryScene[];
export function storyboardDuration(scenes:VideoStoryScene[],timebase?:number):number;
export function storyboardMissingMedia(scenes:VideoStoryScene[],assets?:{id:string;mediaType:string}[]):string[];
export type StoryboardOperation={type:'add';scene:VideoStoryScene}|{type:'delete';id:string}|{type:'move';id:string;index:number}|{type:'update';id:string;patch:Partial<Omit<VideoStoryScene,'id'>>};
export function applyStoryboardOperation(scenes:VideoStoryScene[],operation:StoryboardOperation):VideoStoryScene[];
export function storyboardToTimeline(data:VideoData,options?:{assets?:{id:string;mediaType:string}[]}):VideoData;
