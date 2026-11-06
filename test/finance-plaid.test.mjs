import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaidClient,plaidHostedUrl,hostedLinkResults,syncPlaidItem} from '../src/finance/plaid.mjs';
test('Plaid uses fixed HTTPS endpoints and credentials only in main-process request',async()=>{
 const calls=[];const client=createPlaidClient({environment:'sandbox',clientId:'client',secret:'secret',fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({accounts:[]}));}});
 await client.call('/accounts/get',{access_token:'private'});assert.equal(calls[0].url,'https://sandbox.plaid.com/accounts/get');assert.equal(JSON.parse(calls[0].options.body).secret,'secret');assert.equal(calls[0].options.redirect,'error');
 await assert.rejects(client.call('/transfer/create',{}),/Unsupported/);assert.throws(()=>createPlaidClient({environment:'http://evil',clientId:'x',secret:'x'}));
});
test('provider errors never echo arbitrary sensitive error messages',async()=>{
 const client=createPlaidClient({environment:'sandbox',clientId:'client',secret:'secret',fetcher:async()=>new Response(JSON.stringify({error_code:'ITEM_LOGIN_REQUIRED',error_message:'access-private secret'}),{status:400})});
 await assert.rejects(client.call('/accounts/get',{}),error=>error.code==='ITEM_LOGIN_REQUIRED'&&!error.message.includes('access-private'));
});
test('Hosted Link reads results for each session and rejects non-Plaid external URLs',()=>{
 const result=hostedLinkResults({link_sessions:[{results:{item_add_results:[{public_token:'public-sandbox-x',institution:{name:'Example',institution_id:'i'}}]}}]});assert.equal(result[0].publicToken,'public-sandbox-x');
 assert.equal(plaidHostedUrl('https://secure.plaid.com/hl/example'),'https://secure.plaid.com/hl/example');
 for(const url of ['http://secure.plaid.com/hl/x','https://secure.plaid.com.attacker.invalid/hl/x','https://user@secure.plaid.com/hl/x','https://secure.plaid.com:444/hl/x'])assert.throws(()=>plaidHostedUrl(url));
});
test('pagination mutation restarts from original cursor and staged changes reconcile once',async()=>{
 const cursors=[];let n=0;const client={call:async(endpoint,input)=>{assert.equal(endpoint,'/transactions/sync');cursors.push(input.cursor);n++;if(n===2)throw Object.assign(Error('retry'),{code:'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'});return n===1?{added:[{transaction_id:'discard'}],modified:[],removed:[],has_more:true,next_cursor:'partial'}:{added:[{transaction_id:'new'}],modified:[{transaction_id:'old',amount:9}],removed:[{transaction_id:'removed'}],has_more:false,next_cursor:'final'};}};
 const result=await syncPlaidItem(client,{accessToken:'secret',cursor:'original'});assert.deepEqual(cursors,['original','partial','original']);assert.equal(result.cursor,'final');assert.deepEqual(result.added.map(t=>t.transaction_id),['new']);assert.equal(result.removed[0].transaction_id,'removed');
});
test('sync rejects malformed pagination rather than returning partial success',async()=>{
 await assert.rejects(syncPlaidItem({call:async()=>({added:[],modified:[],removed:[],has_more:true,next_cursor:''})},{accessToken:'x',cursor:''}),/cursor|pagination/i);
});

test('initial transactions still preparing is a valid terminal empty response',async()=>{
 const client={call:async()=>({added:[],modified:[],removed:[],has_more:false,next_cursor:''})};
 const result=await syncPlaidItem(client,{accessToken:'x',cursor:''});
 assert.equal(result.ready,false);assert.equal(result.cursor,'');assert.deepEqual(result.added,[]);
 await assert.rejects(syncPlaidItem(client,{accessToken:'x',cursor:'existing'}),/pagination/i);
});
