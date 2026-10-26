import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityProjection, restoreRuns} from '../src/shared/activity.mjs';

const task = (kind, fields = {}, id = 'task-1') => ({payload_type:`task.lifecycle.${kind}`,payload:{kind:'task_lifecycle',command_id:'command',run_stream:{kind:'run',id:'run'},task_stream:{kind:'task',id},task_id:id,event:{kind,task_id:id,...fields}}});
const root={commandId:'command',runId:'run'};
test('native tasks progress independently, retain details, and cannot complete the parent run',()=>{
 const projection=createActivityProjection();
 projection.accept(task('proposed',{task_kind:'tool.powershell'}),root);
 projection.accept(task('started'),root);
 projection.accept(task('status',{message:'Running project tests'}),root);
 let state=projection.snapshot();assert.equal(state.items[0].status,'working');assert.equal(state.items[0].detail,'Running project tests');
 projection.accept(task('proposed',{task_kind:'tool.read_file'},'task-2'),root);
 projection.accept(task('completed'),root);
 state=projection.snapshot();assert.equal(state.items[0].status,'completed');assert.equal(state.items[1].status,'queued');assert.equal(state.terminal,undefined);
 state.items[0].status='forged';assert.equal(projection.snapshot().items[0].status,'completed');
 projection.finish('failed');assert.equal(projection.snapshot().items[1].status,'interrupted');assert.equal(projection.snapshot().items[0].status,'completed');
});
test('activity never projects unrelated or ambiguous identities or assistant claims',()=>{
 const projection=createActivityProjection();
 for(const record of [task('proposed',{task_kind:'tool.read_file'}),task('proposed',{task_kind:'tool.read_file'}),task('proposed',{task_kind:'tool.read_file'})]){
  if(!projection.snapshot().items.length){record.payload.run_stream.id='other';projection.accept(record,root);}
 }
 const mismatch=task('started');mismatch.payload.event.task_id='other';projection.accept(mismatch,root);
 projection.accept({payload_type:'run.output.delta',payload:{text:'I started three agents.'}},root);
 assert.deepEqual(projection.snapshot().items,[]);
});
test('activity is bounded and model task output does not expose reasoning as tool output',()=>{
 const projection=createActivityProjection({maxItems:2,maxDetail:100});
 projection.accept(task('proposed',{task_kind:'model.meta.response'}),root);
 projection.accept(task('output',{chunk:'private model internals',final_result:true}),root);
 assert.equal(projection.snapshot().items[0].output,'');
 projection.accept(task('proposed',{task_kind:'tool.read_file'},'task-2'),root);
 projection.accept(task('output',{chunk:'x'.repeat(150)},'task-2'),root);
 projection.accept(task('proposed',{task_kind:'tool.read_file'},'task-3'),root);
 assert.equal(projection.snapshot().items.length,2);assert.equal(projection.snapshot().items[1].output.length,100);assert.equal(projection.snapshot().truncated,true);
});
test('saved runs restore with no false live work, bounded history and detached arrays',()=>{
 const saved=[{id:'turn',promptId:'prompt',prompt:'Task',runId:'run',status:'working',startedAt:'2026-10-26T12:00:00Z',activities:[{id:'item',kind:'tool',title:'Read file',status:'working',detail:'Reading',output:''}]}];
 const restored=restoreRuns(saved);assert.equal(restored[0].status,'interrupted');assert.equal(restored[0].activities[0].status,'interrupted');assert.equal(saved[0].status,'working');
 assert.equal(restoreRuns(Array.from({length:100},(_,i)=>({...saved[0],id:String(i)}))).length,40);
 assert.deepEqual(restoreRuns([{id:'bad',status:'completed'},null]),[]);
});
