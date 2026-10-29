import test from 'node:test';import assert from 'node:assert/strict';
import {MuseSessionAdapter} from '../session-adapter.mjs';
import {FixturePort,descriptor,events,sessionResult,turnAck} from './fixture-port.mjs';
const root=sessionResult.session.workspaceRoot;
async function setup(options={}){const port=new FixturePort();const adapter=new MuseSessionAdapter({connection:port,...descriptor(),timeoutMs:50,...options});await adapter.open(root);return {adapter,port};}
const event=(method)=>structuredClone(events.find(e=>e.method===method));
const mcpFailure='invalid run configuration: Required MCP server `musebench_workspace` failed during startup: the configured command is unavailable.';

test('send reports the admission boundary without retrying unknown outcomes',async()=>{
 const {adapter,port}=await setup();
 await assert.rejects(adapter.send({text:' '}),error=>error.inputAdmission==='not-sent');
 assert.equal(port.calls.length,1);
 port.command=async(method)=>{port.calls.push({method});throw Error('Acknowledgment lost');};
 await assert.rejects(adapter.send({text:'Inspect'}),error=>error.inputAdmission==='unknown');
 assert.equal(port.calls.length,2);assert.equal(adapter.snapshot().status,'uncertain');
 await assert.rejects(adapter.send({text:'Retry'}),error=>error.inputAdmission==='not-sent');
 assert.equal(port.calls.length,2);
});
test('native terminal failure keeps its useful reason without replaying the request',async()=>{
 const {adapter,port}=await setup();await adapter.send({text:'Inspect the workspace'});
 const failed=event('turn/completed');Object.assign(failed.params,{terminal:'failed',reason:mcpFailure,error:{kind:'configError',message:'Lower priority detail',retryable:true}});port.emit(failed);
 assert.equal(adapter.snapshot().status,'failed');assert.equal(adapter.snapshot().reason,mcpFailure);assert.equal(adapter.snapshot().outcome,'failed');assert.equal(Object.hasOwn(adapter.snapshot(),'error'),false);
 port.emit(failed);assert.equal(adapter.snapshot().reason,mcpFailure);assert.equal(port.calls.filter(call=>call.method==='turn/start').length,1);
 await adapter.send({text:'Try again after I fix it'});assert.equal(adapter.snapshot().reason,null);assert.equal(port.calls.filter(call=>call.method==='turn/start').length,2);
});
test('native terminal failure falls back to its structured error message',async()=>{
 for(const reason of [undefined,null,'   ',{secret:'not text'}]){
  const {adapter,port}=await setup();await adapter.send({text:'Inspect'});const failed=event('turn/completed');Object.assign(failed.params,{terminal:'failed',reason,error:{message:'The server did not respond during startup.'}});port.emit(failed);
  assert.equal(adapter.snapshot().reason,'The server did not respond during startup.');
 }
});
test('failure reasons redact common credentials and bound the published text',async()=>{
 const {adapter,port}=await setup();await adapter.send({text:'Inspect'});const failed=event('turn/completed');Object.assign(failed.params,{terminal:'failed',reason:'Server failed: Bearer fixtureBearer123, META_API_KEY="fixtureKey123" password=fixturePassword123 sk-fixtureSecret123 https://fixtureUser:fixturePass@example.test/path?access_token=fixtureQuery#fragment\n'+ 'detail '.repeat(1000)});port.emit(failed);
 const shown=adapter.snapshot().reason;assert.equal(typeof shown,'string');assert.ok(shown.startsWith('Server failed:'));assert.ok(shown.length<=1200);assert.match(shown,/redacted/);assert.match(shown,/example\.test\/path/);
 for(const secret of ['fixtureBearer123','fixtureKey123','fixturePassword123','sk-fixtureSecret123','fixtureUser','fixturePass','fixtureQuery','#fragment'])assert.ok(!shown.includes(secret),secret);
 assert.doesNotMatch(shown,/[\u0000-\u001f\u007f]/);
});
test('cancelled native turns retain an explanation while successful turns ignore stale errors',async()=>{
 for(const terminal of ['cancelled','completed']){const {adapter,port}=await setup();await adapter.send({text:'Inspect'});const finished=event('turn/completed');Object.assign(finished.params,{terminal,reason:'Stopped by the user.',error:{message:'Old error'}});port.emit(finished);assert.equal(adapter.snapshot().reason,terminal==='cancelled'?'Stopped by the user.':null);assert.equal(adapter.snapshot().status,terminal);}
});
test('quoted diagnostic credentials stay redacted through escapes and truncated input',async()=>{
 for(const reason of [String.raw`Server failed: token="prefix\"fixtureEscapedSecret" detail`,String.raw`Server failed: password='prefix\'fixtureEscapedSecret' detail`,'Server failed: token="'+ 'fixtureEscapedSecret'.repeat(2000)]){
  const {adapter,port}=await setup();await adapter.send({text:'Inspect'});const failed=event('turn/completed');Object.assign(failed.params,{terminal:'failed',reason});port.emit(failed);
  assert.doesNotMatch(adapter.snapshot().reason,/fixtureEscapedSecret/);assert.match(adapter.snapshot().reason,/redacted/);
 }
});
test('malformed native diagnostic fields are not published as objects or trusted failures',async()=>{
 const {adapter,port}=await setup();await adapter.send({text:'Inspect'});const failed=event('turn/completed');Object.assign(failed.params,{terminal:'failed',reason:{message:'not a reason'},error:{message:['not','text'],stack:'private'}});port.emit(failed);assert.equal(adapter.snapshot().reason,null);assert.equal(Object.hasOwn(adapter.snapshot(),'error'),false);
});
test('native diagnostic URL filtering consumes apostrophes inside user information and query values',async()=>{
 for(const address of ["https://user:'fixtureUrlSecret@example.test/mcp","https://example.test/mcp?session=prefix'fixtureUrlSecret",'https://user:"fixtureUrlSecret@example.test/mcp','https://example.test/mcp#prefix"fixtureUrlSecret']){
  const {adapter,port}=await setup();await adapter.send({text:'Inspect'});const failed=event('turn/completed');Object.assign(failed.params,{terminal:'failed',reason:'Request to '+address+' failed'});port.emit(failed);
  const shown=adapter.snapshot().reason;assert.doesNotMatch(shown,/fixtureUrlSecret/);assert.match(shown,/Request to/);assert.match(shown,/ failed$/);
 }
});
test('incompatible connection never starts a session',async()=>{const port=new FixturePort();const a=new MuseSessionAdapter({connection:port,...descriptor(),sdkVersion:'wrong'});assert.equal(a.snapshot().status,'unavailable');await assert.rejects(a.open(root));assert.equal(port.calls.length,0);});
test('session and turn use verified command shapes without auto retry',async()=>{const {adapter:a,port:p}=await setup();assert.equal(a.snapshot().status,'idle');await a.send({text:'Plan the tea filter',mode:'plan'});assert.equal(p.calls[0].method,'session/start');assert.deepEqual(p.calls[0].params,{workspaceRoot:root});assert.equal(p.calls[1].method,'turn/start');assert.equal(p.calls[1].options.maxAttempts,1);assert.equal(p.calls[1].params.sessionId,sessionResult.session.sessionId);assert.match(p.calls[1].params.input[0].text,/Plan the tea filter/);assert.equal(a.snapshot().planReadOnlyEnforced,false);assert.equal(a.snapshot().status,'running');});
test('official event sequence reaches completion with exact final text',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'test'});for(const f of events)p.emit(f);const s=a.snapshot();assert.equal(s.status,'completed');assert.equal(s.messages.at(-1).text,'All 214 tests pass except two in tbh-agent...');assert.equal(s.messages.at(-1).phase,'finalAnswer');assert.equal(s.tests,'not-run');});
test('ack and final message are not turn completion',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'hello'});for(const f of events.filter(f=>f.method!=='turn/completed'))p.emit(f);assert.equal(a.snapshot().status,'running');});
test('duplicates do not double text; final object replaces partial text',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'hello'});p.emit(event('item/started'));const delta=event('item/delta');p.emit(delta);p.emit(delta);assert.equal(a.snapshot().messages[0].text,delta.params.delta);const final=events.find(f=>f.method==='item/completed'&&f.params.item.kind==='agentMessage');p.emit(final);assert.equal(a.snapshot().messages[0].text,final.params.item.text);});
test('foreign session events cannot affect active session',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'hello'});const f=event('turn/completed');f.params.sessionId='foreign';p.emit(f);assert.equal(a.snapshot().status,'running');});
test('malformed or unknown terminal state fails closed',async()=>{for(const terminal of [null,'new-terminal']){const {adapter:a,port:p}=await setup();await a.send({text:'hello'});const f=event('turn/completed');f.params.terminal=terminal;p.emit(f);assert.equal(a.snapshot().status,'unavailable');}});
test('failure and cancellation remain distinct from completed',async()=>{for(const terminal of ['failed','cancelled']){const {adapter:a,port:p}=await setup();await a.send({text:'hello'});const f=event('turn/completed');f.params.terminal=terminal;p.emit(f);assert.equal(a.snapshot().status,terminal);}});
test('approval request is surfaced and never automatically decided',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'hello'});const reply=await p.serverRequest({method:'approval/request',params:{sessionId:sessionResult.session.sessionId,approvalId:'approval-1',availableChoices:[{choiceId:'abort'}]}});assert.deepEqual(reply,{});assert.equal(a.snapshot().status,'blocked');assert.equal(a.snapshot().reason,'approval-ui-unavailable');assert.equal(p.calls.some(x=>x.method==='approval/decide'),false);await assert.rejects(a.send({text:'again'}));});
test('turn timeout is uncertain; late response does not revive session',async()=>{const {adapter:a,port:p}=await setup({timeoutMs:5});let finish;p.command=()=>new Promise(r=>finish=r);await assert.rejects(a.send({text:'hello'}),/timeout/);assert.equal(a.snapshot().status,'uncertain');finish(turnAck);await new Promise(r=>setTimeout(r,5));assert.equal(a.snapshot().status,'uncertain');await assert.rejects(a.send({text:'retry'}));});
test('host death disables sends and marks active outcome unknown',async()=>{const {adapter:a}=await setup();await a.send({text:'hello'});a.disconnect('host-exited');assert.equal(a.snapshot().status,'unavailable');assert.equal(a.snapshot().outcome,'unknown');await assert.rejects(a.send({text:'retry'}));});
test('same cursor with conflicting content is not silently accepted',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'hello'});p.emit(event('item/started'));const f=event('item/delta');p.emit(f);f.params.delta='conflict';p.emit(f);assert.equal(a.snapshot().status,'unavailable');});
test('events arriving before command acknowledgement are drained after identity is known',async()=>{const {adapter:a,port:p}=await setup();const cmd=p.command.bind(p);p.command=async(...args)=>{for(const f of events)p.emit(f);return cmd(...args);};await a.send({text:'hello'});assert.equal(a.snapshot().status,'completed');});
test('input validation and concurrent-send guard prevent extra commands',async()=>{const {adapter:a,port:p}=await setup();await assert.rejects(a.send({text:' '}));await assert.rejects(a.send({text:'x',mode:'invented'}));await a.send({text:'first'});await assert.rejects(a.send({text:'second'}));assert.equal(p.calls.length,2);});
test('session/closed with nullable cursor disables future commands',async()=>{const {adapter:a,port:p}=await setup();p.emit({method:'session/closed',params:{sessionId:sessionResult.session.sessionId,reason:'idle',viewCursor:null}});assert.equal(a.snapshot().status,'unavailable');assert.equal(a.snapshot().reason,'session-closed');await assert.rejects(a.send({text:'again'}));assert.equal(p.calls.length,1);});
test('view gap before or after terminal invalidates transcript completeness',async()=>{for(const late of [false,true]){const {adapter:a,port:p}=await setup();await a.send({text:'hello'});p.emit(event('item/started'));if(late)p.emit(event('turn/completed'));p.emit({method:'view/gap',params:{sessionId:sessionResult.session.sessionId,after:'opaque-a',next:'opaque-b'}});if(!late)p.emit(event('turn/completed'));assert.equal(a.snapshot().status,'unavailable');assert.equal(a.snapshot().reason,'transcript-gap-reconciliation-required');}});
test('observer disconnect during startup prevents session/start',async()=>{const p=new FixturePort();const a=new MuseSessionAdapter({connection:p,...descriptor()});a.subscribe(s=>{if(s.status==='starting')a.disconnect('controller-disconnected');});await assert.rejects(a.open(root));assert.equal(p.calls.length,0);});
test('observer disconnect during submission prevents turn/start',async()=>{const {adapter:a,port:p}=await setup();a.subscribe(s=>{if(s.status==='submitting')a.disconnect('controller-disconnected');});await assert.rejects(a.send({text:'hello'}));assert.equal(p.calls.length,1);});
test('conflicting terminal outcome cannot turn failure into completion',async()=>{const {adapter:a,port:p}=await setup();await a.send({text:'hello'});const f=event('turn/completed');f.params.terminal='failed';p.emit(f);f.params.viewCursor='different-opaque-cursor';f.params.terminal='completed';p.emit(f);assert.equal(a.snapshot().status,'unavailable');assert.equal(a.snapshot().reason,'conflicting-terminal');});
test('command id mint failure becomes unavailable without issuing a turn',async()=>{const {adapter:a,port:p}=await setup();p.mintCommandId=()=>{throw Error('id generation failed');};await assert.rejects(a.send({text:'hello'}));assert.equal(a.snapshot().status,'unavailable');assert.equal(a.snapshot().reason,'command-id-unavailable');assert.equal(p.calls.length,1);});

