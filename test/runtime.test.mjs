import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRuntime, curateEnvironment, discoverMuseBinaries} from '../src/runtime/index.mjs';

const pin='sha256:c94c3d1f2f51e6424074b9ec43eac3eedcf532d3dcd77351ec1383a87d3049c6';
const inspectionItem={itemId:'inspect-item',kind:'subagent',childSessionId:'child-session',revision:2,status:'inProgress',controlStatus:'running'};
const childRead=()=>({session:{sessionId:'child-session',parentSessionId:'session-one',kind:'subagent',status:'notLoaded'},history:{mode:'inline',items:[{itemId:'answer',kind:'agentMessage',revision:1,status:'completed',text:'Child answer'}],snapshot:null},viewCursor:'child-head',pendingRequests:[]});
test('child inspection uses only session/read during running work and leaves parent ownership untouched',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Delegate'});h.emit({method:'item/updated',params:{sessionId:'session-one',item:inspectionItem}});
 const before=h.runtime.snapshot(),commands=h.calls.filter(c=>c.opts).length,reads=[];
 h.host.connection.request=async(method,params)=>{reads.push({method,params});return childRead();};
 const input={sessionId:'session-one',itemId:'inspect-item',revision:2,childSessionId:'forged'};
 await assert.rejects(h.runtime.inspectChild({...input,sessionId:'foreign'}));await assert.rejects(h.runtime.inspectChild({...input,revision:1}));assert.equal(reads.length,0);
 await h.runtime.inspectChild(input);const after=h.runtime.snapshot();assert.deepEqual(reads,[{method:'session/read',params:{sessionId:'child-session',excludeItems:false}}]);assert.equal(after.childInspections[0].data.history.items[0].text,'Child answer');
 for(const key of ['status','turnId','childrenBusy','permissionVerified'])assert.deepEqual(after[key],before[key]);assert.equal(h.calls.filter(c=>c.opts).length,commands);
});
test('child read accepts ordinary revision progress but rejects retargeting and clears failed refreshes',async t=>{
 const h=await harness(t);await h.connect();h.emit({method:'item/updated',params:{sessionId:'session-one',item:inspectionItem}});let resolve;
 h.host.connection.request=()=>new Promise(r=>resolve=r);const input={sessionId:'session-one',itemId:'inspect-item',revision:2};const pending=h.runtime.inspectChild(input);
 await assert.rejects(h.runtime.inspectChild(input),/already/);h.emit({method:'item/updated',params:{sessionId:'session-one',item:{...inspectionItem,revision:3}}});resolve(childRead());await pending;assert.equal(h.runtime.snapshot().childInspections[0].revision,2);
 const refresh=h.runtime.inspectChild({...input,revision:3});assert.equal(h.runtime.snapshot().childInspections[0].data,undefined);h.emit({method:'item/updated',params:{sessionId:'session-one',item:{...inspectionItem,revision:4,childSessionId:'different-child'}}});resolve(childRead());await assert.rejects(refresh,/changed/);assert.equal(h.runtime.snapshot().childInspections[0].data,undefined);
});
test('late child reads cannot populate a disconnected or replacement connection',async t=>{
 const h=await harness(t);await h.connect();h.emit({method:'item/updated',params:{sessionId:'session-one',item:inspectionItem}});let resolve;h.host.connection.request=()=>new Promise(r=>resolve=r);
 const pending=h.runtime.inspectChild({sessionId:'session-one',itemId:'inspect-item',revision:2});await h.runtime.disconnect();resolve(childRead());await assert.rejects(pending,/interrupted/);assert.deepEqual(h.runtime.snapshot().childInspections,[]);
});
test('protocol invalidation clears pending child reads instead of leaving a permanent loader',async t=>{
 const h=await harness(t);await h.connect();h.emit({method:'item/updated',params:{sessionId:'session-one',item:inspectionItem}});let resolve;h.host.connection.request=()=>new Promise(r=>resolve=r);
 const pending=h.runtime.inspectChild({sessionId:'session-one',itemId:'inspect-item',revision:2});h.protocolError(Error('Protocol invalidation fixture'));resolve(childRead());await assert.rejects(pending,/interrupted/);
 assert.equal(h.runtime.snapshot().permissionVerified,false);assert.deepEqual(h.runtime.snapshot().childInspections,[]);
});
test('interactive credentials are private and verified before a turn can start',async t=>{
 let changed=false;const key='fixture-api-private';
 const h=await harness(t,{credentials:async({environment})=>({source:'api',environment:{...environment,META_API_KEY:key},verify:async()=>{if(changed)throw Error('Billing source changed');}})});
 await h.connect();assert.equal(h.calls.find(c=>c.method==='spawn').spec.env.META_API_KEY,key);assert.ok(!JSON.stringify(h.runtime.snapshot()).includes(key));
 changed=true;await assert.rejects(h.runtime.send({text:'Go'}),/changed/);assert.equal(h.calls.some(c=>c.method==='turn/start'),false);
});
const inputRequest=()=>({sessionId:'session-one',turnId:'turn-one',userInputId:'question-one',questions:[{id:'color',header:'Color',question:'Which color?',options:[{label:'Blue'},{label:'Green'}],selection:{mode:'single'}}]});
test('native question answers bind to the observed request and wait for settlement',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Ask'});await h.request({method:'userInput/request',params:inputRequest()});
 const p=h.runtime.snapshot().pending;assert.equal(h.runtime.snapshot().questionsSupported,true);
 const action={sessionId:p.sessionId,turnId:p.turnId,userInputId:p.userInputId,revision:p.revision,operation:'answer',answers:[{questionId:'color',selectedLabel:'Blue'}]};
 await assert.rejects(h.runtime.answerInput({...action,userInputId:'stale'}));await assert.rejects(h.runtime.answerInput({...action,answers:[{questionId:'color',selectedLabel:'invented'}]}));
 h.host.connection.command=async(method,params,opts)=>{h.calls.push({method,params,opts});return {status:'accepted',commandId:opts.commandId,userInputId:params.userInputId};};
 await h.runtime.answerInput(action);assert.equal(h.runtime.snapshot().pending.userInputId,p.userInputId);assert.equal(h.runtime.snapshot().inputResponse.status,'accepted');
 await assert.rejects(h.runtime.answerInput(action),/pending|already/);
 h.emit({method:'userInput/settled',params:{sessionId:p.sessionId,userInputId:p.userInputId,outcome:'answered',answers:action.answers}});assert.equal(h.runtime.snapshot().pending,null);assert.equal(h.runtime.snapshot().status,'running');assert.deepEqual(h.runtime.snapshot().inputResponse.confirmedAnswers,action.answers);
});
test('ambiguous native question response is not replayed',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Ask'});await h.request({method:'userInput/request',params:inputRequest()});const p=h.runtime.snapshot().pending;
 h.host.connection.command=async()=>({status:'accepted',commandId:'wrong',userInputId:p.userInputId});
 const action={...p,operation:'cancel'};await assert.rejects(h.runtime.answerInput(action));assert.equal(h.runtime.snapshot().inputResponse.status,'unknown');await assert.rejects(h.runtime.answerInput(action));
});
test('native question arriving before turn acknowledgement is retained',async t=>{
 const h=await harness(t);await h.connect();const command=h.host.connection.command;h.host.connection.command=async(method,...args)=>{if(method==='turn/start')await h.request({method:'userInput/request',params:inputRequest()});return command(method,...args);};
 await h.runtime.send({text:'Ask'});assert.equal(h.runtime.snapshot().pending?.userInputId,'question-one');assert.equal(h.runtime.snapshot().status,'blocked');
});
test('native settlement before request prevents stale question resurrection',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Ask'});
 h.emit({method:'userInput/settled',params:{sessionId:'session-one',userInputId:'question-one',outcome:'timedOut'}});await h.request({method:'userInput/request',params:inputRequest()});
 assert.equal(h.runtime.snapshot().pending,null);assert.equal(h.runtime.snapshot().status,'running');
});
const permissions=()=>({profileId:':ask-me',reviewerAuthority:'human',reviewerAttached:false,axes:{filesystem:'sandboxed',network:'off',approval:'onRequest',reviewer:'human'}});

