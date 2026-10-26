import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRuntime, curateEnvironment, discoverMuseBinaries} from '../src/runtime/index.mjs';

const pin='sha256:7fddaf646dbc317e5fcac0785e135eb04df14fbb0db1863089dfd6da21730e5b';
const permissions=()=>({profileId:':ask-me',reviewerAuthority:'human',reviewerAttached:false,axes:{filesystem:'sandboxed',network:'off',approval:'onRequest',reviewer:'human'}});

// This replaces only the external native process. The real runtime and
// preserved session adapter still validate/dispatch/fold every protocol action.
async function harness(t,options={}) {
 const root=await mkdtemp(join(tmpdir(),'musebench-runtime-'));
 const binary=join(root,(options.platform??process.platform)==='win32'?'muse.exe':'muse');
 await writeFile(binary,'not executable: process boundary is injected');
 t.after(()=>rm(root,{recursive:true,force:true}));
 const calls=[]; let notification=()=>{}, serverRequest=()=>{}, resolveExit;
 const session=()=>({sessionId:'session-one',workspaceRoot:root,status:'idle',approvalMode:{mode:'onRequest',source:'sessionOverride',lastCommandId:null},permissionState:permissions()});
 const host={initializeResult:{serverInfo:{name:'muse-session-server',version:'1.4.13'},schema:{version:1,fingerprint:pin},sandboxAvailability:'available',experimentalApi:true},exited:new Promise(resolve=>{resolveExit=resolve;}),close:async()=>{calls.push({method:'close'});return {code:0,signal:null};}};
 host.connection={
  mintCommandId:()=> '0198f0ab-9999-7000-8000-000000000001',
  onNotification:fn=>{notification=fn;},onServerRequest:fn=>{serverRequest=fn;},onProtocolError:()=>{},
  request:async(method,params)=>{calls.push({method,params});if(method==='permissionProfile/list')return {profiles:[{profileId:':ask-me',label:'Ask me',available:true,reviewerAuthority:'human'}]};if(method==='session/read')return {session:session()};throw Error('Unexpected request '+method);},
  command:async(method,params,opts)=>{calls.push({method,params,opts});if(method==='session/start')return {session:session(),viewCursor:'start-1'};if(method==='turn/start')return {commandId:opts.commandId,status:'accepted',disposition:'started',startedNewTurn:true,turnId:'turn-one'};if(method==='approval/decide')return {terminal:true};throw Error('Unexpected command '+method);}
 };
 const sdk={EXPECTED_SCHEMA_FINGERPRINT:pin,spawnMspConnection:spec=>{calls.push({method:'spawn',spec});return {initialize:async params=>{calls.push({method:'initialize',params});return host;},close:host.close};}};
 const runtime=createRuntime({environment:{PATH:'',SystemRoot:'C:\\Windows',META_API_KEY:'must-not-cross',MUSE_EXPERIMENTAL_SDK_ENABLED:'on'},loadSdk:async()=>({sdk,sdkVersion:'1.4.13'}),probeVersion:async()=>options.version??'1.4.13',timeoutMs:100,...options});
 t.after(()=>runtime.close());
 return {runtime,root,binary,calls,host,sdk,session,emit:frame=>notification(frame),request:frame=>serverRequest(frame),exit:resolveExit,connect:()=>runtime.connect({binary,workspaceRoot:root})};
}

test('missing binary is actionable and never loads or starts an SDK',async()=>{
 let loaded=false;const runtime=createRuntime({environment:{PATH:''},loadSdk:async()=>{loaded=true;throw Error('must not load');}});
 assert.equal(runtime.snapshot().status,'unavailable');assert.equal(runtime.snapshot().binary,null);
 assert.match(runtime.snapshot().reason,/install|select/i);
 await assert.rejects(runtime.connect({workspaceRoot:process.cwd()}),/binary/i);
 assert.equal(loaded,false);
});

