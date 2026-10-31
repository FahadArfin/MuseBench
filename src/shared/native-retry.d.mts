export interface NativeRetry {kind:'model'|'turn';attempt:number;nextAttempt:number;maxAttempts:number;retryDelayMs:number}
export function observeNativeRetry(method:unknown,params:unknown):NativeRetry|null;
export function nativeRetryText(value:unknown):string|null;
