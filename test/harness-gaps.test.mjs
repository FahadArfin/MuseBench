import {writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {validateAction} from '../electron/security.mjs';

function fakeRuntime(){
 let state={status:'unavailable',transport:'exec',permissionVerified:false,messages:[],runId:null,cleanup:'confirmed'},listeners=[],sequence=0;
 const emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn(state));};
 return {emit,sent:[],snapshot:()=>structuredClone(state),subscribe(fn){listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn);};},async connect(){emit({status:'idle',permissionVerified:true});},async disconnect(){emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'});},async send(request){this.sent.push(request);emit({status:'running',runId:null,inputAccepted:false,messages:[],cleanup:undefined});emit({runId:`run-${++sequence}`,inputAccepted:true});},finish(text='Done',status='completed',cleanup='confirmed'){emit({status,messages:[{id:`answer-${sequence}`,kind:'agentMessage',text}],cleanup});}};
}
async function fixture(t,{node=true,background=false}={}){
 const root=await mkdtemp(join(tmpdir(),'musebench-gaps-')),project=join(root,'project'),dataDir=join(root,'data');await mkdir(project);if(node)await writeFile(join(project,'package.json'),'{}');await writeFile(join(project,'notes.md'),'Useful project notes.');await writeFile(join(project,'.env'),'SECRET=never-send');
 const runtime=fakeRuntime(),runtimes=[runtime],c=await createController({dataDir,runtime,...(background?{runtimeFactory:()=>{const r=fakeRuntime();runtimes.push(r);return r;}}:{})});t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});await c.dispatch({type:'openProject',path:project});return{c,project,dataDir,runtime,runtimes};
}
const start=async c=>{const result=await c.dispatch({type:'newTask',request:'Build a helpful tool',mode:'muse'});assert.equal(result.error,null);return result.task.id;};
const wait=async predicate=>{for(let i=0;i<50;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Timed out waiting for queue');};

test('update restart guard covers inactive chats and releases only after native work settles',async t=>{
 const {c,runtime}=await fixture(t,{background:true});await start(c);assert.equal(c.canRestartForUpdate(),true);await c.dispatch({type:'sendMessage',text:'Work'});assert.equal(c.canRestartForUpdate(),false);await start(c);assert.equal(c.canRestartForUpdate(),false);runtime.finish();assert.equal(c.canRestartForUpdate(),true);
});

test('any source folder can be opened without package.json',async t=>{const {c}=await fixture(t,{node:false});assert.equal(c.getState().error,null);assert.deepEqual(c.getState().activeProject.scripts,{});await start(c);});
test('new workspace actions reject malformed data and internal queue flags',()=>{
 for(const action of [{type:'sendMessage',text:'Go',fromQueue:true},{type:'saveDraft',projectId:'p',taskId:null,text:'draft',files:[{path:'.env',hash:'bad'}]},{type:'setTaskFlags',id:'task',archived:'yes'},{type:'setProjectInstructions',projectId:'p',text:'x'.repeat(4001)},{type:'queueMessage',text:'Next',mode:'unrestricted'}])assert.throws(()=>validateAction(action));
});
test('context inspection refuses stale bindings and credentials even when files are explicitly requested',async t=>{
 const {c,project}=await fixture(t);await start(c);await writeFile(join(project,'auth.json'),'{"token":"do-not-expose"}');const s=c.getState();await assert.rejects(c.inspectContext({projectId:'other',taskId:s.task.id}),/changed/i);const info=await c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id});assert.ok(!info.files.some(f=>f.path==='auth.json'));await assert.rejects(c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id,files:[{path:'auth.json',hash:'a'.repeat(64)}]}),/file/i);
});
test('follow-ups replay prior exchanges and project guidance without trusting project configuration',async t=>{
 const {c,runtime}=await fixture(t);await start(c);assert.equal((await c.dispatch({type:'setProjectInstructions',projectId:c.getState().activeProject.id,text:'Use accessible labels.'})).error,null);
 await c.dispatch({type:'sendMessage',text:'Remember the name cobalt.'});runtime.finish('The chosen name is cobalt.');
 await c.dispatch({type:'sendMessage',text:'What name did we choose?'});
 assert.match(runtime.sent[1].text,/cobalt/);assert.match(runtime.sent[1].text,/accessible labels/);assert.equal(c.getState().task.messages.filter(x=>x.role==='user').length,2);assert.ok(c.getState().task.contextSummary.characters>0);
});
test('file context excludes secrets, pins reviewed contents and rejects changed files before dispatch',async t=>{
 const {c,runtime,project}=await fixture(t);await start(c);const s=c.getState(),binding={projectId:s.activeProject.id,taskId:s.task.id};
 assert.equal(typeof c.inspectContext,'function');const info=await c.inspectContext({...binding,text:'Explain',files:[]});assert.ok(info.files.some(f=>f.path==='notes.md'));assert.ok(!info.files.some(f=>f.path==='.env'));
 const files=info.files.filter(f=>f.path==='notes.md').map(({path,hash})=>({path,hash}));const preview=await c.inspectContext({...binding,text:'Explain',files});assert.match(preview.prompt,/Useful project notes/);
 await writeFile(join(project,'notes.md'),'Changed after selection');const result=await c.dispatch({type:'sendMessage',text:'Explain',files});assert.match(result.error,/changed|select/i);assert.equal(runtime.sent.length,0);
 await assert.rejects(c.inspectContext({...binding,files:[{path:'../outside',hash:'x'}]}),/file|context|select|path/i);
});
test('context budget is explicit and the newest request is never truncated',async t=>{
 const {c,runtime}=await fixture(t);await start(c);for(let i=0;i<5;i++){await c.dispatch({type:'sendMessage',text:`Request ${i} ${'x'.repeat(14000)}`});runtime.finish(`Answer ${i} ${'y'.repeat(14000)}`);}
 const s=c.getState(),info=await c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id,text:'FINAL UNIQUE REQUEST',files:[]});assert.ok(info.prompt.length<=64000);assert.ok(info.omittedMessages>0);assert.match(info.prompt,/FINAL UNIQUE REQUEST/);assert.ok(info.prompt.includes('Request 4'));assert.equal(info.characters,info.prompt.length);
});
test('follow-up context retains earlier selected source snapshots even when the assistant only acknowledged them',async t=>{
 const {c,runtime}=await fixture(t);await start(c);const s=c.getState(),info=await c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id,files:[]});const files=info.files.filter(f=>f.path==='notes.md').map(({path,hash})=>({path,hash}));
 await c.dispatch({type:'sendMessage',text:'Remember these notes and reply Ready.',files});runtime.finish('Ready.');await c.dispatch({type:'sendMessage',text:'What did the notes say?'});assert.match(runtime.sent[1].text,/Useful project notes/);assert.equal(c.getState().task.contextSummary.replayedFiles,1);
});
test('queue advances only on verified success and captures its own options',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First'});
 assert.equal((await c.dispatch({type:'queueMessage',text:'Second',mode:'plan',files:[],runOptions:{reasoning:'low',approval:'ask'}})).error,null);
 runtime.finish('First complete');await wait(()=>runtime.sent.length===2);assert.match(runtime.sent[1].text,/Second/);assert.equal(runtime.sent[1].mode,'plan');assert.equal(runtime.sent[1].runOptions.reasoning,'low');
 await c.dispatch({type:'queueMessage',text:'Third',files:[]});runtime.finish('Failure','failed');await new Promise(r=>setTimeout(r,30));assert.equal(runtime.sent.length,2);assert.equal(c.getState().task.queuePaused,true);assert.equal(c.getState().task.promptQueue.length,1);
 await c.dispatch({type:'resumeQueue'});assert.equal(runtime.sent.length,3);
});
test('stop and unconfirmed completion cannot launch queued requests',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First'});await c.dispatch({type:'queueMessage',text:'Do not run yet'});runtime.finish('Not safely closed','completed','unconfirmed');await new Promise(r=>setTimeout(r,30));assert.equal(runtime.sent.length,1);assert.equal(c.getState().task.queuePaused,true);
 await c.dispatch({type:'disconnectMuse'});assert.equal(c.getState().task.promptQueue.length,1);
});
test('adding another prompt does not resume an explicitly paused queue',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First'});await c.dispatch({type:'queueMessage',text:'Second'});await c.dispatch({type:'pauseQueue'});await c.dispatch({type:'queueMessage',text:'Third'});runtime.finish();await new Promise(r=>setTimeout(r,40));assert.equal(runtime.sent.length,1);assert.equal(c.getState().task.queuePaused,true);assert.equal(c.getState().task.promptQueue.length,2);
});
test('drafts and paused queues survive restart without sending work',async t=>{
 const {c,runtime,dataDir}=await fixture(t);await start(c);const s=c.getState();await c.dispatch({type:'saveDraft',projectId:s.activeProject.id,taskId:s.task.id,text:'Unsent draft',files:[],mode:'plan'});
 await c.dispatch({type:'sendMessage',text:'First'});await c.dispatch({type:'queueMessage',text:'Later'});await c.close();const restored=await createController({dataDir,runtime:fakeRuntime()});t.after(()=>restored.close());const after=restored.getState();assert.equal(after.drafts[`${s.activeProject.id}:${s.task.id}`].text,'Unsent draft');assert.equal(after.task.promptQueue[0].text,'Later');assert.equal(after.task.queuePaused,true);assert.equal(runtime.sent.length,1);await restored.close();
});
test('branching keeps earlier context, restores the selected prompt as draft and never reverts files',async t=>{
 const {c,runtime,project}=await fixture(t);const original=await start(c);await c.dispatch({type:'sendMessage',text:'First question'});runtime.finish('First answer');await c.dispatch({type:'sendMessage',text:'Try option B'});runtime.finish('Second answer');await writeFile(join(project,'notes.md'),'Current source stays');
 const prompt=c.getState().task.messages.find(x=>x.text==='Try option B');const fork=await c.dispatch({type:'forkTask',messageId:prompt.id});assert.equal(fork.error,null);assert.notEqual(fork.task.id,original);assert.equal(fork.task.forkedFrom,original);assert.ok(fork.task.messages.some(x=>x.text==='First answer'));assert.ok(!fork.task.messages.some(x=>x.text==='Second answer'));assert.equal(fork.drafts[`${fork.activeProject.id}:${fork.task.id}`].text,'Try option B');assert.equal(await readFile(join(project,'notes.md'),'utf8'),'Current source stays');assert.equal(runtime.sent.length,2);
});
test('archived chats remain searchable and can be restored without retaining a pin',async t=>{
 const {c,runtime}=await fixture(t);const id=await start(c);await c.dispatch({type:'sendMessage',text:'Hidden searchable phrase zircon'});runtime.finish();assert.equal((await c.dispatch({type:'setTaskFlags',id,pinned:true,archived:true})).error,null);
 assert.equal(typeof c.searchChats,'function');const hits=c.searchChats({query:'zircon',includeArchived:true});assert.equal(hits.length,1);assert.equal(hits[0].id,id);assert.equal(hits[0].archived,true);assert.match(hits[0].snippet,/zircon/);assert.equal(c.searchChats({query:'zircon'}).length,0);
 const state=await c.dispatch({type:'setTaskFlags',id,archived:false});assert.equal(state.tasks.find(x=>x.id===id).pinned,false);assert.equal(c.searchChats({query:'zircon'}).length,1);
});
test('branches retain failed-turn outcome markers in replayed context',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Attempt a change'});runtime.finish('Partial work only','failed');await c.dispatch({type:'sendMessage',text:'Investigate another approach'});runtime.finish();const s=c.getState(),message=s.task.messages.find(m=>m.text==='Investigate another approach');await c.dispatch({type:'forkTask',messageId:message.id});const fork=c.getState(),context=await c.inspectContext({projectId:fork.activeProject.id,taskId:fork.task.id,text:'Continue',files:[]});assert.match(context.prompt,/"outcome":"failed"/);
});
test('failed outcomes survive eviction from the bounded activity journal',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Early failed request'});runtime.finish('Early partial output','failed');for(let i=0;i<42;i++){await c.dispatch({type:'sendMessage',text:`Follow-up ${i}`});runtime.finish('Done');}const s=c.getState();assert.ok(!s.task.runs.some(r=>r.prompt==='Early failed request'));const context=await c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id,text:'Recap',files:[]});assert.match(context.prompt,/"text":"Early partial output","outcome":"failed"/);
});
test('stopped turns keep cancelled outcomes after branching',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Interrupted attempt'});await c.dispatch({type:'disconnectMuse'});await c.dispatch({type:'sendMessage',text:'Later prompt'});runtime.finish();const s=c.getState();await c.dispatch({type:'forkTask',messageId:s.task.messages.find(m=>m.text==='Later prompt').id});const fork=c.getState(),context=await c.inspectContext({projectId:fork.activeProject.id,taskId:fork.task.id,text:'Review history',files:[]});assert.match(context.prompt,/"text":"Interrupted attempt","outcome":"cancelled"/);
});