// This replaces only the external native process. The real runtime and
// preserved session adapter still validate/dispatch/fold every protocol action.
async function harness(t,options={}) {
 const root=await mkdtemp(join(tmpdir(),'musebench-runtime-'));
 const binary=join(root,(options.platform??process.platform)==='win32'?'muse.exe':'muse');
 await writeFile(binary,'not executable: process boundary is injected');
 t.after(()=>rm(root,{recursive:true,force:true}));
 const calls=[]; let notification=()=>{}, serverRequest=()=>{}, protocolError=()=>{}, resolveExit;
 const session=()=>({sessionId:'session-one',workspaceRoot:root,status:'idle',activeTurnId:null,turnCount:0,providerId:'meta',modelId:'muse-spark-1.2',approvalMode:{mode:'onRequest',source:'sessionOverride',lastCommandId:null},permissionState:permissions()});
 const host={initializeResult:{serverInfo:{name:'muse-session-server',version:'1.4.14'},schema:{version:1,fingerprint:pin},sandboxAvailability:'available',experimentalApi:true},exited:new Promise(resolve=>{resolveExit=resolve;}),close:async()=>{calls.push({method:'close'});return {code:0,signal:null};}};
 host.connection={
  mintCommandId:()=> '0198f0ab-9999-7000-8000-000000000001',
  onNotification:fn=>{notification=fn;},onServerRequest:fn=>{serverRequest=fn;},onProtocolError:fn=>{protocolError=fn;},
  request:async(method,params)=>{calls.push({method,params});if(method==='permissionProfile/list')return {profiles:[{profileId:':ask-me',label:'Ask me',available:true,reviewerAuthority:'human'}]};if(method==='model/list')return nativeCatalog();if(method==='session/read')return {session:session()};throw Error('Unexpected request '+method);},
  command:async(method,params,opts)=>{calls.push({method,params,opts});if(method==='session/start')return {session:session(),viewCursor:'start-1'};if(method==='turn/start')return {commandId:opts.commandId,status:'accepted',disposition:'started',startedNewTurn:true,turnId:'turn-one'};if(method==='approval/decide')return {terminal:true};throw Error('Unexpected command '+method);}
 };
 const sdk={EXPECTED_SCHEMA_FINGERPRINT:pin,spawnMspConnection:spec=>{calls.push({method:'spawn',spec});return {initialize:async params=>{calls.push({method:'initialize',params});return host;},close:host.close};}};
 const runtime=createRuntime({environment:{PATH:'',SystemRoot:'C:\\Windows',META_API_KEY:'must-not-cross',MUSE_EXPERIMENTAL_SDK_ENABLED:'on'},loadSdk:async()=>({sdk,sdkVersion:'1.4.14'}),probeVersion:async()=>options.version??'1.4.14',timeoutMs:100,...options});
 t.after(()=>runtime.close());
 return {runtime,root,binary,calls,host,sdk,session,emit:frame=>notification(frame),protocolError:error=>protocolError(error),request:frame=>serverRequest(frame),exit:resolveExit,connect:()=>runtime.connect({binary,workspaceRoot:root})};
}

