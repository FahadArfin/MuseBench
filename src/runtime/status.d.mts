export interface RuntimeStatus {status:string|null;operationBusy:boolean;childrenBusy:boolean;cleanup:string|null;pending:boolean;}
export function projectRuntimeStatus(state:unknown):RuntimeStatus;
export function readRuntimeStatus(runtime:unknown):RuntimeStatus;
export function runtimeStatusBusy(state:RuntimeStatus):boolean;
