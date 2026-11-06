import type {VideoData} from './work-video-schema.mjs';
import type {MotionData} from './work-motion-schema.mjs';
import type {StructuredDocumentData} from './work-document-blocks.mjs';
/** Application-owned document model; independent of rendering libraries. */
export type WorkDocumentKind='image'|'design'|'slides'|'video'|'motion'|'document';
export interface WorkSourceMask {version:1;sourceAssetId:string;width:number;height:number;inverted:boolean;feather:number;strokes:{mode:'brush'|'erase';radius:number;points:{x:number;y:number}[]}[];}
export interface GeneratedAssetOrigin {type:'generated';providerId:string;model:string;requestId:string;prompt:string;referenceAssetIds:string[];settings:{count:number;size?:string;aspect?:string;voice?:string;language?:string;speed?:number;duration?:number;mask?:WorkSourceMask};sourceItemId:string;sourceRevision:number;}
export interface WorkAsset {id:string;hash:string;name:string;mediaType:string;bytes:number;storageRef:string;width?:number;height?:number;duration?:number;origin:'import'|'generated'|'converted'|'template'|GeneratedAssetOrigin;}
export interface SceneStyle {fill?:string;stroke?:string;strokeWidth?:number;fontFamily?:string;fontSize?:number;fontWeight?:number|'normal'|'bold';fontStyle?:'normal'|'italic';textAlign?:'left'|'center'|'right'|'justify';color?:string;}
export interface SceneChart {type:'bar'|'line';labels:string[];values:number[];title?:string;}
export interface SceneTable {columns:string[];rows:(string|number)[][];}
export interface ImageAdjustments {crop?:{x:number;y:number;width:number;height:number};brightness?:number;contrast?:number;saturation?:number;flipX?:boolean;flipY?:boolean;mask?:'none'|'ellipse'|'rounded';fit?:'cover'|'contain';}
export interface SceneNode {id:string;type:'text'|'shape'|'image'|'chart'|'table';x:number;y:number;width:number;height:number;rotation:number;opacity:number;locked:boolean;hidden:boolean;groupId?:string;text?:string;assetId?:string;style?:SceneStyle;shape?:'rect'|'ellipse'|'line';chart?:SceneChart;table?:SceneTable;image?:ImageAdjustments;}
export interface WorkArtboard {id:string;name:string;width:number;height:number;background:string;nodes:SceneNode[];margin?:number;safeArea?:number;}
export interface DesignData {artboards:WorkArtboard[];activeArtboardId?:string;}
export type ImageData=DesignData;
export interface SlideData {width:number;height:number;slides:{id:string;name:string;background:string;nodes:SceneNode[];notes:string}[];theme?:{name:string;fontFamily:string;accent:string;background:string;color:string};}
export interface WorkDocumentEnvelope<K extends WorkDocumentKind,D> {version:2;id:string;kind:K;title:string;revision:number;createdAt:string;updatedAt:string;assets:WorkAsset[];data:D;}
export type DesignDocument=WorkDocumentEnvelope<'design',DesignData>;
export type ImageDocument=WorkDocumentEnvelope<'image',ImageData>;
export type SlidesDocument=WorkDocumentEnvelope<'slides',SlideData>;
export type VideoDocument=WorkDocumentEnvelope<'video',VideoData>;
export type MotionDocument=WorkDocumentEnvelope<'motion',MotionData>;
export type StructuredWorkDocument=WorkDocumentEnvelope<'document',StructuredDocumentData>;
export type WorkDocument=DesignDocument|ImageDocument|SlidesDocument|VideoDocument|MotionDocument|StructuredWorkDocument;
export interface WorkDocumentCreateOptions {id?:string;title?:string;now?:string;data?:unknown;assets?:WorkAsset[];}
