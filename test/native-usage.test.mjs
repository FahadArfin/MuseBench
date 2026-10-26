import test from 'node:test';import assert from 'node:assert/strict';
import {nativeUsage,combineUsage,restoreUsage} from '../src/shared/native-usage.mjs';
const payload={models:[{model:'muse',input_tokens:100,cached_tokens:20,output_tokens:30,reasoning_tokens:10,calls:2}],calls:2,completed_calls:2,failed_calls:0,cancelled_calls:0,children_included:false};
test('native usage retains explicit counters without inferring context or money',()=>{
 const u=nativeUsage(payload);assert.equal(u.inputTokens,100);assert.equal(u.outputTokens,30);assert.equal(u.cachedTokens,20);assert.equal(u.reasoningTokens,10);assert.equal(u.childrenIncluded,false);assert.equal(u.cost,undefined);assert.equal(u.contextTokens,undefined);
 assert.equal(nativeUsage({calls:1}),null);assert.equal(nativeUsage({...payload,models:[{...payload.models[0],input_tokens:-1}]}),null);assert.equal(nativeUsage({...payload,models:[{...payload.models[0],input_tokens:Infinity}]}),null);
 assert.equal(restoreUsage({reportedRuns:1,totalRuns:1,inputTokens:-1}),null);
});
test('usage aggregation marks partial reporting and avoids treating missing usage as zero',()=>{
 const u=nativeUsage(payload);assert.equal(combineUsage([null,null]),null);const result=combineUsage([u,null,u]);assert.equal(result.reportedRuns,2);assert.equal(result.totalRuns,3);assert.equal(result.inputTokens,200);assert.deepEqual(restoreUsage(result),result);
});
