import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCodeSchedules} from '../src/controller/code-schedules.mjs';
import {validateScheduleSpec,validateScheduleAction,nextOccurrence} from '../src/shared/code-schedules.mjs';

const origin=Date.parse('2026-11-01T12:00:00Z');
const spec=overrides=>({title:'Weekly review',projectId:'project',prompt:'Review changes and report findings.',startAt:new Date(origin+60000).toISOString(),intervalMinutes:60,maxRuns:3,runOptions:{reasoning:'high',approval:'ask',budget:'standard'},fullAccess:false,...overrides});
function fixture(t){const db=new DatabaseSync(':memory:');let time=origin;const options={now:()=>time};const store=createCodeSchedules(db,options);t.after(()=>db.close());return{db,store,options,set:value=>time=value,add:overrides=>store.save({spec:spec(overrides)},'/project','a'.repeat(64))};}
test('schedules require explicit current review and save paused, without advancing user configuration silently',t=>{
 const {store,add}=fixture(t);let s=add();assert.equal(s.enabled,false);assert.equal(store.due().length,0);
 assert.throws(()=>store.enable(s.id,s.revision,false),/confirm/i);assert.throws(()=>store.enable(s.id,s.revision+1,true),/changed/i);
 s=store.enable(s.id,s.revision,true);assert.equal(s.enabled,true);const previous=s;
 s=store.save({id:s.id,expectedRevision:s.revision,spec:spec({prompt:'A changed request'})},'/project','a'.repeat(64));assert.equal(s.enabled,false);assert.match(s.reason,/review/i);assert.throws(()=>store.enable(s.id,previous.revision,true),/changed/i);
 assert.throws(()=>validateScheduleAction({type:'codeSchedule',operation:'tick'}),/command/i);
 for(const change of [{fullAccess:'yes'},{maxRuns:101},{intervalMinutes:1},{prompt:'x'.repeat(16001)},{runOptions:{reasoning:'high',approval:'ask',budget:'infinite'}},{startAt:'not a date'},{secret:'unexpected'}])assert.throws(()=>validateScheduleSpec(spec(change)));
});
test('one occurrence is claimed durably before work and repeat attempts stay bounded',t=>{
 const {store,add,set,db}=fixture(t);let s=add();store.enable(s.id,s.revision,true);set(origin+60000);
 const claim=store.claim(s.id);assert.equal(claim.run.status,'starting');assert.equal(JSON.parse(db.prepare('SELECT json FROM code_schedules WHERE id=?').get(s.id).json).active.id,claim.run.id);
 assert.equal(store.claim(s.id),null);assert.equal(store.get(s.id).attempts,1);store.attach(s.id,claim.run.id,'owned-chat');store.settle(s.id,claim.run.id,'completed');
 for(let n=1;n<3;n++){set(origin+60000+n*3600000);const next=store.claim(s.id);assert.ok(next);store.settle(s.id,next.run.id,'completed');}
 s=store.get(s.id);assert.equal(s.attempts,3);assert.equal(s.enabled,false);assert.equal(s.history.length,3);assert.equal(s.history[2].taskId,'owned-chat');assert.throws(()=>store.enable(s.id,s.revision,true),/limit/i);
});
test('sleep, late times and overlapping runs skip ahead without catch-up or consuming attempts',t=>{
 const {store,add,set}=fixture(t);let s=add();store.enable(s.id,s.revision,true);set(origin+4*3600000);assert.equal(store.claim(s.id),null);s=store.get(s.id);assert.equal(s.history[0].status,'skipped');assert.equal(s.attempts,0);assert.ok(Date.parse(s.nextAt)>origin+4*3600000);
 set(Date.parse(s.nextAt));const claim=store.claim(s.id);set(Date.parse(store.get(s.id).nextAt));assert.equal(store.claim(s.id),null);assert.equal(store.get(s.id).active.id,claim.run.id);assert.equal(store.get(s.id).attempts,1);
 assert.equal(nextOccurrence(origin,60,origin+20*3600000),origin+21*3600000);assert.equal(nextOccurrence(origin,0,origin),null);
 set(origin);const once=add({intervalMinutes:0});store.enable(once.id,once.revision,true);set(origin+1000000);assert.equal(store.claim(once.id),null);assert.equal(store.get(once.id).enabled,false);
});
test('attention and restart preserve uncertain ownership and never replay; stale stops cannot settle a different run',t=>{
 const {store,add,set,db,options}=fixture(t);let s=add();store.enable(s.id,s.revision,true);set(origin+60000);const c=store.claim(s.id);store.attach(s.id,c.run.id,'chat-a');store.attention(s.id,c.run.id,'Approval requested');assert.equal(store.get(s.id).enabled,false);assert.equal(store.get(s.id).active.status,'waiting');
 assert.throws(()=>store.save({id:s.id,expectedRevision:store.get(s.id).revision,spec:spec()},'/project'),/active/i);assert.throws(()=>store.remove(s.id,store.get(s.id).revision),/active/i);assert.equal(store.settle(s.id,'other-run','completed'),false);
 const resumed=createCodeSchedules(db,options);s=resumed.get(s.id);assert.equal(s.active,null);assert.equal(s.enabled,false);assert.equal(s.history[0].status,'uncertain');assert.equal(s.history[0].taskId,'chat-a');assert.equal(resumed.claim(s.id),null);
});
test('pause stops future dispatch without canceling owned work and deletion retains independent chat identities',t=>{
 const {store,add,set}=fixture(t);let s=add();store.enable(s.id,s.revision,true);set(origin+60000);const c=store.claim(s.id);s=store.pause(s.id,store.get(s.id).revision);assert.equal(s.active.id,c.run.id);assert.equal(s.enabled,false);store.attach(s.id,c.run.id,'keep-this-chat');store.settle(s.id,c.run.id,'completed');s=store.get(s.id);assert.equal(s.enabled,false);assert.equal(s.history[0].taskId,'keep-this-chat');store.remove(s.id,s.revision);assert.equal(store.list().length,0);
});
test('history is bounded without discarding the active claim; malformed saved configuration cannot dispatch',t=>{
 const {store,add,set,db,options}=fixture(t);let s=add({maxRuns:100,intervalMinutes:15});store.enable(s.id,s.revision,true);set(origin+60000);const c=store.claim(s.id);
 for(let n=1;n<45;n++){set(origin+60000+n*15*60000);assert.equal(store.claim(s.id),null);}
 s=store.get(s.id);assert.equal(s.active.id,c.run.id);assert.equal(s.history.length,30);assert.ok(s.historyTruncated);assert.equal(s.attempts,1);
 db.prepare('INSERT INTO code_schedules(id,json) VALUES(?,?)').run('broken',JSON.stringify({id:'broken',enabled:true,spec:{prompt:'unsafe'},nextAt:origin}));const restored=createCodeSchedules(db,options);assert.equal(restored.list().some(row=>row.id==='broken'),false);assert.equal(restored.due().length,0);
});

test('restored schedules without a project identity remain visible but require a new save and review',t=>{
 const {store,add,db,options}=fixture(t);let row=add();store.enable(row.id,row.revision,true);row=JSON.parse(db.prepare('SELECT json FROM code_schedules WHERE id=?').get(row.id).json);delete row.rootIdentity;db.prepare('UPDATE code_schedules SET json=? WHERE id=?').run(JSON.stringify(row),row.id);
 const restored=createCodeSchedules(db,options),paused=restored.get(row.id);assert.equal(paused.enabled,false);assert.match(paused.reason,/folder|review/i);assert.throws(()=>restored.enable(paused.id,paused.revision,true),/save|review/i);
});
