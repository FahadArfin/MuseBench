import test from 'node:test';import assert from 'node:assert/strict';
import {createCodeRuntime} from '../src/runtime/selector.mjs';
test('compact status follows the current adapter without cloning full snapshots',async()=>{
 let full=0;const states={exec:{status:'unavailable',cleanup:'confirmed'},msp:{status:'unavailable',cleanup:'confirmed'}};
 const factory=kind=>()=>({snapshot(){full++;return{...states[kind]};},statusSnapshot:()=>({...states[kind]}),subscribe:()=>()=>{},async connect(){states[kind].status='idle';states[kind].permissionVerified=true;},async disconnect(){states[kind].status='unavailable';states[kind].permissionVerified=false;}});
 const r=createCodeRuntime({execFactory:factory('exec'),mspFactory:factory('msp')});assert.equal(typeof r.statusSnapshot,'function');
 full=0;assert.equal(r.statusSnapshot().status,'unavailable');assert.equal(full,0);
 await r.connect({transport:'msp',fullAccess:true});states.msp.childrenBusy=true;states.exec.status='running';full=0;
 assert.equal(r.statusSnapshot().status,'idle');assert.equal(r.statusSnapshot().childrenBusy,true);assert.equal(full,0);
 const read=r.statusSnapshot();read.status='changed';assert.equal(states.msp.status,'idle');await r.close();
});

test('compact selector remains compatible with legacy adapters',async()=>{
 let reads=0;const r=createCodeRuntime({execFactory:()=>({snapshot(){reads++;return{status:'unavailable',cleanup:'confirmed'};},subscribe:()=>()=>{},async disconnect(){}})});
 assert.equal(typeof r.statusSnapshot,'function');reads=0;assert.equal(r.statusSnapshot().status,'unavailable');assert.equal(reads,1);await r.close();
});
test('exec stays default and an active connection cannot be switched to interactive',async()=>{
 const created=[];const factory=transport=>()=>{let s={transport,status:'unavailable',cleanup:'confirmed'};created.push(transport);return{snapshot:()=>s,subscribe:()=>()=>{},connect:async()=>{s={...s,status:'idle',permissionVerified:true};},disconnect:async()=>{s={...s,status:'unavailable',permissionVerified:false};},send:async()=>{}};};
 const r=createCodeRuntime({execFactory:factory('exec'),mspFactory:factory('msp'),verifyConfiguration:async()=>{}});assert.equal(r.snapshot().transport,'exec');await r.connect({workspaceRoot:'fixture'});await assert.rejects(r.connect({transport:'msp',fullAccess:true}),/Disconnect/);await r.disconnect();await assert.rejects(r.connect({transport:'msp',fullAccess:false}),/Full access/);await r.connect({transport:'msp',fullAccess:true,workspaceRoot:'fixture'});assert.equal(r.snapshot().transport,'msp');assert.deepEqual(created,['exec','msp']);await r.disconnect();
});
