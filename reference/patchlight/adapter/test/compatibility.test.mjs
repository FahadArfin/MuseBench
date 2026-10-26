import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TARGET,compatibility} from '../compatibility.mjs';
const init=()=>({serverInfo:{name:'muse-session-server',version:TARGET.hostVersion},schema:{version:TARGET.schemaVersion,fingerprint:TARGET.fingerprint},sandboxAvailability:'available'});
test('exact documented candidate is eligible but never marked live-verified',()=>{
 const result=compatibility({sdkVersion:TARGET.sdkVersion,initializeResult:init()});
 assert.equal(result.available,true);assert.equal(result.liveVerified,false);
});
test('unknown SDK, host, schema and sandbox each fail closed',()=>{
 for(const [field,value,reason] of [['sdk','2.0.0','sdk-version-mismatch'],['host','1.4.14','host-version-mismatch'],['schema',2,'schema-version-mismatch'],['fingerprint','sha256:wrong','schema-fingerprint-mismatch'],['sandbox',undefined,'sandbox-unverified']]){
  const h=init();let sdkVersion=TARGET.sdkVersion;
  if(field==='sdk')sdkVersion=value;if(field==='host')h.serverInfo.version=value;if(field==='schema')h.schema.version=value;if(field==='fingerprint')h.schema.fingerprint=value;if(field==='sandbox')delete h.sandboxAvailability;
  const r=compatibility({sdkVersion,initializeResult:h});assert.equal(r.available,false);assert.equal(r.reason,reason);
 }
});
test('missing runtime and malformed handshake are explicit unavailable states',()=>{
 assert.equal(compatibility({}).reason,'runtime-unavailable');
 assert.equal(compatibility({sdkVersion:TARGET.sdkVersion,initializeResult:{}}).reason,'invalid-handshake');
});
test('unmodified official recorded transcript is rejected, not silently relabeled compatible',()=>{
 const frames=readFileSync(new URL('../evidence/transcript.ndjson',import.meta.url),'utf8').trim().split('\n').map(l=>JSON.parse(JSON.parse(l).raw));
 const recorded=frames.find(f=>f.result?.schema).result;
 assert.notEqual(recorded.schema.fingerprint,TARGET.fingerprint);
 assert.equal(compatibility({sdkVersion:TARGET.sdkVersion,initializeResult:recorded}).available,false);
});
test('candidate pin matches downloaded official source schema manifest',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../evidence/schema-manifest.json',import.meta.url)));
 assert.equal(TARGET.fingerprint,manifest.fingerprint);assert.equal(TARGET.schemaVersion,manifest.schemaVersion);
});
