import type {AccountUsage} from './account-usage.mjs';
export const USAGE_REFRESH_MS:number;
export interface ResetWindow {label:string;resetsAt:string|null;remainingMs:number|null;status:'unknown'|'awaiting'|'scheduled'}
export function subscriptionResets(usage?:AccountUsage|null,now?:number):{kind:'api'|'unavailable'|'subscription';windows:ResetWindow[]};
export function nextUsageRefreshDelay(usage?:AccountUsage|null,now?:number):number;
export function formatResetCountdown(remainingMs:number|null):string;
