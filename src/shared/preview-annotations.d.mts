export interface PreviewPoint {projectId:string;taskId:string;frameName:string;x:number;y:number}
import type {BrowserAnnotation} from './browser-annotations.mjs';
export type PreviewStyleProperty='color'|'backgroundColor'|'opacity'|'fontFamily'|'fontSize'|'fontWeight'|'lineHeight'|'letterSpacing'|'padding'|'margin'|'borderRadius'|'width'|'height';
export type PreviewStyles=Partial<Record<PreviewStyleProperty,string>>;
export interface PreviewTarget {selector:string;tag:string;title:string;text:string;rect:{x:number;y:number;width:number;height:number};styles?:PreviewStyles}
export interface PreviewSelection {token:string;projectId:string;taskId:string;page:string;target:PreviewTarget}
export interface PreviewContext {key:unknown;url:string;projectId:string;taskId:string}
export interface PreviewAnnotations {
 inspect(input:PreviewPoint):Promise<PreviewSelection>;
 feedback(input:{token:string;note:string;styleChanges?:PreviewStyles}):Promise<{text:string;annotation:BrowserAnnotation}>;
 discard(token:string):void;
 invalidate():void;
}
export function validatePreviewPoint(input:unknown):PreviewPoint;
export function previewPageUrl(value:string):string;
export function normalizePreviewTarget(value:unknown):PreviewTarget;
export const PREVIEW_STYLE_PROPERTIES:PreviewStyleProperty[];
export function normalizePreviewStyles(value:unknown):PreviewStyles;
export function createPreviewAnnotations(options:{resolve:(input:PreviewPoint)=>PreviewContext;read:(context:PreviewContext,point:{x:number;y:number}|{selector:string})=>Promise<unknown>;onInvalidate?:()=>void;now?:()=>number;token?:()=>string;readTimeoutMs?:number}):PreviewAnnotations;
