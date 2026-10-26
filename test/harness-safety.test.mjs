import test from 'node:test';
import assert from 'node:assert/strict';
import {redact,diagnosticText,permissionReport,probeEligibility,confirmNativeShutdown} from '../scripts/harness-safety.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

test('quoted JSON credential values never survive diagnostic redaction',()=>{
 const sentinel='FAKE_REVIEW_CREDENTIAL_9375';
 for(const key of ['password','api_key','access_token','authorization','cookie']){
  for(const input of [JSON.stringify({[key]:sentinel}),{rawArgs:JSON.stringify({[key]:sentinel})}]){
   assert.equal(JSON.stringify(redact(input)).includes(sentinel),false,key);
  }
 }
});

test('diagnostic fragments and truncated private keys are redacted before display limits',()=>{
 const sentinel='FAKE_REVIEW_CREDENTIAL_9375';
 for(const value of ['Host rejected: {"password":"'+sentinel+'"}','password="'+sentinel+' with spaces"','-----BEGIN PRIVATE KEY-----\n'+sentinel]){
  assert.equal(diagnosticText(value,200).includes(sentinel),false);
 }
});

test('permission reports omit all request contents including arbitrary identifiers and labels',()=>{
 const sentinel='FAKE_REVIEW_CREDENTIAL_9375';
 const report=permissionReport({kind:'approval',toolName:sentinel,subject:sentinel,rawArgs:sentinel,approvalId:sentinel,
  availableChoices:[{choiceId:sentinel,label:sentinel,decisionToken:sentinel,decision:'approved',scope:'once'},
   {choiceId:sentinel,label:sentinel,decision:'denied',scope:'once'}]});
 assert.equal(JSON.stringify(report).includes(sentinel),false);
 assert.deepEqual(report.oneTimeChoices,{approve:1,deny:1});
});

const eligible=()=>({version:TARGET.hostVersion,sdkVersion:TARGET.sdkVersion,sdkFingerprint:TARGET.fingerprint,
 initializeResult:{serverInfo:{version:TARGET.hostVersion},schema:{version:TARGET.schemaVersion,fingerprint:TARGET.fingerprint},sandboxAvailability:'available',experimentalApi:true}});

test('preflight eligibility requires every pinned compatibility check, not sandbox availability alone',()=>{
 assert.equal(probeEligibility(eligible()).status,'host-eligible-not-model-tested');
 for(const change of [
  x=>{x.version='9.9.9';},x=>{x.version='unrecognized';},x=>{x.sdkVersion='9.9.9';},x=>{x.sdkFingerprint='other';},
  x=>{x.initializeResult.serverInfo.version='9.9.9';},x=>{x.initializeResult.schema.fingerprint='other';},
  x=>{x.initializeResult.schema.version=2;},x=>{x.initializeResult.experimentalApi=false;}
 ]){
  const value=eligible();change(value);const result=probeEligibility(value);
  assert.equal(result.available,false);assert.equal(result.status,'host-incompatible');
 }
 const unavailable=eligible();unavailable.initializeResult.sandboxAvailability='unavailable';
 assert.equal(probeEligibility(unavailable).status,'host-sandbox-unavailable');
});

test('native shutdown requires an explicit disconnect and observed cleanup confirmation',async()=>{
 for(const cleanup of ['confirmed','not-started']){
  const actions=[];assert.equal(await confirmNativeShutdown(async action=>{actions.push(action);return {runtime:{cleanup,sessionId:null}};}),cleanup);
  assert.deepEqual(actions,[{type:'disconnectMuse'}]);
 }
 for(const runtime of [{cleanup:'unconfirmed'},{cleanup:'pending'},{},{cleanup:'confirmed',sessionId:'still-live'}])
  await assert.rejects(confirmNativeShutdown(async()=>({runtime})),/could not be confirmed/);
 await assert.rejects(confirmNativeShutdown(async()=>({error:'failed',runtime:{cleanup:'confirmed'}})),/could not be confirmed/);
 await assert.rejects(confirmNativeShutdown(()=>new Promise(()=>{}),{timeoutMs:5}),/timed out/);
});
