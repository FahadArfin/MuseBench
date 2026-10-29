export interface NativeHook {id:string;event:'UserPromptSubmit'|'Stop';command:string;timeout:number;enabled:boolean}
export const HOOK_EVENTS:readonly NativeHook['event'][];
export function validateHooks(items:unknown):NativeHook[];
export function nativeHooks(items:unknown,platform:'win32'|'linux'|'darwin'):Record<string,unknown>;
