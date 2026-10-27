const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function normalizeAllowance(value){
 const root=value?.subs_usage??value?.usage??value;
 const windows=[];
 for(const [key,label] of [['window','Current window'],['weekly','Weekly']]){
  const v=root?.[key];if(!valid(v?.used_percent)||v.used_percent>100)continue;
  const reset=typeof v.resets_at==='number'?v.resets_at*1000:Date.parse(v.resets_at);
  windows.push({label,remainingPercent:100-v.used_percent,...(Number.isFinite(reset)&&reset>0?{resetsAt:new Date(reset).toISOString()}: {})});
 }
 return {windows};
}
// Only explicit labels; balances and payment thresholds are never treated as spend.
export function parseBillingText(text){
 if(typeof text!=='string')return null;
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const amount=label=>{
  const matches=lines.flatMap((line,i)=>label.test(line)?[lines[i+1]??'']:[]);
  if(matches.length!==1)return null;
  const m=/^(USD|EUR|GBP|\$|€|£)\s*((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})$/.exec(matches[0]);
  return m?{currency:m[1]==='€'?'EUR':m[1]==='£'?'GBP':m[1],value:Number(m[2].replaceAll(',',''))}:null;
 };
 const fields={spent:amount(/^(Month-to-date spend|Spend this month|Total spend this month)$/i),currentBalance:amount(/^Current balance$/i),freeCredits:amount(/^Free credits in use$/i),paymentThreshold:amount(/^Your balance reaches$/i),alertLimit:amount(/^(Monthly spend limit alert|Monthly spend alert)$/i)};
 const anchor=fields.spent??fields.currentBalance??fields.freeCredits;if(!anchor)return null;
 const result={currency:anchor.currency,period:'This month',source:'Meta billing'};
 for(const [key,v] of Object.entries(fields))if(v&&v.currency===anchor.currency)result[key]=v.value;
 if(lines.includes('Set a monthly amount to get email alerts as you approach it.')&&lines.includes('Set up'))result.alertStatus='not-set';
 return result;
}
export const money=(n,currency='USD')=>currency==='$'?`$${new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)}`:new Intl.NumberFormat('en-US',{style:'currency',currency}).format(n);
export function usageHeadline(usage){
 if(usage?.windows?.length)return `${Math.floor(Math.min(...usage.windows.map(w=>w.remainingPercent)))}% left`;
 const b=usage?.billing;if(!b)return 'Unavailable';
 if(valid(b.freeCredits))return `${money(b.freeCredits,b.currency)} free credits`;
 if(valid(b.spent)&&valid(b.alertLimit))return b.spent>b.alertLimit?`${money(b.spent-b.alertLimit,b.currency)} over alert`:`${money(b.alertLimit-b.spent,b.currency)} to alert`;
 if(valid(b.spent))return `${money(b.spent,b.currency)} spent`;
 if(valid(b.currentBalance))return `${money(b.currentBalance,b.currency)} balance`;
 return 'Unavailable';
}