test('interactive Full access retains schema and Ask me verification while relaxing only sandbox availability',async t=>{
 const h=await harness(t);h.host.initializeResult.sandboxAvailability='unavailable';await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,fullAccess:true});assert.equal(h.runtime.snapshot().permissionVerified,true);assert.equal(h.runtime.snapshot().fullAccess,true);assert.ok(h.calls.find(c=>c.method==='spawn').spec.args.includes('--disable-sandbox'));await h.runtime.disconnect();assert.equal(h.runtime.snapshot().fullAccess,false);
});

test('live steering uses exact turn identity once and verifies the acknowledgement',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Original'});const original=h.host.connection.command;h.host.connection.command=async(method,params,opts)=>{if(method==='turn/steer'){h.calls.push({method,params,opts});return{commandId:opts.commandId,status:'accepted',turnId:params.expectedTurnId};}return original(method,params,opts);};
 await assert.rejects(h.runtime.steer({text:'Correction',expectedTurnId:'different'}),/turn/i);await h.runtime.steer({text:'Correction',expectedTurnId:'turn-one'});const calls=h.calls.filter(c=>c.method==='turn/steer');assert.equal(calls.length,1);assert.equal(calls[0].params.expectedTurnId,'turn-one');assert.equal(calls[0].opts.maxAttempts,1);assert.equal(h.runtime.snapshot().steering.status,'accepted');
});

test('ambiguous steering acknowledgement remains unknown and is never resent',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Original'});let count=0;h.host.connection.command=async()=>{count++;return{status:'accepted',turnId:'another',commandId:'wrong'};};await assert.rejects(h.runtime.steer({text:'Correction',expectedTurnId:'turn-one'}));assert.equal(count,1);assert.equal(h.runtime.snapshot().steering.status,'unknown');
});

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
 const env=curateEnvironment({...process.env,Path:join(windows,'System32'),pathext:'.COM;.EXE;.BAT;.CMD',SystemRoot:windows,META_API_KEY:'must-not-cross',NODE_OPTIONS:'must-not-cross'});
 const {stdout}=await promisify(execFile)(join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),[
  '-NoLogo','-NoProfile','-NonInteractive','-Command',
  "$ErrorActionPreference='Stop'; $null=whoami; if($env:META_API_KEY -or $env:NODE_OPTIONS){throw 'Unexpected inherited environment'}; Write-Output 'native-command-resolved'",
 ],{env,windowsHide:true,shell:false,timeout:60000,maxBuffer:4096,encoding:'utf8'});
 assert.equal(stdout.trim(),'native-command-resolved');
});

async function officialInstallFixture(t) {
 const localAppData=await mkdtemp(join(tmpdir(),'musebench-discovery-'));
 t.after(()=>rm(localAppData,{recursive:true,force:true}));
 const install=join(localAppData,'Programs','muse');await mkdir(install,{recursive:true});
 const version='1.4.14-R7309.1';const binary=join(install,`muse-bin-${version}.exe`);
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
 for(const invalid of ['../escape','..\\escape','1.4.14-R7309.1/../../escape','1.4.14-R7309.1.exe:$DATA','1.4.14-R7309.1\nother','1'.repeat(1024)]){
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
 assert.deepEqual(h.calls.find(c=>c.method==='initialize').params.capabilities,{experimentalApi:true,userInputDialogs:true});
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
 h.host.connection.request=async method=>method==='model/list'?nativeCatalog():({session:{...h.session(),permissionState:{...permissions(),axes:{...permissions().axes,filesystem:'unrestricted'}}}});
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
 await h.runtime.disconnect();release('1.4.14');await assert.rejects(connecting,/interrupt|disconnect/i);
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

test('concurrent questions and approvals retain independent revisions and settle out of order',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Inspect modules'});
 const approval=id=>({method:'approval/request',params:{sessionId:'session-one',approvalId:id,currentRequirementId:{approvalId:id,sourceIndex:0},availableChoices:[{choiceId:'allow',scope:'once',decision:'approved'}]}});
 await h.request(approval('first'));await h.request({method:'userInput/request',params:inputRequest()});await h.request(approval('second'));
 assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.runtime.snapshot().pendingRequests.length,3);assert.equal(h.calls.some(c=>c.method==='close'),false);
 const [first,question,second]=h.runtime.snapshot().pendingRequests;
 const original=h.host.connection.command;h.host.connection.command=async(method,params,opts)=>method==='userInput/answer'?{commandId:opts.commandId,userInputId:params.userInputId,status:'accepted'}:original(method,params,opts);
 await h.runtime.decide(second.availableChoices[0].decisionToken);
 await assert.rejects(h.runtime.decide(second.availableChoices[0].decisionToken),/pending|submitted/);
 await h.runtime.answerInput({...question,operation:'answer',answers:[{questionId:'color',selectedLabel:'Blue'}]});
 h.emit({method:'approval/resolved',params:{sessionId:'session-one',approvalId:'second'}});
 h.emit({method:'userInput/settled',params:{sessionId:'session-one',userInputId:question.userInputId,outcome:'answered',answers:[{questionId:'color',selectedLabel:'Blue'}]}});
 assert.equal(h.runtime.snapshot().pendingRequests.length,1);assert.equal(h.runtime.snapshot().pending.revision,first.revision);
 await h.runtime.decide(first.availableChoices[0].decisionToken);h.emit({method:'approval/resolved',params:{sessionId:'session-one',approvalId:'first'}});
 assert.equal(h.runtime.snapshot().status,'running');assert.deepEqual(h.runtime.snapshot().pendingRequests,[]);
 await h.request(approval('second'));assert.equal(h.runtime.snapshot().pending,null);
});