test('closing with a pending enqueue never starts queued work and persists a hold',async t=>{
 const {c,runtime,dataDir}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First'});
 const disconnect=runtime.disconnect.bind(runtime);runtime.disconnect=async()=>{await new Promise(r=>setTimeout(r,40));await disconnect();};
 const pending=c.dispatch({type:'queueMessage',text:'Second'});pending.then(()=>runtime.finish());await c.close();assert.equal(runtime.sent.length,1);
 const restored=await createController({dataDir,runtime:fakeRuntime()});t.after(()=>restored.close());assert.equal(restored.getState().task.queuePaused,true);assert.equal(restored.getState().task.promptQueue.length,1);await restored.close();
});

test('queued attachment validation failure stays paused when later prompts are added',async t=>{
 const {c,runtime,project}=await fixture(t);await start(c);const s=c.getState(),info=await c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id});const files=info.files.filter(f=>f.path==='notes.md').map(({path,hash})=>({path,hash}));
 await c.dispatch({type:'sendMessage',text:'First'});await c.dispatch({type:'queueMessage',text:'Second',files});await writeFile(join(project,'notes.md'),'Changed');runtime.finish();await wait(()=>c.getState().task.queuePaused);assert.equal(runtime.sent.length,1);
 await writeFile(join(project,'notes.md'),'Useful project notes.');await c.dispatch({type:'sendMessage',text:'Independent request'});await c.dispatch({type:'queueMessage',text:'Third'});runtime.finish();await new Promise(r=>setTimeout(r,40));assert.equal(runtime.sent.length,2);assert.equal(c.getState().task.promptQueue.length,2);
});


