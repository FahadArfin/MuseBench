import type {WorkAsset} from './work-document-types';
export type WorkJobState='queued'|'running'|'cancelling'|'completed'|'failed'|'cancelled'|'interrupted';
export type WorkStudioExportFormat='png'|'jpg'|'jpeg'|'webp'|'svg'|'pdf'|'pptx'|'docx'|'mp4'|'gif'|'srt'|'vtt'|'html'|'json'|'md'|'csv'|'zip';
export interface WorkExportSettings {width?:number;height?:number;quality?:number|'draft'|'balanced'|'high';transparent?:boolean;range?:string|{start:number;end:number};dpi?:number;bleed?:number;margin?:number;cropMarks?:boolean;burnCaptions?:boolean;fps?:number;artboardId?:string;[key:string]:unknown;}
export interface WorkRenderedFont {name:string;sha256:string;coveredCodepoints:string[];coveredCodepointCount:number;}
export interface WorkJobReceipt {itemId:string;revision:number;format:WorkStudioExportFormat;settings:WorkExportSettings;sourceAssetHashes:string[];bytes?:number;hash?:string;toolVersion:string;completedAt:string;fonts?:string[];renderedFonts?:WorkRenderedFont[];warnings?:string[];editable?:boolean;independentOfficeVerified?:boolean;}
export interface WorkJob {id:string;itemId:string;revision:number;kind:string;format:WorkStudioExportFormat;settings:WorkExportSettings;state:WorkJobState;progress:number;message?:string;error?:string;createdAt:string;updatedAt:string;startedAt?:string;completedAt?:string;remote:boolean;requestId?:string;uncertainOutcome?:boolean;retryOf?:string;receipt?:WorkJobReceipt;}
export interface WorkManagedAsset extends WorkAsset {missing?:boolean;usageCount?:number;deletedAt?:string;favorite?:boolean;addedAt?:string;lastUsedAt?:string;}
export interface WorkExportCapability {format:WorkStudioExportFormat;label:string;available:boolean;reason?:string;warnings?:string[];}
