import type {RuntimeStatus} from '../runtime/status.mjs';
export interface WorkIdentity {run:string|null;turn:string|null;session:string|null;pendingKind:string|null;pendingId:string|null;pendingRevision:number|null;compaction:string|null;steering:string|null;children:(string|null)[][];}
export function workIdentity(value?:unknown):WorkIdentity;
export function workLabel(status:RuntimeStatus,identity:WorkIdentity):string;
