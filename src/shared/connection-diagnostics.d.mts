import type {RuntimeState} from './types';
import type {CustomizeState} from './customize-types';
export interface DiagnosticRow {id:string;label:string;value:string;detail:string;}
export function connectionDiagnostics(runtime?:Partial<RuntimeState>):DiagnosticRow[];
export function extensionDiagnostics(state?:Partial<CustomizeState>):DiagnosticRow[];
export function diagnosticReport(runtime?:Partial<RuntimeState>):string;
