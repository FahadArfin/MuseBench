import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/shared/compaction-history.mjs').catch(()=>({}));
const at='2026-10-30T12:00:00.000Z';
const item=(patch={})=>({kind:'compaction',itemId:'item',turnId:'turn',revision:1,status:'completed',outcome:'compacted',trigger:'auto',...patch});
const observe=(patch={},options={})=>api.observeCompaction(item(patch),{sessionId:'session',source:'live',at,...options});
test('compaction history retains finite observations without inferring current occupancy',()=>{
 const r=observe({tokensBefore:100,tokensAfter:0,summarizedThrough:'opaque/anchor',text:'private summary',other:'unknown'});
 assert.deepEqual(r,{sessionId:'session',itemId:'item',turnId:'turn',revision:1,trigger:'auto',status:'compacted',source:'live',at,tokensBefore:100,tokensAfter:0,summarizedThrough:'opaque/anchor'});
 for(const value of [null,-1,Infinity,NaN,2.5,Number.MAX_SAFE_INTEGER+1,'200']){const r=observe({tokensBefore:value,tokensAfter:value});assert.equal(r.tokensBefore,undefined);assert.equal(r.tokensAfter,undefined);}
 assert.equal(observe({status:'inProgress',outcome:'compacted'}).status,'in-progress');assert.equal(observe({outcome:'future-outcome'}).status,'unknown');assert.equal(observe({status:'future-status'}).status,'unknown');
});
test('invalid identity is discarded and bounded text cannot become an execution handle',()=>{
 for(const patch of [{itemId:''},{itemId:'x'.repeat(201)},{revision:0},{revision:1.5},{turnId:null},{kind:'toolCall'}])assert.equal(observe(patch),null);
 assert.equal(observe({}, {sessionId:''}),null);assert.equal(observe({}, {source:'invented'}),null);
 const r=observe({summarizedThrough:'a'.repeat(4097),reason:'x'.repeat(2000),trigger:'y'.repeat(250)});assert.equal(r.summarizedThrough,undefined);assert.equal(r.reason.length,1000);assert.equal(r.trigger,'unknown');
});
test('merge isolates sessions, ignores stale revisions, bounds history and preserves first observation order',()=>{
 const first=observe(),second=observe({itemId:'second'}),foreign=observe({}, {sessionId:'other'});let rows=api.mergeCompactionHistory([], [first,second,foreign]);assert.equal(rows.length,3);
 const newer=observe({revision:2,tokensAfter:50},{at:'2026-10-30T12:01:00.000Z'});rows=api.mergeCompactionHistory(rows,[newer,first]);assert.equal(rows[0].revision,2);assert.equal(rows[0].tokensAfter,50);assert.equal(rows[0].at,at);assert.equal(rows[2].sessionId,'other');
 assert.deepEqual(api.mergeCompactionHistory(rows,[newer]),rows);
 rows=api.mergeCompactionHistory(rows,Array.from({length:70},(_,i)=>observe({itemId:'i'+i})));assert.equal(rows.length,30);assert.equal(rows[0].itemId,'i40');assert.equal(rows.at(-1).itemId,'i69');
 assert.deepEqual(api.mergeCompactionHistory([{...first,revision:-1}],[{...second,tokensAfter:-1,extra:'private'}]),[{...second}]);
});
test('interruption preserves completed evidence and marks pending history unknown without replay',()=>{
 const completed=observe(),pending=observe({itemId:'pending',status:'inProgress'});const rows=api.interruptCompactionHistory([completed,pending]);assert.equal(rows[0].status,'compacted');assert.equal(rows[1].status,'unknown');assert.match(rows[1].reason,/not observed/i);assert.equal(rows[1].revision,1);
 const terminal=observe({itemId:'pending',revision:2,status:'completed',outcome:'compacted'},{source:'restored'});const reconciled=api.mergeCompactionHistory(rows,[terminal]);assert.equal(reconciled[1].status,'compacted');assert.equal(reconciled[1].source,'restored');
});
