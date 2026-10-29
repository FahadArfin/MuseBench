import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {createExecRuntime} from '../src/runtime/exec.mjs';

const readiness='backend=windows_elevated\nstatus=ready\nrunner_trusted=true\nrunner_version_matches=true\nsandbox_users_ready=true\ncapabilities_ready=true\nrestricted_network_required=true\nwfp_ready=true\n';
const configuration='Enterprise configuration status\nGeneration: sha256:fe1be96aa5a6c4c857e50fe4bcfbcf2c33694bdad6321093706cb9b435356ac1\nSources:\n  plane=defaults source_class=system_file state=absent\n  plane=policy source_class=system_file state=absent\n  plane=defaults source_class=windows_machine_policy state=absent\n  plane=policy source_class=windows_machine_policy state=absent\n';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const jsonl=values=>values.map(value=>JSON.stringify(value)).join('\n')+'\n';

// These synthetic protocol frames cross the real exec fold, runtime owner and
// controller subscription. Neither a Muse executable nor a model is invoked.
function frames({terminal='completed',text='The requested change is complete.',reason=null,model=true,sessionId='native-session',runId='native-run'}={}){
  let sequence=0;
  const commandId='controller-command';
  const event=(type,kind,fields={})=>({schema_version:1,payload_schema_version:1,id:`frame-${++sequence}`,stream:{kind:'session',id:sessionId},sequence,recorded_at:1000+sequence,record_type:'event',durability:'durable',causation_id:commandId,payload_type:type,payload:{kind,command_id:commandId,...fields}});
  const run={run_stream:{kind:'run',id:runId}};
  return [
    event('runtime.command.accepted','command_accepted',{command_kind:'turn.submit'}),
    event('session.run.linked','session_run_linked',run),
    ...(model?[event('run.model.configured','run_model_configured',{...run,provider_id:'meta',model_id:'injected-meta-model',source:'startup'})]:[]),
    event('run.lifecycle.started','run_started',run),
    event('run.output.delta','run_output_delta',{...run,text:'The change is complete and tests pass (unverified assistant claim).'}),
    event(`run.terminal.${terminal}`,'run_terminal',{...run,terminal,text,reason}),
  ];
}

async function within(promise,milliseconds=1000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Controller dispatch blocked on the pending native run.')),milliseconds);})]);}
  finally{clearTimeout(timer);}
}

