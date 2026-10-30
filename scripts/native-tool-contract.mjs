// Opt-in contract test: actual pinned Muse + workspace MCP, scripted loopback
// Responses endpoint. No model inference, credential copying or external relay.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as sdk from '@muse-code/sdk';
import {createRuntime,curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {createWorkspaceMcpConfig} from '../electron/workspace-mcp-config.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

assert.deepEqual(process.argv.slice(2),['--local-fixture']);
const require=createRequire(import.meta.url),appRoot=fileURLToPath(new URL('..',import.meta.url));
const temporary=await realpath(tmpdir()),root=await mkdtemp(path.join(temporary,'muse-native-tool-contract-'));
const profile=path.join(root,'profile'),workspace=path.join(root,'project'),model='musebench-contract-fixture';
const namespace='mcp__musebench_workspace',registered=name=>`${namespace}__${name}`;
const report={at:new Date().toISOString(),modelInferenceRequests:0,personalCredentials:false,provider:'scripted-loopback-fixture',cases:[],requests:[],approvals:[],nativeTools:[],toolOutputs:[],cleanup:null};
const steps=[
 {name:'workspace_tool_search',args:{query:'definition'}},
 {name:'workspace_tool_call',args:{operation:'definition',path:'main.ts',line:2,column:2}},
 {name:'workspace_tool_batch',args:{calls:[{id:'symbols',operation:'workspace_symbols',query:'value'},{id:'definition',operation:'definition',path:'main.ts',line:2,column:2},{id:'syntax',operation:'syntax_diagnostics',path:'lib.ts'}]}},
];
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
   const sequence=scenario==='allow'?steps:[{name:'workspace_tool_search',args:{query:'denied fixture'}}];
   assert.ok(nextStep<=sequence.length,'Unexpected repeated main request');step=sequence[nextStep++];toolNamespace=namespace;
  }
  if(step){
   const callId=`fixture_${scenario}_${id}`;
   if(!observer)expectedCalls.set(callId,{...step,scenario});
   stream(res,{type:'function_call',id:`fc_${id}`,call_id:callId,name:`${toolNamespace}.${step.name}`,arguments:JSON.stringify(step.args),status:'completed'},id);
  }else stream(res,{type:'message',id:`msg_${id}`,role:'assistant',status:'completed',content:[{type:'output_text',text:`LOCAL_CONTRACT_${scenario.toUpperCase()}_DONE`,annotations:[]}]},id);
 }catch(error){fail(error);if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Local contract rejected the request'}}));}
}
function observe(frame){
 if(frames.length>=1500){fail(Error('Native event limit exceeded'));return;}
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
 const settings={schema_version:1,provider:'meta',model,endpoint_transport:{base_url:serverUrl,auth:'none'},model_catalog:[{model_id:model,provider_id:'meta',profile_id:'tbh',display_label:'Local contract fixture',visibility:'visible',display_order:0,is_default:true,context_limit:32768,output_limit:8192,description:'Scripted local contract fixture'}]};
 const settingsFile=path.join(profile,'.config','muse','settings.json');await writeFile(settingsFile,JSON.stringify(settings));
 const environment={...curateEnvironment(),HOME:profile,USERPROFILE:profile,APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share'),XDG_CACHE_HOME:path.join(profile,'.cache'),HOMEDRIVE:path.parse(profile).root.slice(0,2),HOMEPATH:profile.slice(2)};
 const sdkVersion=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8')).version;
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
 stage='connect';runtime=createRuntime({environment,workspaceMcp:createWorkspaceMcpConfig({appRoot,executable:require('electron')}),loadSdk:async()=>({sdk:wrappedSdk,sdkVersion}),timeoutMs:5000});
 const state=await bounded(runtime.connect({binary:discoverMuseBinaries()[0],workspaceRoot:workspace,fullAccess:true,workspaceTools:true,workspaceToolset:'analysis-v1'}));
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
   assert.equal(JSON.parse(calls[0].output).operations[0].name,'definition');assert.equal(JSON.parse(calls[1].output).items[0].path,'lib.ts');
   const batch=JSON.parse(calls[2].output);assert.equal(batch.kind,'workspace-batch');assert.equal(batch.calls.length,3);assert.ok(batch.calls.every(c=>c.status==='completed'&&c.result.snapshot===batch.snapshot));assert.equal(batch.calls[1].result.items[0].path,'lib.ts');
   assert.equal(final.activity.items.length,3);assert.ok(final.activity.items.every(c=>c.status==='completed'));assert.equal(final.activity.items[2].workspaceBatch.calls.length,3);
  }else{
   assert.equal(calls.length,1);assert.equal(calls[0].status,'rejected');assert.equal(calls[0].output,undefined);
   const refused=report.toolOutputs.find(x=>x.callId===calls[0].callId);assert.ok(refused);assert.match(refused.output,/denied|aborted|rejected/i);assert.doesNotMatch(refused.output,/"gateway"|"operations"/);
   const row=final.activity.items.find(x=>x.id===calls[0].itemId);assert.equal(row.status,'failed');assert.equal(row.detail,'Tool request was not approved');
  }
  report.cases.push({scenario,terminal:'completed',tools:calls.map(c=>({name:c.tool,status:c.status})),nativeActivityVerified:true});
 }
 check();assert.equal(report.approvals.filter(a=>a.decision==='approved').length,3);assert.equal(report.approvals.filter(a=>a.decision==='abort').length,1);report.status='passed';
}catch(error){report.status='failed';report.stage=stage;report.error=String(error.stack??error).slice(0,4000);process.exitCode=1;}
finally{
 try{await runtime?.disconnect();report.cleanup=runtime?.snapshot().cleanup??'no-runtime';}catch{report.cleanup='unconfirmed';}
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(!['confirmed','no-runtime'].includes(report.cleanup)){report.status='failed';process.exitCode=1;}
 const target=path.resolve(root);assert.equal(path.dirname(target),temporary);assert.ok(path.basename(target).startsWith('muse-native-tool-contract-'));
 if(['confirmed','no-runtime'].includes(report.cleanup)){await rm(target,{recursive:true,force:true});report.workspaceRemoved=true;}else{report.workspaceRemoved=false;report.retainedWorkspace=target;}
 const output=path.join(appRoot,'artifacts','native-tool-contract');await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,stage:report.stage,error:report.error,cases:report.cases,requests:report.requests.length,cleanup:report.cleanup,workspaceRemoved:report.workspaceRemoved,modelInferenceRequests:0}));
}
