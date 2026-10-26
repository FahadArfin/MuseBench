export interface SkillReceipt {id:string;scope:string;bytes:number;total:number;truncated:boolean;callId:string;runId:string;}
export function skillReceipt(payload:unknown):SkillReceipt|null;
export function restoreSkillReceipts(value:unknown):SkillReceipt[];
