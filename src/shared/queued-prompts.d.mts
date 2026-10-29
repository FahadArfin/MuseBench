import type {Task,QueuedPrompt} from './types';
export function moveQueuedPrompt(task:Task|null, action:{taskId:string;id:string;beforeId:string|null}):QueuedPrompt[];
export function queuedPrompt(task:Task|null,action:{taskId:string;id:string;expectedRevision:number},options?:{allowUnknown?:boolean}):QueuedPrompt;
export function editQueuedPrompt(task:Task|null,action:{taskId:string;id:string;expectedRevision:number;text:string;mode:'chat'|'plan'}):QueuedPrompt;