test('closing during an already scheduled queue preflight retains the unsent entry',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First'});await c.dispatch({type:'queueMessage',text:'Second'});runtime.finish();await Promise.resolve();await c.close();assert.equal(runtime.sent.length,1);assert.equal(c.getState().task.promptQueue.length,1);assert.equal(c.getState().task.queuePaused,true);
});

test('closing while connection preparation is pending never sends the prompt',async t=>{
 const {c,runtime}=await fixture(t);await start(c);const connect=runtime.connect.bind(runtime);let release,started;const ready=new Promise(resolve=>{started=resolve;});runtime.connect=async()=>{started();await new Promise(resolve=>{release=resolve;});await connect();};
 const pending=c.dispatch({type:'sendMessage',text:'Never launch'});await ready;const closing=c.close();release();await pending;await closing;assert.equal(runtime.sent.length,0);
});


test('close cancels runtime preflight before waiting for controller operations',async t=>{
 const {c,runtime}=await fixture(t);await start(c);const send=runtime.send.bind(runtime),disconnect=runtime.disconnect.bind(runtime);let started,stopped=false;const ready=new Promise(resolve=>{started=resolve;});runtime.send=async request=>{started();await new Promise(r=>setTimeout(r,40));if(stopped)throw Error('Disconnected');return send(request);};runtime.disconnect=async()=>{stopped=true;return disconnect();};
 const pending=c.dispatch({type:'sendMessage',text:'Still preparing'});await ready;await c.close();await pending;assert.equal(runtime.sent.length,0);
});


test('branch from an assistant response includes that output, excludes later turns and preserves the original',async t=>{
 const {c,runtime,project}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First question'});runtime.finish('First answer');
 await c.dispatch({type:'sendMessage',text:'Later question'});runtime.finish('Later answer');const before=c.getState(),response=before.task.messages.find(m=>m.role==='assistant'&&m.text==='First answer');
 const fork=await c.dispatch({type:'forkTask',messageId:response.id});assert.equal(fork.error,null);assert.notEqual(fork.task.id,before.task.id);assert.equal(fork.task.forkedFrom,before.task.id);
 assert.deepEqual(fork.task.messages.filter(m=>m.role!=='system').map(m=>m.text),['First question','First answer']);assert.equal(fork.drafts[`${fork.activeProject.id}:${fork.task.id}`],undefined);assert.equal(Boolean(fork.task.pinned),false);assert.equal(Boolean(fork.task.archived),false);assert.equal(runtime.sent.length,2);
 const context=await c.inspectContext({projectId:fork.activeProject.id,taskId:fork.task.id,text:'Continue',files:[]});assert.match(context.prompt,/First answer/);assert.doesNotMatch(context.prompt,/Later answer/);
 const original=await c.dispatch({type:'selectTask',id:before.task.id});assert.deepEqual(original.task.messages.map(({id,role,text,at})=>({id,role,text,at})),before.task.messages.map(({id,role,text,at})=>({id,role,text,at})));
});

