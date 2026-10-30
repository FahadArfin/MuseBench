export interface ContextCompaction {sessionId:string;itemId:string;turnId:string;revision:number;trigger:'auto'|'manual'|'unknown';status:'in-progress'|'compacted'|'noop'|'failed'|'cancelled'|'unknown';source:'live'|'restored';at:string;tokensBefore?:number;tokensAfter?:number;summarizedThrough?:string;reason?:string}
export function observeCompaction(item:unknown,options:{sessionId:string;source?:'live'|'restored';at?:string}):ContextCompaction|null;
export function mergeCompactionHistory(previous:unknown,incoming:unknown):ContextCompaction[];
export function interruptCompactionHistory(history:unknown):ContextCompaction[];
