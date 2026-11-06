import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceService} from '../src/finance/service.mjs';
const store=()=>{let record=null;return{available:true,read:()=>structuredClone(record),write:async value=>{record=structuredClone(value);}};};
const configuration={type:'configure',clientId:'private-client',secret:'private-secret',environment:'sandbox'};
test('CSV preview does not persist, commit is deduplicated, budgets survive reopen and balances remain unknown',async()=>{
 const vault=store(),service=createFinanceService({store:vault});const csv='Date,Description,Amount\n2026-10-01,Shop,12.34\n2026-10-01,Shop,12.34';
 const preview=service.previewCsv(csv,{currency:'USD',positive:'expense',accountName:'Local card'},'test.csv');assert.equal(service.snapshot().transactions.length,0);assert.equal(preview.added,2);
 await service.command({type:'importCommit',id:preview.id});assert.equal(service.snapshot().transactions.length,2);assert.equal(service.snapshot().accounts[0].balanceMinor,null);
 const again=service.previewCsv(csv,{currency:'USD',positive:'expense',accountName:'Local card'},'test.csv');assert.equal(again.added,0);await service.command({type:'importCommit',id:again.id});
 await service.command({type:'budget',currency:'USD',category:'Groceries',amountMinor:50000});const reopened=createFinanceService({store:vault});assert.equal(reopened.snapshot().budgets['USD:Groceries'],50000);
});
test('link tokens and credentials never enter snapshots; real completion exchanges and syncs',async()=>{
 const vault=store(),calls=[],opened=[];const service=createFinanceService({store:vault,openExternal:async url=>opened.push(url),clientFactory:()=>({call:async(endpoint,input)=>{calls.push(endpoint);if(endpoint==='/link/token/create')return{link_token:'link-private',hosted_link_url:'https://secure.plaid.com/hl/test',expiration:'2099-01-01T00:00:00Z'};if(endpoint==='/link/token/get')return{link_sessions:[{results:{item_add_results:[{public_token:'public-private',institution:{name:'Test Bank'}}]}}]};if(endpoint==='/item/public_token/exchange')return{item_id:'item-1',access_token:'access-private'};if(endpoint==='/accounts/get')return{accounts:[{account_id:'a',name:'Checking',mask:'1234',type:'depository',balances:{current:100,iso_currency_code:'USD'}}]};return{added:[],modified:[],removed:[],has_more:false,next_cursor:'cursor-1'};}})});
 await service.command(configuration);await service.command({type:'link'});assert.equal(opened.length,1);await service.command({type:'finishLink'});const state=service.snapshot();assert.equal(state.items.length,1);assert.equal(state.accounts[0].balanceMinor,10000);for(const secret of ['private-secret','private-client','access-private','link-private','public-private'])assert(!JSON.stringify(state).includes(secret));assert(calls.includes('/transactions/sync'));
});
test('failed pagination does not commit staged records or cursor, failed unlink retains connection',async()=>{
 const vault=store();await vault.write({version:1,revision:1,clientUserId:'user',config:{clientId:'id',secret:'secret',environment:'sandbox'},items:[{id:'bank',source:'plaid',institution:'Bank',accessToken:'access',cursor:'old',status:'connected',lastSync:null,error:null}],accounts:[],transactions:[],budgets:{},link:null});
 const service=createFinanceService({store:vault,clientFactory:()=>({call:async(endpoint)=>{if(endpoint==='/accounts/get')return{accounts:[]};throw Error('temporary failure');}})});
 await assert.rejects(service.command({type:'sync'}));assert.equal(vault.read().items[0].cursor,'old');assert.equal(vault.read().transactions.length,0);await assert.rejects(service.command({type:'unlink',itemId:'bank'}));assert.equal(service.snapshot().items.length,1);
});
test('changing credentials or forgetting while linked cannot orphan revocation tokens; unknown commands rejected',async()=>{
 const vault=store();await vault.write({version:1,revision:0,clientUserId:'user',config:{clientId:'id',secret:'secret',environment:'sandbox'},items:[{id:'bank',source:'plaid',institution:'Bank',accessToken:'access',cursor:'',status:'connected',lastSync:null,error:null}],accounts:[],transactions:[],budgets:{},link:null});const service=createFinanceService({store:vault});await assert.rejects(service.command(configuration),/Disconnect/);await assert.rejects(service.command({type:'forget'}),/Disconnect/);await assert.rejects(service.command({type:'state',secret:'bad'}),/Invalid/);
});
test('closing cancels pending requests and rejects subsequent writes',async()=>{
 const service=createFinanceService({store:store()});await service.close();await assert.rejects(service.command(configuration),/closed/);
});
test('Plaid identifiers are scoped per institution and removals cannot erase another item',async()=>{
 const vault=store();await vault.write({version:1,revision:1,clientUserId:'user',config:{clientId:'id',secret:'secret',environment:'sandbox'},items:['one','two'].map(id=>({id,source:'plaid',institution:id,accessToken:id,cursor:'',status:'connected',lastSync:null,error:null})),accounts:[],transactions:[],budgets:{},link:null});
 let remove=false;const service=createFinanceService({store:vault,clientFactory:()=>({call:async(endpoint,input)=>endpoint==='/accounts/get'?{accounts:[{account_id:'shared',name:'Account',type:'depository',balances:{current:25,iso_currency_code:'USD'}}]}:{added:remove?[]:[{transaction_id:'shared-tx',account_id:'shared',date:'2026-10-01',name:'Purchase',amount:5,iso_currency_code:'USD',pending:false}],modified:[],removed:remove?[{transaction_id:'shared-tx'}]:[],next_cursor:'done',has_more:false}})});
 await service.command({type:'sync'});assert.equal(service.snapshot().accounts.length,2);assert.equal(new Set(service.snapshot().accounts.map(a=>a.id)).size,2);assert.equal(service.snapshot().transactions.length,2);remove=true;await service.command({type:'sync',itemId:'one'});assert.equal(service.snapshot().transactions.length,1);assert.equal(service.snapshot().transactions[0].itemId,'two');
});
test('an exited reconnect session is not treated as a successful consent flow',async()=>{
 const vault=store();await vault.write({version:1,revision:0,clientUserId:'u',config:{clientId:'id',secret:'secret',environment:'sandbox'},items:[{id:'bank',source:'plaid',institution:'Bank',accessToken:'access',cursor:'',status:'reconnect',lastSync:null,error:null}],accounts:[],transactions:[],budgets:{},link:{token:'link',expiresAt:'2099-01-01T00:00:00Z',itemId:'bank',done:[]}});
 const service=createFinanceService({store:vault,clientFactory:()=>({call:async()=>({link_sessions:[{finished_at:'2026-11-05T12:00:00Z',on_exit:{error:null},events:[{event_name:'EXIT'}]}]})})});await assert.rejects(service.command({type:'finishLink'}),/Finish signing in/);assert.equal(service.snapshot().link.reconnect,true);
});

