import type {ActivityItem,ShellResult,WorkStatus} from './types';
export type WorkLogCategory='command'|'edit'|'read'|'search'|'webSearch'|'webRead'|'tool'|'agent';
export interface WorkLogItem extends ActivityItem {category:WorkLogCategory;subject:string;shellResult?:ShellResult;}
export interface WorkLogGroup {id:string;items:WorkLogItem[];status:WorkStatus;label:string;}
export function toolCategory(tool:string):WorkLogCategory;
export function toolSubject(tool:string,args:unknown):string;
export function workLogItemLabel(item:ActivityItem&{category?:WorkLogCategory}):string;
export function groupWorkLog(activities?:ActivityItem[],shellResults?:ShellResult[]):WorkLogGroup[];
