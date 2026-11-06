import {createHash,randomUUID} from 'node:crypto';
import {moneyMinor,parseFinanceCsv,currencyDigits,financeDate,financeSummary} from '../shared/finance-model.mjs';
import {createPlaidClient,plaidHostedUrl,hostedLinkResults,syncPlaidItem} from './plaid.mjs';
const clone=structuredClone;
const clean=(value,max=180)=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{if(typeof value!=='string'||!value||value.length>250||/[\x00-\x1f]/.test(value))throw Error('Invalid finance identity.');return value;};
const empty=()=>({version:1,revision:0,clientUserId:randomUUID(),config:null,items:[],accounts:[],transactions:[],budgets:{},link:null});
const category=value=>clean(value||'Uncategorized',80).replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
function account(value,itemId,at){const currency=value.balances?.iso_currency_code;if(!currency)throw Error('An account has no supported ISO currency.');currencyDigits(currency);return{id:itemId+':'+id(value.account_id),itemId,name:clean(value.name||'Account'),mask:/^\d{1,4}$/.test(value.mask??'')?value.mask:'',type:clean(value.type,30),currency,balanceMinor:value.balances?.current==null?null:moneyMinor(value.balances.current,currency),balanceAt:at};}
function transaction(value,itemId){
 const currency=value.iso_currency_code;if(!currency)throw Error('A transaction has no supported ISO currency.');const amountMinor=moneyMinor(value.amount,currency),primary=value.personal_finance_category?.primary??'',detail=value.personal_finance_category?.detailed??'';
 const flow=/^TRANSFER_(IN|OUT)$/.test(primary)||/CREDIT_CARD_PAYMENT/.test(detail)?'transfer':primary==='INCOME'?'income':amountMinor<0?'refund':'expense';
 if(flow==='income'&&amountMinor>0)throw Error('A transaction has an inconsistent income sign.');
 return{id:itemId+':'+id(value.transaction_id),itemId,accountId:itemId+':'+id(value.account_id),date:financeDate(value.date),merchant:clean(value.merchant_name||value.name||'Transaction'),amountMinor,currency,category:category(primary||value.category?.[0]),flow,pending:value.pending===true};
}
const fields={state:[],configure:['clientId','secret','environment'],link:['itemId'],finishLink:[],cancelLink:['acknowledgeUnknown'],sync:['itemId'],unlink:['itemId'],budget:['currency','category','amountMinor'],importCommit:['id'],importCancel:['id'],forget:[],clearError:[]};
export function createFinanceService({store,clientFactory=createPlaidClient,openExternal=async()=>{},onChange=()=>{},now=()=>new Date(),initialError=null}){
 let data=store.read()??empty(),busy=false,closed=false,error=initialError,abort=null,inFlight=null;const previews=new Map();
 if(data.version!==1||!Array.isArray(data.items)||!Array.isArray(data.accounts)||!Array.isArray(data.transactions)||!data.budgets||!Number.isSafeInteger(data.revision))throw Error('Finance data version is unsupported. Existing data was preserved.');
 const snapshot=()=>({revision:data.revision,configured:!!data.config,environment:data.config?.environment??null,protectedStorage:store.available===true,busy,error,link:data.link?{expiresAt:data.link.expiresAt,reconnect:!!data.link.itemId,uncertain:!!data.link.exchanging}:null,items:data.items.map(({id,source,institution,status,lastSync,error})=>({id,source,institution,status,lastSync,error})),accounts:clone(data.accounts),transactions:clone(data.transactions),budgets:clone(data.budgets)});
 const emit=()=>onChange(snapshot());
 async function save(next){if(closed)throw Error('Finance is closed.');if(next.items.length>16||next.accounts.length>100||next.transactions.length>25000)throw Error('Finance storage limit reached (16 institutions, 100 accounts, or 25,000 transactions).');next.revision=data.revision+1;await store.write(next);data=next;emit();}
 const client=()=>{if(!data.config)throw Error('Set up your Plaid connection first.');return clientFactory(data.config);};
 function previewCsv(text,options,name='Transactions.csv'){
  if(closed)throw Error('Finance is closed.');if(busy)throw Error('Wait for the current finance operation.');const parsed=parseFinanceCsv(text,options),label=clean(options.accountName||'Imported transactions',80);if(!label)throw Error('Name this imported account.');
  const itemId='csv-'+hash(label+'\0'+options.currency).slice(0,24),accountId=itemId+'-account',seen=new Map();const rows=parsed.rows.map(row=>{const key=JSON.stringify(row),occurrence=seen.get(key)||0;seen.set(key,occurrence+1);return{...row,id:'csv-'+hash(accountId+'\0'+key+'\0'+occurrence),itemId,accountId};});
  const known=new Set(data.transactions.map(t=>t.id)),added=rows.filter(t=>!known.has(t.id)),preview={id:randomUUID(),name:clean(name),rows:rows.length,added:added.length,duplicates:rows.length-added.length,sample:rows.slice(0,6)};
  previews.clear();previews.set(preview.id,{preview,rows,label,itemId,accountId,currency:options.currency,expires:now().valueOf()+600000});return clone(preview);
 }
 async function sync(itemIds){
  const api=client();let failure;
  for(const itemId of itemIds){const item=data.items.find(i=>i.id===itemId&&i.source==='plaid');if(!item)throw Error('Choose a linked bank.');try{
   const accountResult=await api.call('/accounts/get',{access_token:item.accessToken},abort.signal);if(!Array.isArray(accountResult.accounts))throw Error('Plaid account data is unavailable.');
   const changes=await syncPlaidItem(api,item,abort.signal),at=now().toISOString(),accounts=accountResult.accounts.map(v=>account(v,item.id,at)),accountIds=new Set(accounts.map(a=>a.id));
   const next=clone(data),transactions=new Map(next.transactions.filter(t=>t.itemId!==item.id||accountIds.has(t.accountId)).map(t=>[t.id,t]));
   for(const value of changes.removed)transactions.delete(item.id+':'+id(value.transaction_id));
   for(const value of [...changes.added,...changes.modified]){const t=transaction(value,item.id);if(!accountIds.has(t.accountId))throw Error('Transaction refers to an unavailable account.');if(value.pending_transaction_id)transactions.delete(item.id+':'+id(value.pending_transaction_id));transactions.set(t.id,t);}
   next.transactions=[...transactions.values()];next.accounts=[...next.accounts.filter(a=>a.itemId!==item.id),...accounts];Object.assign(next.items.find(i=>i.id===item.id),{cursor:changes.cursor,status:changes.ready?'connected':'preparing',lastSync:at,error:null});await save(next);
  }catch(caught){failure=caught;if(closed||abort.signal.aborted)throw caught;const next=clone(data);Object.assign(next.items.find(i=>i.id===item.id),{status:caught.code==='ITEM_LOGIN_REQUIRED'?'reconnect':'error',error:clean(caught.message,250)});await save(next);}}
  if(failure)throw failure;
 }
 async function run(input){
  if(input.type==='clearError'){error=null;return snapshot();}
  if(input.type==='configure'){
   if(data.items.some(i=>i.source==='plaid')||data.link)throw Error('Disconnect linked banks and finish the link session before changing credentials.');
   if(!['sandbox','production'].includes(input.environment)||typeof input.clientId!=='string'||!input.clientId.trim()||input.clientId.length>200||typeof input.secret!=='string'||!input.secret.trim()||input.secret.length>200)throw Error('Enter your Plaid client ID, secret and environment.');
   const next=clone(data);next.config={clientId:input.clientId.trim(),secret:input.secret.trim(),environment:input.environment};await save(next);
  }else if(input.type==='link'){
   if(data.link)throw Error('Finish or cancel the existing link session first.');if(data.items.length>=16&&!input.itemId)throw Error('At most 16 institutions can be linked.');
   const item=input.itemId?data.items.find(i=>i.id===input.itemId&&i.source==='plaid'):null;if(input.itemId&&!item)throw Error('Choose a linked bank to reconnect.');
   const result=await client().call('/link/token/create',{user:{client_user_id:data.clientUserId},client_name:'MuseBench',language:'en',country_codes:['US'],...(item?{access_token:item.accessToken}:{products:['transactions'],transactions:{days_requested:730}}),hosted_link:{url_lifetime_seconds:1800}},abort.signal);
   const url=plaidHostedUrl(result.hosted_link_url);if(typeof result.link_token!=='string'||!result.link_token||!Number.isFinite(Date.parse(result.expiration)))throw Error('Plaid returned an invalid link session.');
   const next=clone(data);next.link={token:result.link_token,url,expiresAt:result.expiration,itemId:item?.id??null,done:[],exchanging:false};await save(next);await openExternal(url);
  }else if(input.type==='finishLink'){
   if(!data.link)throw Error('Start a bank link first.');if(data.link.exchanging)throw Error('The previous link exchange has an unknown outcome. Check your Plaid dashboard before dismissing this session; do not retry it automatically.');
   const result=await client().call('/link/token/get',{link_token:data.link.token},abort.signal);
   if(data.link.itemId){if(!(result.link_sessions??[]).some(s=>s.finished_at&&(s.results?.item_add_results?.length||s.on_success||(s.events??[]).some(e=>e.event_name==='HANDOFF'))))throw Error('Finish signing in in your browser, then check again.');const itemId=data.link.itemId;const next=clone(data);next.link=null;await save(next);await sync([itemId]);}
   else{const results=hostedLinkResults(result);if(!results.length)throw Error('No completed bank connection yet. Finish in your browser, then check again.');
    for(const linked of results){const key=hash(linked.publicToken);if(data.link.done.includes(key))continue;let next=clone(data);next.link.exchanging=true;await save(next);
     const exchange=await client().call('/item/public_token/exchange',{public_token:linked.publicToken},abort.signal);id(exchange.item_id);if(typeof exchange.access_token!=='string'||!exchange.access_token||exchange.access_token.length>1000)throw Error('Plaid returned an invalid connection.');
     next=clone(data);if(!next.items.some(i=>i.id===exchange.item_id))next.items.push({id:exchange.item_id,source:'plaid',institution:clean(linked.institution),accessToken:exchange.access_token,cursor:'',status:'syncing',lastSync:null,error:null});next.link.exchanging=false;next.link.done.push(key);await save(next);
    }const next=clone(data);next.link=null;await save(next);await sync(data.items.filter(i=>i.source==='plaid'&&i.status==='syncing').map(i=>i.id));}
  }else if(input.type==='cancelLink'){
   if(data.link&&input.acknowledgeUnknown!==true)throw Error('Close the Plaid browser tab and revoke any completed or uncertain connection in your Plaid dashboard before dismissing it.');const next=clone(data);next.link=null;await save(next);
  }else if(input.type==='sync'){await sync(input.itemId?[id(input.itemId)]:data.items.filter(i=>i.source==='plaid').map(i=>i.id));
  }else if(input.type==='unlink'){
   const item=data.items.find(i=>i.id===input.itemId);if(!item)throw Error('Choose a saved connection.');if(data.link)throw Error('Finish or cancel the active link session first.');
   if(item.source==='plaid'){try{await client().call('/item/remove',{access_token:item.accessToken},abort.signal);}catch(caught){if(caught.code!=='ITEM_NOT_FOUND')throw caught;}}
   const next=clone(data);next.items=next.items.filter(i=>i.id!==item.id);next.accounts=next.accounts.filter(a=>a.itemId!==item.id);next.transactions=next.transactions.filter(t=>t.itemId!==item.id);await save(next);
  }else if(input.type==='budget'){
   currencyDigits(input.currency);if(typeof input.category!=='string'||!input.category.trim()||input.category.length>80||!Number.isSafeInteger(input.amountMinor)||input.amountMinor<0||input.amountMinor>1e12)throw Error('Enter a valid category and non-negative budget.');const next=clone(data);if(Object.keys(next.budgets).length>=100&&!Object.hasOwn(next.budgets,input.currency+':'+input.category))throw Error('At most 100 budgets are supported.');next.budgets[input.currency+':'+input.category.trim()]=input.amountMinor;await save(next);
  }else if(input.type==='importCommit'){
   const selected=previews.get(input.id);if(!selected||selected.expires<now().valueOf())throw Error('The import preview expired. Choose the file again.');const next=clone(data),known=new Set(next.transactions.map(t=>t.id));
   if(!next.items.some(i=>i.id===selected.itemId)){next.items.push({id:selected.itemId,source:'csv',institution:selected.label,status:'imported',lastSync:now().toISOString(),error:null});next.accounts.push({id:selected.accountId,itemId:selected.itemId,name:selected.label,mask:'',type:'imported',currency:selected.currency,balanceMinor:null,balanceAt:null});}
   next.transactions.push(...selected.rows.filter(t=>!known.has(t.id)));await save(next);previews.delete(input.id);
  }else if(input.type==='importCancel'){previews.delete(input.id);
  }else if(input.type==='forget'){
   if(data.items.some(i=>i.source==='plaid')||data.link)throw Error('Disconnect linked banks and finish the link session before clearing local data.');await save(empty());previews.clear();
  }return snapshot();
 }
 return{snapshot,previewCsv,isBusy:()=>busy,summary:options=>financeSummary(data,options),async command(input){
  if(!input||!Object.hasOwn(fields,input.type)||Object.keys(input).some(k=>k!=='type'&&!fields[input.type].includes(k)))throw Error('Invalid finance command.');if(closed)throw Error('Finance is closed.');if(input.type==='state')return snapshot();if(busy)throw Error('Wait for the current finance operation.');if(initialError)throw Error(initialError);
  busy=true;error=null;abort=new AbortController();emit();inFlight=run(input);try{return await inFlight;}catch(caught){error=clean(caught.message,300);throw caught;}finally{busy=false;abort=null;inFlight=null;emit();}
 },async close(){closed=true;abort?.abort();previews.clear();await inFlight?.catch(()=>{});}};
}
