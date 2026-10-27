import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHistoryStore} from '../src/controller/chat-history.mjs';
function fixture(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());return createHistoryStore(db);}
const message=(id,text)=>({id,role:'assistant',text,at:'2026-10-26T12:00:00Z'});
test('history survives bounded windows and streaming replacement',t=>{
 const h=fixture(t);h.sync({id:'a',messages:[message('old','original decision zircon')]},true);
 for(let i=0;i<170;i++)h.put('a',message(String(i),'later '+i));
 h.put('a',message('long','x'.repeat(17000)+' final evidence'));h.sync({id:'a',messages:[message('long','x'.repeat(16000))]});
 assert.equal(h.search('a','zircon').messageId,'old');assert.equal(h.search('a','final evidence').messageId,'long');
 assert.equal(h.page({taskId:'a'}).total,172);assert.equal(h.page({taskId:'a'}).coverage,'retained-legacy');
 h.put('a',message('old','corrected decision sapphire'));assert.equal(h.search('a','zircon'),null);assert.equal(h.search('a','sapphire').messageId,'old');
 assert.equal(h.page({taskId:'a',messageId:'long',offset:17000}).messages[0].text,' final evidence');
});
test('pages scope cursors and deletion purges indexes',t=>{
 const h=fixture(t);for(let i=0;i<5;i++)h.put('a',message(String(i),'needle '+i));h.put('b',message('other','needle'));
 const first=h.page({taskId:'a',limit:2});assert.deepEqual(first.messages.map(m=>m.id),['3','4']);assert.deepEqual(h.page({taskId:'a',before:first.before,limit:2}).messages.map(m=>m.id),['1','2']);
 assert.throws(()=>h.page({taskId:'b',before:first.before}),/cursor/);h.remove('a','4');assert.equal(h.page({taskId:'a'}).total,4);h.deleteTask('a');assert.equal(h.search('a','needle'),null);assert.ok(h.search('b','needle'));
});
test('literal and Unicode search, excluded system text and request bounds',t=>{
 const h=fixture(t);h.put('a',message('1','foo.ts unexpected token'));h.put('a',message('3','foo unrelated ts'));h.put('a',{...message('2','secret'),role:'system'});
 assert.equal(h.search('a','foo.ts').messageId,'1');assert.equal(h.search('a','unexpect').messageId,'1');assert.equal(h.search('a','.').messageId,'1');assert.equal(h.search('a','" OR *'),null);assert.equal(h.search('a','secret'),null);
 assert.throws(()=>h.page({taskId:'a',limit:1000}),/history/);assert.throws(()=>h.page({taskId:'a',offset:-1}),/history/);
 h.put('a',message('u','ÉCOLE ПРИВЕТ'));assert.equal(h.search('a','école').messageId,'u');assert.equal(h.search('a','привет').messageId,'u');
});
