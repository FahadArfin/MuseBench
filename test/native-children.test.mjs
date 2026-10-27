import test from 'node:test';import assert from 'node:assert/strict';import {createChildTracker} from '../src/runtime/children.mjs';
import {childActions,childWorking} from '../src/shared/child-actions.mjs';
const child=(patch={})=>({itemId:'i',kind:'subagent',subagentId:'a',revision:1,status:'inProgress',controlStatus:'running',...patch});
test('child commands require observed identity and current revision',()=>{const t=createChildTracker();assert.throws(()=>t.prepare({itemId:'i',revision:1,action:'stop'}));t.observe(child());assert.equal(t.prepare({itemId:'i',revision:1,action:'sendMessage',body:'  Correction  '}).params.body,'Correction');t.observe(child({revision:2,controlStatus:'resultReady',status:'completed'}));assert.throws(()=>t.prepare({itemId:'i',revision:1,action:'stop'}),/changed/);assert.throws(()=>t.prepare({itemId:'i',revision:2,action:'sendMessage',body:'x'}),/available/);assert.equal(t.prepare({itemId:'i',revision:2,action:'followupTask',body:'Next'}).method,'subagent/followupTask');t.observe(child({revision:1}));assert.equal(t.snapshot().items[0].revision,2);});
test('workflow control uses the current observed child attempt, never a renderer supplied run id',()=>{const t=createChildTracker();t.observe({itemId:'w',kind:'workflow',workflowRunId:'native-run',revision:3,status:'inProgress',children:[{childId:'c',attempt:2,status:'terminal',terminal:'failed'}]});assert.throws(()=>t.prepare({itemId:'w',revision:3,action:'retry',childId:'c',attempt:1}),/attempt/);const command=t.prepare({itemId:'w',revision:3,action:'retry',childId:'c',attempt:2,workflowRunId:'forged'});assert.equal(command.params.workflowRunId,'native-run');assert.equal(command.params.attempt,2);assert.throws(()=>t.prepare({itemId:'w',revision:3,action:'close',childId:'c',attempt:2}));});
test('unknown kinds and states do not acquire controls and retained output is bounded',()=>{const t=createChildTracker();t.observe(child({controlStatus:'futureState',objective:'x'.repeat(9000),result:{summary:'x'.repeat(9000)}}));assert.throws(()=>t.prepare({itemId:'i',revision:1,action:'stop'}));assert.ok(t.snapshot().items[0].objective.length<=2000);assert.ok(t.snapshot().items[0].result.summary.length<=8000);for(let i=0;i<150;i++)t.observe(child({itemId:'id'+i}));assert.ok(t.snapshot().items.length<=128);assert.equal(t.snapshot().truncated,true);});

test('workflow controls select the latest observed attempt even with retained history',()=>{const t=createChildTracker();t.observe({itemId:'w',kind:'workflow',workflowRunId:'run',revision:3,status:'inProgress',children:[{childId:'c',attempt:1,status:'terminal',terminal:'failed'},{childId:'c',attempt:2,status:'running'}]});assert.throws(()=>t.prepare({itemId:'w',revision:3,childId:'c',attempt:1,action:'retry'}),/attempt/);assert.equal(t.prepare({itemId:'w',revision:3,childId:'c',attempt:2,action:'skip'}).params.attempt,2);});

test('a ready result is not proof of a resumable paused child',()=>{
 const t=createChildTracker();t.observe(child({controlStatus:'resultReady'}));
 assert.throws(()=>t.prepare({itemId:'i',revision:1,action:'resume'}),/available/);
 assert.equal(t.prepare({itemId:'i',revision:1,action:'followupTask',body:'Next'}).method,'subagent/followupTask');
});
test('workflow-owned results route new work through the workflow attempt',()=>{
 const t=createChildTracker();t.observe(child({controlStatus:'resultReady',workflowRunId:'native-workflow'}));
 for(const action of ['followupTask','resume','reopen'])assert.throws(()=>t.prepare({itemId:'i',revision:1,action,body:'Next'}),/available/);
 assert.equal(t.prepare({itemId:'i',revision:1,action:'readResult'}).method,'subagent/readResult');
 assert.deepEqual(childActions(t.snapshot().items[0]),['readResult','close']);
 t.observe(child({revision:2,controlStatus:'closed',workflowRunId:'native-workflow',status:'completed'}));
 assert.throws(()=>t.prepare({itemId:'i',revision:2,action:'reopen'}),/available/);
});
test('native started workflow attempts can be skipped using their observed attempt',()=>{
 const t=createChildTracker();t.observe({itemId:'w',kind:'workflow',workflowRunId:'run',revision:1,status:'inProgress',children:[{childId:'c',attempt:3,status:'started'}]});
 assert.deepEqual(t.prepare({itemId:'w',revision:1,childId:'c',attempt:3,action:'skip'}),{method:'workflow/childControl',params:{workflowRunId:'run',childId:'c',attempt:3,action:'skip'}});
});
test('generic terminal state overrides stale running controls and recovery remains manual',()=>{
 const t=createChildTracker();t.observe(child({status:'failed',controlStatus:'running'}));
 assert.throws(()=>t.prepare({itemId:'i',revision:1,action:'sendMessage',body:'Next'}),/available/);
 assert.equal(childWorking(t.snapshot().items[0]),false);
 for(const controlStatus of ['recoveryPending','manualReconciliation']){
  assert.deepEqual(childActions(child({controlStatus})),[]);
  assert.equal(childWorking(child({controlStatus})),true);
 }
});
test('tracker retains only the host supplied child session identity',()=>{
 const t=createChildTracker();t.observe(child({childSessionId:'native-child-session'}));
 assert.equal(t.snapshot().items[0].childSessionId,'native-child-session');
 t.observe(child({revision:2}));assert.equal(t.snapshot().items[0].childSessionId,undefined);
});
test('workflow ownership is correlated from observed child identity when omitted on the subagent row',()=>{
 const t=createChildTracker();t.observe(child({controlStatus:'resultReady'}));
 t.observe({itemId:'w',kind:'workflow',workflowRunId:'owner-run',revision:1,status:'completed',children:[{childId:'a',attempt:1,status:'terminal',terminal:'completed'}]});
 assert.throws(()=>t.prepare({itemId:'i',revision:1,action:'followupTask',body:'Next'}),/available/);
 assert.deepEqual(childActions(t.snapshot().items.find(i=>i.itemId==='i')),['readResult','close']);
});
