import test from 'node:test';
import assert from 'node:assert/strict';
import * as resets from '../src/shared/usage-resets.mjs';

const now=Date.parse('2026-10-28T15:00:00.000Z');
const usage={billingSource:'account',windows:[
 {label:'Current window',remainingPercent:0,resetsAt:new Date(now+90000).toISOString()},
 {label:'Weekly',remainingPercent:9,resetsAt:new Date(now+86400000).toISOString()},
]};

test('reported reset windows count down without changing remaining allowance',()=>{
 const input=structuredClone(usage);const rows=resets.subscriptionResets(input,now);
 assert.equal(rows.kind,'subscription');assert.equal(rows.windows[0].status,'scheduled');
 assert.equal(rows.windows[0].remainingMs,90000);assert.equal(rows.windows[1].remainingMs,86400000);
 assert.deepEqual(input,usage);
 const after=resets.subscriptionResets(input,now+90001);
 assert.equal(after.windows[0].status,'awaiting');assert.equal(after.windows[0].remainingMs,0);
 assert.equal(input.windows[0].remainingPercent,0);
});

test('missing data and invalid dates never become a reset or banked balance',()=>{
 for(const value of [null,{}, {windows:[]}, {...usage,billingSource:'unknown'}]){
  assert.deepEqual(resets.subscriptionResets(value,now),{kind:'unavailable',windows:[]});
 }
 const rows=resets.subscriptionResets({windows:[{label:'Weekly',remainingPercent:5,resetsAt:'bad'}]},now);
 assert.deepEqual(rows.windows,[{label:'Weekly',resetsAt:null,remainingMs:null,status:'unknown'}]);
});

test('API mode cannot inherit a subscription reset from a previous selection',()=>{
 const api={...usage,billingSource:'api'};
 assert.deepEqual(resets.subscriptionResets(api,now),{kind:'api',windows:[]});
 assert.equal(resets.nextUsageRefreshDelay(api,now),300000);
});

test('refresh occurs once after the nearest future deadline, never loops on stale data',()=>{
 assert.equal(resets.nextUsageRefreshDelay(usage,now),91000);
 assert.equal(resets.nextUsageRefreshDelay(usage,now+90000),300000);
 assert.equal(resets.nextUsageRefreshDelay(usage,now+90000000),300000);
 assert.equal(resets.nextUsageRefreshDelay(null,now),300000);
 assert.equal(resets.nextUsageRefreshDelay({...usage,windows:[{...usage.windows[0],resetsAt:'bad'}]},now),300000);
});

test('countdown stays concise across minute, hour and day boundaries',()=>{
 assert.equal(resets.formatResetCountdown(20000),'in under 1m');
 assert.equal(resets.formatResetCountdown(90000),'in 2m');
 assert.equal(resets.formatResetCountdown(7500000),'in 2h 5m');
 assert.equal(resets.formatResetCountdown(176400000),'in 2d 1h');
 assert.equal(resets.formatResetCountdown(0),'Awaiting Meta update');
 assert.equal(resets.formatResetCountdown(null),'Reset time unavailable');
});