test('queued prompts can move during a run and execute in the chosen order',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First'});
 for(const text of ['Second','Third','Fourth'])await c.dispatch({type:'queueMessage',text,mode:'plan',runOptions:{reasoning:'low',approval:'ask'}});
 const s=c.getState(),[second,third,fourth]=s.task.promptQueue;
 const action={type:'moveQueued',taskId:s.task.id,id:fourth.id,beforeId:second.id};assert.deepEqual(validateAction(action),action);
 assert.equal((await c.dispatch(action)).error,null);assert.deepEqual(c.getState().task.promptQueue,[fourth,second,third]);assert.equal(runtime.sent.length,1);
 runtime.finish();await wait(()=>runtime.sent.length===2);assert.match(runtime.sent[1].text,/Fourth/);assert.equal(runtime.sent[1].mode,'plan');assert.equal(runtime.sent[1].runOptions.reasoning,'low');
 const before=c.getState().task.promptQueue;assert.match((await c.dispatch(action)).error,/queue|started/i);assert.deepEqual(c.getState().task.promptQueue,before);
 assert.match((await c.dispatch({...action,id:second.id,taskId:'another-chat'})).error,/chat/i);assert.deepEqual(c.getState().task.promptQueue,before);
});
test('queue reordering persists and does not resume paused work',async t=>{
 const {c,runtime,dataDir}=await fixture(t);await start(c);
 for(const text of ['One','Two','Three'])await c.dispatch({type:'queueMessage',text});
 const s=c.getState(),[one,two,three]=s.task.promptQueue;
 assert.equal((await c.dispatch({type:'moveQueued',taskId:s.task.id,id:one.id,beforeId:null})).error,null);
 assert.deepEqual(c.getState().task.promptQueue,[two,three,one]);assert.equal(c.getState().task.queuePaused,true);assert.equal(runtime.sent.length,0);
 await c.close();const reopened=await createController({dataDir,runtime:fakeRuntime()});t.after(()=>reopened.close());assert.deepEqual(reopened.getState().task.promptQueue,[two,three,one]);await reopened.close();
 for(const bad of [{taskId:1,id:'x',beforeId:null},{taskId:'t',id:'x',beforeId:42},{taskId:'t',id:'',beforeId:null}])assert.throws(()=>validateAction({type:'moveQueued',...bad}));
});


test('full received responses remain searchable past the renderer limit',async t=>{
 const {c,runtime}=await fixture(t);const id=await start(c);await c.dispatch({type:'sendMessage',text:'Inspect the source'});runtime.finish('x'.repeat(17000)+' retrievedlongresponse');
 assert.ok(c.getState().task.messages.every(m=>m.text.length<=16000));assert.equal(c.getState().task.messages.find(m=>m.text.length===16000).contextTruncated,true);const hit=c.searchChats({query:'retrievedlongresponse'})[0];assert.equal(hit.id,id);
 const page=c.readChatHistory({taskId:id,messageId:hit.messageId,offset:17000});assert.equal(page.messages[0].text,' retrievedlongresponse');
});


test('definitive asynchronous rejection restores draft and removes unaccepted history',async t=>{
 const {c,runtime}=await fixture(t);const id=await start(c);runtime.send=async()=>runtime.emit({status:'running',runId:null,inputAccepted:false,messages:[]});
 await c.dispatch({type:'sendMessage',text:'unacceptedquartz'});runtime.emit({status:'failed',inputAccepted:false,runId:null,cleanup:'confirmed'});
 assert.equal(c.searchChats({query:'unacceptedquartz'}).length,0);assert.ok(Object.values(c.getState().drafts).some(d=>d.text==='unacceptedquartz'));
 assert.ok(!c.readChatHistory({taskId:id}).messages.some(m=>m.text==='unacceptedquartz'));
});


test('workflow phase gates hold both manual dequeue and automatic continuation',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);
 await c.dispatch({type:'saveWorkflow',workflow:{id:'gated',title:'Gated',scope:[],checks:['Tests pass'],phases:[{title:'Review',instructions:'Review only',budget:'standard',requiredChecks:['test']}]}});
 await c.dispatch({type:'queueWorkflow',id:'gated-request',taskId,workflowId:'gated',objective:'Review current revision'});
 const before=runtime.sent.length;const s=await c.dispatch({type:'resumeQueue'});assert.match(s.error,/passing checks/);assert.equal(runtime.sent.length,before);assert.equal(s.task.promptQueue.length,1);
});


test('stored context receipt matches the exact prompt delivered to the runtime',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Bind the source evidence'});
 const receipt=c.getState().task.contextSummary.receipt;assert.equal(receipt.promptHash,createHash('sha256').update(runtime.sent[0].text).digest('hex'));assert.equal(receipt.revision.length,64);assert.equal(receipt.nativeContext,'unknown');
});

test('checkpoint restoration binds review revision, refuses active writers and preserves redo',async t=>{
 const {c,project,dataDir,runtime}=await fixture(t);const taskId=await start(c),db=new DatabaseSync(join(dataDir,'musebench.sqlite'));const text='Earlier notes',files={'notes.md':{text,binary:false,hash:createHash('sha256').update(text).digest('hex')}};
 db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run('restore-test',taskId,'old',JSON.stringify({files}));db.close();
 const info=await c.inspectCheckpoint({taskId,id:'restore-test'});assert.ok(info.files.some(f=>f.path==='notes.md'));
 let result=await c.dispatch({type:'restoreCheckpoint',taskId,id:'restore-test',revision:'stale',paths:['notes.md']});assert.match(result.error,/changed/);
 await c.dispatch({type:'sendMessage',text:'Still working'});result=await c.dispatch({type:'restoreCheckpoint',taskId,id:'restore-test',revision:info.revision,paths:['notes.md']});assert.match(result.error,/running|runtime/i);runtime.finish();
 result=await c.dispatch({type:'restoreCheckpoint',taskId,id:'restore-test',revision:info.revision,paths:['notes.md']});assert.equal(result.error,null);assert.equal(await readFile(join(project,'notes.md'),'utf8'),text);assert.ok(result.checkpoints.some(c=>c.title.startsWith('Before restore')));assert.equal(await readFile(join(project,'package.json'),'utf8'),'{}');
 const redo=result.checkpoints[0],review=await c.inspectCheckpoint({taskId,id:redo.id});result=await c.dispatch({type:'restoreCheckpoint',taskId,id:redo.id,revision:review.revision,paths:['notes.md']});assert.equal(result.error,null);assert.equal(await readFile(join(project,'notes.md'),'utf8'),'Useful project notes.');
});

