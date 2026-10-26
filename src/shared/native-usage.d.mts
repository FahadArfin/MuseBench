export interface NativeUsage {inputTokens:number;cachedTokens:number;outputTokens:number;reasoningTokens:number;calls:number;completedCalls:number;failedCalls:number;cancelledCalls:number;childrenIncluded:boolean|null;reportedRuns:number;totalRuns:number;}
export function nativeUsage(payload:unknown):Omit<NativeUsage,'reportedRuns'|'totalRuns'>|null;
export function combineUsage(runs:(Omit<NativeUsage,'reportedRuns'|'totalRuns'>|null)[]):NativeUsage|null;
export function restoreUsage(value:unknown):NativeUsage|null;
