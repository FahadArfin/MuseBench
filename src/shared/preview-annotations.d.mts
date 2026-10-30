export interface PreviewPoint {projectId:string;taskId:string;frameName:string;x:number;y:number}
export interface PreviewTarget {selector:string;tag:string;title:string;text:string;rect:{x:number;y:number;width:number;height:number}}
export interface PreviewSelection {token:string;projectId:string;taskId:string;page:string;target:PreviewTarget}
export interface PreviewContext {key:unknown;url:string;projectId:string;taskId:string}
export interface PreviewAnnotations {
 inspect(input:PreviewPoint):Promise<PreviewSelection>;
 feedback(input:{token:string;note:string}):Promise<{text:string}>;
 discard(token:string):void;
 invalidate():void;
}
export function validatePreviewPoint(input:unknown):PreviewPoint;
export function previewPageUrl(value:string):string;
export function normalizePreviewTarget(value:unknown):PreviewTarget;
export function createPreviewAnnotations(options:{resolve:(input:PreviewPoint)=>PreviewContext;read:(context:PreviewContext,point:{x:number;y:number}|{selector:string})=>Promise<unknown>;onInvalidate?:()=>void;now?:()=>number;token?:()=>string;readTimeoutMs?:number}):PreviewAnnotations;