test('answer uncertainty remains per request even after another answer settles',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Ask'});
 for(const id of ['uncertain','other'])await h.request({method:'userInput/request',params:{...inputRequest(),userInputId:id}});
 const [a,b]=h.runtime.snapshot().pendingRequests;
 h.host.connection.command=async(method,params,opts)=>({commandId:params.userInputId==='uncertain'?'wrong':opts.commandId,userInputId:params.userInputId,status:'accepted'});
 await assert.rejects(h.runtime.answerInput({...a,operation:'cancel'}));await h.runtime.answerInput({...b,operation:'cancel'});
 h.emit({method:'userInput/settled',params:{sessionId:'session-one',userInputId:'other',outcome:'cancelled'}});
 await assert.rejects(h.runtime.answerInput({...a,operation:'cancel'}),/pending|submitted/);
 assert.equal(h.runtime.snapshot().inputResponses.find(r=>r.userInputId==='uncertain').status,'unknown');
});

test('repeated disconnect cannot turn unconfirmed shutdown into permission to reconnect',async t=>{
 const h=await harness(t);await h.connect();h.host.close=async()=>{throw Error('process did not confirm exit');};
 await h.runtime.disconnect();assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');
 await h.runtime.disconnect();assert.equal(h.runtime.snapshot().cleanup,'unconfirmed');
 await assert.rejects(h.connect(),/unconfirmed|shutdown/i);
});

test('interactive request accepts the same bounded prepared context as exec',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Context '.repeat(7000)});assert.equal(h.runtime.snapshot().status,'running');
});

test('native compaction waits for terminal evidence and blocks sends until it arrives',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'A turn'});h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',terminal:'completed',viewCursor:'done'}});const original=h.host.connection.command;h.host.connection.command=async(method,params,opts)=>method==='session/compact'?{status:'accepted',commandId:opts.commandId}:original(method,params,opts);
 await assert.rejects(h.runtime.compact({sessionId:'wrong',turnId:'turn-one'}));await h.runtime.compact({sessionId:'session-one',turnId:'turn-one'});assert.equal(h.runtime.snapshot().compaction.status,'accepted');await assert.rejects(h.runtime.send({text:'Too early'}));h.emit({method:'item/completed',params:{sessionId:'session-one',viewCursor:'compact-done',item:{itemId:'compaction-1',kind:'compaction',turnId:'turn-one',trigger:'manual',revision:2,status:'completed',outcome:'compacted'}}});assert.equal(h.runtime.snapshot().compaction.status,'compacted');assert.equal(h.runtime.snapshot().operationBusy,false);await h.runtime.send({text:'Continue'});
});
test('disconnect during compaction ack never updates a new owner',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'A turn'});h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',terminal:'completed',viewCursor:'done'}});let resolve;h.host.connection.command=async()=>new Promise(r=>resolve=r);const operation=h.runtime.compact({sessionId:'session-one',turnId:'turn-one'});await h.runtime.disconnect();resolve({commandId:'0198f0ab-9999-7000-8000-000000000001',status:'accepted'});await assert.rejects(operation,/interrupted/);assert.equal(h.runtime.snapshot().compaction.status,'unknown');assert.equal(h.runtime.snapshot().permissionVerified,false);
});

