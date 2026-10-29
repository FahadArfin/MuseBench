import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRuntimeStatus,readRuntimeStatus,runtimeStatusBusy} from '../src/runtime/status.mjs';

test('status projection reads only lifecycle fields and returns detached primitives',()=>{
 const state={status:'idle',cleanup:'confirmed',pending:{kind:'approval'},operationBusy:0,childrenBusy:1};
 for(const key of ['messages','activity','credentials','childInspections'])Object.defineProperty(state,key,{get(){throw Error('Status must not read '+key);}});
 const first=projectRuntimeStatus(state);assert.deepEqual(first,{status:'idle',cleanup:'confirmed',pending:true,operationBusy:false,childrenBusy:true});
 first.status='changed';assert.equal(state.status,'idle');state.status='running';assert.equal(projectRuntimeStatus(state).status,'running');assert.equal(first.status,'changed');
});

test('status reader prefers compact state and legacy fallback reads exactly once',()=>{
 let full=0,compact=0;const state={status:'idle',messages:['Private content']};
 const r={snapshot(){full++;return state;},statusSnapshot(){compact++;return state;}};
 assert.equal(readRuntimeStatus(r).status,'idle');assert.equal(full,0);assert.equal(compact,1);
 state.status='running';assert.equal(readRuntimeStatus(r).status,'running');delete r.statusSnapshot;
 assert.equal(readRuntimeStatus(r).status,'running');assert.equal(full,1);assert.ok(!('messages' in readRuntimeStatus(r)));
});

test('status reader rejects malformed declared adapters rather than fabricating idle state',()=>{
 for(const value of [null,undefined,42,[],Promise.resolve({}),{status:{}},{cleanup:{}}]){
  assert.throws(()=>readRuntimeStatus({statusSnapshot:()=>value}),/runtime status/i);
 }
 assert.throws(()=>readRuntimeStatus({statusSnapshot:'idle',snapshot:()=>({status:'running'})}),/runtime status/i);
 assert.throws(()=>readRuntimeStatus({snapshot:()=>null}),/runtime status/i);
 assert.deepEqual(readRuntimeStatus(undefined),{status:null,cleanup:null,pending:false,operationBusy:false,childrenBusy:false});
});

test('native busy classification preserves all existing active and terminal conditions',()=>{
 for(const status of ['running','starting','submitting','connecting','checking-permissions'])assert.equal(runtimeStatusBusy(projectRuntimeStatus({status})),true,status);
 for(const status of ['idle','completed','failed','cancelled','closed','unavailable','blocked','uncertain',null])assert.equal(runtimeStatusBusy(projectRuntimeStatus({status})),false,String(status));
 for(const flag of [{operationBusy:true},{childrenBusy:true},{cleanup:'unconfirmed'},{pending:{}}])assert.equal(runtimeStatusBusy(projectRuntimeStatus({status:'idle',...flag})),true);
 assert.equal(runtimeStatusBusy(projectRuntimeStatus({cleanup:'pending'})),false,'cleanup pending keeps the existing separate lifecycle policy');
});
