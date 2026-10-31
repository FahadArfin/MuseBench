import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionDetails } from '../src/ui/permissions.mjs';

const approval = { kind:'approval',toolName:'shell',subject:'Run a project command',availableChoices:[{choiceId:'allow',label:'Allow once',scope:'once',decision:'approved',decisionToken:'current-allow'},{choiceId:'deny',label:'Deny',scope:'once',decision:'denied',decisionToken:'current-deny'}] };

test('approval details preserve a consequential suffix within the review limit', () => {
  const rawArgs = 'echo harmless;'.repeat(1600) + '; delete-important-files';
  const details = permissionDetails({...approval,rawArgs});
  assert.equal(details.args,rawArgs);
  assert.equal(details.approvalAllowed,true);
});

test('oversized approval details visibly report truncation and withhold approval while retaining denial', () => {
  for (const field of ['rawArgs','subject','toolName']) {
    const details = permissionDetails({...approval,[field]:'x'.repeat(70000)});
    assert.equal(details.truncated,true,field);
    assert.equal(details.approvalAllowed,false,field);
    assert.equal(details.choices.find(choice=>choice.decision==='denied').decisionToken,'current-deny');
  }
});

test('unrenderable request details withhold approval', () => {
  const rawArgs={};rawArgs.circular=rawArgs;
  const details=permissionDetails({...approval,rawArgs});
  assert.equal(details.approvalAllowed,false);
  assert.equal(details.incomplete,true);
});

test('permission choices exclude persistent grants and missing current tokens', () => {
  const details=permissionDetails({...approval,availableChoices:[...approval.availableChoices,{choiceId:'forever',scope:'session',decision:'approved',decisionToken:'persistent'},{choiceId:'missing',scope:'once',decision:'approved'}]});
  assert.deepEqual(details.choices.map(choice=>choice.choiceId),['allow','deny']);
});

const discoveryArgs={sourceId:'global:docs-one',catalogRevision:'a'.repeat(64),tool:'same_tool',arguments:{query:'literal <script>unsafe()</script> **text**'}};
const discoveryApproval={...approval,sessionId:'session',turnId:'turn',approvalId:'request',revision:3,toolName:'mcp__musebench_discovery__discovery_call',rawArgs:JSON.stringify(discoveryArgs)};
const discoveryRuntime=(pending=discoveryApproval)=>({sessionId:'session',turnId:'turn',permissionVerified:true,pendingRequests:[pending],toolDiscovery:{sources:[{id:'global:docs-one',revision:'b'.repeat(64)},{id:'global:docs-two',revision:'c'.repeat(64)}]}});

test('exact current discovery approvals show requested identities and preserve all raw details and tokens',()=>{
 const details=permissionDetails(discoveryApproval,discoveryRuntime());
 assert.deepEqual(details.discovery,{sourceId:'global:docs-one',tool:'same_tool',catalogRevision:'a'.repeat(64)});
 assert.equal(details.args,discoveryApproval.rawArgs);assert.equal(details.pending,discoveryApproval);
 assert.deepEqual(details.choices,approval.availableChoices);assert.equal(details.approvalAllowed,true);
 // A digest is only a requested identity: it does not assert a live catalog match.
 const other={...discoveryApproval,rawArgs:JSON.stringify({...discoveryArgs,sourceId:'global:docs-two',catalogRevision:'d'.repeat(64)})};
 assert.deepEqual(permissionDetails(other,discoveryRuntime(other)).discovery,{sourceId:'global:docs-two',tool:'same_tool',catalogRevision:'d'.repeat(64)});
});

test('discovery enrichment requires exact wrapper, reviewed source, current request, session and turn',()=>{
 const cases=[
  [discoveryApproval,undefined],
  [{...discoveryApproval,toolName:'discovery_call'},discoveryRuntime()],
  [discoveryApproval,{...discoveryRuntime(),sessionId:'previous'}],
  [discoveryApproval,{...discoveryRuntime(),turnId:'previous'}],
  [discoveryApproval,{...discoveryRuntime(),permissionVerified:false}],
  [discoveryApproval,{...discoveryRuntime(),pendingRequests:[]}],
  [{...discoveryApproval,revision:2},discoveryRuntime()],
  [{...discoveryApproval,approvalId:'old'},discoveryRuntime()],
  [discoveryApproval,{...discoveryRuntime(),toolDiscovery:{sources:[{id:'global:docs-two',revision:'c'.repeat(64)}]}}],
 ];
 for(const [pending,runtime] of cases)assert.equal(permissionDetails(pending,runtime).discovery,undefined);
 const changed={...discoveryApproval,rawArgs:JSON.stringify({...discoveryArgs,tool:'changed'})};
 assert.equal(permissionDetails(changed,discoveryRuntime()).discovery,undefined);
 for(const toolName of ['discovery_call','mcp__other__discovery_call','mcp__musebench_discovery__discovery_call_extra']){
  const pending={...discoveryApproval,toolName};assert.equal(permissionDetails(pending,discoveryRuntime(pending)).discovery,undefined);
 }
 const invalidSelection={...discoveryRuntime(),toolDiscovery:{sources:[{id:'global:docs-one',revision:'invalid'}]}};
 assert.equal(permissionDetails(discoveryApproval,invalidSelection).discovery,undefined);
 const fallback={...discoveryRuntime(),pending:discoveryApproval};delete fallback.pendingRequests;
 assert.ok(permissionDetails(discoveryApproval,fallback).discovery);
});

test('malformed, unknown, excessive and non JSON discovery arguments retain the generic view',()=>{
 const values=['{',JSON.stringify(null),JSON.stringify([]),JSON.stringify({...discoveryArgs,sourceId:'global:unknown'}),JSON.stringify({...discoveryArgs,extra:true}),JSON.stringify({...discoveryArgs,catalogRevision:'not-a-digest'}),JSON.stringify({...discoveryArgs,tool:''}),JSON.stringify({...discoveryArgs,tool:'x'.repeat(201)}),JSON.stringify({...discoveryArgs,arguments:[]}),JSON.stringify({...discoveryArgs,arguments:{large:'x'.repeat(70000)}}),JSON.stringify({...discoveryArgs,arguments:{large:'界'.repeat(30000)}}),discoveryArgs];
 for(const rawArgs of values){const pending={...discoveryApproval,rawArgs};const details=permissionDetails(pending,discoveryRuntime(pending));assert.equal(details.discovery,undefined);assert.equal(details.choices[0].decisionToken,'current-allow');}
});

test('hostile tool identity remains literal data and changing reviewed selection removes attribution',()=>{
 const pending={...discoveryApproval,rawArgs:JSON.stringify({...discoveryArgs,tool:'<img src=x onerror=unsafe()> **tool**'})};
 const runtime=discoveryRuntime(pending);
 assert.equal(permissionDetails(pending,runtime).discovery?.tool,'<img src=x onerror=unsafe()> **tool**');
 runtime.toolDiscovery.sources=[{id:'global:other',revision:'e'.repeat(64)}];
 assert.equal(permissionDetails(pending,runtime).discovery,undefined);
});
