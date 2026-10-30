import type {RunOptions} from './types';
export interface CodeScheduleSpec {title:string;projectId:string;prompt:string;startAt:string;intervalMinutes:number;maxRuns:number;runOptions:RunOptions;fullAccess:boolean}
export interface CodeScheduledRun {id:string;taskId:string|null;status:'starting'|'running'|'waiting'|'completed'|'failed'|'stopped'|'uncertain'|'timed-out'|'skipped';dueAt:string;startedAt:string|null;endedAt:string|null;reason:string|null;deadlineAt?:number}
export interface CodeSchedule {id:string;revision:number;spec:CodeScheduleSpec;root:string;enabled:boolean;nextAt:string|null;attempts:number;active:CodeScheduledRun|null;history:CodeScheduledRun[];outcomes:number;historyTruncated:boolean;reason:string|null;createdAt:string}
export type CodeScheduleAction={type:'codeSchedule';operation:'save';id?:string;expectedRevision?:number;spec:CodeScheduleSpec}|{type:'codeSchedule';operation:'enable';id:string;expectedRevision:number;confirmed:true}|{type:'codeSchedule';operation:'pause'|'remove';id:string;expectedRevision:number}|{type:'codeSchedule';operation:'stop';id:string;runId:string};
export function validateScheduleSpec(value:unknown):CodeScheduleSpec;
export function validateScheduleAction(value:unknown):CodeScheduleAction;
export function nextOccurrence(due:number,intervalMinutes:number,now:number):number|null;
