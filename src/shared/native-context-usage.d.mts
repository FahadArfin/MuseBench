export interface NativeContextUsage {sessionId:string;viewCursor:string;source:'live'|'restored';observedAt:string;usedTokens:number;windowTokens:number|null;pressure:'normal'|'warning'|'blocked'|'unknown';connected:boolean}
export function normalizeContextUsage(value:unknown,binding?:{sessionId:string;viewCursor:string;source:'live'|'restored';observedAt:string}):NativeContextUsage|null;
export function restoreContextUsage(value:unknown):NativeContextUsage|null;
export function contextUsagePresentation(value:unknown):{label:string;percentage:number|null;meter:number|null};
export function validContextSourceRange(value:unknown):boolean;