test('project lessons retain actual source provenance and reject stale acceptance',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Find the fix'});runtime.finish('Use the existing tests.');const s=c.getState(),source=s.task.messages.at(-1);let result=await c.dispatch({type:'proposeLesson',projectId:s.activeProject.id,taskId,messageId:source.id,title:'Tests',text:'Run existing tests',applicability:'Code changes'});assert.equal(result.error,null);const lesson=result.activeProject.lessons[0];assert.equal(lesson.sourceMessageId,source.id);await c.dispatch({type:'setProjectInstructions',projectId:s.activeProject.id,text:'New guidance'});result=await c.dispatch({type:'decideLesson',projectId:s.activeProject.id,id:lesson.id,decision:'accept'});assert.match(result.error,/changed/);assert.equal(result.activeProject.instructions,'New guidance');
});

test('execution receipts survive restart and notification updates never dispatch a new run',async t=>{
 const {c,runtime,dataDir}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Keep the receipt'});let receipt=c.getState().task.executionReceipts[0];assert.equal(receipt.phase,'running');assert.equal(receipt.promptHash.length,64);runtime.finish();receipt=c.getState().task.executionReceipts[0];assert.equal(receipt.result,'completed');c.recordDelivery(receipt.id,'failed');assert.equal(runtime.sent.length,1);assert.equal(c.getState().task.executionReceipts[0].result,'completed');await c.close();const reopened=await createController({dataDir,runtime:fakeRuntime()});assert.equal(reopened.getState().task.executionReceipts[0].result,'completed');await reopened.close();
});

test('bounded continuation runs validation, stops on passing evidence and yields to queued user input',async t=>{
 const {c,runtime,project}=await fixture(t);await writeFile(join(project,'package.json'),JSON.stringify({scripts:{test:'node -e "process.exit(0)"'}}));await start(c);await c.dispatch({type:'refresh'});await c.dispatch({type:'saveValidationProfile',projectId:c.getState().activeProject.id,scripts:['test']});await c.dispatch({type:'setGoal',objective:'Finish with tests',status:'active'});assert.equal((await c.dispatch({type:'continueGoal',maxRounds:2,minutes:1})).error,null);await wait(()=>runtime.sent.length===1);runtime.finish();for(let i=0;i<120&&c.getState().task.goal.driver.armed;i++)await new Promise(r=>setTimeout(r,50));assert.equal(c.getState().task.goal.driver.reason,'Checks passed; review the result');assert.equal(runtime.sent.length,1);
 await c.dispatch({type:'continueGoal',maxRounds:2,minutes:1});await c.dispatch({type:'queueMessage',text:'Human priority'});await new Promise(r=>setTimeout(r,250));assert.equal(runtime.sent.length,1);assert.equal(c.getState().task.goal.driver.armed,false);
});

test('restart disarms a pending goal and untrusted dispatch cannot claim controller origin',async t=>{
 const {c,dataDir,project}=await fixture(t);await writeFile(join(project,'package.json'),JSON.stringify({scripts:{test:'node -e "process.exit(0)"'}}));await start(c);await c.dispatch({type:'refresh'});await c.dispatch({type:'saveValidationProfile',projectId:c.getState().activeProject.id,scripts:['test']});await c.dispatch({type:'setGoal',objective:'Continue after checks',status:'active'});await c.dispatch({type:'continueGoal',maxRounds:2,minutes:1});await c.close();const runtime=fakeRuntime(),reopened=await createController({dataDir,runtime});await new Promise(r=>setTimeout(r,250));assert.equal(reopened.getState().task.goal.driver.armed,false);assert.equal(runtime.sent.length,0);await reopened.close();assert.throws(()=>validateAction({type:'sendMessage',text:'Spoof',fromGoal:true}));
});

test('goal continuation rejects passing checks when a later edit changes the reviewed revision',async t=>{
 const {c,runtime,project}=await fixture(t);await writeFile(join(project,'package.json'),JSON.stringify({scripts:{test:'node -e "process.exit(0)"'}}));await start(c);await c.dispatch({type:'refresh'});await c.dispatch({type:'saveValidationProfile',projectId:c.getState().activeProject.id,scripts:['test']});await c.dispatch({type:'setGoal',objective:'Validate current files',status:'active'});let changed=false;const unsubscribe=c.subscribe(state=>{if(!changed&&state.task?.validationRun?.status==='passed'){changed=true;writeFileSync(join(project,'notes.md'),'Edited after check');}});await c.dispatch({type:'continueGoal',maxRounds:2,minutes:1});await wait(()=>runtime.sent.length===1);runtime.finish();for(let i=0;i<120&&c.getState().task.goal.driver.armed;i++)await new Promise(r=>setTimeout(r,50));unsubscribe();assert.equal(changed,true);assert.equal(c.getState().task.goal.driver.reason,'Validation unavailable, cancelled or stale');assert.equal(runtime.sent.length,1);
});

test('independent review pins a source revision, refuses recursion and integrates only explicitly',async t=>{
 const {c,runtimes,project}=await fixture(t,{background:true});const parentId=await start(c),projectId=c.getState().activeProject.id;let result=await c.dispatch({type:'createReviewer',parentTaskId:parentId,projectId,role:'tests',question:'Check error coverage'});assert.equal(result.error,null);const childId=result.task.id;assert.notEqual(childId,parentId);assert.equal(result.task.reviewContract.parentTaskId,parentId);assert.equal(result.task.runOptions.approval,'ask');const runtime=runtimes.find(r=>r.sent.length);runtime.finish(JSON.stringify({findings:[{severity:'medium',path:'notes.md',line:1,message:'Missing case',evidence:'Observed fixture gap'}],unresolved:[]}));assert.equal((await c.dispatch({type:'createReviewer',parentTaskId:childId,projectId,role:'tests',question:'Recursive'})).error,'Reviewer chats cannot recursively delegate.');
 await writeFile(join(project,'notes.md'),'Changed revision');result=await c.dispatch({type:'integrateReview',taskId:childId});assert.match(result.error,/stale/);await writeFile(join(project,'notes.md'),'Useful project notes.');result=await c.dispatch({type:'integrateReview',taskId:childId});assert.equal(result.error,null);assert.equal(result.task.id,parentId);assert.match(result.drafts[`${projectId}:${parentId}`].text,/Observed fixture gap/);assert.equal(runtimes.reduce((sum,r)=>sum+r.sent.length,0),1);
});

