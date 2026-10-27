import {literalIndex} from '../shared/literal-search.mjs';
// App-received history is independent of the bounded renderer/context window.
// This cannot recover messages discarded before migration or unseen native tools.
const CAP=1024*1024, PAGE_TEXT=12000;
const tokens=text=>[...new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu)??[])];
export function createHistoryStore(db){
 db.function('history_lower',{deterministic:true},text=>text.toLowerCase());
 db.exec(`CREATE TABLE IF NOT EXISTS history_coverage(task_id TEXT PRIMARY KEY,coverage TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS chat_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,message_id TEXT NOT NULL,role TEXT NOT NULL,text TEXT NOT NULL,metadata TEXT NOT NULL,UNIQUE(task_id,message_id));
 CREATE TABLE IF NOT EXISTS history_terms(task_id TEXT NOT NULL,term TEXT NOT NULL,message_id TEXT NOT NULL,PRIMARY KEY(task_id,term,message_id));
 CREATE INDEX IF NOT EXISTS history_message_terms ON history_terms(task_id,message_id);
 CREATE TRIGGER IF NOT EXISTS history_delete AFTER DELETE ON chat_history BEGIN DELETE FROM history_terms WHERE task_id=old.task_id AND message_id=old.message_id; END;`);
 const lookup=db.prepare('SELECT * FROM chat_history WHERE task_id=? AND message_id=?');
 const coverage=db.prepare('INSERT OR IGNORE INTO history_coverage VALUES(?,?)');
 function put(taskId,m,{snapshot=false}={}){
  if(!m||typeof m.id!=='string'||typeof m.text!=='string'||!['user','assistant','system'].includes(m.role))return;
  coverage.run(taskId,'app-received');const old=lookup.get(taskId,m.id);
  const prior=old?JSON.parse(old.metadata):{};
  const preserve=snapshot&&old; // Window saves update metadata, never replace canonical text.
  const text=preserve?old.text:m.text.slice(0,CAP);
  const metadata=JSON.stringify({...prior,id:m.id,role:m.role,at:prior.at??m.at,turnId:m.turnId,outcome:m.outcome,captureTruncated:preserve?prior.captureTruncated:m.text.length>CAP});
  if(old?.text===text&&old.metadata===metadata)return;
  db.exec('SAVEPOINT history_write');
  try{
   db.prepare('INSERT INTO chat_history(task_id,message_id,role,text,metadata) VALUES(?,?,?,?,?) ON CONFLICT(task_id,message_id) DO UPDATE SET text=excluded.text,metadata=excluded.metadata').run(taskId,m.id,m.role,text,metadata);
   if(old?.text!==text){db.prepare('DELETE FROM history_terms WHERE task_id=? AND message_id=?').run(taskId,m.id);const insert=db.prepare('INSERT INTO history_terms VALUES(?,?,?)');for(const term of tokens(text))insert.run(taskId,term,m.id);}
   db.exec('RELEASE history_write');
  }catch(error){db.exec('ROLLBACK TO history_write; RELEASE history_write');throw error;}
 }
 function sync(task,legacy=false){
  coverage.run(task.id,legacy?'retained-legacy':'app-received');
  for(const m of task.messages??[])put(task.id,m,{snapshot:true});
 }
 function search(taskId,query){
  const needle=query.trim().toLowerCase();if(!needle)return null;const terms=tokens(needle);
  // The index narrows whole-token candidates; verify the exact substring. Fall
  // back for partial words and punctuation to preserve the existing search UX.
  let row=terms.length?db.prepare(`SELECT h.message_id,h.metadata,h.text FROM chat_history h JOIN (SELECT message_id FROM history_terms WHERE task_id=? AND term IN (${terms.map(()=>'?').join(',')}) GROUP BY message_id HAVING count(*)=?) matches ON h.message_id=matches.message_id WHERE h.task_id=? AND h.role!='system' AND instr(history_lower(h.text),?)>0 ORDER BY h.seq DESC LIMIT 1`).get(taskId,...terms,terms.length,taskId,needle):null;
  row??=db.prepare("SELECT message_id,metadata,text FROM chat_history WHERE task_id=? AND role!='system' AND instr(history_lower(text),?)>0 ORDER BY seq DESC LIMIT 1").get(taskId,needle);
  if(!row)return null;const offset=Math.max(0,literalIndex(row.text,needle)-50);
  return{messageId:row.message_id,snippet:row.text.slice(offset,offset+240),offset,at:JSON.parse(row.metadata).at};
 }
 function page({taskId,before,messageId,offset=0,limit=20}={}){
  if(typeof taskId!=='string'||!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>CAP||before!==undefined&&typeof before!=='string'||messageId!==undefined&&typeof messageId!=='string')throw Error('Invalid history request.');
  const total=db.prepare('SELECT count(*) n FROM chat_history WHERE task_id=?').get(taskId).n;
  let cursor=Number.MAX_SAFE_INTEGER;
  if(before!==undefined){const row=lookup.get(taskId,before);if(!row)throw Error('Invalid history cursor.');cursor=row.seq;}
  const rows=messageId?[lookup.get(taskId,messageId)].filter(Boolean):db.prepare('SELECT * FROM chat_history WHERE task_id=? AND seq<? ORDER BY seq DESC LIMIT ?').all(taskId,cursor,limit).reverse();
  const messages=rows.map(row=>({...JSON.parse(row.metadata),text:row.text.slice(offset,offset+PAGE_TEXT),textLength:row.text.length,offset}));
  const older=rows.length&&db.prepare('SELECT 1 FROM chat_history WHERE task_id=? AND seq<? LIMIT 1').get(taskId,rows[0].seq);
  return{messages,total,before:!messageId&&older?rows[0].message_id:null,coverage:db.prepare('SELECT coverage FROM history_coverage WHERE task_id=?').get(taskId)?.coverage??'app-received'};
 }
 return{put,sync,search,page,remove:(task,id)=>db.prepare('DELETE FROM chat_history WHERE task_id=? AND message_id=?').run(task,id),deleteTask(task){db.prepare('DELETE FROM chat_history WHERE task_id=?').run(task);db.prepare('DELETE FROM history_coverage WHERE task_id=?').run(task);}};
}
