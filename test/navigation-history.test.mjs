import test from 'node:test';
import assert from 'node:assert/strict';
import {visit,historyTarget} from '../src/shared/navigation-history.mjs';
const empty=()=>({entries:[],index:-1});
test('visits deduplicate refreshes and bound the history',()=>{
 let history=visit(empty(),'chat-a');assert.equal(visit(history,'chat-a'),history);
 history=visit(visit(history,'home'),'projects',2);assert.deepEqual(history,{entries:['home','projects'],index:1});
});
test('new navigation after going back discards the forward branch',()=>{
 let history=visit(visit(visit(empty(),'a'),'b'),'c');history={...history,index:1};
 assert.equal(historyTarget(history,1),2);history=visit(history,'d');assert.deepEqual(history.entries,['a','b','d']);assert.equal(historyTarget(history,1),-1);
});
test('history skips removed destinations in both directions and respects boundaries',()=>{
 const history={entries:['a','deleted','c','deleted','e'],index:2},available=route=>route!=='deleted';
 assert.equal(historyTarget(history,-1,available),0);assert.equal(historyTarget(history,1,available),4);
 assert.equal(historyTarget({...history,index:0},-1,available),-1);
 assert.equal(historyTarget(empty(),1),-1);
});