test('PATH discovery only reports existing native files and curated env excludes credentials',async t=>{
 const h=await harness(t);
 assert.deepEqual(discoverMuseBinaries({environment:{PATH:h.root}}),[h.binary]);
 const env=curateEnvironment({Path:'native-path',pAtHeXt:'.COM;.EXE;.BAT;.CMD',SystemRoot:'windows',META_API_KEY:'secret',OPENAI_API_KEY:'secret',MUSE_EXPERIMENTAL_SDK_ENABLED:'on',NODE_OPTIONS:'inject',USERPROFILE:'profile'});
 assert.equal(env.PATH,'native-path');assert.equal(env.PATHEXT,'.COM;.EXE;.BAT;.CMD');assert.equal(env.USERPROFILE,'profile');
 assert.deepEqual(Object.keys(env).sort(),['PATH','PATHEXT','SystemRoot','USERPROFILE'].sort());
});

test('curated Windows environment resolves a bare native shell command without inheriting secrets',{skip:process.platform!=='win32'},async()=>{
 const windows=process.env.SystemRoot??'C:\\Windows';
 const env=curateEnvironment({Path:join(windows,'System32'),pathext:'.COM;.EXE;.BAT;.CMD',SystemRoot:windows,META_API_KEY:'must-not-cross',NODE_OPTIONS:'must-not-cross'});
 const {stdout}=await promisify(execFile)(join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),[
  '-NoLogo','-NoProfile','-NonInteractive','-Command',
  "$ErrorActionPreference='Stop'; $null=whoami; if($env:META_API_KEY -or $env:NODE_OPTIONS){throw 'Unexpected inherited environment'}; Write-Output 'native-command-resolved'",
 ],{env,windowsHide:true,shell:false,timeout:10000,maxBuffer:4096,encoding:'utf8'});
 assert.equal(stdout.trim(),'native-command-resolved');
});

async function officialInstallFixture(t) {
 const localAppData=await mkdtemp(join(tmpdir(),'musebench-discovery-'));
 t.after(()=>rm(localAppData,{recursive:true,force:true}));
 const install=join(localAppData,'Programs','muse');await mkdir(install,{recursive:true});
 const version='1.4.13-R6996.1';const binary=join(install,`muse-bin-${version}.exe`);
 return {localAppData,install,version,binary,marker:join(install,'.muse-version')};
}

test('Windows discovery finds the official default install when process PATH is stale',async t=>{
 const f=await officialInstallFixture(t);
 await writeFile(f.marker,f.version+'\r\n');await writeFile(f.binary,'discovery fixture only');
 assert.deepEqual(discoverMuseBinaries({platform:'win32',environment:{PATH:join(f.localAppData,'stale-path'),LOCALAPPDATA:f.localAppData}}),[f.binary]);
});

test('Windows discovery resolves the versioned layout on PATH and deduplicates the default install',async t=>{
 const f=await officialInstallFixture(t);
 await writeFile(f.marker,f.version);await writeFile(f.binary,'discovery fixture only');
 assert.deepEqual(discoverMuseBinaries({platform:'win32',environment:{Path:f.install+';'+f.install,LOCALAPPDATA:f.localAppData}}),[f.binary]);
});

test('Windows discovery refuses missing, malformed and oversized version markers',async t=>{
 const f=await officialInstallFixture(t);await writeFile(f.binary,'discovery fixture only');
 const discover=()=>discoverMuseBinaries({platform:'win32',environment:{PATH:f.install}});
 assert.deepEqual(discover(),[]);
 for(const invalid of ['../escape','..\\escape','1.4.13-R6996.1/../../escape','1.4.13-R6996.1.exe:$DATA','1.4.13-R6996.1\nother','1'.repeat(1024)]){
  await writeFile(f.marker,invalid);assert.deepEqual(discover(),[],`Accepted invalid marker: ${invalid.slice(0,40)}`);
 }
});

test('Windows discovery requires both its marker and versioned target to be regular files',async t=>{
 const f=await officialInstallFixture(t);
 const discover=()=>discoverMuseBinaries({platform:'win32',environment:{PATH:f.install}});
 await mkdir(f.marker);await writeFile(f.binary,'discovery fixture only');assert.deepEqual(discover(),[]);
 await rm(f.marker,{recursive:true});await writeFile(f.marker,f.version);await rm(f.binary);await mkdir(f.binary);
 assert.deepEqual(discover(),[]);
});

test('a selected host version mismatch cannot start the host',async t=>{
 const h=await harness(t,{version:'9.0.0'});
 await assert.rejects(h.connect(),/version/i);assert.equal(h.calls.some(c=>c.method==='spawn'),false);
 assert.equal(h.runtime.snapshot().status,'unavailable');
});

