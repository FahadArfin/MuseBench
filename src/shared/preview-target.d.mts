import type {PreviewTarget} from './preview-annotations.mjs';
export function capturePreviewTarget(doc:Document,request:{x:number;y:number}|{selector:string}):PreviewTarget|null;
