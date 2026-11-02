import type {PreviewKind} from './file-preview-types';
export function previewKind(value?:string):PreviewKind|null;
export function localPreviewPath(value:unknown,root?:string):string|null;
export function linkedPreviewFiles(text:string,root?:string):string[];
