export interface WorkspaceBatchSummary {version:1;calls:Array<{id:string;operation:string;status:'completed'|'failed';count:number|null;path:string|null;error:string|null;truncated:boolean}>}
export function normalizeWorkspaceBatchSummary(value:unknown):WorkspaceBatchSummary|null;
export function workspaceBatchSummary(tool:string,output:string,truncated?:boolean):WorkspaceBatchSummary|null;
export function createWorkspaceToolActivity():{reset():void;observe(item:unknown,ownedTurns?:string[]):boolean;finish(status:string):void;snapshot():{scope:string;items:unknown[];truncated:boolean}};
