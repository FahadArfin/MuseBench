import {validateHistoryFind,literalOccurrences,historyHit} from '../shared/history-find.mjs';
import {literalIndex} from '../shared/literal-search.mjs';
// App-received history is independent of the bounded renderer/context window.
// This cannot recover messages discarded before migration or unseen native tools.
const CAP=1024*1024, PAGE_TEXT=12000;
const tokens=text=>[...new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu)??[])];
const valid=m=>m&&typeof m.id==='string'&&typeof m.text==='string'&&['user','assistant','system'].includes(m.role);
const metadataFor=(m,prior={},snapshot=false)=>JSON.stringify({...prior,id:m.id,role:m.role,at:prior.at??m.at,turnId:m.turnId,outcome:m.outcome??prior.outcome,captureTruncated:snapshot?prior.captureTruncated:m.text.length>CAP});
export function createHistoryStore(db){
 db.function('history_lower',{deterministic:true},text=>text.toLowerCase());
 db.exec(`CREATE TABLE IF NOT EXISTS history_coverage(task_id TEXT PRIMARY KEY,coverage TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS chat_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,message_id TEXT NOT NULL,role TEXT NOT NULL,text TEXT NOT NULL,metadata TEXT NOT NULL,UNIQUE(task_id,message_id));
 CREATE INDEX IF NOT EXISTS history_task_sequence ON chat_history(task_id,seq);
 CREATE TABLE IF NOT EXISTS history_terms(task_id TEXT NOT NULL,term TEXT NOT NULL,message_id TEXT NOT NULL,PRIMARY KEY(task_id,term,message_id));
 CREATE INDEX IF NOT EXISTS history_message_terms ON history_terms(task_id,message_id);
 CREATE TRIGGER IF NOT EXISTS history_delete AFTER DELETE ON chat_history BEGIN DELETE FROM history_terms WHERE task_id=old.task_id AND message_id=old.message_id; END;`);
 const lookup=db.prepare('SELECT * FROM chat_history WHERE task_id=? AND message_id=?');
 const coverage=db.prepare('INSERT OR IGNORE INTO history_coverage VALUES(?,?)');
 const write=db.prepare('INSERT INTO chat_history(task_id,message_id,role,text,metadata) VALUES(?,?,?,?,?) ON CONFLICT(task_id,message_id) DO UPDATE SET role=excluded.role,text=excluded.text,metadata=excluded.metadata');
 const writeMetadata=db.prepare('UPDATE chat_history SET role=?,metadata=? WHERE task_id=? AND message_id=?');
 const addTerm=db.prepare('INSERT INTO history_terms VALUES(?,?,?)');
 const removeTerm=db.prepare('DELETE FROM history_terms WHERE task_id=? AND term=? AND message_id=?');
 // Fixed-size batches bound statement count and parameter count, including legacy imports.
 const batchSize=500,readMetadata=db.prepare(`SELECT message_id,role,metadata FROM chat_history WHERE task_id=? AND message_id IN (${Array(batchSize).fill('?').join(',')})`);
 const count=db.prepare('SELECT count(*) n FROM chat_history WHERE task_id=?');
 const readPage=db.prepare('SELECT * FROM chat_history WHERE task_id=? AND seq<? ORDER BY seq DESC LIMIT ?');
 const hasOlder=db.prepare('SELECT 1 FROM chat_history WHERE task_id=? AND seq<? LIMIT 1');
 const readCoverage=db.prepare('SELECT coverage FROM history_coverage WHERE task_id=?');
 const findNewer=db.prepare("SELECT seq,message_id,metadata,text FROM chat_history WHERE task_id=? AND seq>? AND role!='system' AND instr(history_lower(text),?)>0 ORDER BY seq DESC LIMIT 1");
 function atomic(work){
  db.exec('SAVEPOINT history_write');
  try{const result=work();db.exec('RELEASE history_write');return result;}
  catch(error){db.exec('ROLLBACK TO history_write; RELEASE history_write');throw error;}
 }
 function writeMessage(taskId,m,old){
  const text=m.text.slice(0,CAP),metadata=metadataFor(m,old?JSON.parse(old.metadata):{});
  if(old?.text===text&&old.metadata===metadata&&old.role===m.role)return;
  write.run(taskId,m.id,m.role,text,metadata);
  if(old?.text!==text){
   const next=new Set(tokens(text)),previous=new Set(old?tokens(old.text):[]);
   for(const term of previous)if(!next.has(term))removeTerm.run(taskId,term,m.id);
   for(const term of next)if(!previous.has(term))addTerm.run(taskId,term,m.id);
  }
  return{message_id:m.id,role:m.role,metadata};
 }
 function updateMetadata(taskId,m,old){
  const metadata=metadataFor(m,JSON.parse(old.metadata),true);
  if(metadata!==old.metadata||m.role!==old.role)writeMetadata.run(m.role,metadata,taskId,m.id);
  return{message_id:m.id,role:m.role,metadata};
 }
 function put(taskId,m,{snapshot=false}={}){
  if(!valid(m))return;
  atomic(()=>{
   coverage.run(taskId,'app-received');const old=lookup.get(taskId,m.id);
   if(snapshot&&old)updateMetadata(taskId,m,old);else writeMessage(taskId,m,old);
  });
 }
 function sync(task,legacy=false){
  atomic(()=>{
   coverage.run(task.id,legacy?'retained-legacy':'app-received');
   const messages=(task.messages??[]).filter(valid),ids=[...new Set(messages.map(m=>m.id))],stored=new Map();
   for(let i=0;i<ids.length;i+=batchSize){const batch=ids.slice(i,i+batchSize);for(const row of readMetadata.all(task.id,...batch,...Array(batchSize-batch.length).fill(null)))stored.set(row.message_id,row);}
   // Snapshot text is only admitted for a new message. Existing canonical bodies
   // may be much longer than the display window and are never selected here.
   for(const m of messages){const old=stored.get(m.id);stored.set(m.id,old?updateMetadata(task.id,m,old):writeMessage(task.id,m));}
  });
 }
 function search(taskId,query){
  const needle=query.trim().toLowerCase();if(!needle)return null;const terms=tokens(needle);
  // The index narrows whole-token candidates; verify the exact substring. Fall
  // back for partial words and punctuation to preserve the existing search UX.
  let row=terms.length?db.prepare(`SELECT h.seq,h.message_id,h.metadata,h.text FROM chat_history h JOIN (SELECT message_id FROM history_terms WHERE task_id=? AND term IN (${terms.map(()=>'?').join(',')}) GROUP BY message_id HAVING count(*)=?) matches ON h.message_id=matches.message_id WHERE h.task_id=? AND h.role!='system' AND instr(history_lower(h.text),?)>0 ORDER BY h.seq DESC LIMIT 1`).get(taskId,...terms,terms.length,taskId,needle):null;
  // A newer partial-word match can outrank the index's whole-token candidate.
  row=findNewer.get(taskId,row?.seq??0,needle)??row;
  if(!row)return null;const offset=Math.max(0,literalIndex(row.text,needle)-50);
  return{messageId:row.message_id,snippet:row.text.slice(offset,offset+240),offset,at:JSON.parse(row.metadata).at};
 }
 function find(input){
  validateHistoryFind(input);const {taskId,query,direction,cursor}=input,forward=direction==='next';
  const selected=cursor?lookup.get(taskId,cursor.messageId):null;
  if(cursor){let valid=false;if(selected&&selected.role!=='system')for(const m of literalOccurrences(selected.text,query)){if(m.offset===cursor.offset){valid=true;break;}if(m.offset>cursor.offset)break;}if(!valid)throw Error('Invalid history cursor.');}
  const coverage=readCoverage.get(taskId)?.coverage??'app-received';
  // Iterate one captured body at a time. Neither message lists nor totals enter the renderer.
  const candidates=db.prepare(`SELECT seq,message_id,role,text,metadata FROM chat_history WHERE task_id=? AND role!='system' AND instr(history_lower(text),?)>0 ORDER BY seq ${forward?'ASC':'DESC'}`);
  let fallback=null;
  const hit=({row,match})=>historyHit({...row,captureTruncated:JSON.parse(row.metadata).captureTruncated},match);
  for(const row of candidates.iterate(taskId,query.toLowerCase())){
   let choice=null;const eligible=!cursor||(forward?row.seq>=selected.seq:row.seq<=selected.seq);
   for(const match of literalOccurrences(row.text,query)){
    if(forward){fallback??={row,match};if(eligible&&(!cursor||row.seq!==selected.seq||match.offset>cursor.offset))return{hit:hit({row,match}),coverage,wrapped:false};}
    else{if(!fallback||fallback.row.seq===row.seq)fallback={row,match};if(eligible&&(!cursor||row.seq!==selected.seq||match.offset<cursor.offset))choice=match;}
   }
   if(choice)return{hit:hit({row,match:choice}),coverage,wrapped:false};
  }
  return{hit:fallback?hit(fallback):null,coverage,wrapped:Boolean(cursor&&fallback)};
 }
 function page({taskId,before,messageId,offset=0,limit=20}={}){
  if(typeof taskId!=='string'||!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>CAP||before!==undefined&&typeof before!=='string'||messageId!==undefined&&typeof messageId!=='string')throw Error('Invalid history request.');
  const total=count.get(taskId).n;
  let cursor=Number.MAX_SAFE_INTEGER;
  if(before!==undefined){const row=lookup.get(taskId,before);if(!row)throw Error('Invalid history cursor.');cursor=row.seq;}
  const rows=messageId?[lookup.get(taskId,messageId)].filter(Boolean):readPage.all(taskId,cursor,limit).reverse();
  const messages=rows.map(row=>({...JSON.parse(row.metadata),text:row.text.slice(offset,offset+PAGE_TEXT),textLength:row.text.length,offset}));
  const older=rows.length&&hasOlder.get(taskId,rows[0].seq);
  return{messages,total,before:!messageId&&older?rows[0].message_id:null,coverage:readCoverage.get(taskId)?.coverage??'app-received'};
 }
 return{put,sync,search,find,page,remove:(task,id)=>db.prepare('DELETE FROM chat_history WHERE task_id=? AND message_id=?').run(task,id),deleteTask(task){db.prepare('DELETE FROM chat_history WHERE task_id=?').run(task);db.prepare('DELETE FROM history_coverage WHERE task_id=?').run(task);}};
}
