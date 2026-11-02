export type PreviewKind='html'|'markdown'|'pdf'|'docx'|'pptx'|'text'|'image';
export interface PreviewFile {token:string;taskId:string;path:string;name:string;kind:PreviewKind;size:number;revision:string;rawUrl:string;resourceBaseUrl:string;source?:string;sourceTruncated?:boolean;warnings?:string[];}
export interface PreviewEntry {name:string;path:string;kind:PreviewKind|'directory';}
export interface PreviewList {directory:string;entries:PreviewEntry[];nextOffset?:number;outputs:PreviewEntry[];}
export interface FileComment {page:number;x:number;y:number;note:string;quote?:string;}
export type FilePreviewCommand={type:'list';taskId:string;directory?:string;offset?:number}|{type:'open';taskId:string;path:string}|{type:'close';taskId:string;token?:string}|{type:'feedback';taskId:string;token:string;comments:FileComment[]};
export type FilePreviewResult=PreviewFile|PreviewList|{closed:true}|{taskId:string;text:string};
