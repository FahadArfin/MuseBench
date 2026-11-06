import type {GeneratedAsset,WorkProviderJob} from '../shared/work-provider-types';
import type {VideoCaption} from '../shared/work-video-schema.mjs';
export function inspectGeneratedMedia(asset:GeneratedAsset&{hasAudio?:boolean},options:{kind:'audio'|'video';targetDuration?:number;requireAudio?:boolean}):{kind:string;duration:number;durationMismatch:boolean;deltaSeconds:number;audioUnverified:boolean};
export function acceptGeneratedMedia<T>(document:T,job:WorkProviderJob,options:{assetId:string;trackId:string;clipId:string;start?:number}):T;
export interface GeneratedInsertOptions {surfaceId?:string;nodeId?:string;trackId?:string;clipId?:string;start?:number;}
export function insertGeneratedAsset<T>(document:T,asset:GeneratedAsset,options?:GeneratedInsertOptions):T;
export function acceptGeneratedAsset<T>(document:T,job:WorkProviderJob,options:GeneratedInsertOptions&{assetId:string}):T;
export function transcriptToCaptions(transcript:{text:string;start:number;end:number}[],options:{timebase:number;offset?:number;idPrefix?:string}):VideoCaption[];