test('SDK fingerprint mismatch is refused before spawning',async t=>{
 const h=await harness(t);h.sdk.EXPECTED_SCHEMA_FINGERPRINT='unknown';
 await assert.rejects(h.connect(),/SDK|fingerprint/i);assert.equal(h.calls.some(c=>c.method==='spawn'),false);
});

test('a mismatched handshake is closed and cannot create a session',async t=>{
 const h=await harness(t);h.host.initializeResult.schema.fingerprint='other';
 await assert.rejects(h.connect(),/fingerprint|compatib/i);
 assert.equal(h.calls.filter(c=>c.method==='close').length,1);assert.equal(h.calls.some(c=>c.method==='session/start'),false);
});

for(const availability of ['unavailable',undefined]){
 test(`a ${availability??'missing'} host sandbox report is actionable and closes before sessions or turns`,async t=>{
  const h=await harness(t,{platform:'win32'});
  if(availability===undefined)delete h.host.initializeResult.sandboxAvailability;
  else h.host.initializeResult.sandboxAvailability=availability;
  await assert.rejects(h.connect(),availability===undefined?/sandbox.*unknown/i:/sandbox.*unavailable/i);
  const state=h.runtime.snapshot();
  assert.match(state.reason,/host supplied no reason/i);
  assert.match(state.reason,/muse sandbox windows check/);
  assert.match(state.reason,/muse sandbox windows setup/);
  assert.match(state.reason,/already.*ready.*serve.*unavailable/i);
  assert.match(state.reason,/no session.*no turn/i);
  assert.equal(state.status,'unavailable');assert.equal(state.cleanup,'confirmed');
  assert.equal(state.permissionVerified,false);assert.equal(state.sessionId,null);
  await assert.rejects(h.runtime.send({text:'Create the page'}),/permission|blocked/i);
  assert.equal(h.calls.some(c=>c.method==='session/start'||c.method==='turn/start'),false);
  assert.equal(h.calls.filter(c=>c.method==='close').length,1);
 });
}

test('sandbox diagnostics report only a reason actually supplied by the host',async t=>{
 const h=await harness(t);h.host.initializeResult.sandboxAvailability='unavailable';
 h.host.initializeResult.sandboxUnavailableReason='bubblewrapUnavailable';
 await assert.rejects(h.connect(),/Host reason: bubblewrapUnavailable/);
 assert.doesNotMatch(h.runtime.snapshot().reason,/host supplied no reason/i);
 assert.equal(h.calls.filter(c=>c.method==='close').length,1);
});

test('a host without negotiated permission evidence stays blocked before a session or model call',async t=>{
 const h=await harness(t);h.host.initializeResult.experimentalApi=false;
 await h.connect();assert.equal(h.runtime.snapshot().status,'blocked');
 await assert.rejects(h.runtime.send({text:'Make a page'}),/permission|blocked/i);
 assert.equal(h.calls.some(c=>c.method==='session/start'||c.method==='turn/start'),false);
 assert.equal(h.calls.filter(c=>c.method==='close').length,1);
});

test('unavailable or automatic-review catalog entries cannot enable a session',async t=>{
 const h=await harness(t);h.host.connection.request=async()=>({profiles:[{profileId:':ask-me',label:'Ask me',available:true,reviewerAuthority:'autoReview'}]});
 await h.connect();assert.equal(h.runtime.snapshot().status,'blocked');
 assert.equal(h.calls.some(c=>c.method==='session/start'),false);
});

