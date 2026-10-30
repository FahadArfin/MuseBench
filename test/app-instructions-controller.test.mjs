import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';

async function fixture(t,{native=false}={}){
 const base=await mkdtemp(path.join(tmpdir(),'muse-instruction-snapshot-')),project=path.join(base,'project'),dataDir=path.join(base,'data');await mkdir(project);await writeFile(path.join(project,'AGENTS.md'),'Repository instructions stay independent');
 const runtimes=[],controllers=[];
 const factory=()=>{let state={status:'idle',transport:native?'msp':'exec',permissionVerified:true,cleanup:'confirmed',messages:[],...(native?{durableSessions:true,nativeSessionId:'snapshot-session',sessionSeeded:true}:{})},seq=0;const listeners=new Set();const r={attempts:[],admission:'accepted',snapshot:()=>structuredClone(state),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(patch){state={...state,...patch};listeners.forEach(fn=>fn(state));},async connect(input){this.emit({status:'idle',permissionVerified:true,...(native?{nativeSessionId:input?.sessionId??state.nativeSessionId}: {})});},async disconnect(){this.emit({status:'closed',cleanup:'confirmed'});},async send(input){this.attempts.push(input);if(this.admission==='rejected')throw Object.assign(Error('Before admission'),{inputAdmission:'not-sent'});if(this.admission==='unknown')throw Error('Receipt lost');this.emit({status:'running',runId:'run-'+(++seq),rootTurnId:'turn-'+seq,turnId:'turn-'+seq,inputAccepted:true,cleanup:'pending',messages:[]});},finish(){this.emit({status:'completed',cleanup:'confirmed',messages:[]});}};runtimes.push(r);return r;};
 const options={dataDir,runtimeFactory:factory};let c=await createController(options);controllers.push(c);
 const act=async action=>{const s=await c.dispatch(action);assert.equal(s.error,null,s.error);return s;};
 await act({type:'openProject',path:project});await act({type:'newTask',request:'Snapshot fixture',mode:'muse'});const binding={projectId:c.getState().activeProject.id,taskId:c.getState().task.id};
 const reopen=async()=>{await c.close();c=await createController(options);controllers.push(c);};
 if(native){await c.close();const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));try{const row=JSON.parse(db.prepare('SELECT json FROM tasks WHERE id=?').get(binding.taskId).json);row.nativeSession={id:'snapshot-session',transport:'msp',root:project,seeded:true,status:'ready'};row.messages=[{id:'legacy',role:'user',text:'Legacy direct instruction',at:row.createdAt}];delete row.contextSummary;db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(row),row.id);}finally{db.close();}await reopen();}
 t.after(async()=>{for(const controller of controllers)await controller.close();await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 return{get c(){return c;},act,binding,project,base,reopen,runtimes,attempts:()=>runtimes.flatMap(r=>r.attempts),active:()=>runtimes.findLast(r=>r.attempts.length)};
}
const descriptor=(personal,project)=>({version:1,scope:'app-settings',personal,project});
for(const native of [false,true])test(`${native?'legacy native':'fallback'} controller composes current settings only, without settings-save or inspection sends`,async t=>{
 const f=await fixture(t,{native});await f.act({type:'setMemories',text:'Personal before'});await f.act({type:'setProjectInstructions',projectId:f.binding.projectId,text:'Project before'});
 const inspection=await f.c.inspectContext({...f.binding,text:'Ordinary request'});assert.equal(f.attempts().length,0);assert.deepEqual(inspection.instructionSnapshot,descriptor('included','included'));
 let s=await f.act({type:'sendMessage',text:'Ordinary request'});assert.equal(f.attempts()[0].text,inspection.prompt);assert.deepEqual(s.task.contextSummary.receipt.instructionSnapshot,inspection.instructionSnapshot);if(native)assert.equal(s.task.contextSummary.historyMode,'native');f.active().finish();
 await f.act({type:'setMemories',text:'Personal after'});await f.act({type:'setProjectInstructions',projectId:f.binding.projectId,text:''});await f.act({type:'sendMessage',text:'After edit'});assert.match(f.attempts()[1].text,/Personal after/);assert.doesNotMatch(f.attempts()[1].text,/Personal before|Project before/);assert.match(f.attempts()[1].text,/Empty: no current app-saved project instructions/);f.active().finish();
 await f.act({type:'setMemories',text:''});await f.reopen();assert.equal(f.attempts().length,2);s=await f.act({type:'sendMessage',text:'After restart'});assert.deepEqual(s.task.contextSummary.receipt.instructionSnapshot,descriptor('empty','empty'));assert.doesNotMatch(f.attempts()[2].text,/Personal before|Personal after|Project before/);
});
test('queue uses current snapshot at admission and retries a proven rejection only when explicitly requested',async t=>{
 const f=await fixture(t);await f.act({type:'setMemories',text:'Queued old setting'});let s=await f.act({type:'queueMessage',text:'Queued request'}),item=s.task.promptQueue[0];const bound={taskId:f.binding.taskId,id:item.id,expectedRevision:0};
 await f.act({type:'setMemories',text:''});const runtime=f.runtimes.at(-1);runtime.admission='rejected';s=await f.c.dispatch({type:'sendQueued',...bound});assert.match(s.error,/admission/);assert.equal(s.task.promptQueue[0].delivery,'ready');assert.deepEqual(s.task.contextSummary.receipt.instructionSnapshot,descriptor('empty','empty'));assert.doesNotMatch(f.attempts()[0].text,/Queued old setting/);
 await f.act({type:'setMemories',text:'Current retry setting'});assert.equal(f.attempts().length,1);runtime.admission='accepted';s=await f.act({type:'sendQueued',...bound});assert.match(f.attempts()[1].text,/Current retry setting/);assert.deepEqual(s.task.contextSummary.receipt.instructionSnapshot,descriptor('included','empty'));runtime.finish();
});
test('unknown queue admission stays unreplayed after restart and includes a complete attempted snapshot',async t=>{
 const f=await fixture(t);const item=(await f.act({type:'queueMessage',text:'Unknown fixture'})).task.promptQueue[0];f.runtimes.at(-1).admission='unknown';const s=await f.c.dispatch({type:'sendQueued',taskId:f.binding.taskId,id:item.id,expectedRevision:0});assert.equal(s.task.promptQueue[0].delivery,'unknown');assert.deepEqual(s.task.contextSummary.receipt.instructionSnapshot,descriptor('empty','empty'));assert.match(f.attempts()[0].text,/Empty: no current app-saved personal instructions/);await f.reopen();assert.match((await f.c.dispatch({type:'resumeQueue'})).error,/unknown/i);assert.equal(f.attempts().length,1);
});
for(const native of [false,true])for(const type of ['forkTask','createSideChat'])test(`${native?'native':'fallback'} ${type} composes current settings independently of historical receipts`,async t=>{
 const f=await fixture(t,{native});await f.act({type:'setMemories',text:'Old parent setting'});await f.act({type:'sendMessage',text:'Parent conversation'});f.active().finish();await f.act({type:'setMemories',text:''});await f.act({type:'setProjectInstructions',projectId:f.binding.projectId,text:'Current project setting'});
 if(native&&type==='forkTask'){const runtime=f.active();runtime.emit({forkSupported:true});runtime.forkSession=async({sessionId,onReceipt})=>{const receipt={sessionId,commandId:'snapshot-fork',status:'released',childSessionId:'snapshot-child',at:'2026-10-30T12:00:00Z',release:{outcome:'released',viewCursor:'snapshot-release'}};await onReceipt(receipt);return receipt;};}
 await f.act({type,taskId:f.binding.taskId});const s=await f.act({type:'sendMessage',text:'Child request'});assert.deepEqual(s.task.contextSummary.receipt.instructionSnapshot,descriptor('empty','included'));const prompt=f.attempts().at(-1).text;assert.doesNotMatch(prompt,/Old parent setting/);assert.match(prompt,/Current project setting/);assert.equal(prompt.includes('Parent conversation'),type==='forkTask'&&!native);
});
test('switching project excludes another project’s saved settings without sending',async t=>{
 const f=await fixture(t);await f.act({type:'setProjectInstructions',projectId:f.binding.projectId,text:'Project A only'});const other=path.join(f.base,'other');await mkdir(other);await writeFile(path.join(other,'README.md'),'Other');let s=await f.act({type:'openProject',path:other});s=await f.act({type:'newTask',request:'Other project',mode:'muse'});const inspection=await f.c.inspectContext({projectId:s.activeProject.id,taskId:s.task.id,text:'Inspect other'});assert.deepEqual(inspection.instructionSnapshot,descriptor('empty','empty'));assert.doesNotMatch(inspection.prompt,/Project A only/);assert.equal(f.attempts().length,0);
});