test('stream snapshots coalesce while terminal state and source history stay immediate and complete',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Stream updates'});let updates=0,latest;const unsubscribe=c.subscribe(s=>{updates++;latest=s;});for(let i=0;i<80;i++)runtime.emit({messages:[{id:'stream',kind:'agentMessage',text:'partial '+i}]});runtime.emit({status:'completed',cleanup:'confirmed',messages:[{id:'stream',kind:'agentMessage',text:'final unique answer'}]});assert.ok(updates<10,`${updates} redundant updates`);assert.equal(latest.task.runtimeComplete,true);assert.equal(c.readChatHistory({taskId,messageId:'runtime:stream'}).messages[0].text,'final unique answer');unsubscribe();
});

test('pending approval bypasses stream batching and periodic progress eventually publishes',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Wait for approval'});let latest;c.subscribe(s=>{latest=s;});runtime.emit({messages:[{id:'slow',kind:'agentMessage',text:'Progress while still working'}]});await new Promise(r=>setTimeout(r,75));assert.ok(latest.task.messages.some(m=>m.text==='Progress while still working'));runtime.emit({status:'blocked',pending:{kind:'approval',sessionId:'session'},sessionId:'session',permissionVerified:true});assert.equal(latest.runtime.status,'blocked');assert.equal(latest.runtime.pending.kind,'approval');
});

test('goal expiry during connection preparation never dispatches its prompt',async t=>{
 const {c,runtime,project}=await fixture(t);await writeFile(join(project,'package.json'),JSON.stringify({scripts:{test:'node -e "process.exit(0)"'}}));await start(c);await c.dispatch({type:'refresh'});await c.dispatch({type:'saveValidationProfile',projectId:c.getState().activeProject.id,scripts:['test']});await c.dispatch({type:'setGoal',objective:'Respect the deadline',status:'active'});
 let release,expire,connected;const ready=new Promise(resolve=>{connected=resolve;});const connect=runtime.connect.bind(runtime);runtime.connect=async()=>{connected();await new Promise(resolve=>{release=resolve;});await connect();};
 const nativeTimeout=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(callback,ms,...args)=>{if(ms===60000){expire=callback;return{unref(){}};}return nativeTimeout(callback,ms,...args);});
 await c.dispatch({type:'continueGoal',maxRounds:2,minutes:1});await ready;await expire();release();await new Promise(r=>nativeTimeout(r,80));assert.equal(runtime.sent.length,0);assert.equal(c.getState().task.goal.driver.armed,false);assert.match(c.getState().task.goal.driver.reason,/Time budget reached/);
});

for(const cleanup of ['confirmed','unknown'])test(`disconnect settles an owned receipt with ${cleanup} cleanup`,async t=>{
 const {c,runtime,dataDir}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Stop this run'});runtime.disconnect=async()=>runtime.emit({status:'cancelled',cleanup});await c.dispatch({type:'disconnectMuse'});let receipt=c.getState().task.executionReceipts[0];assert.equal(receipt.phase,'settled');assert.equal(receipt.result,cleanup==='confirmed'?'cancelled':'unknown');await c.close();const reopened=await createController({dataDir,runtime:fakeRuntime()});receipt=reopened.getState().task.executionReceipts[0];assert.equal(receipt.result,cleanup==='confirmed'?'cancelled':'unknown');assert.doesNotMatch(receipt.reason??'',/restarted/);await reopened.close();
});

test('disconnect without a terminal callback settles as unknown',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Stop this run'});runtime.disconnect=async()=>{};await c.dispatch({type:'disconnectMuse'});const receipt=c.getState().task.executionReceipts[0];assert.equal(receipt.phase,'settled');assert.equal(receipt.result,'unknown');assert.match(receipt.reason,/Disconnect/);
});

for(const kind of ['files','images'])test(`review integration preserves a ${kind}-only parent draft`,async t=>{
 const {c,runtimes}=await fixture(t,{background:true});const parentTaskId=await start(c),projectId=c.getState().activeProject.id,key=`${projectId}:${parentTaskId}`;
 const attachment=kind==='files'?{path:'notes.md',hash:'a'.repeat(64)}:await c.importImage({projectId,taskId:parentTaskId,name:'screen.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='});const draft={type:'saveDraft',projectId,taskId:parentTaskId,text:'',[kind]:[attachment]};assert.equal((await c.dispatch(draft)).error,null);const before=c.getState().drafts[key];
 const result=await c.dispatch({type:'createReviewer',parentTaskId,projectId,role:'tests',question:'Check error coverage'});assert.equal(result.error,null);runtimes.find(r=>r.sent.length).finish(JSON.stringify({findings:[],unresolved:[]}));const integrated=await c.dispatch({type:'integrateReview',taskId:result.task.id});assert.match(integrated.error,/draft/);assert.deepEqual(integrated.drafts[key],before);
});

test('branching and restart retain shortened response provenance in context receipts',async t=>{
 const {c,runtime,dataDir}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'Long response'});runtime.finish('x'.repeat(17000));const response=c.getState().task.messages.find(m=>m.role==='assistant');await c.dispatch({type:'forkTask',messageId:response.id});await c.close();const reopened=await createController({dataDir,runtime:fakeRuntime()});try{const s=reopened.getState(),answer=s.task.messages.find(m=>m.role==='assistant');assert.equal(answer.contextTruncated,true);const info=await reopened.inspectContext({projectId:s.activeProject.id,taskId:s.task.id,text:'Continue',files:[]});assert.ok(info.receipt.messages.some(m=>m.id===answer.id&&m.truncated));}finally{await reopened.close();}
});