test('accounts remain visible while initial transactions prepare and later sync completes',async()=>{
 const vault=store();await vault.write({version:1,revision:0,clientUserId:'u',config:{clientId:'id',secret:'secret',environment:'sandbox'},items:[{id:'bank',source:'plaid',institution:'Bank',accessToken:'access',cursor:'',status:'syncing',lastSync:null,error:null}],accounts:[],transactions:[],budgets:{},link:null});
 let ready=false;const service=createFinanceService({store:vault,clientFactory:()=>({call:async endpoint=>endpoint==='/accounts/get'?{accounts:[{account_id:'a',name:'Checking',type:'depository',balances:{current:12,iso_currency_code:'USD'}}]}:{added:[],modified:[],removed:[],has_more:false,next_cursor:ready?'done':''}})});
 await service.command({type:'sync'});assert.equal(service.snapshot().accounts[0].balanceMinor,1200);assert.equal(service.snapshot().items[0].status,'preparing');assert.equal(service.snapshot().error,null);
 ready=true;await service.command({type:'sync'});assert.equal(service.snapshot().items[0].status,'connected');assert.equal(vault.read().items[0].cursor,'done');
});

test('lost token exchange response remains explicitly uncertain after reopen and cannot retry automatically',async()=>{
 const vault=store();const factory=()=>({call:async endpoint=>{if(endpoint==='/link/token/create')return{link_token:'private-link',hosted_link_url:'https://secure.plaid.com/hl/test',expiration:'2099-01-01T00:00:00Z'};if(endpoint==='/link/token/get')return{link_sessions:[{results:{item_add_results:[{public_token:'private-public',institution:{name:'Bank'}}]}}]};throw Error('Connection lost');}});
 const service=createFinanceService({store:vault,clientFactory:factory});await service.command(configuration);await service.command({type:'link'});await assert.rejects(service.command({type:'finishLink'}),/Connection lost/);
 const reopened=createFinanceService({store:vault,clientFactory:factory});assert.equal(reopened.snapshot().link.uncertain,true);await assert.rejects(reopened.command({type:'finishLink'}),/unknown outcome/);await assert.rejects(reopened.command({type:'cancelLink'}),/revoke/);await assert.rejects(reopened.command({type:'forget'}),/Disconnect/);
 await reopened.command({type:'cancelLink',acknowledgeUnknown:true});assert.equal(reopened.snapshot().link,null);
});

