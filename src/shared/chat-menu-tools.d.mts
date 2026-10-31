import type {Message,Task} from './types';
export function chatLink(id:string):string;
export function chatLinkTask(value:string):string|null;
export function chatMarkdown(task:Pick<Task,'title'|'request'>&Partial<Task>,messages:(Partial<Message>&{role:string;text:string;captureTruncated?:boolean})[]):string;