test('steering preserves the active run and draft on rejection, then records admitted correction',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Original request'});runtime.emit({transport:'msp',turnId:'turn-active',steeringSupported:true});let count=0;runtime.steer=async()=>{count++;if(count===1)throw Error('Stale turn');return runtime.snapshot();};
 const projectId=c.getState().activeProject.id;await c.dispatch({type:'saveDraft',projectId,taskId,text:'Correction'});let s=await c.dispatch({type:'steerMessage',taskId,expectedTurnId:'turn-active',text:'Correction'});assert.match(s.error,/Stale/);assert.equal(s.drafts[`${projectId}:${taskId}`].text,'Correction');s=await c.dispatch({type:'steerMessage',taskId,expectedTurnId:'turn-active',text:'Correction'});assert.equal(s.error,null);assert.equal(s.task.runs.length,1);assert.equal(s.task.messages.at(-1).text,'Correction');assert.equal(runtime.sent.length,1);
});

test('legacy non-durable interactive connection seeds app history once',async t=>{
 const {c,runtime}=await fixture(t);await start(c);await c.dispatch({type:'sendMessage',text:'First session context'});runtime.finish('Keep this answer.');runtime.emit({transport:'msp',sessionSeeded:false});await c.dispatch({type:'sendMessage',text:'Interactive follow-up'});assert.match(runtime.sent.at(-1).text,/Keep this answer/);assert.equal(c.getState().task.nativeSession??null,null);runtime.emit({rootTurnId:'legacy-root',turnId:'legacy-root',inputAccepted:true,status:'running'});runtime.finish('Interactive answer');runtime.emit({sessionSeeded:true});await c.dispatch({type:'sendMessage',text:'One more'});assert.doesNotMatch(runtime.sent.at(-1).text,/Interactive answer/);assert.match(runtime.sent.at(-1).text,/existing native session/);
});

test('uncertain steering preserves a durable receipt and draft without inventing a user turn',async t=>{
 const {c,runtime,dataDir}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Working'});runtime.emit({transport:'msp',steeringSupported:true,turnId:'native-turn'});runtime.steer=async()=>{runtime.emit({steering:{commandId:'command-unknown',turnId:'native-turn',status:'unknown'}});throw Error('Receipt unknown');};const projectId=c.getState().activeProject.id;await c.dispatch({type:'saveDraft',projectId,taskId,text:'Correction'});const s=await c.dispatch({type:'steerMessage',taskId,expectedTurnId:'native-turn',text:'Correction'});assert.equal(s.task.steeringReceipts[0].status,'unknown');assert.equal(s.drafts[`${projectId}:${taskId}`].text,'Correction');assert.ok(!s.task.messages.some(m=>m.text==='Correction'));await c.close();const restored=await createController({dataDir,runtime:fakeRuntime()});t.after(()=>restored.close());assert.equal(restored.getState().task.steeringReceipts[0].text,'Correction');await restored.close();
});

test('restart reconciles unfinished native compaction as unknown without deleting history',async t=>{const {c,runtime,dataDir}=await fixture(t);await start(c);runtime.emit({compaction:{commandId:'compact-c',sessionId:'s',turnId:'t',status:'accepted'}});await c.close();const reopened=await createController({dataDir,runtime:fakeRuntime()});try{assert.equal(reopened.getState().task.compactionReceipts[0].status,'unknown');assert.equal(reopened.getState().task.compactionReceipts[0].commandId,'compact-c');}finally{await reopened.close();}});

test('a rejected second correction never relabels the first unknown steering receipt',async t=>{const {c,runtime}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Work'});runtime.emit({transport:'msp',steeringSupported:true,turnId:'turn'});runtime.steer=async()=>{runtime.emit({steering:{commandId:'first',turnId:'turn',status:'unknown'}});throw Error('Unknown');};await c.dispatch({type:'steerMessage',taskId,expectedTurnId:'turn',text:'A'});runtime.steer=async()=>{throw Error('Previous command uncertain');};await c.dispatch({type:'steerMessage',taskId,expectedTurnId:'turn',text:'B'});assert.equal(c.getState().task.steeringReceipts[0].text,'A');});
test('native child work reserves its checkout and refuses followups while another chat owns it',async t=>{const {c,runtime,runtimes}=await fixture(t,{background:true});const first=await start(c);await c.dispatch({type:'sendMessage',text:'First'});runtime.finish();runtime.emit({childControlsSupported:true,childrenBusy:true});const second=await start(c);let s=await c.dispatch({type:'sendMessage',text:'Conflicting'});assert.match(s.error,/checkout/);runtime.emit({childrenBusy:false});await c.dispatch({type:'sendMessage',text:'Other work'});await c.dispatch({type:'selectTask',id:first});let controls=0;runtime.childControl=async()=>controls++;s=await c.dispatch({type:'childControl',taskId:first,sessionId:'s',itemId:'i',revision:1,action:'followupTask',body:'Work'});assert.match(s.error,/checkout/);assert.equal(controls,0);assert.equal(c.getState().tasks.find(t=>t.id===second).runtimeBusy,true);});

test('native reporting and later child followup stay attached to the original app prompt',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);runtime.emit({transport:'msp'});await c.dispatch({type:'sendMessage',text:'Delegate work'});
 runtime.emit({rootTurnId:'native-root',turnId:'native-root',runId:'native-root',inputAccepted:true});
 const promptId=c.getState().task.messages.find(m=>m.role==='user').id;
 runtime.emit({status:'running',childrenBusy:true,foregroundActive:false});
 assert.match((await c.dispatch({type:'sendMessage',text:'Too early'})).error,/running/);
 runtime.emit({status:'running',turnId:'report',runId:'report',foregroundActive:true,messages:[{id:'child-report',kind:'agentMessage',text:'Child result'}]});
 runtime.emit({status:'completed',childrenBusy:false,cleanup:'confirmed'});
 assert.equal(c.getState().task.messages.find(m=>m.text==='Child result').turnId,promptId);
 runtime.emit({status:'running',turnId:'followup-report',runId:'followup-report',foregroundActive:true,messages:[{id:'followup-report',kind:'agentMessage',text:'Follow-up result'}]});
 runtime.emit({status:'completed',cleanup:'confirmed'});
 assert.equal(c.getState().task.messages.find(m=>m.text==='Follow-up result').turnId,promptId);
 assert.equal(c.getState().task.runs.length,1);assert.equal(c.getState().task.runtimeComplete,true);
 assert.equal(c.readChatHistory({taskId}).messages.filter(m=>m.role==='assistant').length,2);
});


