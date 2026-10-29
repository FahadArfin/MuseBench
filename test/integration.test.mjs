import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {createRuntime} from '../src/runtime/index.mjs';
import {TARGET} from '../reference/patchlight/adapter/compatibility.mjs';

test('a controller-owned Muse turn survives an explicit one-time approval and records its final message',async()=>{
  const base=await mkdtemp(path.join(tmpdir(),'musebench-integration-'));
  const project=path.join(base,'project');await mkdir(project);await writeFile(path.join(project,'package.json'),'{"name":"integration","scripts":{}}');
  const binary=path.join(base,'muse.exe');await writeFile(binary,'fixture boundary: never executed');
  let notify=()=>{},serverRequest=()=>{},counter=0;const commands=[];
  const session=()=>({sessionId:'session-integration',workspaceRoot:project,status:'idle',providerId:'meta',modelId:'fixture-model',approvalMode:{mode:'onRequest'},permissionState:{profileId:':ask-me',reviewerAuthority:'human',reviewerAttached:false,axes:{filesystem:'sandboxed',network:'off',approval:'onRequest',reviewer:'human'}}});
  const connection={
    mintCommandId:()=>`command-${++counter}`,
    onNotification:fn=>{notify=fn;},onServerRequest:fn=>{serverRequest=fn;},onProtocolError:()=>{},
    request:async method=>method==='permissionProfile/list'?{profiles:[{profileId:':ask-me',available:true,reviewerAuthority:'human'}]}:method==='model/list'?{providerId:'meta',profileId:null,source:'providerCatalog',models:[{providerId:'meta',profileId:null,modelId:'fixture-model',isDefault:true,variants:['high'],defaultReasoningEffort:'high'}]}:{session:session()},
    command:async(method,params,options)=>{commands.push({method,params});if(method==='session/start')return{session:session(),viewCursor:'start'};if(method==='turn/start')return{commandId:options.commandId,status:'accepted',disposition:'started',startedNewTurn:true,turnId:'turn-integration'};if(method==='approval/decide')return{terminal:true};throw Error(method);},
  };
  const host={connection,initializeResult:{serverInfo:{version:TARGET.hostVersion},schema:{version:TARGET.schemaVersion,fingerprint:TARGET.fingerprint},sandboxAvailability:'available',experimentalApi:true},exited:new Promise(()=>{}),close:async()=>({code:0,signal:null})};
  const runtime=createRuntime({environment:{PATH:'',HOME:base,USERPROFILE:base},probeVersion:async()=>TARGET.hostVersion,loadSdk:async()=>({sdkVersion:TARGET.sdkVersion,sdk:{EXPECTED_SCHEMA_FINGERPRINT:TARGET.fingerprint,spawnMspConnection:()=>({initialize:async()=>host,close:host.close})}})});
  let controller;
  try{
    controller=await createController({dataDir:path.join(base,'data'),runtime});
    await controller.dispatch({type:'openProject',path:project});
    await controller.dispatch({type:'newTask',request:'Make one reviewable change',mode:'muse'});
    await controller.dispatch({type:'approvePlan'});
    let state=await controller.dispatch({type:'connectMuse',binary});assert.equal(state.error,null);
    state=await controller.dispatch({type:'sendMessage',text:'Make the approved change',mode:'chat'});assert.equal(state.error,null);
    await serverRequest({method:'approval/request',params:{sessionId:'session-integration',approvalId:'approval-integration',currentRequirementId:{approvalId:'approval-integration',sourceIndex:0},subject:'Read project source',availableChoices:[{choiceId:'allow',decision:'approved',scope:'once',label:'Allow once'}]}});
    state=controller.getState();assert.equal(state.runtime.status,'blocked');assert.equal(state.task.runtimeComplete,false);
    state=await controller.dispatch({type:'runtimeDecision',decision:state.runtime.pending.availableChoices[0].decisionToken});assert.equal(state.error,null);
    notify({method:'approval/resolved',params:{sessionId:'session-integration',approvalId:'approval-integration',decision:'approved'}});
    notify({method:'item/completed',params:{sessionId:'session-integration',viewCursor:'final-text',item:{itemId:'answer',turnId:'turn-integration',kind:'agentMessage',text:'The approved change is ready for review.',revision:1,status:'completed'}}});
    notify({method:'turn/completed',params:{sessionId:'session-integration',turnId:'turn-integration',viewCursor:'final-turn',terminal:'completed'}});
    state=controller.getState();assert.equal(state.runtime.status,'completed');assert.equal(state.task.runtimeComplete,true);
    assert(state.task.messages.some(m=>m.text==='The approved change is ready for review.'));
    assert.equal(commands.filter(c=>c.method==='turn/start').length,1);assert.equal(commands.filter(c=>c.method==='approval/decide').length,1);
  }finally{await controller?.close();await runtime.close();await rm(base,{recursive:true,force:true});}
});
