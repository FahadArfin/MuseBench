import type {CodeImage} from './types';
export interface SideChatState {revision?:number;taskId:string|null;status:string;busy:boolean;error:string|null;messages:{id:string;role:'user'|'assistant';text:string}[];}
export type SideChatCommand={type:'open'|'status'|'stop'|'close';taskId:string}|{type:'send';taskId:string;text:string};
export interface ChatBrowserCapture {token:string;page:string;imageDataUrl:string;width:number;height:number;documentId:string;}
export interface ChatBrowserState {revision?:number;taskId:string|null;url:string;title:string;loading:boolean;error:string|null;canGoBack:boolean;canGoForward:boolean;native:boolean;controlEnabled?:boolean;visible?:boolean;documentId?:string;capture?:ChatBrowserCapture;selection?:import('./preview-annotations.mjs').PreviewSelection;annotation?:import('./browser-annotations.mjs').BrowserAnnotation;text?:string;}
export interface ChatBrowserCommand {type:'open'|'navigate'|'back'|'forward'|'reload'|'bounds'|'close'|'status'|'control'|'capture'|'inspect'|'feedback'|'discard';taskId:string;url?:string;rect?:{x:number;y:number;width:number;height:number};visible?:boolean;enabled?:boolean;token?:string;x?:number;y?:number;note?:string;styleChanges?:Record<string,string>;}
export interface SessionMediaItem {id:string;kind:'uploaded'|'created'|'modified';name:string;image?:CodeImage;path?:string;hash?:string;runId?:string;}
export interface SessionMediaCommand {type:'list'|'read';taskId:string;id?:string;thumbnail?:boolean;}
export interface SessionMediaResult {items?:SessionMediaItem[];omitted?:number;dataUrl?:string;}