function restoreResult(patch={}){return {session:{...sessionResult.session,activeTurnId:null,turnCount:1},viewCursor:'',pendingRequests:[],history:{mode:'inline',items:[{itemId:'old',kind:'agentMessage',turnId:'old-turn',text:'Retained answer',revision:1,status:'completed'}],snapshot:null},...patch};}
test('native restore uses the exact session and preserves history without submitting it',async()=>{
 const p=new FixturePort(),a=new MuseSessionAdapter({connection:p,...descriptor()});p.command=async(method,params,options)=>{p.calls.push({method,params,options});return restoreResult();};
 await a.open(root,{sessionId:sessionResult.session.sessionId});assert.equal(p.calls[0].method,'session/resume');assert.equal(p.calls[0].params.sessionId,sessionResult.session.sessionId);assert.equal(p.calls[0].options.maxAttempts,1);assert.equal(a.snapshot().restoration.status,'restored');assert.equal(a.snapshot().restoration.viewCursor,'');assert.equal(a.snapshot().restoredMessages[0].text,'Retained answer');assert.deepEqual(a.snapshot().messages,[]);assert.equal(p.calls.length,1);
});
test('native restore refuses identity mismatch, missing history and unsupported snapshots',async()=>{
 for(const patch of [{session:{...sessionResult.session,sessionId:'other'}},{history:{mode:'none',noneReason:'projectionUnavailable',items:null,snapshot:null}},{history:{mode:'snapshot',items:null,snapshot:{schemaVersion:99,state:{items:[]}}}}]){
  const p=new FixturePort(),a=new MuseSessionAdapter({connection:p,...descriptor()});p.command=async()=>restoreResult(patch);await assert.rejects(a.open(root,{sessionId:sessionResult.session.sessionId}));assert.equal(a.snapshot().status,'uncertain');
 }
});
test('native restore recovers an active turn and folds its later completion',async()=>{
 const p=new FixturePort(),a=new MuseSessionAdapter({connection:p,...descriptor()});p.command=async()=>restoreResult({session:{...sessionResult.session,status:'running',activeTurnId:turnAck.turnId,turnCount:1}});
 await a.open(root,{sessionId:sessionResult.session.sessionId});assert.equal(a.snapshot().status,'running');assert.equal(a.snapshot().turnId,turnAck.turnId);p.emit(event('turn/completed'));assert.equal(a.snapshot().status,'completed');
});
test('native restore cannot reattach ephemeral sessions',async()=>{
 const p=new FixturePort(),d=descriptor();d.initializeResult.sessionDurability='ephemeral';const a=new MuseSessionAdapter({connection:p,...d});await assert.rejects(a.open(root,{sessionId:sessionResult.session.sessionId}),/durab|ephemeral/i);assert.equal(p.calls.length,0);
});

