// The service caps records at 25,000 and balances at 100, keeping every
// aggregate below Number.MAX_SAFE_INTEGER even at this per-value bound.
const MAX_MONEY=1e11;
export function currencyDigits(currency){
 if(typeof currency!=='string'||! /^[A-Z]{3}$/.test(currency))throw Error('Use a three-letter currency such as USD.');
 return new Intl.NumberFormat('en-US',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
}
export function moneyMinor(value,currency='USD'){
 const digits=currencyDigits(currency),text=String(value).trim();
 if(!/^-?\d+(?:\.\d+)?$/.test(text))throw Error('Enter a plain decimal amount without thousands separators.');
 const [whole,fraction='']=text.replace('-','').split('.');
 if(fraction.length>digits&&/[1-9]/.test(fraction.slice(digits)))throw Error('Amount has too many decimal places for its currency.');
 const result=(Number(whole)*10**digits+Number(fraction.slice(0,digits).padEnd(digits,'0')))*(text.startsWith('-')?-1:1);
 if(!Number.isSafeInteger(result)||Math.abs(result)>MAX_MONEY)throw Error('Amount is outside the supported range.');return result;
}
export const formatMoney=(value,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:currencyDigits(currency)}).format(value/10**currencyDigits(currency));
export function financeDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Dates must be valid YYYY-MM-DD dates.');return value;}
const short=(v,max=180)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
export function parseFinanceCsv(text,options={}){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('CSV must be UTF-8 text up to 2 MiB.');
 const currency=options.currency??'USD';currencyDigits(currency);if(!['expense','income'].includes(options.positive??'expense'))throw Error('Choose the amount sign convention.');
 text=text.replace(/^\uFEFF/,'');const records=[];let row=[],field='',quoted=false,afterQuote=false;
 for(let i=0;i<=text.length;i++){
  const c=text[i];if(quoted){if(c===undefined)throw Error('CSV has an unfinished quoted field.');if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
  if(c==='"'){if(field||afterQuote)throw Error('CSV has a misplaced quote.');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'||c===undefined){row.push(field);field='';afterQuote=false;if(c!==','){if(row.some(v=>v.trim()))records.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}if(records.length>10001)throw Error('Import at most 10,000 transaction rows.');}
  else{if(afterQuote)throw Error('CSV has characters after a closing quote.');field+=c;if(field.length>20000)throw Error('CSV field is too long.');}
 }
 if(records.length<2)throw Error('CSV needs a header and at least one transaction.');
 const headers=records.shift().map(v=>v.trim());if(new Set(headers.map(v=>v.toLowerCase())).size!==headers.length)throw Error('CSV headers must be unique.');
 const columns=options.columns??{date:'Date',description:'Description',amount:'Amount',category:'Category',type:'Type'};
 const index=name=>headers.findIndex(h=>h.toLowerCase()===String(name??'').toLowerCase());
 for(const key of ['date','description','amount'])if(index(columns[key])<0)throw Error(`CSV is missing the ${columns[key]||key} column. Choose matching column names.`);
 const rows=records.map((values,i)=>{
  try{
   if(values.length!==headers.length)throw Error('Column count does not match the header.');
   const get=key=>values[index(columns[key])]??'';const date=financeDate(get('date').trim()),merchant=short(get('description'));if(!merchant)throw Error('Description is empty.');
   const amountMinor=moneyMinor(get('amount'),currency)*(options.positive==='income'?-1:1),category=short(get('category')||'Uncategorized',80),explicit=get('type').trim().toLowerCase();
   if(explicit&&!['income','expense','refund','transfer'].includes(explicit))throw Error('Type must be income, expense, refund or transfer.');
   const flow=explicit||(/transfer|credit.card.payment/i.test(category)?'transfer':/refund/i.test(category)?'refund':amountMinor<0?'income':'expense');
   if((flow==='income'||flow==='refund')&&amountMinor>0||flow==='expense'&&amountMinor<0)throw Error('Amount sign conflicts with Type.');
   return{date,merchant,amountMinor,currency,category,flow,pending:false};
  }catch(error){throw Error(`Row ${i+2}: ${error.message}`);}
 });return{headers,rows};
}
const monthBefore=month=>{const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7);};
const sum=rows=>rows.reduce((n,t)=>n+t.amountMinor,0);
function recurringCharges(rows,today){
 const groups=new Map();for(const t of rows){if(t.pending||t.amountMinor<=0||t.flow!=='expense')continue;const key=t.accountId+'\0'+t.merchant.toLowerCase().replace(/\s+/g,' ').trim();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const result=[];for(const group of groups.values()){
  group.sort((a,b)=>a.date.localeCompare(b.date));if(group.length<3)continue;const tail=group.slice(-4),gaps=tail.slice(1).map((v,i)=>(Date.parse(v.date)-Date.parse(tail[i].date))/86400000);
  const cadence=gaps.every(d=>d>=26&&d<=35)?'Monthly':gaps.every(d=>d>=6&&d<=8)?'Weekly':null;if(!cadence)continue;
  const last=tail.at(-1),prior=tail.at(-2);if(tail.some(t=>Math.abs(t.amountMinor-last.amountMinor)>Math.max(100,last.amountMinor*.25)))continue;
  const d=new Date(last.date+'T00:00:00Z');if(cadence==='Monthly'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const days=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,days));}else d.setUTCDate(d.getUTCDate()+7);
  const nextDate=d.toISOString().slice(0,10);if(Date.parse(today)-Date.parse(nextDate)>35*86400000)continue;
  result.push({merchant:last.merchant,accountId:last.accountId,amountMinor:last.amountMinor,currency:last.currency,cadence,nextDate,estimated:true,occurrences:group.length,change:last.amountMinor-prior.amountMinor});
 }return result.sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
}
export function financeSummary(data,{month=new Date().toISOString().slice(0,7),currency='USD',today=new Date().toISOString().slice(0,10)}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose a valid month.');currencyDigits(currency);financeDate(today);
 const transactions=data.transactions.filter(t=>t.currency===currency),accounts=data.accounts.filter(a=>a.currency===currency),posted=transactions.filter(t=>!t.pending),current=posted.filter(t=>t.date.startsWith(month)),expenses=current.filter(t=>['expense','refund'].includes(t.flow));
 const income=-sum(current.filter(t=>t.flow==='income')),spending=sum(expenses),categories=new Map();for(const t of expenses)categories.set(t.category,(categories.get(t.category)||0)+t.amountMinor);
 const available=accounts.filter(a=>a.balanceMinor!==null),assets=sum(available.filter(a=>!['credit','loan'].includes(a.type)).map(a=>({amountMinor:a.balanceMinor}))),debt=sum(available.filter(a=>['credit','loan'].includes(a.type)).map(a=>({amountMinor:a.balanceMinor})));
 const prior=posted.filter(t=>t.date.startsWith(monthBefore(month))&&['expense','refund'].includes(t.flow));
 const months=[];let m=month;for(let i=0;i<6;i++){const rows=posted.filter(t=>t.date.startsWith(m));months.unshift({month:m,income:-sum(rows.filter(t=>t.flow==='income')),spending:sum(rows.filter(t=>['expense','refund'].includes(t.flow)))});m=monthBefore(m);}
 const counts=new Map();for(const t of current){if(t.flow!=='expense')continue;const key=JSON.stringify([t.accountId,t.date,t.merchant,t.amountMinor]);const group=counts.get(key)||[];group.push(t);counts.set(key,group);}
 return{month,currency,income,spending,cashFlow:income-spending,assets,debt,netWorth:available.length?assets-debt:null,unknownBalances:accounts.length-available.length,accountCount:accounts.length,pending:sum(transactions.filter(t=>t.pending&&t.date.startsWith(month))),transactionCount:current.length,previousSpending:sum(prior),categories:[...categories].map(([category,amountMinor])=>({category,amountMinor,budgetMinor:data.budgets?.[currency+':'+category]??null})).sort((a,b)=>b.amountMinor-a.amountMinor),months,recurring:recurringCharges(posted,today),possibleDuplicates:[...counts.values()].filter(g=>g.length>1).map(g=>({merchant:g[0].merchant,date:g[0].date,amountMinor:g[0].amountMinor,count:g.length})),currencies:[...new Set([...data.accounts,...data.transactions].map(t=>t.currency))].sort()};
}
export function financeQuestion(question,summary){
 const s=summary,m=n=>formatMoney(n,s.currency);
 if(/subscri|recurr|bill/i.test(question))return s.recurring.length?s.recurring.map(r=>`${r.merchant}: ${m(r.amountMinor)}, ${r.cadence.toLowerCase()}, estimated next ${r.nextDate} (${r.occurrences} observed charges).`).join('\n'):'Not enough history to identify recurring charges. Estimates require at least three comparable posted charges.';
 if(/duplicate|unusual/i.test(question))return s.possibleDuplicates.length?s.possibleDuplicates.map(r=>`${r.count} matching ${r.merchant} charges of ${m(r.amountMinor)} on ${r.date}. These may be legitimate; compare with your statement.`).join('\n'):'No matching same-day charges were found in the selected month. This does not rule out other unusual activity.';
 if(/balance|net worth/i.test(question))return s.netWorth===null?'Balances are unavailable. CSV transaction imports do not establish account balances.':`Known balances total ${m(s.assets)} in assets and ${m(s.debt)} in debt; their difference is ${m(s.netWorth)}. ${s.unknownBalances} account balances are unavailable. Linked balances may be delayed.`;
 return `For ${s.month}, posted spending was ${m(s.spending)}, income ${m(s.income)}, and net cash flow ${m(s.cashFlow)}. Transfers and pending transactions are excluded.\n${s.categories.slice(0,5).map(c=>`${c.category}: ${m(c.amountMinor)}`).join('\n')}\nPrevious-month spending: ${m(s.previousSpending)}. Coverage depends on imported or synced records.`;
}
export function financeSample(today=new Date().toISOString().slice(0,10)){
 financeDate(today);const month=today.slice(0,7),items=[{id:'sample-bank',source:'sample',institution:'Example Bank',status:'sample',lastSync:null,error:null}],accounts=[{id:'sample-checking',itemId:'sample-bank',name:'Everyday checking',mask:'0428',type:'depository',currency:'USD',balanceMinor:824350,balanceAt:null},{id:'sample-savings',itemId:'sample-bank',name:'Rainy day savings',mask:'1792',type:'depository',currency:'USD',balanceMinor:1650000,balanceAt:null},{id:'sample-credit',itemId:'sample-bank',name:'Everyday credit',mask:'7301',type:'credit',currency:'USD',balanceMinor:128940,balanceAt:null}];
 const transactions=[];let m=month;for(let i=0;i<6;i++){
  const values=[['Payroll',-520000,'Income','income'],['Rent',165000,'Housing','expense'],['Fresh market',8420,'Groceries','expense'],['Neighborhood cafe',1860,'Dining','expense'],['Stream Studio',1599,'Entertainment','expense'],['Cloud storage',999,'Software','expense'],['Transit pass',7500,'Transport','expense'],['Savings transfer',50000,'Transfers','transfer']];
  for(let j=0;j<values.length;j++){const [merchant,amountMinor,category,flow]=values[j];transactions.push({id:`sample-${i}-${j}`,itemId:'sample-bank',accountId:'sample-checking',date:m+'-'+String(Math.min(j+1,Number(today.slice(-2))||1)).padStart(2,'0'),merchant,amountMinor:amountMinor+(j===2?i*320:0),currency:'USD',category,flow,pending:false});}m=monthBefore(m);
 }return{items,accounts,transactions,budgets:{'USD:Groceries':45000,'USD:Dining':20000,'USD:Housing':180000}};
}
