import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeCapabilities} from '../src/shared/runtime-capabilities.mjs';
const get=(state,id)=>runtimeCapabilities(state).find(item=>item.id===id);
test('capability report requires verified connection and never treats observed output as control support',()=>{
 assert.equal(get({transport:'exec',durableSessions:true},'sessions').status,'disconnected');
 const ready={transport:'exec',status:'idle',permissionVerified:true,durableSessions:true,shellEnabled:true};
 assert.equal(get(ready,'sessions').status,'available');
 assert.equal(get({...ready,fullAccess:true},'web').status,'unavailable');
 assert.equal(get({...ready,webSearchEnabled:true,fullAccess:false,shellEnabled:false},'web').status,'available');
 assert.equal(get({...ready,webSearchEnabled:true,webFetchEnabled:false},'webFetch').status,'unavailable');
 assert.equal(get({...ready,webFetchEnabled:true},'webFetch').status,'available');
 assert.equal(get(ready,'hooks').status,'available');assert.equal(get(ready,'images').status,'available');assert.equal(get(ready,'modelSelection').status,'available');
 for(const id of ['steering','questions','childControls','compaction','web']){assert.equal(get(ready,id).status,'unavailable');assert.ok(get(ready,id).reason);}
 assert.equal(get({...ready,permissionVerified:false},'shell').status,'disconnected');
 assert.equal(get({...ready,durableSessions:false},'sessions').status,'unavailable');
});

test('planning capability report never inherits Full access shell, web or hooks',()=>{
 const state={transport:'exec',status:'running',permissionVerified:true,fullAccess:true,shellEnabled:true,webSearchEnabled:true,webFetchEnabled:true,publicWebEnabled:true,planning:true};
 for(const id of ['shell','web','webFetch','hooks'])assert.equal(get(state,id).status,'unavailable');
 assert.equal(get({...state,planning:false},'webFetch').status,'available');
 assert.equal(get({transport:'msp',status:'idle',permissionVerified:true,publicWebEnabled:true},'webFetch').status,'available');
});
test('preview and legacy MSP capabilities describe actual adapter boundaries',()=>{
 for(const item of runtimeCapabilities({simulation:true,transport:'exec',permissionVerified:true,durableSessions:true}))assert.equal(item.status,'simulated');
 const msp={transport:'msp',status:'idle',permissionVerified:true};
 assert.equal(get(msp,'approvals').status,'available');
 assert.equal(get(msp,'images').status,'unavailable');
 assert.equal(get(msp,'steering').status,'unavailable');
 assert.equal(get({status:'idle'},'sessions').status,'unavailable');
});
test('native MSP capabilities require explicit adapter support and verified permissions',()=>{
 const state={transport:'msp',status:'idle',permissionVerified:true,durableSessions:true,imagesSupported:true,modelsSupported:true,hooksSupported:true,workspaceTools:true};
 for(const id of ['sessions','images','modelSelection','hooks','workspaceTools']){
  assert.equal(get(state,id).status,'available');
  assert.equal(get({...state,permissionVerified:false},id).status,'disconnected');
 }
 assert.equal(get({...state,workspaceTools:false},'workspaceTools').status,'unavailable');
});