test('restored native queue blocks new input and adopts only its observed queued turn',async()=>{
 const p=new FixturePort(),a=new MuseSessionAdapter({connection:p,...descriptor()});p.command=async()=>restoreResult({history:{mode:'snapshot',snapshot:{schemaVersion:1,viewCursor:'',state:{items:[],queuedTurns:[{turnId:'native-queued'}],activeTurn:null}}}});
 await a.open(root,{sessionId:sessionResult.session.sessionId});await assert.rejects(a.send({text:'Do not overlap'}),/queued/);assert.equal(a.snapshot().status,'idle');
 p.emit({method:'turn/started',params:{sessionId:sessionResult.session.sessionId,turnId:'native-queued',commandId:'existing-queue-command',viewCursor:'queued-start'}});assert.equal(a.snapshot().status,'running');assert.equal(a.snapshot().rootTurnId,'native-queued');assert.deepEqual(a.snapshot().restoration.queuedTurnIds,[]);
});
test('adapter transports ordered validated image parts and rejects invalid payloads before dispatch',async()=>{
 const {adapter:a,port:p}=await setup();const picture={type:'image',mediaType:'image/png',base64Data:Buffer.from('png bytes').toString('base64')};await assert.rejects(a.send({text:'Describe',images:[{...picture,base64Data:'!'}]}),/image/i);assert.equal(p.calls.length,1);await a.send({text:'Describe',images:[picture]});assert.deepEqual(p.calls[1].params.input,[{type:'text',text:'Describe'},picture]);
});
