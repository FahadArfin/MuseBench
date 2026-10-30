import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createActivityInbox} from '../src/controller/activity-inbox.mjs';
import {validateActivityRead} from '../src/shared/activity-inbox.mjs';
import {validateAction} from '../electron/security.mjs';

function fixture(t){const db=new DatabaseSync(':memory:');let time=Date.parse('2026-10-29T12:00:00Z');const clock=()=>time,store=createActivityInbox(db,{clock});t.after(()=>db.close());return{db,store,clock,advance:days=>time+=days*86400000};}
const run=(sourceId='run',kind='run_completed',identity='')=>({source:'run',sourceId,kind,identity});

test('inbox persists metadata, deduplicates observations and distinguishes requests',t=>{
 const {db,store,clock}=fixture(t);store.record('chat',run());store.record('chat',run());
 store.record('chat',{...run('run','response_requested','question-a:1'),prompt:'private prompt',question:'private question'});
 store.record('chat',run('run','response_requested','question-b:1'));assert.equal(store.list().length,3);
 const first=store.list()[0];store.setRead([first.id],true);const restored=createActivityInbox(db,{clock});assert.equal(restored.list().find(e=>e.id===first.id).readAt,'2026-10-29T12:00:00.000Z');
 assert.equal(restored.list().filter(e=>e.readAt===null).length,2);restored.setRead([first.id],false);assert.equal(restored.list()[0].readAt,null);
 const stored=db.prepare('SELECT * FROM activity_inbox').all();assert.doesNotMatch(JSON.stringify(stored),/private|question-a|question-b/);
 assert.deepEqual(Object.keys(first).sort(),['at','id','kind','readAt','source','sourceId','taskId'].sort());
 const copy=store.list();copy[0].kind='broken';assert.notEqual(store.list()[0].kind,'broken');
});
test('inbox retains at most 200 events for 30 days including across startup',t=>{
 const f=fixture(t);for(let n=0;n<205;n++)f.store.record('chat',run('run-'+n));assert.equal(f.store.list().length,200);assert.equal(f.db.prepare('SELECT count(*) AS n FROM activity_inbox').get().n,200);
 f.advance(29);assert.equal(f.store.prune(),0);f.advance(2);const restored=createActivityInbox(f.db,{clock:f.clock});assert.deepEqual(restored.list(),[]);assert.equal(f.db.prepare('SELECT count(*) AS n FROM activity_inbox').get().n,0);
});
test('event and source persistence roll back together without poisoning dedupe cache',t=>{
 const {store,db}=fixture(t);db.exec('CREATE TABLE source(value TEXT)');assert.throws(()=>store.record('chat',run(),()=>{db.prepare('INSERT INTO source VALUES(?)').run('partial');throw Error('write failed');}),/write failed/);
 assert.deepEqual(store.list(),[]);assert.equal(db.prepare('SELECT count(*) AS n FROM source').get().n,0);store.record('chat',run(),()=>db.prepare('INSERT INTO source VALUES(?)').run('saved'));assert.equal(store.list().length,1);assert.equal(db.prepare('SELECT count(*) AS n FROM source').get().n,1);
});
test('deletion participates in the owning transaction and refreshes after commit or rollback',t=>{
 const {store,db}=fixture(t);store.record('a',run());store.record('b',run());db.exec('BEGIN');store.deleteTask('a');db.exec('ROLLBACK');store.refresh();assert.equal(store.list().length,2);
 db.exec('BEGIN');store.deleteTask('a');db.exec('COMMIT');store.refresh();assert.deepEqual(store.list().map(e=>e.taskId),['b']);
});
test('captured read IDs leave new arrivals unread and expired IDs are harmless',t=>{
 const {store}=fixture(t);store.record('a',run());const captured=store.list().map(e=>e.id);store.record('b',run());store.setRead(captured,true);assert.equal(store.list().find(e=>e.taskId==='b').readAt,null);assert.ok(store.list().find(e=>e.taskId==='a').readAt);store.setRead(['f'.repeat(64)],true);assert.equal(store.list().length,2);
});
test('read actions reject broad or malformed mutations at both shared and IPC boundary',()=>{
 const valid={type:'setActivityRead',ids:['a'.repeat(64)],read:true};assert.deepEqual(validateActivityRead(valid),valid);assert.deepEqual(validateAction(valid),valid);
 for(const patch of [{ids:[]},{ids:Array(201).fill('a'.repeat(64))},{ids:['wrong']},{ids:[2]},{read:'true'},{all:true},{taskId:'wrong'}])for(const validate of [validateActivityRead,validateAction])assert.throws(()=>validate({...valid,...patch}));
});
test('read action must be an object rather than an array with attached fields',()=>{
 const action=Object.assign([],{type:'setActivityRead',ids:['a'.repeat(64)],read:true});for(const validate of [validateActivityRead,validateAction])assert.throws(()=>validate(action));
});
test('a batch of concurrent observations and its source commit as one transaction',t=>{
 const {store,db}=fixture(t);db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON activity_inbox WHEN NEW.kind='approval_requested' BEGIN SELECT RAISE(ABORT, 'second write failed'); END");
 const events=[run('run','response_requested','one'),run('run','approval_requested','two')];let persisted=0;assert.throws(()=>store.recordMany('chat',events,()=>persisted++),/second write failed/);assert.equal(persisted,0);assert.equal(db.prepare('SELECT count(*) AS n FROM activity_inbox').get().n,0);assert.deepEqual(store.list(),[]);
 db.exec('DROP TRIGGER fail_second');store.recordMany('chat',events,()=>persisted++);assert.equal(persisted,1);assert.equal(store.list().length,2);
});
