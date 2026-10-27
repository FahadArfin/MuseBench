import type {Check} from './types';
export function validateCheckScripts(value:unknown):string[];
export function missingChecks(task:{check?:Check|null;checkReceipts?:Check[]},revision:string,scripts:string[]):string[];
export interface Diagnostic {path:string;line:number;column:number;severity:string;message:string;}
export function checkDiagnostics(log:string):Diagnostic[];
