import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {DatabaseSync} from 'node:sqlite';

const nativeId='11111111-1111-4111-8111-111111111111';
test('native failure explanation survives chat reload without replaying the failed request',async t=>{
 const {c,rt,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Inspect the project'});
 const reason='Required MCP server `musebench_workspace` failed during startup: the configured command is unavailable.';
 rt.emit({status:'failed',cleanup:'confirmed',reason});let state=c.getState();assert.equal(state.task.runs.at(-1).status,'failed');assert.equal(state.task.runs.at(-1).reason,reason);assert.equal(state.task.runtimeComplete,false);assert.equal(state.task.queuePaused,true);assert.equal(rt.sent.length,1);
 await c.close();const next=runtime(),reopened=await open(next);state=reopened.getState();assert.equal(state.task.runs.at(-1).status,'failed');assert.equal(state.task.runs.at(-1).reason,reason);assert.equal(next.sent.length,0);assert.equal(next.connections.length,0);
});
test('MCP inventory stays read-only and rejects stale chat or connection scope',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Work'});
 const input={taskId:c.getState().task.id,sessionId:nativeId},before=c.getState();let finish,calls=0;
 rt.readMcpServers=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 await assert.rejects(c.readMcpServers({...input,taskId:'other'}));await assert.rejects(c.readMcpServers({...input,sessionId:'other'}));await assert.rejects(c.readMcpServers({...input,command:'forged'}));assert.equal(calls,0);
 const pending=c.readMcpServers(input);assert.equal(c.getState().busy,false);
 const stopped=await Promise.race([c.dispatch({type:'disconnectMuse'}),new Promise(resolve=>setTimeout(()=>resolve(null),1000))]);assert.ok(stopped);
 finish({sessionId:nativeId,servers:[]});await assert.rejects(pending,/changed/);
 assert.equal(rt.sent.length,1);assert.equal(c.getState().error,null);assert.equal(c.getState().task.executionReceipts.length,before.task.executionReceipts.length);
});
test('MCP inventory cannot follow a pending read into another chat',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});
 const input={taskId:c.getState().task.id,sessionId:nativeId};let finish;
 rt.readMcpServers=()=>new Promise(resolve=>finish=resolve);
 const pending=c.readMcpServers(input);
 const next=await c.dispatch({type:'newTask',request:'Another chat',mode:'muse'});assert.equal(next.error,null);assert.notEqual(next.task.id,input.taskId);
 await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});
 const before=c.getState();finish({sessionId:nativeId,servers:[{name:'Old chat only'}]});
 await assert.rejects(pending,/changed/);assert.deepEqual(c.getState(),before);assert.equal(rt.sent.length,0);
});
test('read-only child inspection leaves Stop responsive during a slow native read',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Delegate'});
 rt.emit({childControlsSupported:true});let finish;rt.inspectChild=()=>new Promise(resolve=>finish=()=>{rt.inspectionFinished=true;resolve();});
 const s=c.getState(),pending=c.dispatch({type:'inspectChild',taskId:s.task.id,sessionId:nativeId,itemId:'child',revision:1});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof finish,'function');assert.equal(c.getState().busy,false);
 const stopped=await Promise.race([c.dispatch({type:'disconnectMuse'}),new Promise(resolve=>setTimeout(()=>resolve(null),1000))]);assert.ok(stopped,'Stop must not wait behind the read');assert.equal(stopped.runtime.permissionVerified,false);finish();await pending;
 assert.equal(rt.sent.length,1);assert.equal(c.getState().task.executionReceipts.length,1);
});
test('child inspection text is visible in memory but never saved to the app database',async t=>{
 const {c,rt,dataDir}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});rt.emit({childControlsSupported:true});
 rt.inspectChild=async()=>{rt.setInspection([{itemId:'child',status:'ready',data:{privateText:'PRIVATE CHILD RECORD'}}]);};
 const result=await c.dispatch({type:'inspectChild',taskId:c.getState().task.id,sessionId:nativeId,itemId:'child',revision:1});assert.equal(result.error,null);assert.match(JSON.stringify(result.runtime.childInspections),/PRIVATE CHILD RECORD/);
 const db=new DatabaseSync(join(dataDir,'musebench.sqlite'),{readOnly:true});try{assert.ok(!db.prepare('SELECT json FROM app WHERE id=1').get().json.includes('PRIVATE CHILD RECORD'));}finally{db.close();}
});
test('an old child-read rejection cannot put an error on a reconnected healthy session',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});rt.emit({childControlsSupported:true});let reject;
 rt.inspectChild=()=>new Promise((_,no)=>reject=no);const pending=c.dispatch({type:'inspectChild',taskId:c.getState().task.id,sessionId:nativeId,itemId:'child',revision:1});
 await c.dispatch({type:'disconnectMuse'});await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});assert.equal(c.getState().error,null);
 reject(Error('Old connection closed'));await pending;assert.equal(c.getState().runtime.permissionVerified,true);assert.equal(c.getState().error,null);
});
test('one failed child read cannot label a concurrent successful read as failed',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});rt.emit({childControlsSupported:true});const requests=new Map();
 rt.inspectChild=action=>new Promise((resolve,reject)=>requests.set(action.itemId,{resolve,reject}));const input={type:'inspectChild',taskId:c.getState().task.id,sessionId:nativeId,revision:1};
 const a=c.dispatch({...input,itemId:'a'}),b=c.dispatch({...input,itemId:'b'});requests.get('a').reject(Error('Child A failed'));assert.equal((await a).error,'Child A failed');
 rt.setInspection([{itemId:'b',status:'ready',data:{history:{items:[]}}}]);requests.get('b').resolve();const result=await b;assert.equal(result.runtime.childInspections[0].status,'ready');assert.equal(result.error,null);assert.equal(c.getState().error,null);
});
function runtime(restoration={}){
 let state={connectionEpoch:0,status:'unavailable',transport:'msp',permissionVerified:false,messages:[],cleanup:'confirmed'},listeners=[];
 const emit=patch=>{state={...state,...patch};for(const fn of listeners)fn(state);};
 return{setInspection(value){state={...state,childInspections:value};},connections:[],sent:[],disconnects:0,emit,snapshot:()=>structuredClone(state),subscribe(fn){listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn);};},async connect(options){this.connections.push(options);emit({connectionEpoch:state.connectionEpoch+1,status:'idle',transport:'msp',durableSessions:true,imagesSupported:true,permissionVerified:true,fullAccess:options.fullAccess===true,workspaceTools:options.workspaceTools===true,nativeSessionId:options.sessionId??nativeId,sessionId:options.sessionId??nativeId,sessionSeeded:!!options.sessionId,restoration:options.sessionId?{status:'restored',sessionId:options.sessionId,activeTurnId:null,pendingRequests:[],turnCount:1,...restoration}:undefined,...(options.sessionId&&restoration.activeTurnId?{status:'blocked',rootTurnId:restoration.activeTurnId,turnId:restoration.activeTurnId,pending:restoration.waitingPayload?null:{kind:'input',sessionId:options.sessionId},restoringRequests:restoration.waitingPayload?1:0}:{})});},async disconnect(){this.disconnects++;emit({connectionEpoch:state.connectionEpoch+1,status:'unavailable',permissionVerified:false,pending:null,cleanup:'confirmed'});},async send(request){this.sent.push(request);emit({status:'running',inputAccepted:true,sessionSeeded:true,rootTurnId:'native-turn-1',turnId:'native-turn-1',runId:'native-turn-1',cleanup:undefined});},finish(){emit({status:'completed',cleanup:'confirmed',messages:[{id:'answer-1',kind:'agentMessage',text:'Remembered cobalt'}]});}};
}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'musebench-msp-controller-')),project=join(root,'project'),dataDir=join(root,'data');await mkdir(project);await writeFile(join(project,'notes.md'),'Notes');const controllers=[];t.after(async()=>{for(const c of controllers)await c.close();await rm(root,{recursive:true,force:true});});const open=async rt=>{const c=await createController({dataDir,runtime:rt});controllers.push(c);return c;};const rt=runtime(),c=await open(rt);await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',request:'Native session',mode:'muse'});return{c,rt,open,project,dataDir};}
test('MSP connects persist the host session before first send and completed restart resumes without replay',async t=>{
 const {c,rt,open,project}=await fixture(t);let s=await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true,workspaceTools:true});assert.equal(s.error,null);assert.equal(s.task.nativeSession?.id,nativeId);assert.equal(s.task.nativeSession.transport,'msp');assert.equal(s.task.nativeSession.fullAccess,true);assert.equal(s.task.nativeSession.workspaceTools,true);
 s=await c.dispatch({type:'sendMessage',text:'Remember cobalt'});assert.equal(s.error,null);assert.equal(rt.sent[0].sessionId,nativeId);rt.finish();await c.close();const next=runtime(),reopened=await open(next);assert.equal(next.connections.length,0);s=await reopened.dispatch({type:'connectMuse'});assert.equal(s.error,null);assert.equal(next.connections[0].sessionId,nativeId);assert.equal(next.connections[0].workspaceRoot,project);assert.equal(next.connections[0].fullAccess,true);assert.equal(next.connections[0].workspaceTools,true);s=await reopened.dispatch({type:'sendMessage',text:'Continue carefully'});assert.equal(s.error,null);assert.doesNotMatch(next.sent[0].text,/cobalt/);assert.equal(s.task.executionReceipts.length,2);
});
test('reviewed analysis mode is persisted and restored without submitting a turn',async t=>{
 const {c,rt,open}=await fixture(t);let state=await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true,workspaceTools:true,workspaceToolset:'analysis-v1'});
 assert.equal(state.error,null);assert.equal(rt.connections[0].workspaceToolset,'analysis-v1');assert.equal(state.task.nativeSession.workspaceToolset,'analysis-v1');await c.close();
 const next=runtime(),reopened=await open(next);state=await reopened.dispatch({type:'connectMuse'});assert.equal(state.error,null);assert.equal(next.connections[0].workspaceToolset,'analysis-v1');assert.equal(next.sent.length,0);
});
test('partial workspace activity snapshots preserve earlier receipts in the owned run',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true,workspaceTools:true});await c.dispatch({type:'sendMessage',text:'Inspect'});
 const row=id=>({id,kind:'tool',tool:'mcp__musebench_workspace__workspace_tool_call',title:'Read workspace',status:'completed',detail:'Completed',output:'result'});
 rt.emit({activity:{scope:'workspace-tools',items:[row('earlier')],truncated:false}});rt.emit({activity:{scope:'workspace-tools',items:[row('later')],truncated:false}});
 assert.deepEqual(c.getState().task.runs.at(-1).activities.map(x=>x.id),['earlier','later']);rt.emit({activity:{scope:'workspace-tools',items:[{...row('later'),output:'updated'}],truncated:false}});assert.equal(c.getState().task.runs.at(-1).activities.length,2);
});
test('restoring owned pending work reconciles the existing journal without replaying prompt or answer',async t=>{
 const {c,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Uncertain action'});await c.close();const next=runtime({activeTurnId:'native-turn-1',pendingRequests:[{kind:'input',userInputId:'question-1'}]}),reopened=await open(next);let s=await reopened.dispatch({type:'sendMessage',text:'Do not send'});assert.match(s.error,/recover|Session/i);assert.equal(next.connections.length,0);s=await reopened.dispatch({type:'recoverSession',choice:'continue'});assert.equal(s.error,null);assert.equal(next.connections[0].sessionId,nativeId);assert.equal(next.sent.length,0);assert.equal(s.task.executionReceipts.length,1);assert.equal(s.task.runs.length,1);assert.equal(s.task.runs[0].status,'waiting');next.finish();s=reopened.getState();assert.equal(s.task.executionReceipts[0].result,'completed');assert.equal(s.task.messages.filter(m=>m.text==='Remembered cobalt').length,1);
});
test('fresh recovery disconnects the existing MSP session before forgetting identity',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});const before=rt.disconnects;const s=await c.dispatch({type:'recoverSession',choice:'fresh'});assert.equal(s.error,null);assert.equal(s.task.nativeSession,null);assert.ok(rt.disconnects>before);assert.equal(s.runtime.permissionVerified,false);
});
test('changing native transport cannot silently reuse a saved session',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});const before=rt.connections.length;const s=await c.dispatch({type:'connectMuse',transport:'exec'});assert.match(s.error,/transport|fresh/i);assert.equal(rt.connections.length,before);
});
test('restored unknown outcomes are retained and permission failures never create a replacement session',async t=>{
 const {c,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Uncertain operation'});await c.close();const next=runtime(),reopened=await open(next);next.connect=async options=>{next.connections.push(options);throw Error('Session ownership permission denied');};let s=await reopened.dispatch({type:'recoverSession',choice:'continue'});assert.match(s.error,/ownership permission/);assert.equal(next.connections.length,1);assert.equal(next.connections[0].sessionId,nativeId);assert.equal(s.task.nativeSession.id,nativeId);assert.equal(s.task.executionReceipts[0].result,'unknown');assert.equal(next.sent.length,0);
});
test('restored work from a different native turn never takes ownership of an app run',async t=>{
 const {c,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Owned operation'});await c.close();const next=runtime({activeTurnId:'foreign-turn'}),reopened=await open(next);let s=await reopened.dispatch({type:'recoverSession',choice:'continue'});assert.equal(s.error,null);assert.equal(s.task.nativeSession.status,'needs-recovery');next.finish();s=reopened.getState();assert.equal(s.task.executionReceipts[0].result,'unknown');assert.ok(!s.task.messages.some(m=>m.text==='Remembered cobalt'));assert.equal(next.sent.length,0);
});
test('starting another chat disconnects its predecessor and does not inherit full access',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true,workspaceTools:true});const before=rt.disconnects;let s=await c.dispatch({type:'newTask',request:'Separate chat',mode:'muse'});assert.equal(s.error,null);assert.ok(rt.disconnects>before);assert.equal(s.runtime.permissionVerified,false);await c.dispatch({type:'connectMuse'});assert.equal(rt.connections.at(-1).fullAccess,false);assert.equal(rt.connections.at(-1).workspaceTools,false);assert.equal(rt.connections.at(-1).sessionId,undefined);
});
test('connection tool access requires an explicit boolean',async t=>{
 const {c,rt}=await fixture(t);const s=await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true,workspaceTools:'yes'});assert.match(s.error,/boolean/);assert.equal(rt.connections.length,0);
});
test('model discovery after restart resumes the saved session instead of opening another one',async t=>{
 const {c,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.close();const next=runtime();next.refreshModels=async()=>{};const reopened=await open(next),s=await reopened.dispatch({type:'refreshModels'});assert.equal(s.error,null);assert.equal(next.connections[0].sessionId,nativeId);assert.equal(next.connections[0].fullAccess,true);assert.equal(next.sent.length,0);
});
test('newly discovered active work blocks a follow-up before a second journal entry is created',async t=>{
 const {c,rt,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Work'});rt.finish();await c.close();const next=runtime({activeTurnId:'native-turn-1'}),reopened=await open(next);const s=await reopened.dispatch({type:'sendMessage',text:'Premature follow-up'});assert.match(s.error,/running|unresolved|attention|interrupted/i);assert.equal(next.sent.length,0);assert.equal(s.task.executionReceipts.length,1);
});
test('MSP image dispatch uses verified local image paths only when the transport supports them',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});const s=c.getState(),image=await c.importImage({projectId:s.activeProject.id,taskId:s.task.id,name:'screen.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='});rt.emit({imagesSupported:false});assert.match((await c.dispatch({type:'sendMessage',text:'Inspect screenshot',images:[image]})).error,/screenshots/);assert.equal(rt.sent.length,0);rt.emit({imagesSupported:true});assert.equal((await c.dispatch({type:'sendMessage',text:'Inspect screenshot',images:[image]})).error,null);assert.equal(rt.sent[0].imagePaths.length,1);assert.ok(rt.sent[0].imagePaths[0].endsWith(image.id+'.png'));assert.doesNotMatch(rt.sent[0].text,/base64/);
});
test('a native dispatch with no admission signal requires recovery and is never automatically resent',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});rt.send=async request=>{rt.sent.push(request);throw Error('Connection lost before admission was known');};let s=await c.dispatch({type:'sendMessage',text:'Unconfirmed external action'});assert.match(s.error,/admission/);assert.equal(s.task.nativeSession.status,'needs-recovery');s=await c.dispatch({type:'sendMessage',text:'Unconfirmed external action'});assert.match(s.error,/recover/);assert.equal(rt.sent.length,1);assert.equal(s.task.executionReceipts.length,1);assert.equal(s.task.executionReceipts[0].result,'unknown');
});
test('late restored question payload retains native turn ownership through completion',async t=>{
 const {c,open}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await c.dispatch({type:'sendMessage',text:'Question with delayed payload'});await c.close();const next=runtime({activeTurnId:'native-turn-1',waitingPayload:true,pendingRequests:[{kind:'input',userInputId:'question-1'}]}),reopened=await open(next);let s=await reopened.dispatch({type:'recoverSession',choice:'continue'});assert.equal(s.error,null);assert.equal(s.task.runs[0].status,'waiting');assert.equal(s.task.nativeSession.status,'running');next.emit({restoringRequests:0,pending:{kind:'input',sessionId:nativeId,userInputId:'question-1'},status:'blocked'});next.emit({status:'running',pending:null});next.finish();s=reopened.getState();assert.equal(s.task.executionReceipts[0].result,'completed');assert.equal(s.task.nativeSession.status,'ready');assert.equal(s.task.messages.filter(m=>m.text==='Remembered cobalt').length,1);assert.equal(next.sent.length,0);
});
test('explicit recovery disconnects a surviving idle native owner before exact resume',async t=>{
 const {c,rt}=await fixture(t);await c.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});rt.send=async()=>{throw Error('Admission unknown');};await c.dispatch({type:'sendMessage',text:'Unconfirmed request'});const connect=rt.connect.bind(rt);rt.connect=async options=>{if(rt.snapshot().permissionVerified)throw Error('Disconnect current owner first');return connect(options);};const s=await c.dispatch({type:'recoverSession',choice:'continue'});assert.equal(s.error,null);assert.equal(rt.connections.at(-1).sessionId,nativeId);assert.equal(s.task.executionReceipts[0].result,'unknown');
});