test('native child controls bind current session and revision and send at most once on uncertain ack',async t=>{
 const h=await harness(t);await h.connect();h.emit({method:'item/updated',params:{sessionId:'session-one',item:{itemId:'child-item',kind:'subagent',subagentId:'native-child',revision:2,status:'inProgress',controlStatus:'running'}}});let calls=0;h.host.connection.command=async(method,params,opts)=>{calls++;assert.equal(method,'subagent/sendMessage');assert.equal(params.subagentId,'native-child');assert.equal(opts.maxAttempts,1);return {commandId:'wrong',status:'accepted'};};const input={sessionId:'session-one',itemId:'child-item',revision:2,action:'sendMessage',body:'Correction'};await assert.rejects(h.runtime.childControl({...input,sessionId:'other'}));await assert.rejects(h.runtime.childControl({...input,revision:1}));assert.equal(calls,0);await assert.rejects(h.runtime.childControl(input));assert.equal(h.runtime.snapshot().childReceipts[0].status,'unknown');await assert.rejects(h.runtime.childControl(input),/uncertain/);assert.equal(calls,1);
});
test('child control receipt is admission only, parent item supplies independently observed result',async t=>{
 const h=await harness(t);await h.connect();const item={itemId:'child-item',kind:'subagent',subagentId:'native-child',revision:2,status:'inProgress',controlStatus:'running'};h.emit({method:'item/updated',params:{sessionId:'session-one',item}});h.host.connection.command=async(m,p,o)=>({commandId:o.commandId,status:'accepted'});await h.runtime.childControl({sessionId:'session-one',itemId:'child-item',revision:2,action:'interrupt'});assert.equal(h.runtime.snapshot().childReceipts[0].status,'accepted');assert.equal(h.runtime.snapshot().children.items[0].controlStatus,'running');h.emit({method:'item/updated',params:{sessionId:'session-one',item:{...item,revision:3,status:'cancelled',controlStatus:'resultReady'}}});assert.equal(h.runtime.snapshot().children.items[0].status,'cancelled');assert.equal(h.runtime.snapshot().childReceipts[0].status,'accepted');
});

test('child uncertainty survives bounded receipt eviction',async t=>{const h=await harness(t);await h.connect();for(const id of ['uncertain','other'])h.emit({method:'item/updated',params:{sessionId:'session-one',item:{itemId:id,kind:'subagent',subagentId:id,revision:1,status:'inProgress',controlStatus:'running'}}});let n=0,calls=0;h.host.connection.mintCommandId=()=>String(++n);h.host.connection.command=async(m,p,o)=>{calls++;return {commandId:p.subagentId==='uncertain'?'wrong':o.commandId,status:'accepted'};};const input={sessionId:'session-one',itemId:'uncertain',revision:1,action:'sendMessage',body:'A'};await assert.rejects(h.runtime.childControl(input));for(let i=0;i<41;i++)await h.runtime.childControl({...input,itemId:'other'});assert.equal(h.runtime.snapshot().childReceipts.length,40);await assert.rejects(h.runtime.childControl(input),/uncertain/);assert.equal(calls,42);});

test('native child completion keeps ownership through the host reporting turn',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Delegate'});let cursor=0;
 const event=(method,params)=>h.emit({method,params:{sessionId:'session-one',viewCursor:String(++cursor),...params}});
 const child={itemId:'child',kind:'subagent',subagentId:'native-child',turnId:'turn-one',revision:1,status:'inProgress',controlStatus:'running'};
 event('item/started',{item:child});event('turn/completed',{turnId:'turn-one',terminal:'completed'});
 assert.equal(h.runtime.snapshot().status,'running');assert.equal(h.runtime.snapshot().foregroundActive,false);
 event('item/updated',{item:{...child,revision:2,controlStatus:'resultReady',result:{summary:'Child result'}}});
 await assert.rejects(h.runtime.send({text:'Too early'}));
 event('turn/started',{turnId:'native-report',commandId:'native-report'});
 assert.equal(h.runtime.snapshot().turnId,'native-report');assert.equal(h.runtime.snapshot().rootTurnId,'turn-one');
 event('item/completed',{item:{itemId:'report',kind:'agentMessage',turnId:'native-report',revision:1,status:'completed',text:'Child returned'}});
 event('turn/completed',{turnId:'native-report',terminal:'completed'});
 assert.equal(h.runtime.snapshot().status,'completed');assert.equal(h.runtime.snapshot().childrenBusy,false);assert.equal(h.runtime.snapshot().messages.at(-1).text,'Child returned');
});

test('unobserved or overlapping native turns still fail closed',async t=>{
 for(const child of [false,true]){const h=await harness(t);await h.connect();await h.runtime.send({text:'Work'});
 if(child)h.emit({method:'item/updated',params:{sessionId:'session-one',item:{itemId:'child',kind:'subagent',subagentId:'native',turnId:'turn-one',revision:1,status:'inProgress',controlStatus:'running'}}});
 else h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',terminal:'completed',viewCursor:'done'}});
 h.emit({method:'turn/started',params:{sessionId:'session-one',turnId:'foreign',commandId:'foreign',viewCursor:'foreign'}});assert.equal(h.runtime.snapshot().reason,'unexpected-turn');}
});

test('a fresh explicit request clears prior root identity before its admission',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'First'});
 h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',terminal:'completed',viewCursor:'done'}});
 const snapshots=[];h.runtime.subscribe(s=>snapshots.push(s));const original=h.host.connection.command;
 h.host.connection.command=async(m,p,o)=>m==='turn/start'?{commandId:o.commandId,status:'accepted',disposition:'started',startedNewTurn:true,turnId:'turn-two'}:original(m,p,o);
 await h.runtime.send({text:'Second'});
 assert.ok(snapshots.some(s=>s.status==='submitting'));for(const s of snapshots.filter(s=>s.status==='submitting'))assert.equal(s.rootTurnId,null);
 assert.equal(h.runtime.snapshot().rootTurnId,'turn-two');
});


