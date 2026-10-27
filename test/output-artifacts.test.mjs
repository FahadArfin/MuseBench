import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOutputStore} from '../src/controller/output-artifacts.mjs';
test('captured logs retain head and tail beyond display limit, with searchable offsets',()=>{
 const db=new DatabaseSync(':memory:');try{const s=createOutputStore(db);s.start('t','c','test');s.append('t','c','first evidence\n'+'x'.repeat(80000));s.append('t','c','\nlast evidence');s.finish('t','c','passed');
 const head=s.read({taskId:'t',id:'c'});assert.match(head.selected.text,/first evidence/);const found=s.read({taskId:'t',id:'c',query:'last evidence'});assert.match(found.selected.text,/last evidence/);assert.ok(found.selected.offset>64000);assert.equal(found.selected.captureTruncated,false);assert.throws(()=>s.read({taskId:'other',id:'c'}),/unavailable/);
 }finally{db.close();}
});
test('capture limits, upstream truncation and retention are explicit',()=>{
 const db=new DatabaseSync(':memory:');try{const s=createOutputStore(db,{limit:30,perTask:2});s.start('t','a','a');s.append('t','a','z'.repeat(50));s.finish('t','a','failed',true);let item=s.read({taskId:'t',id:'a'}).selected;assert.equal(item.text.length,30);assert.equal(item.received,50);assert.equal(item.captureTruncated,true);assert.equal(item.sourceTruncated,true);
 s.start('t','b','b');s.start('t','c','c');item=s.read({taskId:'t',id:'a'}).selected;assert.equal(item.status,'expired');assert.equal(item.text,'');s.deleteTask('t');assert.deepEqual(s.read({taskId:'t'}).items,[]);
 }finally{db.close();}
});
test('Unicode expansion never corrupts output search offsets',()=>{const db=new DatabaseSync(':memory:');try{const s=createOutputStore(db);s.start('t','u','unicode');s.append('t','u','\u0130'.repeat(100)+'ERROR');const r=s.read({taskId:'t',id:'u',query:'ERROR'});assert.equal(r.selected.match,100);assert.match(r.selected.text,/ERROR/);}finally{db.close();}});