async function harness(t,{durableSessions=false,missingSession=false,background=false}={}){
  const base=await mkdtemp(join(tmpdir(),'musebench-exec-controller-'));
  const root=join(base,'project'),profile=join(base,'profile'),binary=join(base,'injected-muse.exe');
  await mkdir(root);await mkdir(profile);
  await writeFile(binary,'This is a placeholder. Tests inject every process.');
  await writeFile(join(root,'package.json'),JSON.stringify({name:'exec-controller-fixture',scripts:{}}));
  await writeFile(join(root,'index.html'),'<h1>Disposable review project</h1>');
  const calls=[],stopped=[];
  function spawnProcess(command,args,options){
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.pid=10000+calls.length;child.exitCode=null;child.closed=false;
    child.finish=(code=0)=>{if(child.closed)return;child.closed=true;child.exitCode=code;child.emit('close',code,null);};
    calls.push({command,args,options,child});
    queueMicrotask(()=>{
      child.emit('spawn');
      if(args[0]==='--version'){child.stdout.emit('data',Buffer.from('Muse Code 1.4.14 (1.4.14-R7309.1)'));child.finish();}
      else if(args[0]==='sandbox'){child.stdout.emit('data',Buffer.from(readiness));child.finish();}
      else if(args[0]==='export'){child.finish(missingSession?1:0);}
      else if(args[0]==='config'){child.stdout.emit('data',Buffer.from(configuration));child.finish();}
      else if(args.includes('echo')){child.stdout.emit('data',Buffer.from(jsonl(frames({model:false}))));child.finish();}
    });
    return child;
  }
  const factory=()=>createExecRuntime({durableSessions,platform:'win32',environment:{PATH:'',USERPROFILE:profile,SystemRoot:'C:\\Windows'},spawnProcess,stopProcess:async child=>{stopped.push(child);child.finish(1);return true;},timeoutMs:1000,runTimeoutMs:5000});
  const runtime=factory();
  const dataDir=join(base,'data');
  const controller=await createController({dataDir,runtime,...(background?{runtimeFactory:factory}:{})});
  t.after(async()=>{await controller.close();await runtime.close();await rm(base,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
  let state=await controller.dispatch({type:'openProject',path:root});assert.equal(state.error,null);
  state=await controller.dispatch({type:'newTask',request:'Update the disposable review project',mode:'muse'});assert.equal(state.error,null);
  await controller.dispatch({type:'approvePlan'});
  state=await controller.dispatch({type:'connectMuse',binary});assert.equal(state.error,null);
  assert.equal(state.runtime.status,'idle');
  assert.equal(calls.some(call=>call.args.includes('meta')),false,'connection probes must never call a model');
  const send=async()=>{
    // Dispatch includes real workspace/context I/O. Its contract here is to
    // return before the injected run ends, not a one-second startup benchmark.
    const sent=await within(controller.dispatch({type:'sendMessage',text:'Perform only the approved project change.'}),5000);
    assert.equal(sent.error,null);assert.equal(sent.runtime.status,'running');assert.equal(sent.task.runtimeComplete,false);
    const child=calls.findLast(call=>call.args.includes('meta')).child;assert.equal(child.closed,false);
    return child;
  };
  return{controller,runtime,calls,stopped,send,dataDir};
}

test('screenshot follows draft, queue and native image argument without embedding bytes in chat JSON',async t=>{
 const h=await harness(t),initial=h.controller.getState(),projectId=initial.activeProject.id,taskId=initial.task.id;
 const image=await h.controller.importImage({projectId,taskId,name:'screen.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='});
 let state=await h.controller.dispatch({type:'saveDraft',projectId,taskId,text:'Inspect screenshot',images:[image],files:[]});assert.equal(state.error,null);assert.deepEqual(state.drafts[`${projectId}:${taskId}`].images,[image]);
 state=await h.controller.dispatch({type:'queueMessage',text:'Inspect screenshot',images:[image]});assert.equal(state.error,null);assert.deepEqual(state.task.promptQueue[0].images,[image]);
 state=await h.controller.dispatch({type:'resumeQueue'});assert.equal(state.error,null);
 const args=h.calls.findLast(c=>c.args.includes('meta')).args;assert.ok(args.includes('--image'));assert.match(args[args.indexOf('--image')+1],/code-images/);assert.deepEqual(state.task.messages.find(m=>m.role==='user').images,[image]);assert.ok(!JSON.stringify(state).includes('base64'));
 await h.controller.dispatch({type:'disconnectMuse'});await h.controller.close();
 const reopened=await createController({dataDir:h.dataDir});try{assert.equal(reopened.getState().drafts[`${projectId}:${taskId}`].images[0].id,image.id);assert.match(await reopened.readImage({projectId,image}),/^data:image\/png/);}finally{await reopened.close();}
});

test('durable Code chat reuses its native session without replaying history and requires recovery after stop',async t=>{
 const h=await harness(t,{durableSessions:true});let state=await h.controller.dispatch({type:'sendMessage',text:'Remember the first request'});assert.equal(state.error,null);
 const sessionId=state.task.nativeSession.id,call=h.calls.findLast(c=>c.args.includes('meta'));
 assert.equal(call.args[call.args.indexOf('--session-id')+1],sessionId);assert.ok(!call.args.includes('--no-session-log'));
 call.child.stdout.emit('data',Buffer.from(jsonl(frames({sessionId,runId:'first-run',text:'UNIQUE_OLD_RESPONSE'}))));call.child.finish();await tick();
 assert.equal(h.controller.getState().task.nativeSession.status,'ready');
 state=await h.controller.dispatch({type:'sendMessage',text:'Continue with a different request'});assert.equal(state.error,null);const next=h.calls.findLast(c=>c.args.includes('meta'));
 assert.equal(next.args[next.args.indexOf('--session-id')+1],sessionId);assert.ok(!next.args.at(-1).includes('UNIQUE_OLD_RESPONSE'));assert.ok(next.args.at(-1).includes('existing native session'));
 assert.ok(h.calls.some(c=>c.args[0]==='export'));
 await h.controller.dispatch({type:'disconnectMuse'});assert.equal(h.controller.getState().task.nativeSession.status,'needs-recovery');
 state=await h.controller.dispatch({type:'sendMessage',text:'Do not silently resume'});assert.match(state.error,/Session/);
 state=await h.controller.dispatch({type:'recoverSession',choice:'fresh'});assert.equal(state.task.nativeSession,null);
});

test('exec/controller accepts completion attribution only after the authoritative terminal and exit zero',async t=>{
  const h=await harness(t);const child=await h.send();
  const data=jsonl(frames());
  child.stdout.emit('data',Buffer.from(data.slice(0,37)));
  child.stdout.emit('data',Buffer.from(data.slice(37)));
  let state=h.controller.getState();
  assert.equal(state.runtime.status,'running');assert.equal(state.task.runtimeComplete,false,'terminal output alone does not prove process success');
  assert.match(state.task.messages.at(-1).text,/complete/);
  child.finish(0);await tick();state=h.controller.getState();
  assert.equal(state.runtime.status,'completed');assert.equal(state.runtime.liveVerified,true);assert.equal(state.task.runtimeComplete,true);
  assert.equal(state.task.messages.filter(message=>message.id.startsWith('runtime:')).length,1,'stream updates replace the same assistant response');
  assert.equal(state.task.messages.at(-1).text,'The requested change is complete.');
});

test('native activity belongs to its prompt, persists after completion and stops on cancellation',async t=>{
 const h=await harness(t),child=await h.send();
 const records=frames(),template=records[3];
 const activity=(kind,fields={})=>({...template,payload_type:`task.lifecycle.${kind}`,payload:{...template.payload,kind:'task_lifecycle',task_id:'native-task',task_stream:{kind:'task',id:'native-task'},event:{kind,task_id:'native-task',...fields}}});
 const values=[...records.slice(0,4),activity('proposed',{task_kind:'tool.read_file'}),activity('started'),activity('status',{message:'Reading README.md'})];
 const encode=list=>jsonl(list.map((value,i)=>({...value,id:`activity-${i+1}`,sequence:i+1})));
 child.stdout.emit('data',Buffer.from(encode(values)));
 let state=h.controller.getState(),run=state.task.runs[0];
 assert.equal(run.promptId,state.task.messages.findLast(item=>item.role==='user').id);
 assert.equal(run.status,'working');assert.equal(run.activities[0].detail,'Reading README.md');
 // A stale session cannot write activity into the current prompt.
 const saved=await createController({dataDir:h.dataDir});
 assert.equal(saved.getState().task.runs[0].status,'interrupted');
 assert.equal(saved.getState().task.runs[0].activities[0].status,'interrupted');await saved.close();
 const end=[activity('completed'),...records.slice(4)].map((value,i)=>({...value,id:`activity-${values.length+i+1}`,sequence:values.length+i+1}));
 child.stdout.emit('data',Buffer.from(jsonl(end)));assert.equal(h.controller.getState().task.runs[0].status,'working','terminal alone cannot resolve a thread');
 child.finish(0);await tick();state=h.controller.getState();run=state.task.runs[0];
 assert.equal(run.status,'completed');assert.equal(run.activities[0].status,'completed');assert.ok(run.endedAt);
 assert.equal(state.task.messages.at(-1).turnId,run.promptId);
 const nextChild=await h.send();
 await h.controller.dispatch({type:'disconnectMuse'});state=h.controller.getState();
 assert.equal(state.task.runs[0].status,'completed');assert.equal(state.task.runs.at(-1).status,'cancelled');assert.ok(nextChild.closed);
});

test('native approval stop does not leave a false waiting thread after its process is stopped',async t=>{
 const h=await harness(t),child=await h.send(),records=frames().slice(0,4);
 const approval={...records.at(-1),id:'approval',sequence:5,payload_type:'task.lifecycle.side_effect_intent',payload:{...records.at(-1).payload,kind:'task_lifecycle',event:{kind:'side_effect_intent',policy_decision:'prompt:human_review'}}};
 child.stdout.emit('data',Buffer.from(jsonl([...records,approval])));await tick();await tick();
 const state=h.controller.getState();assert.equal(state.runtime.status,'blocked');assert.equal(state.task.runs[0].status,'failed');assert.ok(state.task.runs[0].endedAt);assert.ok(child.closed);
});

test('background workflow continuation stays attributed to one prompt until process exit',async t=>{
 const h=await harness(t),child=await h.send();
 // Captured native parent-session boundaries, with descriptive paths/text sanitized.
 const rows=(await readFile(new URL('./fixtures/native-workflow.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);
 const firstEnd=rows.findIndex(row=>row.payload_type==='run.terminal.completed');
 child.stdout.emit('data',Buffer.from(jsonl(rows.slice(0,firstEnd+1))));
 let state=h.controller.getState();assert.equal(state.task.runs[0].status,'working');assert.equal(state.task.runtimeComplete,false);
 assert.equal(state.task.runs[0].activities.find(item=>item.tool==='workflow').status,'working');
 child.stdout.emit('data',Buffer.from(jsonl(rows.slice(firstEnd+1))));
 state=h.controller.getState();assert.equal(state.task.runs.length,1);assert.equal(state.task.runs[0].ownedRunIds.length,2);assert.equal(state.task.runs[0].status,'working');
 child.finish(0);await tick();state=h.controller.getState();assert.equal(state.task.runs[0].status,'completed');assert.equal(state.task.runtimeComplete,true);
 assert.equal(state.task.messages.at(-1).turnId,state.task.runs[0].id);assert.match(state.task.messages.at(-1).text,/child completed/);
});

test('chat run settings persist, reach native execution, and cannot change during a run',async t=>{
 const h=await harness(t), options={reasoning:'xhigh',approval:'auto'};
 let state=await h.controller.dispatch({type:'setRunOptions',runOptions:options});assert.equal(state.error,null);
 assert.deepEqual(state.task.runOptions,options);
 const reopened=await createController({dataDir:h.dataDir});
 assert.deepEqual(reopened.getState().task.runOptions,options);await reopened.close();
 const child=await h.send(),args=h.calls.findLast(call=>call.args.includes('meta')).args;
 assert.equal(args[args.indexOf('--reasoning-effort')+1],'xhigh');
 assert.equal(args[args.indexOf('--permission-profile')+1],':auto-review');
 state=await h.controller.dispatch({type:'setRunOptions',runOptions:{reasoning:'low',approval:'never'}});
 assert(state.error);assert.deepEqual(state.task.runOptions,options);
 child.stdout.emit('data',Buffer.from(jsonl(frames())));child.finish(0);await tick();
 state=await h.controller.dispatch({type:'setRunOptions',runOptions:{reasoning:'low',approval:'never'}});
 assert.equal(state.error,null);assert.deepEqual(state.task.runOptions,{reasoning:'low',approval:'never'});
});

for(const scenario of [
  {name:'billing failure',records:()=>frames({terminal:'failed',text:'',reason:'HTTP 402: Billing verification failed'}),exitCode:1,status:'failed',reason:/billing|402/i},
  {name:'missing terminal despite successful exit and assistant claims',records:()=>frames().slice(0,-1),exitCode:0,status:'uncertain',reason:/terminal/i},
  {name:'completed terminal with failed process exit',records:()=>frames(),exitCode:1,status:'uncertain',reason:/contradict/i},
  {name:'failed terminal with successful process exit',records:()=>frames({terminal:'failed',reason:'Request failed'}),exitCode:0,status:'uncertain',reason:/contradict/i},
  {name:'conflicting terminal records',records:()=>{const result=frames();const conflict=structuredClone(result.at(-1));conflict.sequence++;conflict.id='conflicting-terminal';conflict.payload_type='run.terminal.failed';conflict.payload.terminal='failed';result.push(conflict);return result;},exitCode:0,status:'uncertain',reason:/terminal/i},
]){
  test(`exec/controller ${scenario.name} cannot authorize a local checkpoint`,async t=>{
    const h=await harness(t),child=await h.send();
    child.stdout.emit('data',Buffer.from(jsonl(scenario.records())));child.finish(scenario.exitCode);await tick();
    let state=h.controller.getState();assert.equal(state.runtime.status,scenario.status);assert.match(state.runtime.reason,scenario.reason);assert.equal(state.task.runtimeComplete,false);
    state=await h.controller.dispatch({type:'accept',revision:state.task.revision});
    assert.match(state.error,/Muse turn must complete/i,'runtime evidence itself must block acceptance before other review requirements');
    assert.equal(state.task.acceptedRevision,null);assert.equal(state.checkpoints.length,0);
    assert.equal(h.calls.filter(call=>call.args.includes('meta')).length,1,'controller must not automatically retry a rejected or ambiguous model turn');
  });
}

test('exec/controller dispatch remains available to disconnect a pending process and ignores its late completion',async t=>{
  const h=await harness(t),child=await h.send();
  let state=await within(h.controller.dispatch({type:'disconnectMuse'}));
  assert.equal(h.stopped.length,1);assert.equal(h.stopped[0],child);assert.equal(state.runtime.cleanup,'confirmed');assert.equal(state.runtime.status,'unavailable');assert.equal(state.task.runtimeComplete,false);
  child.stdout.emit('data',Buffer.from(jsonl(frames())));child.finish(0);await tick();
  state=h.controller.getState();assert.equal(state.task.runtimeComplete,false);assert.equal(state.runtime.status,'unavailable');assert.equal(state.runtime.liveVerified,false);
  const previousTaskId=state.task.id;
  state=await h.controller.dispatch({type:'newTask',request:'A new independent review task',mode:'muse'});assert.notEqual(state.task.id,previousTaskId);
  child.stdout.emit('data',Buffer.from(jsonl(frames())));child.emit('close',0,null);await tick();
  state=h.controller.getState();assert.equal(state.task.runtimeComplete,false);assert.equal(state.task.messages.some(message=>message.id.startsWith('runtime:')),false,'late prior-run output must not enter the new task journal');
});

test('exec/controller replaces streamed assistant claims with an empty failed terminal response',async t=>{
  const h=await harness(t),child=await h.send();
  const failed=frames({terminal:'failed',text:'',reason:'HTTP 402: Billing verification failed'});
  child.stdout.emit('data',Buffer.from(jsonl(failed.slice(0,-1))));
  let assistant=h.controller.getState().task.messages.find(message=>message.id.startsWith('runtime:'));
  assert.match(assistant.text,/unverified assistant claim/);
  child.stdout.emit('data',Buffer.from(jsonl(failed.slice(-1))));child.finish(1);await tick();
  const state=h.controller.getState();assistant=state.task.messages.find(message=>message.id.startsWith('runtime:'));
  assert.equal(state.runtime.status,'failed');assert.equal(state.task.runtimeComplete,false);
  assert.equal(assistant.text,'','an empty authoritative final response must clear the provisional assistant claim');
  await h.controller.close();
  const reopened=await createController({dataDir:h.dataDir});
  try{
    const restored=reopened.getState();
    assert.equal(restored.task.messages.find(message=>message.id.startsWith('runtime:')).text,'');
    assert.equal(restored.task.messages.some(message=>message.text.includes('unverified assistant claim')),false,'provisional claims must not return from the persisted task journal');
    assert.equal(restored.task.runtimeComplete,false);
  }finally{await reopened.close();}
});

 test('first-turn input receipt survives restart and stop before terminal, and resumes with offset',async t=>{
 const h=await harness(t,{durableSessions:true});await h.send();const id=h.controller.getState().task.nativeSession.id,call=h.calls.findLast(c=>c.args.includes('meta'));
 const rows=frames({sessionId:id,runId:'first-live'}).slice(0,2);rows.push({...rows[1],id:'input-receipt',sequence:3,payload_type:'turn.input.user',payload:{kind:'turn_input_user',command_id:'controller-command',run_stream:{kind:'run',id:'first-live'},prompt:'Accepted prompt'}});
 call.child.stdout.emit('data',Buffer.from(jsonl(rows)));assert.equal(h.controller.getState().task.nativeSession.seeded,true);
 const reopened=await createController({dataDir:h.dataDir});assert.equal(reopened.getState().task.nativeSession.seeded,true);assert.equal(reopened.getState().task.nativeSession.status,'needs-recovery');await reopened.close();
 await h.controller.dispatch({type:'disconnectMuse'});await h.controller.dispatch({type:'recoverSession',choice:'continue'});
 let state=await h.controller.dispatch({type:'sendMessage',text:'Continue after stop'});assert.equal(state.error,null);const next=h.calls.findLast(c=>c.args.includes('meta'));assert.ok(next.args.at(-1).includes('existing native session'));assert.ok(h.calls.some(c=>c.args[0]==='export'));
 const resumed=frames({sessionId:id,runId:'resumed'}).map(row=>({...row,sequence:row.sequence+20}));next.child.stdout.emit('data',Buffer.from(jsonl(resumed)));next.child.finish();await tick();assert.equal(h.controller.getState().task.nativeSession.status,'ready');
 });
 test('unacknowledged first-turn interruption requires a fresh session',async t=>{const h=await harness(t,{durableSessions:true});await h.send();await h.controller.dispatch({type:'disconnectMuse'});const state=await h.controller.dispatch({type:'recoverSession',choice:'continue'});assert.match(state.error,/receipt was not confirmed/);});

test('missing retained native log blocks resume without launching another model',async t=>{
 const h=await harness(t,{durableSessions:true,missingSession:true});await h.send();const id=h.controller.getState().task.nativeSession.id,call=h.calls.findLast(c=>c.args.includes('meta'));call.child.stdout.emit('data',Buffer.from(jsonl(frames({sessionId:id}))));call.child.finish();await tick();
 const state=await h.controller.dispatch({type:'sendMessage',text:'Resume missing log'});assert.ok(state.error);assert.equal(h.calls.filter(c=>c.args.includes('meta')).length,1);assert.equal(state.task.nativeSession.id,id);
});
test('branching a durable chat creates an independent native session',async t=>{
 const h=await harness(t,{durableSessions:true});await h.send();let state=h.controller.getState();const id=state.task.nativeSession.id,call=h.calls.findLast(c=>c.args.includes('meta'));call.child.stdout.emit('data',Buffer.from(jsonl(frames({sessionId:id}))));call.child.finish();await tick();state=h.controller.getState();
 state=await h.controller.dispatch({type:'forkTask',messageId:state.task.messages.find(m=>m.role==='assistant').id});assert.equal(state.error,null);assert.ok(!state.task.nativeSession);
 state=await h.controller.dispatch({type:'sendMessage',text:'Independent branch'});assert.equal(state.error,null);assert.notEqual(state.task.nativeSession.id,id);
});
test('native output from another session never completes the bound chat',async t=>{
 const h=await harness(t,{durableSessions:true});await h.send();const call=h.calls.findLast(c=>c.args.includes('meta'));call.child.stdout.emit('data',Buffer.from(jsonl(frames())));await tick();const state=h.controller.getState();assert.equal(state.task.runtimeComplete,false);assert.match(state.runtime.reason,/another session/);assert.equal(state.task.nativeSession.status,'needs-recovery');
});

test('two native exec owners keep session events and cancellation isolated',async t=>{
 const h=await harness(t,{durableSessions:true,background:true});await h.send();let state=h.controller.getState();const firstId=state.task.id,firstSession=state.task.nativeSession.id,first=h.calls.findLast(c=>c.args.includes('meta'));
 const secondRoot=join(h.dataDir,'..','second');await mkdir(secondRoot);state=await h.controller.dispatch({type:'openProject',path:secondRoot});assert.equal(state.error,null);await h.controller.dispatch({type:'newTask',mode:'muse',request:'Second isolated task'});await h.send();state=h.controller.getState();const secondId=state.task.id,second=h.calls.findLast(c=>c.args.includes('meta'));assert.notEqual(second,first);assert.notEqual(state.task.nativeSession.id,firstSession);
 first.child.stdout.emit('data',Buffer.from(jsonl(frames({sessionId:firstSession,runId:'background-native',text:'Background native result'}))));first.child.finish();await tick();assert.equal(h.controller.getState().task.id,secondId);assert.ok(!h.controller.getState().task.messages.some(m=>m.text==='Background native result'));
 state=await h.controller.dispatch({type:'selectTask',id:firstId});assert.equal(state.error,null);assert.equal(state.task.nativeSession.status,'ready');assert.equal(state.task.runtimeComplete,true);assert.ok(state.task.messages.some(m=>m.text==='Background native result'));assert.equal(second.child.closed,false);
 await h.controller.close();assert.equal(second.child.closed,true);
});
