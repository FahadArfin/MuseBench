import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContextUsage,restoreContextUsage,contextUsagePresentation} from '../src/shared/native-context-usage.mjs';
const binding={sessionId:'s',viewCursor:'v',source:'live',observedAt:'2026-10-30T12:00:00.000Z'};
test('context usage preserves zero, missing limits and unknown pressure without inventing facts',()=>{
 const zero=normalizeContextUsage({usedTokens:0,pressure:'normal'},binding);
 assert.equal(zero.usedTokens,0);assert.equal(zero.windowTokens,null);assert.equal(zero.pressure,'normal');
 assert.equal(contextUsagePresentation(zero).percentage,null);assert.equal(contextUsagePresentation(zero).meter,null);
 const future=normalizeContextUsage({usedTokens:125,windowTokens:100,pressure:'future'},binding);
 assert.equal(future.pressure,'unknown');assert.equal(contextUsagePresentation(future).percentage,125);assert.equal(contextUsagePresentation(future).meter,100);
 assert.equal(normalizeContextUsage({usedTokens:20,windowTokens:100,pressure:'normal'},binding).usedTokens,20);
 assert.equal(contextUsagePresentation(normalizeContextUsage({usedTokens:1,windowTokens:6},binding)).percentage,16.6,'a displayed occupancy floor must not round up');
});
test('context usage rejects malformed counts and identities; invalid windows remain unknown',()=>{
 for(const usedTokens of [undefined,null,'1',-1,1.2,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.equal(normalizeContextUsage({usedTokens},binding),null);
 for(const windowTokens of [null,0,-1,'100',Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(normalizeContextUsage({usedTokens:2,windowTokens},binding).windowTokens,null);
 for(const patch of [{sessionId:''},{sessionId:'s'.repeat(201)},{viewCursor:null},{source:'invented'},{observedAt:'not a date'}])assert.equal(normalizeContextUsage({usedTokens:1},{...binding,...patch}),null);
 assert.equal(normalizeContextUsage({usedTokens:1},{...binding,viewCursor:'',source:'restored'}).viewCursor,'');
});
test('persisted context facts are sanitized and never restart as connected',()=>{
 const value={...normalizeContextUsage({usedTokens:22,windowTokens:80,pressure:'warning'},binding),connected:true,secret:'discard'};
 const saved=restoreContextUsage(value);assert.equal(saved.connected,false);assert.equal(saved.source,'live');assert.equal(saved.observedAt,binding.observedAt);assert.equal(Object.hasOwn(saved,'secret'),false);
 assert.equal(restoreContextUsage({...value,usedTokens:null}),null);assert.equal(contextUsagePresentation(null).label,'Context');
});