test('idle child followup reserves reporting and refuses launches from an older root',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Delegate'});let n=0;
 const event=(method,params)=>h.emit({method,params:{sessionId:'session-one',viewCursor:'follow-'+(++n),...params}});
 const child={itemId:'child',kind:'subagent',subagentId:'native-child',turnId:'turn-one',revision:1,status:'inProgress',controlStatus:'resultReady'};
 event('item/started',{item:child});event('turn/completed',{turnId:'turn-one',terminal:'completed'});
 const command=h.host.connection.command;h.host.connection.command=async(m,p,o)=>m==='subagent/followupTask'?{commandId:o.commandId,status:'accepted'}:command(m,p,o);
 await h.runtime.childControl({sessionId:'session-one',itemId:'child',revision:1,action:'followupTask',body:'Continue'});
 event('item/updated',{item:{...child,revision:2,controlStatus:'running'}});
 event('item/updated',{item:{...child,revision:3}});
 assert.equal(h.runtime.snapshot().status,'running');await assert.rejects(h.runtime.send({text:'Cannot race report'}));
 event('turn/started',{turnId:'report',commandId:'report'});event('turn/completed',{turnId:'report',terminal:'completed'});
 assert.equal(h.runtime.snapshot().status,'completed');
 h.host.connection.command=async(m,p,o)=>m==='turn/start'?{commandId:o.commandId,status:'accepted',disposition:'started',startedNewTurn:true,turnId:'new-root'}:command(m,p,o);
 await h.runtime.send({text:'New explicit request'});event('turn/completed',{turnId:'new-root',terminal:'completed'});
 await assert.rejects(h.runtime.childControl({sessionId:'session-one',itemId:'child',revision:3,action:'followupTask',body:'Old context'}),/earlier request/);
});


test('known child admission rejection releases a pending launch without inventing report work',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Delegate'});
 h.emit({method:'item/updated',params:{sessionId:'session-one',item:{itemId:'child',kind:'subagent',subagentId:'native',turnId:'turn-one',revision:1,status:'inProgress',controlStatus:'resultReady'}}});
 h.emit({method:'turn/completed',params:{sessionId:'session-one',turnId:'turn-one',terminal:'completed',viewCursor:'done'}});
 h.host.connection.command=async()=>{throw Object.assign(Error('subagent_state_ineligible'),{code:-32030});};
 await assert.rejects(h.runtime.childControl({sessionId:'session-one',itemId:'child',revision:1,action:'followupTask',body:'More'}),/ineligible/);
 assert.equal(h.runtime.snapshot().status,'completed');assert.equal(h.runtime.snapshot().childrenBusy,false);assert.equal(h.runtime.snapshot().childReceipts.at(-1).status,'rejected');
});

test('pending request collection bounds resource use without deciding requests',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.send({text:'Ask'});
 for(let i=0;i<32;i++)await h.request({method:'userInput/request',params:{...inputRequest(),userInputId:'q'+i}});
 assert.equal(h.runtime.snapshot().pendingRequests.length,32);
 await h.request({method:'userInput/request',params:{...inputRequest(),userInputId:'overflow'}});
 assert.equal(h.runtime.snapshot().status,'unavailable');assert.equal(h.calls.some(c=>['approval/decide','userInput/answer'].includes(c.method)),false);
});

