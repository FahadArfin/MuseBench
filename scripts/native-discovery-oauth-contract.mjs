// Opt-in contract test: actual pinned Muse + workspace MCP, scripted loopback
// Responses endpoint. No model inference, credential copying or external relay.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {pathToFileURL} from 'node:url';
import {createOAuthAuthority} from '../test/fixtures/discovery-oauth-authority.mjs';
import {oauthIntegration} from '../test/fixtures/discovery-oauth-integration.mjs';

import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {peer} from '../test/fixtures/discovery-remote-peer.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

assert.deepEqual(process.argv.slice(2),['--local-fixture']);
const remoteMode=true,legacy=process.env.MUSEBENCH_OAUTH_LEGACY==='1';let remotePeer,authority,integration;
const require=createRequire(import.meta.url),repoRoot=fileURLToPath(new URL('..',import.meta.url)),appRoot=process.env.MUSEBENCH_DISCOVERY_APP_ROOT||repoRoot;
const load=relative=>import(pathToFileURL(path.join(appRoot,relative)).href);
const packageRequire=createRequire(path.join(appRoot,'package.json')),sdk=await import(pathToFileURL(packageRequire.resolve('@muse-code/sdk')).href);
const runtimeModule=await load('src/runtime/index.mjs'),{createRuntime,curateEnvironment,discoverMuseBinaries}=runtimeModule;
const modules={...await load('electron/discovery-mcp-config.mjs'),...await load('electron/discovery-oauth-store.mjs'),...await load('electron/discovery-oauth-flow.mjs'),...await load('electron/discovery-oauth-callback.mjs'),...await load('electron/discovery-oauth.mjs'),...await load('src/runtime/discovery-remote-network.mjs')};
const temporary=await realpath(tmpdir()),root=await mkdtemp(path.join(temporary,'muse-native-oauth-contract-'));
const profile=path.join(root,'profile'),workspace=path.join(root,'project'),model='musebench-contract-fixture';
const namespace='mcp__musebench_discovery',registered=name=>`${namespace}__${name}`;
const report={at:new Date().toISOString(),modelInferenceRequests:0,personalCredentials:false,provider:'scripted-loopback-fixture',cases:[],requests:[],approvals:[],nativeTools:[],toolOutputs:[],cleanup:null};
const steps=[{name:'discovery_search',args:{query:'fixture'}},{name:'discovery_call',args:{sourceId:'global:fixture',catalogRevision:'pending',tool:'allowed',arguments:{value:7}}}];
const sourceLog=path.join(root,'source.jsonl');let gatewayCreates=0;

let runtime,host,server,serverUrl,stage='setup',scenario='allow',nextStep=0,requestCount=0,failure,ownedSession,ownedTurn;
const deadline=Date.now()+60000,frames=[],expectedCalls=new Map(),approved=new Set();
const fail=error=>{failure??=error instanceof Error?error:Error(String(error));};
const check=()=>{if(failure)throw failure;if(Date.now()>deadline)throw Error('Native contract deadline exceeded.');};
async function bounded(promise,ms=10000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native contract operation timed out.')),Math.min(ms,Math.max(1,deadline-Date.now())));})]);}finally{clearTimeout(timer);}}
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));