test('explicit connect verifies Ask me and explicit send streams the authoritative completion',async t=>{
 const h=await harness(t);await h.connect();
 assert.equal(h.runtime.snapshot().status,'idle');assert.equal(h.runtime.snapshot().liveVerified,false);
 const start=h.calls.find(c=>c.method==='session/start');assert.equal(start.params.permissionProfile,':ask-me');assert.equal(start.params.approvalMode,'onRequest');
 assert.deepEqual(h.calls.find(c=>c.method==='initialize').params.capabilities,{experimentalApi:true,userInputDialogs:false});
 assert.equal(h.calls.find(c=>c.method==='spawn').spec.env.META_API_KEY,undefined);
 assert.equal(h.calls.some(c=>c.method==='turn/start'),false);
 await h.runtime.send({text:'Improve the page',mode:'chat'});
 assert.equal(h.runtime.snapshot().status,'running');
 h.emit({method:'item/completed',params:{sessionId:'session-one',viewCursor:'message-1',item:{itemId:'answer-1',kind:'agentMessage',text:'Actual final answer',revision:1,status:'completed',turnId:'turn-one'}}});
 assert.equal(h.runtime.snapshot().status,'running');
 h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',viewCursor:'complete-1',terminal:'completed'}});
 assert.equal(h.runtime.snapshot().status,'completed');assert.equal(h.runtime.snapshot().messages[0].kind,'agentMessage');assert.equal(h.runtime.snapshot().messages[0].text,'Actual final answer');
});

test('changed or missing permission proof prevents the next model turn',async t=>{
 const h=await harness(t);await h.connect();
 h.host.connection.request=async()=>({session:{...h.session(),permissionState:{...permissions(),axes:{...permissions().axes,filesystem:'unrestricted'}}}});
 await assert.rejects(h.runtime.send({text:'Change a file'}),/permission/i);
 assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.calls.some(c=>c.method==='turn/start'),false);
});

test('approval receipt never approves and denial uses the latest offered choice and requirement',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Check the page'});
 await h.request({method:'approval/request',params:{sessionId:'session-one',approvalId:'approval-one',currentRequirementId:{approvalId:'approval-one',sourceIndex:0},availableChoices:[{choiceId:'reject-initial',decision:'denied',label:'Reject',scope:'once'}]}});
 assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.calls.some(c=>c.method==='approval/decide'),false);
 await assert.rejects(h.runtime.decide('allow'),/deny|support/i);
 h.emit({method:'approval/updated',params:{sessionId:'session-one',approvalId:'approval-one',currentRequirementId:{approvalId:'approval-one',sourceIndex:1},availableChoices:[{choiceId:'reject-current',decision:'denied',label:'Reject',scope:'once'}]}});
 await h.runtime.decide('deny');
 const decision=h.calls.find(c=>c.method==='approval/decide');assert.equal(decision.params.choiceId,'reject-current');assert.equal(decision.params.requirementId.sourceIndex,1);
 assert.notEqual(h.runtime.snapshot().status,'completed');assert.equal(h.calls.some(c=>c.method==='close'),true);
});

test('host exit invalidates readiness and later sends',async t=>{
 const h=await harness(t);await h.connect();h.exit({code:1,signal:null});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.runtime.snapshot().status,'unavailable');await assert.rejects(h.runtime.send({text:'Hi'}));
});

test('disconnect while version probing prevents a late host startup',async t=>{
 let release;const version=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,{probeVersion:()=>version});const connecting=h.connect();await new Promise(resolve=>setImmediate(resolve));
 await h.runtime.disconnect();release('1.4.13');await assert.rejects(connecting,/interrupt|disconnect/i);
 assert.equal(h.calls.some(c=>c.method==='spawn'),false);assert.equal(h.runtime.snapshot().status,'unavailable');
});

test('reconnect cannot overlap a host still draining',async t=>{
 const h=await harness(t);await h.connect();let finishClose;
 h.host.close=()=>new Promise(resolve=>{finishClose=resolve;});
 const closing=h.runtime.disconnect();
 await assert.rejects(h.connect(),/shutdown|disconnect|clos/i);
 finishClose({code:0,signal:null});await closing;
 assert.equal(h.runtime.snapshot().cleanup,'confirmed');
});

test('a permission change stops a turn even while an approval is blocking it',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Check files'});
 await h.request({method:'approval/request',params:{sessionId:'session-one',approvalId:'pending',currentRequirementId:{approvalId:'pending',sourceIndex:0},availableChoices:[]}});
 h.emit({method:'session/permissionProfileChanged',params:{sessionId:'session-one'}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.some(c=>c.method==='close'),true);assert.equal(h.runtime.snapshot().status,'unavailable');
});