const restoredNative=(h,patch={})=>({session:{...h.session(),activeTurnId:null,turnCount:1,providerId:'meta',modelId:'muse-spark-1.2'},viewCursor:'restore-head',pendingRequests:[],history:{mode:'inline',items:[],snapshot:null},...patch});
test('runtime restores a native session with no fresh start or history replay',async t=>{
 const h=await harness(t);const original=h.host.connection.command;h.host.connection.command=async(method,params,opts)=>{if(method==='session/resume'){h.calls.push({method,params,opts});return restoredNative(h);}return original(method,params,opts);};
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,sessionId:'session-one'});const s=h.runtime.snapshot();assert.equal(s.restoration.status,'restored');assert.equal(s.sessionSeeded,true);assert.equal(s.durableSessions,true);assert.equal(s.permissionVerified,true);assert.equal(h.calls.some(c=>c.method==='session/start'||c.method==='turn/start'),false);
});
test('runtime buffers independent resume requests until identity and permission verification',async t=>{
 const h=await harness(t);h.host.connection.command=async(method)=>{assert.equal(method,'session/resume');for(const id of ['early-one','early-two'])await h.request({method:'userInput/request',params:{...inputRequest(),userInputId:id}});return restoredNative(h,{session:{...h.session(),status:'running',activeTurnId:'turn-one',turnCount:1,providerId:'meta',modelId:'muse-spark-1.2'},pendingRequests:['early-one','early-two'].map(userInputId=>({kind:'userInput',userInputId,viewCursor:'q'}))});};
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,sessionId:'session-one'});assert.equal(h.runtime.snapshot().status,'blocked');assert.deepEqual(h.runtime.snapshot().pendingRequests.map(p=>p.userInputId),['early-one','early-two']);assert.equal(h.runtime.snapshot().permissionVerified,true);assert.equal(h.calls.some(c=>c.method==='userInput/answer'),false);
});
test('restored question settlement before payload clears its pointer without resurrecting the request',async t=>{
 const h=await harness(t);h.host.connection.command=async()=>{h.emit({method:'userInput/settled',params:{sessionId:'session-one',userInputId:'question-one',outcome:'timedOut'}});return restoredNative(h,{session:{...h.session(),status:'running',activeTurnId:'turn-one',turnCount:1},pendingRequests:[{kind:'userInput',userInputId:'question-one',viewCursor:'q'}]});};
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,sessionId:'session-one'});assert.equal(h.runtime.snapshot().status,'running');assert.equal(h.runtime.snapshot().pending,null);assert.equal(h.runtime.snapshot().inputResponse,null);await h.request({method:'userInput/request',params:inputRequest()});assert.equal(h.runtime.snapshot().status,'running');assert.deepEqual(h.runtime.snapshot().pendingRequests,[]);assert.equal(h.calls.some(c=>c.method==='userInput/answer'),false);
});
test('pending native restore exposes an explicit request reissue wait until settlement',async t=>{
 const h=await harness(t);h.host.connection.command=async()=>restoredNative(h,{session:{...h.session(),status:'running',activeTurnId:'turn-one',turnCount:1},pendingRequests:[{kind:'userInput',userInputId:'question-one',viewCursor:'q'}]});
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,sessionId:'session-one'});assert.equal(h.runtime.snapshot().status,'blocked');assert.equal(h.runtime.snapshot().pending,null);assert.equal(h.runtime.snapshot().restoringRequests,1);assert.equal(h.runtime.snapshot().rootTurnId,'turn-one');h.emit({method:'userInput/settled',params:{sessionId:'session-one',userInputId:'question-one',outcome:'timedOut'}});assert.equal(h.runtime.snapshot().restoringRequests,0);assert.equal(h.runtime.snapshot().status,'running');
});
test('runtime rejects a restored session with missing model routing or wrong workspace',async t=>{
 for(const change of [{modelId:null},{workspaceRoot:'wrong'}]){const h=await harness(t);h.host.connection.command=async()=>restoredNative(h,{session:{...restoredNative(h).session,...change}});await assert.rejects(h.runtime.connect({binary:h.binary,workspaceRoot:h.root,sessionId:'session-one'}));assert.equal(h.runtime.snapshot().permissionVerified,false);}
});
test('runtime reads screenshot bytes into native image input without trusting extensions',async t=>{
 const h=await harness(t);await h.connect();const file=join(h.root,'image.png');await writeFile(file,Buffer.from('89504e470d0a1a0a00000000','hex'));await h.runtime.send({text:'Describe',imagePaths:[file]});const call=h.calls.find(c=>c.method==='turn/start');assert.equal(call.params.input[1].type,'image');assert.equal(call.params.input[1].mediaType,'image/png');assert.equal(call.params.input[1].base64Data,Buffer.from('89504e470d0a1a0a00000000','hex').toString('base64'));
});
test('runtime rejects malformed and aggregate oversized images before a native turn',async t=>{
 for(const bytes of [Buffer.from('not an image'),Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(7*1024*1024)])]){const h=await harness(t);await h.connect();const file=join(h.root,'image.png');await writeFile(file,bytes);await assert.rejects(h.runtime.send({text:'Describe',imagePaths:[file]}),/image|screenshot|MiB/i);assert.equal(h.calls.some(c=>c.method==='turn/start'),false);assert.equal(h.runtime.snapshot().status,'idle');}
});
const nativeCatalog=()=>({providerId:'meta',profileId:null,source:'bundledCatalog',models:[{providerId:'meta',profileId:null,modelId:'muse-spark-1.2',displayLabel:'Spark',variants:['low','high'],isDefault:true}]});
test('runtime selects only a current native Meta model and verifies it before sending',async t=>{
 const h=await harness(t);await h.connect();const request=h.host.connection.request,command=h.host.connection.command;let selected=false;h.host.connection.request=async(method,params)=>{if(method==='model/list')return nativeCatalog();if(method==='session/read')return {session:{...h.session(),providerId:'meta',modelId:selected?'muse-spark-1.2':'previous'}};return request(method,params);};h.host.connection.command=async(method,params,opts)=>{if(method==='session/setModel'){h.calls.push({method,params,opts});selected=true;return {commandId:opts.commandId,status:'accepted'};}return command(method,params,opts);};
 await h.runtime.send({text:'Hello',runOptions:{reasoning:'low',approval:'ask',model:'muse-spark-1.2'}});assert.equal(h.runtime.snapshot().modelId,'muse-spark-1.2');assert.equal(h.calls.find(c=>c.method==='session/setModel').params.model.providerId,'meta');assert.equal(h.calls.filter(c=>c.method==='turn/start').length,1);
});
test('runtime refuses unlisted model or unconfirmed model change without a turn',async t=>{
 for(const wrong of [false,true]){const h=await harness(t);await h.connect();const request=h.host.connection.request;h.host.connection.request=async(method,params)=>method==='model/list'?nativeCatalog():method==='session/read'?{session:{...h.session(),providerId:'meta',modelId:'previous'}}:request(method,params);h.host.connection.command=async(method,params,opts)=>{h.calls.push({method,params,opts});return {status:'accepted',commandId:opts.commandId};};await assert.rejects(h.runtime.send({text:'Hello',runOptions:{reasoning:'low',approval:'ask',model:wrong?'missing':'muse-spark-1.2'}}));assert.equal(h.calls.some(c=>c.method==='turn/start'),false);}
});
test('Provider default resets an earlier model selection using the current native catalog',async t=>{
 const h=await harness(t);await h.connect();let selected='earlier-explicit';const request=h.host.connection.request,command=h.host.connection.command;
 h.host.connection.request=async(method,params)=>method==='model/list'?nativeCatalog():method==='session/read'?{session:{...h.session(),modelId:selected}}:request(method,params);
 h.host.connection.command=async(method,params,opts)=>{if(method==='session/setModel'){h.calls.push({method,params,opts});selected=params.model.modelId;return {commandId:opts.commandId,status:'accepted'};}return command(method,params,opts);};
 await h.runtime.refreshModels();await h.runtime.send({text:'Use provider default',runOptions:{reasoning:'low',approval:'ask'}});assert.equal(h.calls.find(c=>c.method==='session/setModel')?.params.model.modelId,'muse-spark-1.2');assert.equal(h.runtime.snapshot().modelId,'muse-spark-1.2');assert.equal(h.calls.filter(c=>c.method==='turn/start').length,1);
});
test('Provider default resolves the native catalog again after reconnect clears it',async t=>{
 const h=await harness(t);await h.connect();await h.runtime.disconnect();let selected='earlier-explicit';const request=h.host.connection.request,command=h.host.connection.command;
 h.host.connection.request=async(method,params)=>method==='model/list'?nativeCatalog():method==='session/read'?{session:{...h.session(),modelId:selected}}:request(method,params);
 h.host.connection.command=async(method,params,opts)=>{if(method==='session/resume')return restoredNative(h,{session:{...h.session(),modelId:selected}});if(method==='session/setModel'){h.calls.push({method,params,opts});selected=params.model.modelId;return {commandId:opts.commandId,status:'accepted'};}return command(method,params,opts);};
 await h.runtime.connect({binary:h.binary,workspaceRoot:h.root,sessionId:'session-one'});assert.equal(h.runtime.snapshot().modelCatalog,undefined);await h.runtime.send({text:'Use provider default after reconnect',runOptions:{reasoning:'low',approval:'ask'}});assert.equal(selected,'muse-spark-1.2');assert.equal(h.calls.find(c=>c.method==='session/setModel')?.params.model.modelId,'muse-spark-1.2');assert.equal(h.calls.filter(c=>c.method==='turn/start').length,1);
});
test('workspace MCP is supplied by trusted factory only after the sessionMcp grant',async t=>{
 for(const granted of [false,true]){const h=await harness(t,{workspaceMcp:root=>({transport:'stdio',command:'node',args:['gateway',root]})});h.host.initializeResult.grantedCapabilities=granted?['sessionMcp']:[];const operation=h.runtime.connect({binary:h.binary,workspaceRoot:h.root,workspaceTools:true});if(!granted){await assert.rejects(operation,/sessionMcp|capability/i);assert.equal(h.calls.some(c=>c.method==='session/start'),false);}else{await operation;assert.equal(h.calls.find(c=>c.method==='session/start').params.config.mcpServers.musebench_workspace.args.at(-1),h.root);}assert.deepEqual(h.calls.find(c=>c.method==='initialize').params.capabilities.requestedCapabilities,['sessionMcp']);}
});
test('startup permission projection is reconciled by read-back without treating it as a later policy change',async t=>{
 const h=await harness(t),command=h.host.connection.command;h.host.connection.command=async(method,params,opts)=>{if(method==='session/start')h.emit({method:'session/approvalModeChanged',params:{sessionId:'session-one',viewCursor:'startup-mode',mode:'onRequest',commandId:opts.commandId}});return command(method,params,opts);};await h.connect();assert.equal(h.runtime.snapshot().status,'idle');assert.equal(h.runtime.snapshot().permissionVerified,true);assert.ok(h.calls.some(c=>c.method==='session/read'));
});
test('interactive host receives only the project-bound reviewed hooks and trust decision',async t=>{
 const hooks={UserPromptSubmit:[{hooks:[{type:'command',commandWindows:'Write-Output reviewed',timeout:2}]}]};let reviewedRoot;
 const h=await harness(t,{extensionReview:{allowProject:async root=>{reviewedRoot=root;return true;},nativeHooks:async root=>{assert.equal(root,reviewedRoot);return hooks;}}});await h.connect();const args=h.calls.find(c=>c.method==='spawn').spec.args;assert.ok(args.includes('--trust-workspace'));assert.ok(args.includes('hooks='+JSON.stringify(hooks)));assert.ok(args.includes('managed_hooks_path=null'));
});
