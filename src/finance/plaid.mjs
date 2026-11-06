const ENDPOINTS=new Set(['/link/token/create','/link/token/get','/item/public_token/exchange','/accounts/get','/transactions/sync','/item/remove']);
const ENVIRONMENTS={sandbox:'https://sandbox.plaid.com',production:'https://production.plaid.com'};
const messages={ITEM_LOGIN_REQUIRED:'Your bank needs you to sign in again.',INVALID_CREDENTIALS:'Plaid credentials were rejected. Check your local connection setup.',INVALID_LINK_TOKEN:'This link session expired. Start linking again.',PRODUCT_NOT_READY:'Your bank is still preparing transactions. Try Sync again shortly.',RATE_LIMIT_EXCEEDED:'Plaid requested a pause. Try again later.',INSTITUTION_DOWN:'Your institution is temporarily unavailable.',ITEM_NOT_FOUND:'This bank connection is no longer available. Reconnect it.'};
export function createPlaidClient({environment,clientId,secret,fetcher=fetch,timeoutMs=30000}){
 if(!Object.hasOwn(ENVIRONMENTS,environment)||typeof clientId!=='string'||!clientId||typeof secret!=='string'||!secret)throw Error('Configure a valid Plaid environment and credentials.');
 return{async call(endpoint,input={},signal){
  if(!ENDPOINTS.has(endpoint))throw Error('Unsupported Plaid endpoint.');
  const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([timeout,signal]):timeout;
  let response;try{response=await fetcher(ENVIRONMENTS[environment]+endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Plaid-Version':'2020-09-14'},body:JSON.stringify({...input,client_id:clientId,secret}),signal:combined});}catch{throw Error(combined.aborted?'Plaid request stopped or timed out.':'Could not reach Plaid. Check your connection.');}
  const reader=response.body?.getReader();let text='';if(!reader)throw Error('Plaid returned an empty response.');let bytes=0;const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>8*1024*1024){await reader.cancel();throw Error('Plaid response exceeds the supported size.');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  let data;try{data=JSON.parse(text);}catch{throw Error('Plaid returned an invalid response.');}
  if(!response.ok||data.error_code){const code=typeof data.error_code==='string'&&/^[A-Z_]{1,100}$/.test(data.error_code)?data.error_code:'PLAID_REQUEST_FAILED';throw Object.assign(Error(messages[code]||'Plaid could not complete the request. Try again or check your Plaid dashboard.'),{code});}return data;
 }};
}
export function plaidHostedUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='secure.plaid.com'||url.username||url.password||url.port)throw Error('Plaid returned an unexpected linking address.');return url.href;}
export function hostedLinkResults(value){
 const rows=[];for(const session of value.link_sessions??[]){for(const result of session.results?.item_add_results??[]){if(typeof result.public_token==='string'&&result.public_token.length<1000)rows.push({publicToken:result.public_token,institution:typeof result.institution?.name==='string'?result.institution.name.slice(0,180):'Linked bank',institutionId:result.institution?.institution_id??null});}}return rows;
}
export async function syncPlaidItem(client,item,signal){
 for(let attempt=0;attempt<3;attempt++){
  let cursor=item.cursor||'',added=[],modified=[],removed=[];const seen=new Set([cursor]);
  try{for(let page=0;page<100;page++){
   const result=await client.call('/transactions/sync',{access_token:item.accessToken,...(cursor?{cursor}:{}),count:500},signal);
   if(!Array.isArray(result.added)||!Array.isArray(result.modified)||!Array.isArray(result.removed)||typeof result.has_more!=='boolean'||typeof result.next_cursor!=='string'||result.next_cursor.length>1000)throw Error('Plaid returned invalid pagination data.');
   added.push(...result.added);modified.push(...result.modified);removed.push(...result.removed);if(added.length+modified.length+removed.length>50000)throw Error('Too many transaction updates in one sync.');
   // Plaid returns an empty terminal cursor before the first transactions are ready.
   // A cursor must never reset after history or staged updates already exist.
   if(!result.next_cursor&&(result.has_more||cursor||added.length||modified.length||removed.length))throw Error('Plaid returned invalid pagination data.');
   cursor=result.next_cursor;if(!result.has_more)return{cursor,added,modified,removed,ready:!!cursor};if(seen.has(cursor))throw Error('Plaid repeated a pagination cursor.');seen.add(cursor);
  }throw Error('Plaid pagination exceeded the supported limit.');}
  catch(error){if(error.code==='TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'&&attempt<2)continue;throw error;}
 }throw Error('Transactions changed during sync. Try again.');
}
