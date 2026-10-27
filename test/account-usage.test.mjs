import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAllowance,parseBillingText,usageHeadline} from '../src/shared/account-usage.mjs';
test('subscription uses remaining percentage, preserves zero and separate windows',()=>{
 const a=normalizeAllowance({subs_usage:{window:{used_percent:100,resets_at:1800000000},weekly:{used_percent:21}}});
 assert.equal(a.windows[0].remainingPercent,0);assert.equal(a.windows[1].remainingPercent,79);assert.equal(usageHeadline(a),'0% left');
});
test('missing and malformed allowance does not become zero',()=>{assert.equal(normalizeAllowance({}).windows.length,0);assert.equal(normalizeAllowance({subs_usage:{window:{used_percent:null}}}).windows.length,0);});
test('billing spend alert is not a hard cap; dollars and zero are preserved',()=>{
 const b=parseBillingText('Month-to-date spend\nUSD 25.50\nMonthly spend limit alert\nUSD 100.00');
 assert.equal(b.spent,25.5);assert.equal(b.alertLimit,100);assert.equal(usageHeadline({windows:[],billing:b}),'$74.50 to alert');
 assert.equal(parseBillingText('Month-to-date spend\nUSD 0.00').spent,0);
});
test('unlimited spending has no invented denominator; payment balance is not spend',()=>{
 assert.equal(usageHeadline({windows:[],billing:parseBillingText('Month-to-date spend\nUSD 25.50')}),'$25.50 spent');
 assert.equal(parseBillingText('Current balance\nUSD 25.50\nPayment threshold\nUSD 100.00').spent,undefined);
 assert.equal(parseBillingText('Month-to-date spend\nUSD 25.50\nMonth-to-date spend\nUSD 30.00'),null);
});

test('rendered Meta billing separates credits, owed balance and charge threshold',()=>{
 const b=parseBillingText("Current balance\n$0.09\nYour balance won't increase while using free credits.\nFree credits in use\n$149.74\nYour balance reaches\n$20.00\nSpend limits\nEmail notifications\nSet a monthly amount to get email alerts as you approach it.\nSet up");
 assert.equal(b.currentBalance,0.09);assert.equal(b.freeCredits,149.74);assert.equal(b.paymentThreshold,20);assert.equal(b.spent,undefined);assert.equal(b.alertLimit,undefined);assert.equal(b.alertStatus,'not-set');assert.equal(usageHeadline({windows:[],billing:b}),'$149.74 free credits');
});
