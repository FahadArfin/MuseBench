import type {Message,WorkRun} from './types';
export const RECENT_CONTEXT_LIMIT:number;
export const RECENT_CONTEXT_COUNTS:number[];
export interface RecentEntry {id:string;role:'user'|'assistant';text:string;outcome:string;truncated:boolean;}
export interface RecentCapsule {version:1;projectId:string;taskId:string;sessionId:string;compaction:{itemId:string;revision:number};count:number;section:string;sources:{id:string;hash:string}[];sourceDigest:string;digest:string;}
export interface RecentContextState {count:number;autoPrepare:boolean;prepared:RecentCapsule|null;stagedDigest:string|null;}
export function recentSourceRecord(message:Message,runs?:WorkRun[]):RecentEntry;
export function selectRecentContext(messages:Message[],count?:number,runs?:WorkRun[]):{version:number;entries:RecentEntry[];section:string;sourceIds:string[]};
export function validRecentSection(section:unknown):boolean;
