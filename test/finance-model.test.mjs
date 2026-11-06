import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyMinor,parseFinanceCsv,financeSummary,financeQuestion,financeSample} from '../src/shared/finance-model.mjs';

const account={id:'a',itemId:'bank',name:'Checking',type:'depository',currency:'USD',balanceMinor:100000};
const tx=(id,amountMinor,extra={})=>({id,accountId:'a',itemId:'bank',date:'2026-10-10',merchant:'Shop',currency:'USD',category:'Shopping',flow:'expense',pending:false,amountMinor,...extra});
test('money uses currency minor units and rejects ambiguous/nonfinite values',()=>{
 assert.equal(moneyMinor('12.34','USD'),1234);assert.equal(moneyMinor('-0.10','USD'),-10);
 assert.equal(moneyMinor('120','JPY'),120);assert.equal(moneyMinor('1.234','KWD'),1234);
 for(const value of ['NaN','1,000','1e9','1.005','',Infinity])assert.throws(()=>moneyMinor(value,'USD'));
 // 25,000 records plus 100 balances must remain exact even at the per-value cap.
 assert.equal(moneyMinor('1000000000.00','USD'),100000000000);
 assert.throws(()=>moneyMinor('1000000000.01','USD'),/range/);
});
test('posted cash flow excludes transfers and pending, refunds reduce expenses, currencies stay separate',()=>{
 const summary=financeSummary({accounts:[account,{...account,id:'card',type:'credit',balanceMinor:25000},{...account,id:'unknown',balanceMinor:null}],transactions:[tx('expense',2500),tx('refund',-500,{flow:'refund'}),tx('pay',-10000,{flow:'income'}),tx('transfer',90000,{flow:'transfer'}),tx('pending',1000,{pending:true}),tx('eur',50000,{currency:'EUR'})],budgets:{}},{month:'2026-10',currency:'USD'});
 assert.equal(summary.income,10000);assert.equal(summary.spending,2000);assert.equal(summary.cashFlow,8000);assert.equal(summary.netWorth,75000);assert.equal(summary.unknownBalances,1);assert.equal(summary.pending,1000);assert.equal(summary.currencies.includes('EUR'),true);
});
test('recurring charges require three posted comparable dates, labelled estimated with next date',()=>{
 const rows=['2026-08-15','2026-09-15','2026-10-15'].map((date,i)=>tx('s'+i,1299,{date,merchant:'Streaming'}));
 const summary=financeSummary({accounts:[account],transactions:rows,budgets:{}},{month:'2026-10',currency:'USD',today:'2026-10-20'});
 assert.equal(summary.recurring.length,1);assert.equal(summary.recurring[0].cadence,'Monthly');assert.equal(summary.recurring[0].nextDate,'2026-11-15');assert.equal(summary.recurring[0].estimated,true);
 assert.equal(financeSummary({accounts:[],transactions:rows.slice(1),budgets:{}},{month:'2026-10',currency:'USD'}).recurring.length,0);
});
test('CSV supports BOM, quoted commas/newlines and explicit sign convention',()=>{
 const data=parseFinanceCsv('\uFEFFDate,Description,Amount,Category\r\n2026-10-01,"Shop, Inc",-12.34,Food\r\n2026-10-02,"Pay\nroll",1000,Income',{positive:'income',currency:'USD'});
 assert.equal(data.rows.length,2);assert.equal(data.rows[0].amountMinor,1234);assert.equal(data.rows[1].amountMinor,-100000);assert.equal(data.rows[1].flow,'income');
});
test('CSV invalid dates/amounts/duplicate headers reject with row information; no silent row drops',()=>{
 for(const text of ['Date,Description,Amount\n2026-02-30,Shop,2','Date,Description,Amount\n2026-01-01,Shop,broken','Date,Date,Amount\n2026-01-01,Shop,2','Date,Description,Amount\n2026-01-01,"unfinished,2'])assert.throws(()=>parseFinanceCsv(text,{currency:'USD',positive:'expense'}));
});
test('CSV explicit transfer/refund overrides sign and category without inventing balances',()=>{
 const data=parseFinanceCsv('Date,Description,Amount,Type\n2026-10-01,Move,100,transfer\n2026-10-02,Return,-20,refund',{currency:'USD',positive:'expense'});
 assert.equal(data.rows[0].flow,'transfer');assert.equal(data.rows[1].flow,'refund');assert.equal(data.rows[1].amountMinor,-2000);
});
test('sample is labelled and deterministic question only cites supplied computed facts',()=>{
 const data=financeSample('2026-11-05');const s=financeSummary(data,{month:'2026-11',currency:'USD'});
 assert(data.items.every(i=>i.source==='sample'));assert(s.spending>0);assert.match(financeQuestion('spending',s),/posted|spending/i);assert.equal(data.config,undefined);
});