test('one-time approval binds the displayed requirement and stays blocked until resolution',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Run a reviewed command'});
 const p={sessionId:'session-one',approvalId:'permission-one',currentRequirementId:{approvalId:'permission-one',sourceIndex:0},availableChoices:[{choiceId:'once',decision:'approved',scope:'once',label:'Allow once'},{choiceId:'persist',decision:'approved',scope:'localPersistent',label:'Always allow'}]};
 await h.request({method:'approval/request',params:p});
 const first=h.runtime.snapshot().pending.availableChoices[0].decisionToken;
 assert.equal(typeof first,'string');assert.equal(h.runtime.snapshot().pending.availableChoices[1].decisionToken,undefined);
 h.emit({method:'approval/updated',params:{...p,currentRequirementId:{approvalId:'permission-one',sourceIndex:1}}});
 await assert.rejects(h.runtime.decide(first),/stale|changed/i);
 const current=h.runtime.snapshot().pending.availableChoices[0].decisionToken;
 h.emit({method:'approval/updated',params:{...p,currentRequirementId:{approvalId:'permission-one',sourceIndex:1},rawArgs:'changed display context'}});
 await assert.rejects(h.runtime.decide(current),/stale|changed/i);
 await h.runtime.decide(h.runtime.snapshot().pending.availableChoices[0].decisionToken);
 assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.calls.some(c=>c.method==='close'),false);
 h.emit({method:'approval/resolved',params:{sessionId:'session-one',approvalId:'permission-one',decision:'approved'}});
 assert.equal(h.runtime.snapshot().status,'running');
 h.emit({method:'item/completed',params:{sessionId:'session-one',viewCursor:'answer-final',item:{itemId:'answer',kind:'agentMessage',text:'Finished after approval',revision:1,status:'completed',turnId:'turn-one'}}});
 h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',viewCursor:'turn-final',terminal:'completed'}});
 assert.equal(h.runtime.snapshot().status,'completed');assert.equal(h.runtime.snapshot().messages[0].text,'Finished after approval');
});

test('deny alias cannot write a persistent permission rule',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Inspect'});
 await h.request({method:'approval/request',params:{sessionId:'session-one',approvalId:'persist',currentRequirementId:{approvalId:'persist',sourceIndex:0},availableChoices:[{choiceId:'deny-always',decision:'denied',scope:'localPersistent',label:'Always deny'}]}});
 await assert.rejects(h.runtime.decide('deny'),/supported|choice/i);
 assert.equal(h.calls.some(c=>c.method==='approval/decide'),false);
});

test('a late approval cannot revive an uncertain turn or authorize work',async t=>{
 const h=await harness(t,{timeoutMs:10});await h.connect();
 const command=h.host.connection.command;
 h.host.connection.command=(method,...args)=>method==='turn/start'?new Promise(()=>{}):command(method,...args);
 await assert.rejects(h.runtime.send({text:'Run command'}),/timeout|timed out/i);
 assert.equal(h.runtime.snapshot().status,'uncertain');
 h.emit({method:'approval/requested',params:{sessionId:'session-one',approvalId:'late',currentRequirementId:{approvalId:'late',sourceIndex:0},availableChoices:[{choiceId:'approve',decision:'approved',scope:'once',label:'Allow once'}]}});
 const token=h.runtime.snapshot().pending?.availableChoices?.[0]?.decisionToken??'deny';
 await assert.rejects(h.runtime.decide(token),/uncertain|active|permission|current/i);
 assert.equal(h.calls.some(c=>c.method==='approval/decide'),false);
 assert.equal(h.runtime.snapshot().permissionVerified,false);
});

test('overlapping approvals stop the session instead of losing a pending request',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Inspect modules'});
 const approval=id=>({method:'approval/request',params:{sessionId:'session-one',approvalId:id,currentRequirementId:{approvalId:id,sourceIndex:0},availableChoices:[]}});
 await h.request(approval('first'));await h.request(approval('second'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.runtime.snapshot().status,'unavailable');assert.equal(h.runtime.snapshot().pending,null);
 assert.equal(h.calls.some(c=>c.method==='close'),true);
});

test('repeated disconnect cannot turn unconfirmed shutdown into permission to reconnect',async t=>{
 const h=await harness(t);await h.connect();h.host.close=async()=>{throw Error('process did not confirm exit');};
 await h.runtime.disconnect();assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');
 await h.runtime.disconnect();assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');
 await assert.rejects(h.connect(),/unconfirmed|shutdown/i);
});
