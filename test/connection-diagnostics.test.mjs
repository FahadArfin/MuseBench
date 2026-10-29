import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionDiagnostics,extensionDiagnostics,diagnosticReport} from '../src/shared/connection-diagnostics.mjs';

const row=(rows,id)=>rows.find(item=>item.id===id);
test('A failed or cancelled request does not invalidate its verified native connection',()=>{
 for(const status of ['failed','cancelled']){
  const rows=connectionDiagnostics({status,transport:'msp',permissionVerified:true});
  assert.equal(row(rows,'connection').value,'Connected');
  assert.equal(row(rows,'permissions').value,'Verified for this connection');
  assert.equal(row(rows,'completion').value,'Not tested');
 }
});
test('A configured executable path does not prove the executable currently exists',()=>{
 assert.equal(row(connectionDiagnostics({binary:'missing/muse.exe',status:'unavailable'}),'runtime').value,'Executable selected');
 assert.equal(row(connectionDiagnostics({}),'runtime').value,'No executable selected');
});
test('Discovery and prior success do not establish current readiness',()=>{
 const rows=connectionDiagnostics({binary:'private/path/muse.exe',status:'closed',liveVerified:true,permissionVerified:true});
 assert.equal(row(rows,'connection').value,'Disconnected');
 assert.equal(row(rows,'permissions').value,'Not confirmed');
 assert.equal(row(rows,'completion').value,'Previously observed');
 assert.match(row(rows,'runtime').detail,/Connect/);
});
test('Uncertain cleanup and question state retain explicit recovery guidance',()=>{
 const rows=connectionDiagnostics({status:'uncertain',transport:'msp',permissionVerified:true,cleanup:'unconfirmed',pending:{kind:'input',question:'private'}});
 assert.equal(row(rows,'connection').value,'Outcome uncertain');
 assert.equal(row(rows,'permissions').value,'Not confirmed');
 assert.match(row(rows,'cleanup').detail,/Inspect/);
 assert.match(row(rows,'input').detail,/question/);
 assert.ok(!JSON.stringify(rows).includes('private'));
});
test('Ready interactive and preview states are distinguished without a health probe',()=>{
 const ready=connectionDiagnostics({binary:'muse',status:'ready',transport:'msp',permissionVerified:true,restoration:{status:'restored'}});
 assert.equal(row(ready,'connection').value,'Connected');
 assert.equal(row(ready,'permissions').value,'Verified for this connection');
 assert.equal(row(ready,'history').value,'Native session restored');
 const preview=connectionDiagnostics({status:'ready',permissionVerified:true,simulation:true,liveVerified:true});
 assert.equal(row(preview,'connection').value,'Preview simulation');
 assert.equal(row(preview,'completion').value,'Not tested');
});
test('Reports use allowlisted fields even when runtime values contain secrets',()=>{
 const runtime={status:'secret-status',transport:'secret-transport',binary:'secret-path',hostVersion:'secret-token',sdkVersion:'1.4.14',reason:'secret-reason',sessionId:'secret-id',pending:{kind:'secret-kind',text:'secret-prompt'}};
 const report=diagnosticReport(runtime);
 assert.doesNotMatch(report,/secret-/);
 assert.match(report,/SDK: 1.4.14/);
 assert.match(report,/No provider, sign-in or billing probe/);
 assert.match(report,/Runtime version: Not reported/);
});
test('A native question or approval preserves this connection’s verified permissions',()=>{
 for(const kind of ['input','approval']){
  const rows=connectionDiagnostics({status:'blocked',transport:'msp',permissionVerified:true,sessionId:'s',pending:{kind,sessionId:'s'}});
  assert.equal(row(rows,'permissions').value,'Verified for this connection');
  assert.equal(row(rows,'connection').value,kind==='input'?'Needs your answer':'Needs approval');
 }
 const unavailable=connectionDiagnostics({status:'blocked',permissionVerified:false,pending:{kind:'approval'}});
 assert.equal(row(unavailable,'permissions').value,'Not confirmed');
});
test('Extension diagnostics separate configured, disabled, invalid and unreviewed items',()=>{
 const rows=extensionDiagnostics({available:true,errors:[],pluginsReviewed:false,plugins:[{enabled:true,valid:true,reviewRequired:true},{enabled:false,valid:true},{enabled:true,valid:false}],servers:[{enabled:true,reviewed:true},{enabled:true,reviewed:false},{enabled:false,reviewed:true}],skills:[],skillCatalog:{stale:true}});
 assert.equal(row(rows,'plugins').value,'3 installed · 2 need attention');
 assert.equal(row(rows,'servers').value,'2 enabled · 1 needs review · 1 disabled');
 assert.equal(row(rows,'skills').value,'Last saved inventory');
 assert.match(row(rows,'servers').detail,/not checked/);
 assert.match(row(rows,'inventory').detail,/configuration/);
});
test('Incomplete extension reads never report empty lists as verified absence',()=>{
 const rows=extensionDiagnostics({available:false,errors:['private'],plugins:[],servers:[],skills:[]});
 assert.equal(row(rows,'inventory').value,'Incomplete snapshot');
 assert.match(row(rows,'inventory').detail,/Refresh/);
 assert.doesNotMatch(JSON.stringify(rows),/private/);
});
