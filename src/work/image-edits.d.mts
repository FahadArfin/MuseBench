import type {ImageSourceMask,GeneratedAsset} from '../shared/work-provider-types';
export interface ImageTransformNode {id:string;type?:string;assetId?:string;x:number;y:number;width:number;height:number;rotation?:number;image?:{crop?:{x:number;y:number;width:number;height:number};flipX?:boolean;flipY?:boolean;[key:string]:unknown};}
export function canvasPointToSource(point:{x:number;y:number},node:ImageTransformNode,source:{width:number;height:number}):{x:number;y:number}|null;
export function createImageMask(input:{sourceAssetId:string;width:number;height:number;feather?:number;inverted?:boolean}):ImageSourceMask;
export function addMaskStroke(mask:ImageSourceMask,stroke:ImageSourceMask['strokes'][number]):ImageSourceMask;
export function maskAlphaAt(mask:ImageSourceMask,point:{x:number;y:number}):number;
export interface ImageEditProposal {itemId:string;revision:number;surfaceId:string;nodeId:string;sourceAssetId:string;status:string;asset:GeneratedAsset;}
export function acceptImageEdit<T>(document:T,proposal:ImageEditProposal,options:{nodeId:string}):T;
