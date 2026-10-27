import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeCapabilities} from '../src/shared/runtime-capabilities.mjs';
const get=(state,id)=>runtimeCapabilities(state).find(item=>item.id===id);
test('capability report requires verified connection and never treats observed output as control support',()=>{
 assert.equal(get({transport:'exec',durableSessions:true},'sessions').status,'disconnected');
 const ready={transport:'exec',status:'idle',permissionVerified:true,durableSessions:true,shellEnabled:true};
 assert.equal(get(ready,'sessions').status,'available');
 assert.equal(get({...ready,fullAccess:true},'web').status,'available');
 assert.equal(get(ready,'hooks').status,'available');assert.equal(get(ready,'images').status,'available');assert.equal(get(ready,'modelSelection').status,'available');
 for(const id of ['steering','questions','childControls','compaction','web']){assert.equal(get(ready,id).status,'unavailable');assert.ok(get(ready,id).reason);}
 assert.equal(get({...ready,permissionVerified:false},'shell').status,'disconnected');
 assert.equal(get({...ready,durableSessions:false},'sessions').status,'unavailable');
});
test('preview and legacy MSP capabilities describe actual adapter boundaries',()=>{
 for(const item of runtimeCapabilities({simulation:true,transport:'exec',permissionVerified:true,durableSessions:true}))assert.equal(item.status,'simulated');
 const msp={transport:'msp',status:'idle',permissionVerified:true};
 assert.equal(get(msp,'approvals').status,'available');
 assert.equal(get(msp,'images').status,'unavailable');
 assert.equal(get(msp,'steering').status,'unavailable');
 assert.equal(get({status:'idle'},'sessions').status,'unavailable');
});