function stream(res,item,id){
 const response={id:`resp_${id}`,object:'response',created_at:Math.floor(Date.now()/1000),model,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}};
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});let sequence=0;
 const event=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:sequence++,...data})}\n\n`);
 const call=item.type==='function_call';
 event('response.created',{response:{...response,status:'in_progress',output:[]}});
 event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',...(call?{arguments:''}:{content:[]})}});
 if(call){
  event('response.function_call_arguments.delta',{item_id:item.id,output_index:0,delta:item.arguments});
  event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments});
 }else{
  const part=item.content[0];event('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{...part,text:''}});
  event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:part.text});
  event('response.output_text.done',{item_id:item.id,output_index:0,content_index:0,text:part.text});
  event('response.content_part.done',{item_id:item.id,output_index:0,content_index:0,part});
 }
 event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end();
}
async function respond(req,res){
 try{
  check();const id=++requestCount;assert.ok(id<=24,'Too many fixture requests');
  assert.equal(req.method,'POST');assert.equal(req.url,'/v1/responses');assert.equal(req.headers.host,new URL(serverUrl).host);
  assert.equal(req.headers.authorization,undefined,'No credentials may reach the fixture');
  let bytes=0,source='';for await(const chunk of req){bytes+=chunk.length;assert.ok(bytes<=1048576,'Fixture input exceeded limit');source+=chunk;check();}
  const body=JSON.parse(source);assert.equal(body.model,model);assert.equal(body.stream,true);assert.ok(Array.isArray(body.tools));
  const ns=body.tools.find(tool=>tool.type==='namespace'&&tool.name===namespace);
  const observer=!ns;
  report.requests.push({id,scenario,role:observer?'observer':'main',path:req.url,bytes,credentialPresent:false});
  for(const item of body.input??[])if(item.type==='function_call_output'&&expectedCalls.has(item.call_id)&&!report.toolOutputs.some(x=>x.callId===item.call_id))report.toolOutputs.push({callId:item.call_id,output:String(item.output).slice(0,20000)});
  let step,toolNamespace;
  if(observer){
   assert.ok(body.tools.some(tool=>tool.type==='namespace'&&tool.name==='muse'&&tool.tools?.some(t=>t.name==='submit_reminder_decision')),'Unknown fixture request');
   step={name:'submit_reminder_decision',args:{decision:'none'}};toolNamespace='muse';
  }else{
   for(const step of steps)assert.ok(ns.tools?.some(tool=>tool.name===step.name),'Native workspace tool schema missing');
   const sequence=scenario==='allow'?steps:[{name:'discovery_call',args:{...steps[1].args,catalogRevision:JSON.parse(report.nativeTools.find(item=>item.tool===registered('discovery_search')&&item.status==='completed').output).sources[0].catalogRevision}}];
   assert.ok(nextStep<=sequence.length,'Unexpected repeated main request');step=sequence[nextStep++];if(step?.name==='discovery_call')step={...step,args:{...step.args,catalogRevision:JSON.parse(report.nativeTools.find(item=>item.tool===registered('discovery_search')&&item.status==='completed').output).sources[0].catalogRevision}};toolNamespace=namespace;
  }
  if(step){
   const callId=`fixture_${scenario}_${id}`;
   if(!observer)expectedCalls.set(callId,{...step,scenario});
   stream(res,{type:'function_call',id:`fc_${id}`,call_id:callId,name:`${toolNamespace}.${step.name}`,arguments:JSON.stringify(step.args),status:'completed'},id);
  }else stream(res,{type:'message',id:`msg_${id}`,role:'assistant',status:'completed',content:[{type:'output_text',text:`LOCAL_CONTRACT_${scenario.toUpperCase()}_DONE`,annotations:[]}]},id);
 }catch(error){fail(error);if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Local contract rejected the request'}}));}
}
function observe(frame){
 if(frames.length>=2000){fail(Error('Native event limit exceeded'));return;}
 frames.push(frame);
 if(frame.method==='item/completed'&&frame.params?.item?.kind==='toolCall'){
  const item=frame.params.item;report.nativeTools.push({sessionId:frame.params.sessionId,turnId:item.turnId,itemId:item.itemId,callId:item.callId,tool:item.tool,status:item.status,output:item.visibleOutput?.slice(0,20000)});
 }
}
async function finishTurn(){
 while(true){
  check();const state=runtime.snapshot();
  if(['failed','unavailable'].includes(state.status))throw Error(`Native runtime stopped: ${state.reason??state.status}`);
  const p=state.pending;
  if(p&&!approved.has(p.approvalId)){
   assert.equal(p.kind,'approval');assert.equal(p.sessionId,ownedSession);assert.equal(p.turnId,ownedTurn);
   const expected=expectedCalls.get(p.toolCallId);assert.ok(expected,'Unknown approval call');assert.equal(expected.scenario,scenario);
   assert.equal(p.toolName,registered(expected.name));assert.deepEqual(JSON.parse(p.rawArgs),expected.args);
   const decision=scenario==='allow'?'approved':'abort';
   const choice=p.availableChoices.find(c=>c.scope==='once'&&c.decision===decision);assert.ok(choice?.decisionToken);
   approved.add(p.approvalId);report.approvals.push({callId:p.toolCallId,tool:p.toolName,decision,scope:'once'});
   await bounded(runtime.decide(choice.decisionToken));
  }
  const terminal=frames.find(f=>f.method==='turn/completed'&&f.params.sessionId===ownedSession&&f.params.turnId===ownedTurn);
  if(terminal&&!state.childrenBusy){assert.equal(terminal.params.terminal,'completed');assert.equal(state.status,'completed');return state;}
  await sleep();
 }
}

try{
 await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(workspace);
 await writeFile(path.join(workspace,'lib.ts'),'export const value = 7;\n');await writeFile(path.join(workspace,'main.ts'),"import {value} from './lib';\nvalue;\n");
 server=createServer((req,res)=>{void respond(req,res);});server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));serverUrl=`http://127.0.0.1:${server.address().port}/v1`;
 authority=await createOAuthAuthority();remotePeer=await peer({current:!legacy,mode:legacy?'sse':'json',oauthAuthority:authority});
 const definition={type:'streamable-http',url:remotePeer.url,enabled:false,enabled_tools:['allowed'],disabled_tools:['filtered']};
 const settings={mcpServers:{fixture:definition},schema_version:1,provider:'meta',model,endpoint_transport:{base_url:serverUrl,auth:'none'},model_catalog:[{model_id:model,provider_id:'meta',profile_id:'tbh',display_label:'Local contract fixture',visibility:'visible',display_order:0,is_default:true,context_limit:32768,output_limit:8192,description:'Scripted local contract fixture'}]};
 const settingsFile=path.join(profile,'.config','muse','settings.json');await writeFile(settingsFile,JSON.stringify(settings));
 const environment={...curateEnvironment(),HOME:profile,USERPROFILE:profile,APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share'),XDG_CACHE_HOME:path.join(profile,'.cache'),HOMEDRIVE:path.parse(profile).root.slice(0,2),HOMEPATH:profile.slice(2)};
 const sdkVersion=JSON.parse(await readFile(packageRequire.resolve('@muse-code/sdk/package.json'),'utf8')).version;
 const wrappedSdk={...sdk,spawnMspConnection(options){
  // Use the production arguments and environment; only withhold shell/write
  // execution and background contributor routing in this disposable test.
  const owner=sdk.spawnMspConnection({...options,args:[...options.args,'--disable-shell','--disable-write','--contributor-mode','off']});
  return new Proxy(owner,{get(target,key){
   if(key==='initialize')return async params=>{
    host=await target.initialize(params);const connection=new Proxy(host.connection,{get(raw,key){
     if(key==='onNotification')return handler=>raw.onNotification(frame=>{observe(frame);handler(frame);});
     const value=Reflect.get(raw,key);return typeof value==='function'?value.bind(raw):value;
    }});
    return new Proxy(host,{get(raw,key){if(key==='connection')return connection;const value=Reflect.get(raw,key);return typeof value==='function'?value.bind(raw):value;}});
   };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
 }};
 const review=createExtensionReview({dataDir:path.join(root,'reviews'),profile,environment});await review.approveMcp('fixture',definition);
 const owner={taskId:'oauth-native-fixture',root:workspace,epoch:0};await mkdir(path.join(root,'grant-store'));
 const integrationOptions={dataDir:path.join(root,'grant-store'),workspace,authority,resource:remotePeer,environment,extensionReview:review,appRoot,modules,executable:process.env.MUSEBENCH_DISCOVERY_EXECUTABLE||require('electron'),helperPath:process.env.MUSEBENCH_DISCOVERY_HELPER||path.join(repoRoot,'native','bin','MuseBenchJob.exe'),ownerSnapshot:()=>owner};integration=await oauthIntegration(integrationOptions);
 let trusted=integration.factory;assert.equal((await fetch(remotePeer.url,{headers:{Authorization:'Bearer seeded-not-oauth',Connection:'close'}})).status,401);const enrollment=await integration.enroll();assert.equal(authority.counters.pkceValid,true);assert.equal(authority.counters.codeExchanges,1);assert.equal(remotePeer.effects,0);
 const selection={sources:[{id:enrollment.id,revision:enrollment.revision,authBindingRevision:enrollment.authBindingRevision}],reviewed:true};report.enrollment={pkceVerified:true,seededBearerRejected:true,codeExchanges:1,bindingRevision:enrollment.authBindingRevision};

 stage='connect';runtime=createRuntime({environment,extensionReview:review,discoveryMcp:async(...args)=>{gatewayCreates++;return trusted(...args);},loadSdk:async()=>({sdk:wrappedSdk,sdkVersion}),timeoutMs:5000});
 const state=await bounded(runtime.connect({binary:discoverMuseBinaries()[0],workspaceRoot:workspace,fullAccess:true,toolDiscovery:selection,discoveryTaskId:owner.taskId}));
 assert.equal(state.permissionVerified,true);ownedSession=state.sessionId;
 assert.equal(host.initializeResult.serverInfo.version,TARGET.hostVersion);assert.equal(host.initializeResult.schema.fingerprint,TARGET.fingerprint);
 report.host={version:host.initializeResult.serverInfo.version,schema:host.initializeResult.schema.fingerprint};
 const catalog=await bounded(runtime.refreshModels());assert.equal(catalog.source,'configCatalog');assert.equal(catalog.models.length,1);assert.equal(catalog.models[0].id,model);report.catalog=catalog;
 for(scenario of ['allow','deny']){
  check();stage=scenario;nextStep=0;
  assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),settings,'Fixture routing changed');
  const native=(await bounded(host.connection.request('session/read',{sessionId:ownedSession}))).session;assert.equal(native.providerId,'meta');assert.equal(native.modelId,model);
  await bounded(runtime.send({text:`Run the local scripted ${scenario} contract.`,runOptions:{model,reasoning:'high',approval:'ask'}}));ownedTurn=runtime.snapshot().turnId;assert.ok(ownedTurn);
  const final=await finishTurn(),calls=report.nativeTools.filter(c=>c.sessionId===ownedSession&&c.turnId===ownedTurn);
  if(scenario==='allow'){
   assert.deepEqual(calls.map(c=>c.tool),steps.map(s=>registered(s.name)));assert.ok(calls.every(c=>c.status==='completed'));
   const catalog=JSON.parse(calls[0].output);assert.equal(catalog.sources.length,1);assert.deepEqual(catalog.sources[0].tools.map(t=>t.name),['allowed']);
   const receipt=JSON.parse(calls[1].output);assert.equal(receipt.sourceId,'global:fixture');assert.equal(receipt.tool,'allowed');assert.equal(receipt.outcome,'completed');assert.equal(final.activity.items.length,2);assert.match(final.activity.items[1].detail,/global:fixture.*allowed.*completed/);
   if(remoteMode){assert.equal(remotePeer.effects,1);assert.equal(remotePeer.requests.filter(r=>r.message?.method==='initialize').length,legacy?1:0);assert.ok(remotePeer.requests.filter(r=>r.message).every(r=>authority.accepts((r.headers.authorization??'').replace(/^Bearer /,''))));}
   else{const starts=(await readFile(sourceLog,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(starts.filter(x=>x.kind==='start').length,1);assert.equal(starts.filter(x=>x.kind==='call').length,1);assert.equal(starts[0].cwd,workspace);assert.equal(starts[0].session,ownedSession);assert.equal(starts[0].secret,'exact-reviewed-fixture');}

  }else{
   assert.equal(calls.length,1);assert.equal(calls[0].status,'rejected');assert.equal(calls[0].output,undefined);assert.equal(final.activity.items[0].detail,'Tool request was not approved');
   const refused=report.toolOutputs.find(x=>x.callId===calls[0].callId);assert.ok(refused);assert.match(refused.output,/denied|aborted|rejected/i);assert.doesNotMatch(refused.output,/"gateway"|"operations"/);
   if(remoteMode)assert.equal(remotePeer.effects,1);else assert.equal((await readFile(sourceLog,'utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.kind==='call').length,1);
  }
  report.cases.push({scenario,terminal:'completed',tools:calls.map(c=>({name:c.tool,status:c.status})),nativeActivityVerified:true});
 }
 check();assert.equal(report.approvals.filter(a=>a.decision==='approved').length,2);assert.equal(report.approvals.filter(a=>a.decision==='abort').length,1);assert.equal(gatewayCreates,1);
 stage='reconnect';await runtime.disconnect();assert.equal(runtime.snapshot().cleanup,'confirmed');const reconnect=await bounded(runtime.connect({binary:discoverMuseBinaries()[0],workspaceRoot:workspace,fullAccess:true,toolDiscovery:selection,discoveryTaskId:owner.taskId,sessionId:ownedSession}));assert.equal(reconnect.sessionId,ownedSession);assert.deepEqual(reconnect.toolDiscovery,{sources:selection.sources});assert.equal(authority.counters.codeExchanges,1);assert.equal(authority.counters.refreshes,0);report.cases.push({scenario:'reconnect',sameBinding:true,sameNativeSession:true,newBrowserExchanges:0});
 stage='new-enrollment';const replaced=await integration.enroll();assert.notEqual(replaced.authBindingRevision,enrollment.authBindingRevision);await runtime.disconnect();integrationOptions.protection=integration.protection;await integration.close();integration=await oauthIntegration(integrationOptions);trusted=integration.factory;assert.equal((await integration.inspect()).authBindingRevision,replaced.authBindingRevision);await assert.rejects(bounded(runtime.connect({binary:discoverMuseBinaries()[0],workspaceRoot:workspace,fullAccess:true,toolDiscovery:selection,discoveryTaskId:owner.taskId,sessionId:ownedSession})));assert.equal(remotePeer.effects,1);assert.equal(authority.counters.codeExchanges,2);report.cases.push({scenario:'new-enrollment',oldSavedMarkerRejected:true,restartPreservesRefusal:true,downstreamCalls:0});const forgetReview=(await integration.inspect()).auth;await integration.oauth.command({type:'forget',taskId:owner.taskId,sourceId:enrollment.id,sourceRevision:enrollment.revision,bindingRevision:forgetReview.bindingRevision,reviewRevision:forgetReview.reviewRevision,reviewed:true});assert.equal((await integration.inspect()).auth.credentialAvailable,false);await assert.rejects(bounded(runtime.connect({binary:discoverMuseBinaries()[0],workspaceRoot:workspace,fullAccess:true,toolDiscovery:selection,discoveryTaskId:owner.taskId,sessionId:ownedSession})));report.cases.push({scenario:'forget-latest',olderGrantRevived:false,downstreamCalls:0});
 report.counts={gatewayCreates,ownedValidationWorkers:1,sourceStarts:0,remoteConnections:1,originalDirectStarts:0,downstreamCalls:1,authorizationCodeExchanges:authority.counters.codeExchanges,refreshPosts:authority.counters.refreshes};report.protocol=legacy?'legacy-2025-11-25-post-sse':'current-2026-07-28';report.status='passed';

}catch(error){report.status='failed';report.stage=stage;report.error=String(error.stack??error).slice(0,4000);process.exitCode=1;}
finally{
 try{await runtime?.disconnect();report.cleanup=runtime?.snapshot().cleanup??'no-runtime';if(report.cleanup==='not-started'&&host){await bounded(host.exited);report.lastOwnerExited=true;report.cleanup='confirmed';}if(report.cleanup==='confirmed'){if(remoteMode){for(let i=0;i<30&&remotePeer.sockets;i++)await sleep();assert.equal(remotePeer.sockets,0);report.remoteSocketCleanupVerified=true;report.remote={currentOnly:!legacy,initializeRequests:remotePeer.requests.filter(r=>r.message?.method==='initialize').length,downstreamCalls:remotePeer.effects};}else{const rows=(await readFile(sourceLog,'utf8')).trim().split('\n').map(JSON.parse);for(const row of rows.filter(r=>r.kind==='start'))assert.throws(()=>process.kill(row.pid,0));}report.processCleanupVerified=true;}}catch{report.cleanup='unconfirmed';}
 await integration?.close();await remotePeer?.close();await authority?.close();
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(!['confirmed','no-runtime'].includes(report.cleanup)){report.status='failed';process.exitCode=1;}
 const target=path.resolve(root);assert.equal(path.dirname(target),temporary);assert.ok(path.basename(target).startsWith('muse-native-oauth-contract-'));
 if(['confirmed','no-runtime'].includes(report.cleanup)){await rm(target,{recursive:true,force:true});report.workspaceRemoved=true;}else{report.workspaceRemoved=false;report.retainedWorkspace=target;}
 const evidenceBase=path.resolve(process.env.MUSEBENCH_DISCOVERY_EVIDENCE_DIR||path.join(repoRoot,'artifacts','remote-oauth'));await mkdir(evidenceBase,{recursive:true});const output=process.env.MUSEBENCH_DISCOVERY_REPORT_DIR?path.resolve(process.env.MUSEBENCH_DISCOVERY_REPORT_DIR):await mkdtemp(path.join(evidenceBase,(process.env.MUSEBENCH_DISCOVERY_APP_ROOT?'native-packaged-':'native-source-')+(legacy?'legacy-':'current-')));await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 assert.doesNotMatch(JSON.stringify(report),/FIXTURE_ACCESS_|FIXTURE_REFRESH_|code_verifier/);console.log(JSON.stringify({status:report.status,stage:report.stage,error:report.error,cases:report.cases,requests:report.requests.length,cleanup:report.cleanup,workspaceRemoved:report.workspaceRemoved,modelInferenceRequests:0,report:path.join(output,'report.json')}));
}
