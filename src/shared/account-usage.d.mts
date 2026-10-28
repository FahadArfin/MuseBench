export interface AccountUsage {windows:{label:string;remainingPercent:number;resetsAt?:string}[];tier?:string;observedAt?:string;billingSource?:'account'|'api'|'unknown';billingMatched?:boolean;billing?:{accountId?:string|null;spent?:number;currentBalance?:number;freeCredits?:number;paymentThreshold?:number;alertStatus?:'not-set';currency:string;period:string;alertLimit?:number;source:string}|null;checkedAt?:string;simulation?:boolean}
export function normalizeAllowance(value:unknown):AccountUsage;
export function parseBillingText(text:string):AccountUsage['billing'];
export function usageHeadline(usage?:AccountUsage|null):string;
export function money(value:number,currency?:string):string;
