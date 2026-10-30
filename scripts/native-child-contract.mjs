// Opt-in native acceptance: scripted loopback Responses, no model inference.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as sdk from '@muse-code/sdk';
import {createRuntime,curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {childActions} from '../src/shared/child-actions.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

assert.deepEqual(process.argv.slice(2),['--local-fixture'],'Explicit --local-fixture is required.');
const require=createRequire(import.meta.url),appRoot=fileURLToPath(new URL('..',import.meta.url));
const model='musebench-child-contract-fixture',temporary=await realpath(tmpdir());
const scriptSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const report={at:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:appRoot,encoding:'utf8'}).trim(),scriptSha256,provider:'scripted-loopback-fixture',modelInferenceRequests:0,personalCredentials:false,usage:'Synthetic fixture counters; not inference usage.',limits:{scenarioMs:60000,operationMs:10000,requests:32,events:2000,requestBytes:1048576},cases:[]};
const delay=()=>new Promise(resolve=>setTimeout(resolve,20));
async function timeout(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native child contract operation timed out.')),Math.max(1,ms));})]);}finally{clearTimeout(timer);}}
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
// Retain bounded fixture identities and outcomes, never raw prompts/tool output.
const selected=item=>item&&({itemId:item.itemId,revision:item.revision,kind:item.kind,status:item.status,turnId:item.turnId,subagentId:item.subagentId,childSessionId:item.childSessionId,workflowRunId:item.workflowRunId,controlStatus:item.controlStatus,children:item.children?.map(c=>({childId:c.childId,attempt:c.attempt,status:c.status,terminal:c.terminal,failureReason:c.failureReason?.slice(0,500)})),result:item.result&&{summary:item.result.summary?.slice(0,500),text:item.result.text?.slice(0,500),errorKind:item.result.errorKind}});
async function scenario(name){
 const receipt={name,status:'running',requests:[],commands:[],eventCount:0,approvalsGranted:0};report.cases.push(receipt);
 const deadline=Date.now()+60000,workDeadline=deadline-10000,items=new Map(),held=new Set();
 let runtime,host,server,serverUrl,root,sessionId,turnId,failure,requestCount=0,workflowSent=false,stage='setup';
 const fail=error=>{failure??=error instanceof Error?error:Error(String(error));};
 const check=()=>{if(failure)throw failure;if(Date.now()>=workDeadline)throw Error('Native child contract scenario deadline exceeded.');};
 const bounded=promise=>{check();return timeout(promise,Math.min(10000,workDeadline-Date.now()));};
 const wait=async predicate=>{while(true){check();const state=runtime.snapshot();assert.ok(!state.pending,'Unexpected native approval or question; no decision granted.');const result=predicate(state);if(result)return result;await delay();}};
 const workflow=()=>runtime.snapshot().children.items.find(i=>i.kind==='workflow');
 const currentChild=id=>runtime.snapshot().children.items.find(i=>i.kind==='subagent'&&i.subagentId===id);
 function observe(frame){
  if(++receipt.eventCount>2000){fail(Error('Native event limit exceeded.'));return;}
  if(frame.method.startsWith('approval/')||frame.method.startsWith('userInput/')){fail(Error('Unexpected native approval or question.'));return;}
  const p=frame.params,item=p?.item;
  if(item&&['workflow','subagent'].includes(item.kind)){
   if(sessionId&&p.sessionId!==sessionId){fail(Error('Foreign native child event.'));return;}
   if(items.size>=16&&!items.has(item.itemId)){fail(Error('Native child item limit exceeded.'));return;}
   if((items.get(item.itemId)?.revision??0)<item.revision)items.set(item.itemId,selected(item));
  }
 }
 const script=name==='controls'
  ?'export default async function workflow(host) { const result = await host.parallel([{input:"Return CHILD_READY_A without tools",label:"lifecycle-a"},{input:"Return CHILD_READY_B without tools",label:"lifecycle-b"}]); return {summary:JSON.stringify({result})}; }'
  :'export default async function workflow(host) { const result = await host.agent({input:"Return CHILD_READY without tools",label:"lifecycle-check"}); return {summary:JSON.stringify({result})}; }';
 async function respond(req,res){
  try{
   check();const id=++requestCount;assert.ok(id<=32,'Local HTTP request limit exceeded.');
   assert.equal(req.method,'POST');assert.equal(req.url,'/v1/responses');assert.equal(req.headers.host,new URL(serverUrl).host);
   assert.ok(Object.keys(req.headers).every(key=>!/(authorization|api[-_]key|token)/i.test(key)),'Credentials must not reach the fixture.');
   let bytes=0,source='';for await(const chunk of req){bytes+=chunk.length;assert.ok(bytes<=1048576,'Fixture request body exceeded limit.');source+=chunk;check();}
   const body=JSON.parse(source);assert.equal(body.model,model);assert.equal(body.stream,true);assert.ok(Array.isArray(body.tools));
   const ns=body.tools.find(t=>t.type==='namespace'&&t.name==='muse');assert.ok(ns&&Array.isArray(ns.tools)&&ns.tools.length<=64,'Unexpected native tool namespace.');
   const tools=ns.tools.map(t=>t.name);assert.ok(tools.every(t=>typeof t==='string'&&t.length<=200));
   const metadata={id,bytes,role:'main',credentialPresent:false,tools};receipt.requests.push(metadata);
   const call=(tool,args)=>stream(res,{type:'function_call',id:`fc_${id}`,call_id:`fixture_${name}_${id}`,name:`muse.${tool}`,arguments:JSON.stringify(args),status:'completed'},id);
   if(tools.includes('submit_reminder_decision')){metadata.role='observer';call('submit_reminder_decision',{decision:'none'});return;}
   if(tools.includes('submit_result')){
    metadata.role='child';const schema=ns.tools.find(t=>t.name==='submit_result').parameters;
    assert.equal(schema.properties?.text?.type,'string');assert.deepEqual(schema.required,['text','notes']);assert.equal(schema.additionalProperties,false);
    if(name==='controls'){held.add(res);res.on('close',()=>held.delete(res));return;}
    call('submit_result',{text:'CHILD_READY',notes:null});return;
   }
   assert.ok(tools.includes('workflow'),'Unknown provider request; fixture will not forward it.');
   receipt.advertisedRootTools??=tools;
   assert.ok(!tools.some(t=>/spawn|subagent/i.test(t)),'Direct child capability changed; reassess this contract.');
   if(!workflowSent){
    const schema=ns.tools.find(t=>t.name==='workflow').parameters;assert.equal(schema.properties?.name?.type,'string');assert.equal(schema.properties?.script?.type,'string');
    workflowSent=true;call('workflow',{name:`Isolated child contract ${name}`,script});return;
   }
   stream(res,{type:'message',id:`msg_${id}`,role:'assistant',status:'completed',content:[{type:'output_text',text:`LOCAL_CHILD_${name.toUpperCase()}_DONE`,annotations:[]}]},id);
  }catch(error){fail(error);if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Local child contract rejected request.'}}));}
 }
 async function control(target,action){
  check();assert.equal(target.turnId,turnId,'Child belongs to a foreign turn.');
  const input={sessionId,itemId:target.itemId,revision:target.revision,action};
  if(target.kind==='workflow')Object.assign(input,{childId:target.childId,attempt:target.attempt});
  const entry={...input,nativeId:target.kind==='workflow'?target.workflowRunId:target.subagentId};receipt.commands.push(entry);
  try{
   await bounded(runtime.childControl(input));entry.admission='accepted';
  }catch(error){
   entry.admission=error.code===-32030?'rejected':'unknown';entry.error=String(error.message).slice(0,1000);entry.code=error.code;entry.reason=error.data?.reason;
   throw error; // Unknown outcomes are never retried; confirmed rejection fails the required case.
  }
  const own=runtime.snapshot().childReceipts.at(-1);assert.equal(own.action,action);entry.commandId=own.commandId;
  if(entry.admission==='accepted')assert.equal(own.status,'accepted');
  else assert.equal(own.status,'rejected');
  return entry;
 }
 const workflowTarget=(childId,attempt)=>{
  const w=workflow(),c=w?.children?.find(c=>c.childId===childId&&c.attempt===attempt);
  assert.equal(w?.itemId,receipt.initialWorkflow.itemId);assert.equal(w.workflowRunId,receipt.initialWorkflow.workflowRunId);
  assert.ok(c,'Captured workflow child or attempt was replaced.');assert.equal(Math.max(...w.children.filter(x=>x.childId===childId).map(x=>x.attempt)),attempt);
  return {...w,childId,attempt};
 };
 try{
  root=await mkdtemp(path.join(temporary,'muse-native-child-contract-'));const profile=path.join(root,'profile'),workspace=path.join(root,'project');
  await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(workspace);
  server=createServer((req,res)=>{void respond(req,res);});server.requestTimeout=10000;server.headersTimeout=10000;
  await bounded(new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)));serverUrl=`http://127.0.0.1:${server.address().port}/v1`;
  const settings={schema_version:1,provider:'meta',model,endpoint_transport:{base_url:serverUrl,auth:'none'},model_catalog:[{model_id:model,provider_id:'meta',profile_id:'tbh',display_label:'Local child contract fixture',visibility:'visible',display_order:0,is_default:true,context_limit:32768,output_limit:8192}]};
  const settingsFile=path.join(profile,'.config','muse','settings.json');await writeFile(settingsFile,JSON.stringify(settings));
  const environment={...curateEnvironment(),HOME:profile,USERPROFILE:profile,APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share'),XDG_CACHE_HOME:path.join(profile,'.cache'),HOMEDRIVE:path.parse(profile).root.slice(0,2),HOMEPATH:profile.slice(2)};
  const sdkVersion=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8')).version;
  const wrappedSdk={...sdk,spawnMspConnection(options){
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
  stage='connect';runtime=createRuntime({environment,loadSdk:async()=>({sdk:wrappedSdk,sdkVersion}),timeoutMs:5000});
  const connected=await bounded(runtime.connect({binary:discoverMuseBinaries()[0],workspaceRoot:workspace,fullAccess:true}));
  assert.equal(connected.permissionVerified,true);sessionId=connected.sessionId;
  assert.equal(host.initializeResult.serverInfo.version,TARGET.hostVersion);assert.equal(host.initializeResult.schema.fingerprint,TARGET.fingerprint);
  receipt.host={version:host.initializeResult.serverInfo.version,schema:host.initializeResult.schema.fingerprint};
  const catalog=await bounded(runtime.refreshModels());assert.equal(catalog.source,'configCatalog');assert.equal(catalog.models.length,1);assert.equal(catalog.models[0].id,model);receipt.catalogSource=catalog.source;
  assert.deepEqual(JSON.parse(await readFile(settingsFile,'utf8')),settings,'Fixture provider routing changed.');
  const parent=(await bounded(host.connection.request('session/read',{sessionId}))).session;assert.equal(parent.providerId,'meta');assert.equal(parent.modelId,model);
  stage='start';await bounded(runtime.send({text:`Run the isolated ${name} child contract.`,runOptions:{model,reasoning:'high',approval:'ask'}}));turnId=runtime.snapshot().turnId;assert.ok(turnId);
  receipt.sessionId=sessionId;receipt.turnId=turnId;
  if(name==='controls'){
   stage='restart';await wait(s=>held.size===2&&s.children.items.find(i=>i.kind==='workflow')?.children?.length===2);
   const initial=workflow();assert.equal(initial.status,'inProgress');const [first,second]=initial.children;receipt.initialWorkflow=selected(initial);
   for(const target of [first,second])assert.equal(currentChild(target.childId)?.controlStatus,'running');
   const capturedSecond=selected(currentChild(second.childId));
   assert.equal(first.attempt,1);assert.equal(first.status,'started');
   receipt.restart=await control(workflowTarget(first.childId,first.attempt),'retry');
   stage='attempt2';const next=await wait(()=>workflow()?.children?.find(c=>c.childId===first.childId&&c.attempt===2&&c.status==='started'));
   await wait(()=>held.size===2&&currentChild(first.childId)?.controlStatus==='running');
   receipt.restart.settled=true;receipt.restart.workflow=selected(workflow());receipt.restart.child=selected(currentChild(first.childId));
   const stillSecond=currentChild(second.childId);assert.equal(stillSecond.controlStatus,'running');
   for(const key of ['itemId','childSessionId','workflowRunId'])assert.equal(stillSecond[key],capturedSecond[key],'Restart changed the unrelated child identity.');
   const beforeCommands=receipt.commands.length,stale={sessionId,itemId:initial.itemId,revision:workflow().revision,childId:first.childId,attempt:1,action:'retry'};
   await assert.rejects(runtime.childControl(stale),/attempt changed/);
   assert.equal(receipt.commands.length,beforeCommands);assert.equal(runtime.snapshot().childReceipts.length,1);
   receipt.staleAttempt={...stale,dispatched:false,reason:'Latest observed native attempt is 2; product rejected attempt 1 locally.'};
   stage='skip';receipt.skip=await control(workflowTarget(first.childId,next.attempt),'skip');
   await wait(()=>workflow()?.children?.some(c=>c.childId===first.childId&&c.attempt===next.attempt&&c.terminal==='cancelled')&&currentChild(first.childId)?.result?.errorKind==='workflow_child_skipped');
   receipt.skip.settled=true;receipt.skip.child=selected(currentChild(first.childId));
   stage='stop';const stopTarget=currentChild(second.childId);assert.equal(stopTarget.controlStatus,'running');
   for(const key of ['itemId','childSessionId','workflowRunId'])assert.equal(stopTarget[key],capturedSecond[key],'Captured Stop child identity changed.');
   receipt.stop=await control(stopTarget,'stop');
   await wait(()=>workflow()?.children?.some(c=>c.childId===second.childId&&c.attempt===second.attempt&&c.terminal==='cancelled')&&currentChild(second.childId)?.result?.errorKind==='generated_child_cancelled');
   receipt.stop.settled=true;receipt.stop.child=selected(currentChild(second.childId));
   assert.equal(Math.max(...workflow().children.filter(c=>c.childId===first.childId).map(c=>c.attempt)),2,'Unexpected later attempt.');
  }else{
   stage='result';const child=await wait(s=>s.children.items.find(i=>i.kind==='subagent'&&i.controlStatus==='resultReady'&&i.result?.text==='CHILD_READY'));
   assert.ok(child.workflowRunId);receipt.result={text:child.result.text,child:selected(child)};
   stage='inspect';const inspected=await bounded(runtime.inspectChild({sessionId,itemId:child.itemId,revision:child.revision}));
   const inspection=inspected.childInspections.find(i=>i.itemId===child.itemId);assert.equal(inspection.status,'ready');assert.equal(inspection.data.session.sessionId,child.childSessionId);assert.equal(inspection.data.history.available,true);
   receipt.inspection={status:inspection.status,childSessionId:inspection.data.session.sessionId,items:inspection.data.history.items.length};
   stage='readResult';receipt.readResult=await control(currentChild(child.subagentId),'readResult');
   stage='close';receipt.close=await control(currentChild(child.subagentId),'close');
   const settleUntil=Date.now()+3000;while(Date.now()<settleUntil){check();await delay();}
   const read=await bounded(host.connection.request('session/read',{sessionId,excludeItems:false}));
   assert.equal(read.session?.sessionId,sessionId,'Parent read identity changed.');
   const history=read.history,snapshot=history?.snapshot;
   const authoritative=history?.mode==='inline'?history.items:
    ['snapshot','anchoredSnapshot'].includes(history?.mode)&&snapshot?.schemaVersion===1&&typeof read.viewCursor==='string'&&snapshot.viewCursor===read.viewCursor?snapshot.state?.items:undefined;
   assert.ok(Array.isArray(authoritative),'Authoritative parent history unavailable.');
   const after=authoritative.find(i=>i.itemId===child.itemId);assert.ok(after);assert.equal(after.subagentId,child.subagentId);assert.equal(after.childSessionId,child.childSessionId);
   assert.equal(after.workflowRunId,child.workflowRunId);assert.equal(after.turnId,child.turnId);
   receipt.close.parentSnapshot=selected(after);receipt.close.closedObserved=after.controlStatus==='closed';
   assert.ok(!childActions(currentChild(child.subagentId)).includes('reopen'),'Workflow child must not offer direct reopen.');
   receipt.reopen={dispatched:false,reason:receipt.close.closedObserved?'Workflow-owned child is ineligible for direct reopen.':'No authoritative closed child projection.'};
  }
  stage='terminal';await wait(s=>['completed','cancelled'].includes(s.status)&&!s.childrenBusy);
  check();receipt.finalWorkflow=selected(workflow());receipt.status='passed';
 }catch(error){receipt.status='failed';receipt.stage=stage;receipt.error=String(error.stack??error).slice(0,4000);process.exitCode=1;}
 finally{
  // Reserve the final ten seconds for owned host cleanup after work timeout.
  try{await timeout(runtime?.disconnect(),Math.min(10000,Math.max(1,deadline-Date.now())));receipt.cleanup=runtime?.snapshot().cleanup??'no-runtime';}catch{receipt.cleanup='unconfirmed';}
  for(const res of held)res.destroy();server?.closeAllConnections();
  if(server)try{await timeout(new Promise(resolve=>server.close(resolve)),Math.max(1,deadline-Date.now()));}catch{receipt.cleanup='unconfirmed';}
  if(!['confirmed','no-runtime'].includes(receipt.cleanup)){receipt.status='failed';process.exitCode=1;}
  if(root){
   const target=await realpath(root);assert.equal(path.dirname(target),temporary);assert.ok(path.basename(target).startsWith('muse-native-child-contract-'));
   if(['confirmed','no-runtime'].includes(receipt.cleanup)){await rm(target,{recursive:true,force:true});receipt.workspaceRemoved=true;}else{receipt.workspaceRemoved=false;receipt.retainedWorkspace=target;}
  }
  receipt.directChild='Not advertised by this host configuration; direct follow-up/resume/reopen unproved.';
 }
 return receipt;
}
try{
 for(const name of ['controls','completed']){const receipt=await scenario(name);if(receipt.status!=='passed')break;}
 const cases=report.cases;
 assert.equal(cases.find(c=>c.name==='controls')?.restart?.settled,true,'Required native Restart attempt progression missing');
 assert.equal(cases.find(c=>c.name==='controls')?.staleAttempt?.dispatched,false,'Required local stale-attempt rejection missing');
 assert.equal(cases.find(c=>c.name==='controls')?.skip?.settled,true,'Required native Skip settlement missing');
 assert.equal(cases.find(c=>c.name==='controls')?.stop?.settled,true,'Required native Stop settlement missing');
 assert.equal(cases.find(c=>c.name==='completed')?.result?.text,'CHILD_READY','Required native child result missing');
 assert.ok(cases.every(c=>c.status==='passed'&&c.cleanup==='confirmed'&&c.workspaceRemoved));report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error).slice(0,4000);process.exitCode=1;}
finally{
 const output=path.join(appRoot,'artifacts','native-child-contract');await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,error:report.error,cases:report.cases.map(c=>({name:c.name,status:c.status,stage:c.stage,error:c.error,requests:c.requests.length,events:c.eventCount,cleanup:c.cleanup,workspaceRemoved:c.workspaceRemoved})),modelInferenceRequests:0}));
}
