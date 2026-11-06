import type {VideoCaption} from './work-video-schema.mjs';
export const DEFAULT_CAPTION_STYLE:Readonly<VideoCaption['style']>;
export function wrapCaptionText(text:string,settings:{width:number;fontSize:number}):string;
export function createCaption(input?:{id?:string;start?:number;end?:number;text?:string;style?:Partial<VideoCaption['style']>}):VideoCaption;
export function importSubtitles(text:string,options?:{timebase?:number;offset?:number}):VideoCaption[];
export function exportSubtitles(captions:VideoCaption[],options?:{timebase?:number;format?:'srt'|'vtt'}):string;
export type CaptionOperation={type:'add';caption:Parameters<typeof createCaption>[0]}|{type:'offset';ticks:number}|{type:'merge';ids:string[]}|{type:'delete';id:string}|{type:'update';id:string;patch:Partial<Omit<VideoCaption,'id'|'style'>>&{style?:Partial<VideoCaption['style']>}}|{type:'split';id:string;tick:number;newId:string};
export function applyCaptionOperation(captions:VideoCaption[],operation:CaptionOperation):VideoCaption[];