test('dismissing a browser link requires acknowledgement that dismissal does not revoke bank access',async()=>{
 const vault=store();const service=createFinanceService({store:vault,clientFactory:()=>({call:async()=>({link_token:'link',hosted_link_url:'https://secure.plaid.com/hl/test',expiration:'2099-01-01T00:00:00Z'})})});
 await service.command(configuration);await service.command({type:'link'});await assert.rejects(service.command({type:'cancelLink'}),/browser|revoke/);assert(service.snapshot().link);
 await service.command({type:'cancelLink',acknowledgeUnknown:true});assert.equal(service.snapshot().link,null);
});

test('posted replacement, modifications and removals reconcile together without duplicate pending spend',async()=>{
 const vault=store();await vault.write({version:1,revision:0,clientUserId:'u',config:{clientId:'id',secret:'secret',environment:'sandbox'},items:[{id:'bank',source:'plaid',institution:'Bank',accessToken:'access',cursor:'old',status:'connected',lastSync:null,error:null}],accounts:[],transactions:[{id:'bank:pending',itemId:'bank',accountId:'bank:a',pending:true,amountMinor:1200},{id:'bank:old',itemId:'bank',accountId:'bank:a',pending:false,amountMinor:1500},{id:'bank:removed',itemId:'bank',accountId:'bank:a',pending:false,amountMinor:1500}],budgets:{},link:null});
 const row=(transaction_id,amount)=>({transaction_id,account_id:'a',date:'2026-11-05',name:'Store',amount,iso_currency_code:'USD',pending:false});
 const service=createFinanceService({store:vault,clientFactory:()=>({call:async endpoint=>endpoint==='/accounts/get'?{accounts:[{account_id:'a',name:'Checking',type:'depository',balances:{current:100,iso_currency_code:'USD'}}]}:{added:[{...row('posted',10),pending_transaction_id:'pending'}],modified:[row('old',14)],removed:[{transaction_id:'removed'}],has_more:false,next_cursor:'new'}})});
 await service.command({type:'sync'});assert.deepEqual(service.snapshot().transactions.map(t=>[t.id,t.amountMinor]).sort(),[['bank:old',1400],['bank:posted',1000]]);assert.equal(service.summary({month:'2026-11',currency:'USD'}).spending,2400);assert.equal(vault.read().items[0].cursor,'new');
});
