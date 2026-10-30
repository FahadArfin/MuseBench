import type {Task,Project,ContextFile,ContextSummary} from './types';
export const CONTEXT_LIMIT:number;
export const FILE_CONTEXT_LIMIT:number;
export function fileReferences(value?:unknown):ContextFile[];
export function restoreSourceSnapshots(value:unknown):(ContextFile&{text:string})[];
export function composeChatContext(input:{task?:Partial<Task>|null;project?:Partial<Project>|null;memories?:string;text?:string;attachments?:(ContextFile&{text:string})[];history?:boolean;nativeSession?:boolean;recentContext?:import('./recent-context.mjs').RecentCapsule|null}):ContextSummary&{instructionSnapshot:import('./types').InstructionSnapshot;prompt:string;historyMode:'native'|'replay'|'connection';includedSources:{id:string;role:string;truncated:boolean}[]};
