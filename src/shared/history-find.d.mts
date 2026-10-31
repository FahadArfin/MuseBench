import type {HistoryFindInput,HistoryFindResult,Message} from './types';
export function validateHistoryFind(input:HistoryFindInput):void;
export function literalOccurrences(text:string,query:string):Generator<{offset:number;length:number}>;
export function findPreviewHistory(messages:Message[],input:HistoryFindInput):HistoryFindResult;
