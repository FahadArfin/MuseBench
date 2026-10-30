import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteDiscoveryClient} from '../src/runtime/discovery-remote.mjs';
import {createDiscoveryGateway} from '../src/runtime/discovery-gateway.mjs';
import {peer,source} from './fixtures/discovery-remote-peer.mjs';

test('token-only remote adapter rejects expired credentials before any resource request',async()=>{
 const resource=await peer(),definition={...source(resource.url),headers:{}};
 const client=createRemoteDiscoveryClient(definition,{readAccessToken:async()=>({token:'FIXTURE_ACCESS_EXPIRED',expiresAt:Date.now()-1})});
 try{await assert.rejects(client.connect(),/authorization|sign.in|token/i);assert.equal(resource.requests.length,0);}finally{await client.close();await resource.close();}
});
test('token-only adapter passes bearer solely to the reviewed resource and never replays an unauthorized effect',async()=>{
 const resource=await peer({call:'auth'});let reads=0;
 const gateway=createDiscoveryGateway({sources:[{...source(resource.url),headers:{},authBindingRevision:'b'.repeat(64)}],sessionId:'native-owned',verify:async()=>{},readAccessToken:async row=>{assert.equal(row.id,'global:fixture');reads++;return{token:'FIXTURE_ACCESS_PRIVATE',expiresAt:null};}});
 try{const catalog=await gateway.search({query:''});const receipt=await gateway.call({sourceId:'global:fixture',catalogRevision:catalog.sources[0].catalogRevision,tool:'allowed',arguments:{value:7}});assert.equal(receipt.outcome,'unknown');assert.equal(resource.effects,1);assert.ok(reads>0);assert.ok(resource.requests.every(r=>r.headers.authorization==='Bearer FIXTURE_ACCESS_PRIVATE'));assert.doesNotMatch(JSON.stringify(receipt),/FIXTURE_ACCESS/);await assert.rejects(gateway.search({query:''}),/closed/);}finally{await gateway.dispose();await resource.close();}
});
test('app-owned OAuth rejects conflicting configured Authorization without token retrieval',async()=>{
 let reads=0;assert.throws(()=>createRemoteDiscoveryClient(source('http://127.0.0.1:1/mcp'),{readAccessToken:async()=>{reads++;return{token:'never',expiresAt:null};}}),/authorization/i);assert.equal(reads,0);
});
