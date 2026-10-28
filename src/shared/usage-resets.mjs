export const USAGE_REFRESH_MS=5*60*1000;

// Project Meta's observations only. Passing a deadline does not refill allowance.
export function subscriptionResets(usage,now=Date.now()){
 if(usage?.billingSource==='api')return{kind:'api',windows:[]};
 if(usage?.billingSource==='unknown'||!usage?.windows?.length)return{kind:'unavailable',windows:[]};
 return{kind:'subscription',windows:usage.windows.map(window=>{
  const reset=typeof window.resetsAt==='string'?Date.parse(window.resetsAt):NaN;
  const known=Number.isFinite(reset)&&reset>0;
  return{label:window.label,resetsAt:known?window.resetsAt:null,remainingMs:known?Math.max(0,reset-now):null,status:!known?'unknown':reset<=now?'awaiting':'scheduled'};
 })};
}

export function nextUsageRefreshDelay(usage,now=Date.now()){
 const future=subscriptionResets(usage,now).windows.filter(window=>window.status==='scheduled');
 // A stale provider observation falls back to ordinary polling, not an immediate retry.
 return Math.min(USAGE_REFRESH_MS,...future.map(window=>window.remainingMs+1000));
}

export function formatResetCountdown(remainingMs){
 if(typeof remainingMs!=='number'||!Number.isFinite(remainingMs))return 'Reset time unavailable';
 if(remainingMs<=0)return 'Awaiting Meta update';
 if(remainingMs<60000)return 'in under 1m';
 const minutes=Math.ceil(remainingMs/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 if(days)return `in ${days}d${hours%24?` ${hours%24}h`:''}`;
 if(hours)return `in ${hours}h${minutes%60?` ${minutes%60}m`:''}`;
 return `in ${minutes}m`;
}
