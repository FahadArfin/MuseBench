import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceInput} from './fixtures/discovery-oauth-store.mjs';
import {discoveryIdentity,discoverySelection,sameDiscovery} from '../src/shared/tool-discovery.mjs';
import {restoreNativeSession,prepareNativeSession} from '../src/shared/native-session.mjs';

const identity=()=>import('../src/runtime/discovery-auth-identity.mjs');
test('project root and unrelated overlays do not change durable source identity',async()=>{
 const {authSourceIdentity}=await identity();const first=authSourceIdentity(sourceInput);
 assert.match(first,/^[a-f0-9]{64}$/);
 assert.equal(authSourceIdentity({...sourceInput,root:'C:/other',overlays:['plugin'],revision:'b'.repeat(64),enabledTools:['new'],startupMs:33,environment:{UNUSED:'changed'}}),first);
});
test('canonical global settings or native profile location change prevents enrollment reuse',async()=>{
 const {authSourceIdentity}=await identity();for(const field of ['globalSettingsPath','nativeProfilePath'])assert.notEqual(authSourceIdentity({...sourceInput,[field]:'C:/other/profile'}),authSourceIdentity(sourceInput));
 assert.equal(authSourceIdentity({...sourceInput,globalSettingsPath:'c:\\FIXTURE\\profile\\settings.json',nativeProfilePath:'c:\\fixture\\PROFILE\\.'}),authSourceIdentity(sourceInput));
 assert.throws(()=>authSourceIdentity({...sourceInput,nativeProfilePath:'relative/profile'}));
});
test('atomic same-path settings replacement preserves enrollment provenance',async()=>{
 const {authSourceIdentity}=await identity();assert.equal(authSourceIdentity({...sourceInput,settingsInode:999,settingsMtime:123,settingsDigest:'unrelated rewrite'}),authSourceIdentity(sourceInput));
});
test('endpoint template resolved header global ID and auth policy changes create new identity',async()=>{
 const {authSourceIdentity}=await identity();for(const patch of [{urlTemplate:'https://resource.example/other'},{resolvedUrl:'https://resource.example/changed'},{headerTemplates:{'X-Key':'${OTHER}'}},{resolvedHeaders:{'X-Key':'changed'}},{sourceId:'global:other'},{authPolicy:{version:2,mode:'public-native-bearer'}}])assert.notEqual(authSourceIdentity({...sourceInput,...patch}),authSourceIdentity(sourceInput));
});
test('header order normalized aliases and unrelated environment preserve identity',async()=>{
 const {authSourceIdentity}=await identity(),v={...sourceInput,headerTemplates:{'X-B':'b','X-A':'a'},resolvedHeaders:{'X-B':'b','X-A':'a'}};
 assert.equal(authSourceIdentity({...v,transport:'http',headerTemplates:{'x-a':'a','x-b':'b'},resolvedHeaders:{'x-a':'a','x-b':'b'}}),authSourceIdentity(v));
 assert.throws(()=>authSourceIdentity({...v,resolvedHeaders:{Authorization:'a',authorization:'b'}}));
});
test('binding scope order is canonical and token material never changes its digest',async()=>{
 const {normalizeAuthBinding,authBindingRevision,authSourceIdentity}=await identity();const b={grantId:'enrollment',sourceId:'global:fixture',authSourceIdentity:authSourceIdentity(sourceInput),endpoint:sourceInput.resolvedUrl,issuer:'https://issuer.example/',resource:'https://resource.example/',registrationId:'registration',scopes:['write','read']};
 const normalized=normalizeAuthBinding(b);assert.deepEqual(normalized.scopes,['read','write']);assert.equal(authBindingRevision({...b,scopes:['read','write'],tokens:'ignored'}),normalized.bindingRevision);
 assert.notEqual(authBindingRevision({...b,grantId:'new-enrollment'}),normalized.bindingRevision);
 assert.throws(()=>normalizeAuthBinding({...b,scopes:['read','read']}));assert.throws(()=>normalizeAuthBinding({...b,bindingRevision:'a'.repeat(64)}));
});
test('old identity remains compatible and unknown auth marker retains recovery ID',()=>{
 const row={id:'global:fixture',revision:'a'.repeat(64)},marker='b'.repeat(64),base={id:'fixture-native-session',root:'C:/fixture',status:'ready',transport:'msp'};
 assert.deepEqual(discoveryIdentity({sources:[row]}),{sources:[row]});assert.deepEqual(discoverySelection({sources:[{...row,authBindingRevision:marker}],reviewed:true}).sources[0],{...row,authBindingRevision:marker});
 assert.equal(sameDiscovery({sources:[row]},{sources:[{...row,authBindingRevision:marker}]}),false);
 for(const bad of ['future',null,marker.toUpperCase(),{version:2}]){const restored=restoreNativeSession({...base,toolDiscovery:{sources:[{...row,authBindingRevision:bad}]}});assert.equal(restored.id,base.id);assert.equal(restored.status,'needs-recovery');assert.equal(restored.unsupportedToolDiscovery,true);assert.deepEqual(restoreNativeSession(restored),restored);}
 const saved={...base,toolDiscovery:{sources:[{...row,authBindingRevision:marker}]}};assert.equal(restoreNativeSession(saved).toolDiscovery.sources[0].authBindingRevision,marker);
 assert.throws(()=>prepareNativeSession(saved,base.root,{transport:'msp',nativeSessionId:base.id,toolDiscovery:{sources:[row]}}));
 assert.throws(()=>prepareNativeSession(base,base.root,{transport:'msp',nativeSessionId:base.id,toolDiscovery:saved.toolDiscovery}));
});
test('safe DTO never contains private record marker and rejects unknown command fields',async()=>{
 const {safeAuthState,validateDiscoveryAuthCommand}=await import('../src/shared/discovery-auth.mjs');
 const state=safeAuthState({sourceId:'global:fixture',sourceRevision:'a'.repeat(64),status:'ready',credentialAvailable:true,bindingRevision:'b'.repeat(64),tokens:{accessToken:'secret-private-marker'},reason:'secret-private-marker',headers:{secret:'secret-private-marker'},registration:{clientId:'secret-private-marker'},origin:'https://resource.example/private-secret?token=secret-private-marker',reasonCode:'network-failed'});
 assert.doesNotMatch(JSON.stringify(state),/secret-private-marker|private-secret|tokens|headers|registration/);assert.equal(state.origin,undefined);assert.equal(state.reasonCode,'network-failed');
 const source={taskId:'task-fixture',sourceId:'global:fixture',sourceRevision:'a'.repeat(64)};assert.deepEqual(validateDiscoveryAuthCommand({...source,type:'prepare',reviewedEndpoint:true}),{...source,type:'prepare',reviewedEndpoint:true});
 for(const bad of [{...source,type:'inspect',token:'secret'},{...source,type:'prepare'},{...source,type:'inspect',sourceRevision:'future'},{taskId:'task',attemptId:'opaque-attempt',type:'begin',reviewRevision:'a'.repeat(64),reviewed:false}])assert.throws(()=>validateDiscoveryAuthCommand(bad));
 assert.throws(()=>validateDiscoveryAuthCommand({taskId:'task',attemptId:'opaque-attempt',type:'savePublicClient',reviewRevision:'a'.repeat(64),reviewed:true,clientId:'x'.repeat(16385),callbackPort:1024}));
});
test('every auth command is an exact bounded source or reviewed-attempt union',async()=>{
 const {validateDiscoveryAuthCommand}=await import('../src/shared/discovery-auth.mjs'),source={taskId:'task',sourceId:'global:fixture',sourceRevision:'a'.repeat(64)},attempt={taskId:'task',attemptId:'opaque_attempt'},review={reviewRevision:'b'.repeat(64),reviewed:true};
 const commands=[{...source,type:'inspect'},{...source,type:'prepare',reviewedEndpoint:true},{...source,...review,type:'forget',bindingRevision:'c'.repeat(64)},{...attempt,type:'status'},{...attempt,type:'cancel'},...['begin','retrySave'].map(type=>({...attempt,...review,type})),{...attempt,...review,type:'reviewDestination',destinationChoiceId:'choice_destination'},{...attempt,...review,type:'selectIssuer',issuerChoiceId:'choice_issuer'},{...attempt,...review,type:'savePublicClient',clientId:'c'.repeat(16384),callbackPort:1024}];
 for(const cmd of commands){assert.deepEqual(validateDiscoveryAuthCommand(cmd),cmd);for(const field of Object.keys(cmd)){const missing={...cmd};delete missing[field];assert.throws(()=>validateDiscoveryAuthCommand(missing));}assert.throws(()=>validateDiscoveryAuthCommand({...cmd,owner:'renderer-owner'}));}
 const setup=commands.at(-1);assert.equal(validateDiscoveryAuthCommand({...setup,callbackPort:65535}).callbackPort,65535);
 for(const callbackPort of [1023,65536,1.5])assert.throws(()=>validateDiscoveryAuthCommand({...setup,callbackPort}));
 assert.throws(()=>validateDiscoveryAuthCommand({...setup,clientId:'é'.repeat(8193)}));
});
