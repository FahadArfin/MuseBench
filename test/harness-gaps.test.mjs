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
 return {emit,sent:[],snapshot:()=>structuredClone(state),subscribe(fn){listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn);};},async connect(){emit({status:'idle',permissionVerified:true});},async disconnect(){emit({status:'unavailable',permissionVerified:false,cleanup:'confirmed'});},async send(request){this.sent.push(request);emit({status:'running',runId:null,messages:[],cleanup:undefined});emit({runId:`run-${++sequence}`});},finish(text='Done',status='completed',cleanup='confirmed'){emit({status,messages:[{id:`answer-${sequence}`,kind:'agentMessage',text}],cleanup});}};
}
async function fixture(t,{node=true}={}){
 const root=await mkdtemp(join(tmpdir(),'musebench-gaps-')),project=join(root,'project'),dataDir=join(root,'data');await mkdir(project);if(node)await writeFile(join(project,'package.json'),'{}');await writeFile(join(project,'notes.md'),'Useful project notes.');await writeFile(join(project,'.env'),'SECRET=never-send');
 const runtime=fakeRuntime(),c=await createController({dataDir,runtime});t.after(async()=>{await c.close();await rm(root,{recursive:true,force:true});});await c.dispatch({type:'openProject',path:project});return{c,project,dataDir,runtime};
}
const start=async c=>{const result=await c.dispatch({type:'newTask',request:'Build a helpful tool',mode:'muse'});assert.equal(result.error,null);return result.task.id;};
const wait=async predicate=>{for(let i=0;i<50;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Timed out waiting for queue');};

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
