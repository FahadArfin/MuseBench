// Opt-in bounded live probe. Uses the existing Muse login, creates only its own
// native session and temporary workspace, and closes its own host in finally.
import {spawnMspConnection} from '@muse-code/sdk';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
const mode=process.argv[2];
if(!['direct','workflow','closed'].includes(mode))throw Error('Choose direct, workflow, or closed; each makes one bounded native root turn.');
const workspace=await mkdtemp(path.join(tmpdir(),'muse-child-lifecycle-'));
const report={at:new Date().toISOString(),mode,workspace,commands:[],events:[]};
const items=new Map();let owner,host,sessionId;
const deadline=Date.now()+90000;
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Probe deadline exceeded')),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}};
const wait=async predicate=>{while(Date.now()<deadline){const found=predicate();if(found)return found;await new Promise(r=>setTimeout(r,100));}throw Error('Lifecycle not observed before bounded deadline');};
const command=async(method,params)=>{try{const result=await bounded(host.connection.command(method,{sessionId,...params},{maxAttempts:1}));report.commands.push({method,params,result});return result;}catch(e){report.commands.push({method,params,error:e.message,code:e.code,data:e.data});return null;}};
try{
 owner=spawnMspConnection({command:discoverMuseBinaries()[0],args:['serve','--disable-sandbox','--disable-request-user-input','-c','hooks={}','-c','managed_hooks_path=null'],cwd:workspace,env:curateEnvironment(),shutdownTimeoutMs:5000});
 host=await bounded(owner.initialize({clientInfo:{name:'musebench_child_lifecycle',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:false}}));
 host.connection.onNotification(f=>{const i=f.params?.item;if(i&&['subagent','workflow'].includes(i.kind))items.set(i.itemId,i);if(i||f.method==='turn/completed')report.events.push({method:f.method,params:f.params});});
 const started=await bounded(host.connection.command('session/start',{workspaceRoot:workspace,permissionProfile:':ask-me',approvalMode:'onRequest'},{maxAttempts:1}));sessionId=started.session.sessionId;report.sessionId=sessionId;
 const prompt=mode==='direct'?'Native direct-child capability test. If a direct spawn-agent/subagent tool is available, use it exactly once to create a direct child (not a workflow-owned child). Child must reply DIRECT_CHILD_READY without tools or nested agents. Parent waits for it. Do not use a workflow, generated workflow, scripts, shell, or other workaround. If only workflow delegation exists, reply DIRECT_CHILD_UNAVAILABLE with the relevant available tool name and stop.':'Use the native workflow tool to spawn exactly one child named lifecycle-check. Child must run only Start-Sleep -Seconds 15 in PowerShell, then reply WORKFLOW_CHILD_READY. No files, network, nested agents, or other work. Parent waits for this one result and reports it. This is a bounded native lifecycle test.';
 await command('turn/start',{input:[{type:'text',text:mode==='closed'?prompt.replace('15','1'):prompt}],reasoningEffort:'low'});
 if(mode==='direct'){
  await wait(()=>[...items.values()].find(i=>i.kind==='subagent')||report.events.some(e=>e.method==='turn/completed'));
  const child=[...items.values()].find(i=>i.kind==='subagent');
  if(!child)report.boundary='No direct child was created; see native answer.';
  else if(child.workflowRunId)report.boundary='Native child is workflow-owned; not treated as direct eligibility.';
  else{
   await wait(()=>items.get(child.itemId)?.controlStatus==='resultReady');
   await command('subagent/followupTask',{subagentId:child.subagentId,body:'Reply DIRECT_FOLLOWUP_READY without tools.'});
   await wait(()=>items.get(child.itemId)?.result?.summary?.includes('DIRECT_FOLLOWUP_READY'));
   await command('subagent/close',{subagentId:child.subagentId,reason:'Bounded isolated lifecycle probe'});
   await wait(()=>items.get(child.itemId)?.controlStatus==='closed');
   await command('subagent/reopen',{subagentId:child.subagentId});
  }
 }else if(mode==='closed'){
  const child=await wait(()=>[...items.values()].find(i=>i.kind==='subagent'&&i.controlStatus==='resultReady'));
  report.beforeClose=child;
  const closed=await command('subagent/close',{subagentId:child.subagentId,reason:'Bounded isolated lifecycle probe'});
  if(closed){
   await wait(()=>items.get(child.itemId)?.controlStatus==='closed');
   report.observedClosed=items.get(child.itemId);
   const reopened=await command('subagent/reopen',{subagentId:child.subagentId});
   if(reopened)await wait(()=>items.get(child.itemId)?.revision>report.observedClosed.revision&&items.get(child.itemId)?.controlStatus==='resultReady');
  }
 }else{
  const workflow=await wait(()=>[...items.values()].find(i=>i.kind==='workflow'&&i.children?.some(c=>['scheduled','started','running'].includes(c.status))));
  const child=workflow.children.find(c=>['scheduled','started','running'].includes(c.status));
  const target={workflowRunId:workflow.workflowRunId,childId:child.childId,attempt:child.attempt};
  await command('workflow/childControl',{...target,action:'skip'});
  await wait(()=>items.get(workflow.itemId)?.children?.find(c=>c.childId===child.childId&&(c.terminal||['terminal','cancelled','failed','completed'].includes(c.status))));
  const retry=await command('workflow/childControl',{...target,action:'retry'});
  if(retry){
   const later=await wait(()=>items.get(workflow.itemId)?.children?.find(c=>c.childId===child.childId&&c.attempt>child.attempt));
   report.laterAttempt=later;
   await command('workflow/childControl',{...target,action:'skip'});
   await command('workflow/childControl',{...target,attempt:later.attempt,action:'skip'});
   await wait(()=>items.get(workflow.itemId)?.children?.find(c=>c.childId===child.childId&&c.attempt===later.attempt&&(c.terminal||c.status==='terminal')));
  }
 }
}catch(e){report.error=e.message;}finally{
 report.finalItems=[...items.values()];
 try{await(host??owner)?.close();report.hostClose='completed';}catch(e){report.hostClose=e.message;}
 const absolute=path.resolve(workspace);if(path.dirname(absolute)!==path.resolve(tmpdir())||!path.basename(absolute).startsWith('muse-child-lifecycle-'))throw Error('Unexpected cleanup path');
 await rm(absolute,{recursive:true,force:true});report.workspaceRemoved=true;
 await writeFile(`artifacts/child-lifecycle-${mode}-2026-10-26.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({mode,error:report.error,boundary:report.boundary,commands:report.commands.map(c=>({method:c.method,status:c.result?.status,error:c.error})),hostClose:report.hostClose,workspaceRemoved:report.workspaceRemoved}));
}