test('composer access switches an idle connection and refuses active or stale targets',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);const connections=[];
 const connect=runtime.connect.bind(runtime);runtime.connect=async input=>{connections.push(input);await connect();runtime.emit({fullAccess:input.fullAccess,transport:input.transport});};
 let result=await c.dispatch({type:'setExecutionAccess',taskId,fullAccess:true});assert.equal(result.error,null);assert.equal(connections.at(-1).fullAccess,true);assert.equal(connections.at(-1).transport,'exec');
 runtime.emit({transport:'msp',fullAccess:true});result=await c.dispatch({type:'setExecutionAccess',taskId,fullAccess:false});assert.equal(result.error,null);assert.equal(connections.at(-1).transport,'exec');assert.equal(result.runtime.fullAccess,false);
 const count=connections.length;assert.match((await c.dispatch({type:'setExecutionAccess',taskId:'stale',fullAccess:true})).error,/chat/);
 await c.dispatch({type:'sendMessage',text:'Busy'});assert.match((await c.dispatch({type:'setExecutionAccess',taskId,fullAccess:true})).error,/running/);assert.equal(connections.length,count);
});
test('execution access accepts only an explicit boolean and task identity',()=>{
 assert.throws(()=>validateAction({type:'setExecutionAccess',taskId:'t',fullAccess:'true'}));
 assert.throws(()=>validateAction({type:'setExecutionAccess',fullAccess:true}));
 assert.equal(validateAction({type:'setExecutionAccess',taskId:'t',fullAccess:true}).fullAccess,true);
});
test('composer access keeps the selected executable across fresh chat runtimes',async t=>{
 const {c,runtime,runtimes}=await fixture(t,{background:true});await start(c);
 runtime.emit({binary:'C:/trusted/muse.exe'});await c.dispatch({type:'connectMuse',binary:'C:/trusted/muse.exe'});
 const taskId=await start(c),fresh=runtimes.at(-1);fresh.emit({binary:'C:/old-path/muse.exe',permissionVerified:false});
 let input;fresh.connect=async value=>{input=value;fresh.emit({status:'idle',permissionVerified:true,binary:value.binary,fullAccess:value.fullAccess});};
 const result=await c.dispatch({type:'setExecutionAccess',taskId,fullAccess:false});assert.equal(result.error,null);assert.equal(input.binary,'C:/trusted/muse.exe');
});
test('native question pauses retain run attribution through the answer and completion',async t=>{
 const {c,runtime}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Ask me a question'});const runId=c.getState().task.runs[0].id;
 runtime.emit({transport:'msp',sessionId:'s',rootTurnId:runtime.snapshot().runId,permissionVerified:true,status:'blocked',pending:{kind:'input',sessionId:'s'}});
 assert.equal(c.getState().task.runs[0].id,runId);runtime.answerInput=async()=>runtime.emit({status:'running',pending:null});
 assert.match((await c.dispatch({type:'answerInput',taskId:'wrong'})).error,/another chat/);
 assert.equal((await c.dispatch({type:'answerInput',taskId})).error,null);runtime.finish('Your answer was applied');
 const result=c.getState();assert.equal(result.task.runtimeComplete,true);assert.equal(result.task.runs.length,1);assert.ok(result.task.messages.some(m=>m.text==='Your answer was applied'));
});

test('confirmed native answers survive restart and unknown answers never enter replay',async t=>{
 const {c,runtime,dataDir}=await fixture(t);const taskId=await start(c);await c.dispatch({type:'sendMessage',text:'Choose a design'});
 const prompt={kind:'input',sessionId:'s',userInputId:'q',turnId:'native',questions:[{id:'design',header:'Design',question:'Which design?',selection:{mode:'single'},options:[{label:'A'},{label:'B'}]}]};
 runtime.emit({inputResponse:{sessionId:'s',userInputId:'q',turnId:'native',prompt,status:'accepted',submittedAnswers:[{questionId:'design',freeText:'cobalt'}]}});
 assert.ok(!c.readChatHistory({taskId}).messages.some(m=>m.text.includes('cobalt')));
 runtime.emit({inputResponse:{sessionId:'s',userInputId:'q',turnId:'native',prompt,status:'settled',outcome:'answered',confirmedAnswers:[{questionId:'design',freeText:'cobalt'}]}});
 runtime.emit({inputResponse:{sessionId:'s',userInputId:'unknown',turnId:'native',prompt:{...prompt,userInputId:'unknown'},status:'accepted',submittedAnswers:[{questionId:'design',freeText:'unconfirmed-violet'}]}});
 runtime.finish();await c.close();const fresh=fakeRuntime(),reopened=await createController({dataDir,runtime:fresh});
 try{assert.equal(reopened.getState().task.inputReceipts.find(r=>r.userInputId==='unknown').status,'unknown');await reopened.dispatch({type:'sendMessage',text:'Continue'});assert.match(fresh.sent[0].text,/Which design\?\\nMy answer: cobalt/);assert.doesNotMatch(fresh.sent[0].text,/unconfirmed-violet/);assert.equal(reopened.readChatHistory({taskId}).messages.filter(m=>m.text.includes('cobalt')).length,1);}finally{await reopened.close();}
});
