import type {CodeImage} from './types';
export interface SideChatState {revision?:number;taskId:string|null;status:string;busy:boolean;error:string|null;messages:{id:string;role:'user'|'assistant';text:string}[];}
export type SideChatCommand={type:'open'|'status'|'stop'|'close';taskId:string}|{type:'send';taskId:string;text:string};
export interface ChatBrowserState {revision?:number;taskId:string|null;url:string;title:string;loading:boolean;error:string|null;canGoBack:boolean;canGoForward:boolean;native:boolean;}
export interface ChatBrowserCommand {type:'open'|'navigate'|'back'|'forward'|'reload'|'bounds'|'close'|'status';taskId:string;url?:string;rect?:{x:number;y:number;width:number;height:number};visible?:boolean;}
export interface SessionMediaItem {id:string;kind:'uploaded'|'created'|'modified';name:string;image?:CodeImage;path?:string;hash?:string;runId?:string;}
export interface SessionMediaCommand {type:'list'|'read';taskId:string;id?:string;thumbnail?:boolean;}
export interface SessionMediaResult {items?:SessionMediaItem[];omitted?:number;dataUrl?:string;}
