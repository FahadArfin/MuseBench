import type {PreviewTarget,PreviewStyleProperty} from './preview-annotations.mjs';
export type BrowserStyleSnapshot=Record<PreviewStyleProperty,string>;
export interface BrowserAnnotation {id:string;page:string;target:PreviewTarget;note:string;styleChanges?:Partial<BrowserStyleSnapshot>}
export const BROWSER_ANNOTATION_LIMIT:number;
export const BROWSER_STYLE_PROPERTIES:readonly PreviewStyleProperty[];
export function validateBrowserAnnotations(input?:unknown):BrowserAnnotation[];
export function browserAnnotationsText(input?:unknown):string;
