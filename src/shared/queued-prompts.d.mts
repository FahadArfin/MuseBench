import type {Task,QueuedPrompt} from './types';
export function queuedSteeringUnavailable(item:QueuedPrompt):string|null;
export function isNativeRequestPause(runtime:unknown):boolean;
export function moveQueuedPrompt(task:Task|null, action:{taskId:string;id:string;beforeId:string|null}):QueuedPrompt[];
export function queuedPrompt(task:Task|null,action:{taskId:string;id:string;expectedRevision:number},options?:{allowUnknown?:boolean}):QueuedPrompt;
export function editQueuedPrompt(task:Task|null,action:{taskId:string;id:string;expectedRevision:number;text:string;mode:'chat'|'plan';annotations?:import('./browser-annotations.mjs').BrowserAnnotation[]}):QueuedPrompt;
export function queuedSideChatPrompt(task:Task|null|undefined,action:{taskId:string;id:string;expectedRevision:number}):QueuedPrompt;
