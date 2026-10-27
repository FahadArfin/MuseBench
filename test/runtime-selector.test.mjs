import test from 'node:test';import assert from 'node:assert/strict';
import {createCodeRuntime} from '../src/runtime/selector.mjs';
test('exec stays default and an active connection cannot be switched to interactive',async()=>{
 const created=[];const factory=transport=>()=>{let s={transport,status:'unavailable',cleanup:'confirmed'};created.push(transport);return{snapshot:()=>s,subscribe:()=>()=>{},connect:async()=>{s={...s,status:'idle',permissionVerified:true};},disconnect:async()=>{s={...s,status:'unavailable',permissionVerified:false};},send:async()=>{}};};
 const r=createCodeRuntime({execFactory:factory('exec'),mspFactory:factory('msp'),verifyConfiguration:async()=>{}});assert.equal(r.snapshot().transport,'exec');await r.connect({workspaceRoot:'fixture'});await assert.rejects(r.connect({transport:'msp',fullAccess:true}),/Disconnect/);await r.disconnect();await assert.rejects(r.connect({transport:'msp',fullAccess:false}),/Full access/);await r.connect({transport:'msp',fullAccess:true,workspaceRoot:'fixture'});assert.equal(r.snapshot().transport,'msp');assert.deepEqual(created,['exec','msp']);await r.disconnect();
});
