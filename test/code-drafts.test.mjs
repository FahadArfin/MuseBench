import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDraftStore} from '../src/controller/code-drafts.mjs';

const draft=text=>({text,files:[],images:[],mode:'chat',updatedAt:'2026-10-29T00:00:00Z'});
function fixture(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());return db;}

test('legacy drafts migrate once and an empty migrated table is authoritative',t=>{
 const db=fixture(t),legacy={'project:chat':draft('Legacy'),'project:new':draft('New chat')};
 const store=createDraftStore(db,legacy);assert.deepEqual(store.read(),legacy);
 store.write('project:chat',null);store.write('project:new',null);
 assert.deepEqual(createDraftStore(db,legacy).read(),{});
});

test('failed migration leaves no partial draft table and can be retried',t=>{
 const db=fixture(t),bad={'project:one':draft('First'),'project:two':{text:1n}};
 assert.throws(()=>createDraftStore(db,bad));
 assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='code_drafts'").get(),undefined);
 const good={'project:one':draft('Recovered')};assert.deepEqual(createDraftStore(db,good).read(),good);
});

test('sync is atomic and remains correct after an outer transaction rollback',t=>{
 const db=fixture(t),old={'project:chat':draft('Before')},store=createDraftStore(db,old);
 db.exec('BEGIN');store.sync({'other:chat':draft('Moved')});db.exec('ROLLBACK');
 assert.deepEqual(store.read(),old);
 store.sync({'other:chat':draft('Moved')});assert.deepEqual(store.read(),{'other:chat':draft('Moved')});
});

test('a rejected multi-draft sync retains every old row',t=>{
 const db=fixture(t),old={'project:one':draft('One'),'project:two':draft('Two')},store=createDraftStore(db,old);
 db.exec("CREATE TRIGGER deny BEFORE INSERT ON code_drafts WHEN NEW.draft_key='project:deny' BEGIN SELECT RAISE(ABORT,'owned sync failure'); END");
 assert.throws(()=>store.sync({'project:one':draft('Edited'),'project:deny':draft('Rejected')}),/owned sync failure/);
 assert.deepEqual(store.read(),old);
});

test('unchanged synchronization does not rewrite durable draft rows',t=>{
 const db=fixture(t),saved={'project:chat':draft('Unchanged')},store=createDraftStore(db,saved);
 db.exec("CREATE TRIGGER deny_update BEFORE UPDATE ON code_drafts BEGIN SELECT RAISE(ABORT,'unexpected rewrite'); END");
 assert.doesNotThrow(()=>store.sync(saved));assert.deepEqual(store.read(),saved);
});
