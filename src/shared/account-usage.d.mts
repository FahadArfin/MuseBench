export interface AccountUsage {windows:{label:string;remainingPercent:number;resetsAt?:string}[];billing?:{spent:number;currency:string;period:string;alertLimit?:number;source:string}|null;checkedAt?:string;simulation?:boolean}
export function normalizeAllowance(value:unknown):AccountUsage;
export function parseBillingText(text:string):AccountUsage['billing'];
export function usageHeadline(usage?:AccountUsage|null):string;
export function money(value:number,currency?:string):string;
