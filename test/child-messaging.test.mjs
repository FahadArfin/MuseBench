import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingChildReceipt,childTargetPending,childGroup} from '../src/shared/child-messaging.mjs';
const input={type:'childControl',taskId:'task',sessionId:'session',itemId:'agent',revision:3,action:'sendMessage',body:'Use the existing API'};
const receipt={...input,commandId:'new',status:'accepted'};
const state={task:{id:'task',childControlReceipts:[]},runtime:{sessionId:'session',childReceipts:[receipt]}};
test('only a new acknowledgement for this exact child message can clear its draft',()=>{
 assert.equal(matchingChildReceipt(state,input).status,'accepted');
 assert.equal(matchingChildReceipt(state,input,['new']),undefined);
 for(const patch of [{sessionId:'other'},{itemId:'other'},{revision:4},{action:'followupTask'},{body:'Different text'},{childId:'workflow'},{attempt:1}]){
  assert.equal(matchingChildReceipt({...state,runtime:{...state.runtime,childReceipts:[{...receipt,...patch}]}},input),undefined);
 }
 assert.equal(matchingChildReceipt({...state,task:{id:'other'}},input),undefined);
 assert.equal(matchingChildReceipt({...state,runtime:{...state.runtime,sessionId:'other'}},input),undefined);
 assert.equal(matchingChildReceipt(null,input),undefined);
});
test('uncertain receipts remain uncertain and only block their own live target',()=>{
 const runtime={sessionId:'session',childReceipts:[{...receipt,status:'unknown'}]};
 assert.equal(childTargetPending(runtime,'agent'),true);
 assert.equal(childTargetPending(runtime,'other'),false);
 assert.equal(childTargetPending({...runtime,sessionId:'replacement'},'agent'),false);
 assert.equal(matchingChildReceipt({...state,runtime},input).status,'unknown');
 assert.equal(childTargetPending({...runtime,childReceipts:[receipt]},'agent'),false);
});
test('result-ready and closed children are done, starting and running children remain active',()=>{
 for(const child of [{status:'inProgress',controlStatus:'resultReady'},{status:'inProgress',controlStatus:'closed'},{status:'failed'}])assert.equal(childGroup(child),'Done');
 for(const child of [{status:'inProgress',controlStatus:'running'},{status:'inProgress',controlStatus:'starting'},{status:'blocked'}])assert.equal(childGroup(child),'Active');
});
