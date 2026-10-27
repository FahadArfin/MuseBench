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
// Deliberately narrow: only explicitly labelled period spend, never payment balance,
// tokens, payment thresholds or an arbitrary nearby dollar amount.
export function parseBillingText(text){
 if(typeof text!=='string')return null;
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const amount=label=>{
  const matches=lines.flatMap((line,i)=>label.test(line)?[lines[i+1]??'']:[]);
  if(matches.length!==1)return null;
  const m=/^(USD|EUR|GBP)\s+((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})$/.exec(matches[0]);
  return m?{currency:m[1],value:Number(m[2].replaceAll(',',''))}:null;
 };
 const spent=amount(/^(Month-to-date spend|Spend this month|Total spend this month)$/i);
 if(!spent)return null;
 const alert=amount(/^(Monthly spend limit alert|Monthly spend alert)$/i);
 return {spent:spent.value,currency:spent.currency,period:'This month',...(alert&&alert.currency===spent.currency?{alertLimit:alert.value}:{}),source:'Meta billing'};
}
export const money=(n,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(n);
export function usageHeadline(usage){
 if(usage?.windows?.length)return `${Math.floor(Math.min(...usage.windows.map(w=>w.remainingPercent)))}% left`;
 const b=usage?.billing;if(!b)return 'Unavailable';
 if(valid(b.alertLimit))return b.spent>b.alertLimit?`${money(b.spent-b.alertLimit,b.currency)} over alert`:`${money(b.alertLimit-b.spent,b.currency)} to alert`;
 return `${money(b.spent,b.currency)} spent`;
}
