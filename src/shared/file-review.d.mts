export interface FileReviewInspection {taskId:string;scope:'run'|'all';runId?:string;}
export interface FileReviewRead extends FileReviewInspection {path:string;revision:string;cursor?:string;limit?:number;}
export interface FileReviewHistory {runId:string;capturedAt:string;status:'added'|'modified'|'deleted';}
export interface FileReviewFile {path:string;status:'added'|'modified'|'deleted'|'unchanged';beforeHash:string|null;afterHash:string|null;beforeSize?:number;afterSize?:number;binary:boolean;available:boolean;reason?:string;history:FileReviewHistory[];countsKnown:boolean;additions?:number;deletions?:number;}
export interface FileReviewView extends FileReviewInspection {revision:string;status:'complete'|'pending'|'unavailable';reason?:string;files:FileReviewFile[];capturedAt?:string;}
export interface FileReviewRow {kind:'context'|'added'|'removed'|'hunk';oldLine:number|null;newLine:number|null;text:string;noNewline?:boolean;continued?:boolean;ending?:boolean;}
export interface FileReviewPage {path:string;revision:string;status:'complete'|'unavailable';reason?:string;rows:FileReviewRow[];nextCursor?:string;totalRows:number;additions:number;deletions:number;approximate:false;}
export function validateFileReviewInspection(value:unknown):FileReviewInspection;
export function validateFileReviewRead(value:unknown):FileReviewRead;
