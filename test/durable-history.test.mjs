import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHistoryStore} from '../src/controller/chat-history.mjs';
import {createExecutionLedger} from '../src/controller/execution-ledger.mjs';
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

// Observe real SQLite execution at the store boundary, not a substitute store.
function measured(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const calls=[];
 const observed=new Proxy(db,{get(target,key){
  if(key==='prepare')return sql=>{const statement=target.prepare(sql);return new Proxy(statement,{get(stmt,method){const value=stmt[method];if(!['run','get','all'].includes(method))return typeof value==='function'?value.bind(stmt):value;return(...args)=>{calls.push({sql,method,args});return value.apply(stmt,args);};}});};
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 return{db,calls,observed,h:createHistoryStore(observed)};
}
test('unchanged retained window uses bounded SQL and does not read canonical message bodies',t=>{
 const {h,calls}=measured(t),task={id:'long',messages:Array.from({length:150},(_,i)=>message(String(i),'saved '+i))};
 h.sync(task,true);calls.length=0;h.sync(structuredClone(task));
 assert.ok(calls.length<=4,`unchanged window executed ${calls.length} statements`);
 assert.ok(!calls.some(c=>c.method==='run'&&/chat_history|history_terms/.test(c.sql)));
 assert.ok(!calls.some(c=>c.method!=='run'&&/SELECT\s+(?:\*|[^\n]*\btext\b)/i.test(c.sql)),'metadata sync must not fetch canonical bodies');
 assert.equal(h.page({taskId:'long'}).coverage,'retained-legacy');
});
test('metadata sync preserves long canonical text and keeps search role visibility consistent',t=>{
 const {h}=measured(t);h.put('a',message('long','x'.repeat(17000)+' durable-tail'));
 h.sync({id:'a',messages:[{...message('long','short display'),outcome:'cancelled'}]});
 const row=h.page({taskId:'a',messageId:'long',offset:17000}).messages[0];assert.equal(row.text,' durable-tail');assert.equal(row.outcome,'cancelled');
 h.sync({id:'a',messages:[{...message('long','short display'),role:'system'}]});assert.equal(h.search('a','durable-tail'),null);
 h.put('a',{...message('long','public again'),role:'assistant'});assert.equal(h.search('a','public again').messageId,'long');
});
test('streaming replacements update only changed terms and rollback with canonical text',t=>{
 const {h,db}=measured(t);h.put('a',message('m','alpha beta'));
 db.exec(`CREATE TABLE term_changes(kind TEXT); CREATE TRIGGER count_term_insert AFTER INSERT ON history_terms BEGIN INSERT INTO term_changes VALUES('insert'); END; CREATE TRIGGER count_term_delete AFTER DELETE ON history_terms BEGIN INSERT INTO term_changes VALUES('delete'); END;`);
 h.put('a',message('m','alpha beta gamma'));
 assert.deepEqual(db.prepare('SELECT kind FROM term_changes').all().map(r=>r.kind),['insert']);
 db.exec('DELETE FROM term_changes; BEGIN');h.put('a',message('m','beta delta'));db.exec('ROLLBACK');
 assert.equal(h.search('a','gamma').messageId,'m');assert.equal(h.search('a','delta'),null);
 h.put('a',message('m','beta delta'));
 assert.deepEqual(db.prepare('SELECT kind FROM term_changes ORDER BY kind').all().map(r=>r.kind),['delete','delete','insert']);
 assert.equal(h.search('a','alpha'),null);assert.equal(h.search('a','delta').messageId,'m');
});
test('failed retained window synchronization leaves no partial messages or coverage',t=>{
 const {h,db}=measured(t);db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON chat_history WHEN new.message_id='fail' BEGIN SELECT RAISE(ABORT,'storage failure'); END;");
 assert.throws(()=>h.sync({id:'a',messages:[message('first','first'),message('fail','second')]},true),/storage failure/);
 assert.equal(h.page({taskId:'a'}).total,0);assert.equal(db.prepare('SELECT count(*) n FROM history_coverage').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM history_terms').get().n,0);
});
test('snapshot duplicates retain first canonical text but apply latest metadata and survive outer rollback',t=>{
 const {h,db}=measured(t);h.sync({id:'a',messages:[message('same','canonical'),{...message('same','display copy'),outcome:'completed'}]},true);
 assert.equal(h.page({taskId:'a'}).messages[0].text,'canonical');assert.equal(h.page({taskId:'a'}).messages[0].outcome,'completed');
 db.exec('BEGIN');h.sync({id:'a',messages:[{...message('same','ignored'),outcome:'cancelled'},message('new','not committed')]});db.exec('ROLLBACK');
 h.sync({id:'a',messages:[{...message('same','ignored'),outcome:'cancelled'},message('new','committed')]});
 assert.equal(h.page({taskId:'a'}).messages[0].outcome,'cancelled');assert.equal(h.search('a','committed').messageId,'new');assert.equal(h.page({taskId:'a'}).coverage,'retained-legacy');
});
test('newest literal substring match outranks an older whole-token hit',t=>{
 const h=fixture(t);h.put('a',message('old','cat'));h.put('a',message('new','catalogue'));assert.equal(h.search('a','cat').messageId,'new');
 h.put('a',message('newer','cat again'));assert.equal(h.search('a','cat').messageId,'newer');
 h.put('b',message('foreign','cat'));h.remove('a','newer');assert.equal(h.search('a','cat').messageId,'new');
});
test('history paging and receipt lists use task-scoped ordered indexes',t=>{
 const {h,db,calls,observed}=measured(t),ledger=createExecutionLedger(observed);
 for(let i=0;i<50;i++){const task=i%2?'a':'b';h.put(task,message(String(i),'row '+i));ledger.begin(task,{id:'receipt-'+i});}
 calls.length=0;assert.deepEqual(h.page({taskId:'a',limit:2}).messages.map(m=>m.id),['47','49']);assert.equal(ledger.list('a')[0].id,'receipt-49');
 const reads=calls.filter(c=>c.method==='all'&&/ORDER BY (?:seq|rowid) DESC LIMIT/.test(c.sql));assert.equal(reads.length,2);
 for(const read of reads){const plan=db.prepare('EXPLAIN QUERY PLAN '+read.sql).all(...read.args).map(r=>r.detail).join('\n');assert.match(plan,/SEARCH .* USING (?:COVERING )?INDEX/);assert.doesNotMatch(plan,/USE TEMP B-TREE|SCAN /);}
 ledger.deleteTask('a');h.deleteTask('a');assert.equal(ledger.list('a').length,0);assert.equal(ledger.list('b').length,20);assert.equal(h.page({taskId:'b'}).total,25);
});
test('populated pre-index schema upgrades idempotently and large legacy windows retain canonical text',t=>{
 const {h,db,observed}=measured(t),ledger=createExecutionLedger(observed);
 const messages=Array.from({length:1105},(_,i)=>message(String(i),'legacy '+i));h.sync({id:'legacy',messages},true);
 h.put('legacy',message('500','x'.repeat(17000)+' canonical-tail'));ledger.begin('legacy',{id:'pending'});
 db.exec('DROP INDEX history_task_sequence; DROP INDEX execution_receipts_task');
 const upgraded=createHistoryStore(observed),recovered=createExecutionLedger(observed);
 upgraded.sync({id:'legacy',messages:[...messages,{...message('500','display copy'),outcome:'completed'}]});
 assert.equal(upgraded.page({taskId:'legacy'}).total,1105);assert.equal(upgraded.page({taskId:'legacy'}).coverage,'retained-legacy');
 const row=upgraded.page({taskId:'legacy',messageId:'500',offset:17000}).messages[0];assert.equal(row.text,' canonical-tail');assert.equal(row.outcome,'completed');
 assert.equal(upgraded.search('legacy','canonical-tail').messageId,'500');
 const receipt=recovered.list('legacy')[0];assert.equal(receipt.id,'pending');assert.equal(receipt.result,'unknown');assert.equal(receipt.phase,'settled');
 const reopened=createHistoryStore(observed),again=createExecutionLedger(observed);assert.equal(reopened.page({taskId:'legacy'}).total,1105);assert.deepEqual(again.list('legacy'),recovered.list('legacy'));
 const indices=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name);assert.ok(indices.includes('history_task_sequence'));assert.ok(indices.includes('execution_receipts_task'));
});
test('term insertion failure rolls back the text and removed terms and can be retried',t=>{
 const {h,db}=measured(t);h.put('a',message('m','alpha beta'));
 db.exec("CREATE TRIGGER fail_term BEFORE INSERT ON history_terms WHEN new.term='gamma' BEGIN SELECT RAISE(ABORT,'term write failure'); END;");
 assert.throws(()=>h.put('a',message('m','beta gamma')),/term write failure/);
 assert.equal(h.page({taskId:'a'}).messages[0].text,'alpha beta');assert.equal(h.search('a','alpha').messageId,'m');assert.equal(h.search('a','gamma'),null);
 db.exec('DROP TRIGGER fail_term');h.put('a',message('m','beta gamma'));assert.equal(h.search('a','alpha'),null);assert.equal(h.search('a','gamma').messageId,'m');
});
