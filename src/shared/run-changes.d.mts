import type {FileChange} from './types';
export interface RunChangeFile extends FileChange {beforeHash:string|null;afterHash:string|null;omitted:boolean;stale:boolean;reviewed:boolean;}
export interface RunChangeView {taskId:string;runId:string;status:'pending'|'complete'|'unavailable';revision?:string;reason?:string;createdAt?:string;capturedAt?:string;files:RunChangeFile[];omittedFiles:number;sample?:boolean;}
export interface RunInspection {taskId:string;runId:string;}
export interface RunFileReview extends RunInspection {type:'setRunFileReviewed';revision:string;path:string;reviewed:boolean;}
export interface RunFeedback extends RunInspection {revision:string;path:string;side:'before'|'after';start:number;end:number;note:string;}
export function validateRunInspection(value:unknown):RunInspection;
export function validateRunReview(value:unknown):RunFileReview;
export function validateRunFeedback(value:unknown):RunFeedback;
export function appendReviewFeedback(draft:string,feedback:string):string;
