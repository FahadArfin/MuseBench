import type {Task,QueuedPrompt} from './types';
export function moveQueuedPrompt(task:Task|null, action:{taskId:string;id:string;beforeId:string|null}):QueuedPrompt[];
