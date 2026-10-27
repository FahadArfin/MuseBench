import {literalIndex} from '../shared/literal-search.mjs';
export function createOutputStore(db,{limit=1048576,perTask=16,total=128}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS captured_outputs(seq INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL,id TEXT NOT NULL,label TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',received INTEGER NOT NULL DEFAULT 0,capture_truncated INTEGER NOT NULL DEFAULT 0,source_truncated INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,UNIQUE(task_id,id));`);
 db.prepare("UPDATE captured_outputs SET status='interrupted' WHERE status='running'").run();
 const row=(task,id)=>db.prepare('SELECT * FROM captured_outputs WHERE task_id=? AND id=?').get(task,id);
 function start(task,id,label){
  db.prepare("INSERT OR IGNORE INTO captured_outputs(task_id,id,label,status) VALUES(?,?,?,'running')").run(task,id,String(label).slice(0,200));
  db.prepare("UPDATE captured_outputs SET body='',status='expired' WHERE task_id=? AND seq NOT IN (SELECT seq FROM captured_outputs WHERE task_id=? ORDER BY seq DESC LIMIT ?)").run(task,task,perTask);
  db.prepare("UPDATE captured_outputs SET body='',status='expired' WHERE seq NOT IN (SELECT seq FROM captured_outputs ORDER BY seq DESC LIMIT ?)").run(total);
 }
 function append(task,id,text){const item=row(task,id);if(!item||item.status==='expired')return;const body=(item.body+text).slice(0,limit),received=item.received+text.length;db.prepare('UPDATE captured_outputs SET body=?,received=?,capture_truncated=? WHERE task_id=? AND id=?').run(body,received,Number(received>limit),task,id);}
 function finish(task,id,status,sourceTruncated=false){db.prepare("UPDATE captured_outputs SET status=?,source_truncated=? WHERE task_id=? AND id=? AND status!='expired'").run(status,Number(sourceTruncated),task,id);}
 function put(task,id,label,text,status,sourceTruncated=false){start(task,id,label);const old=row(task,id);if(old.status==='expired')return;if(old.body!==text.slice(0,limit)||old.received!==text.length)db.prepare('UPDATE captured_outputs SET body=?,received=?,capture_truncated=? WHERE task_id=? AND id=?').run(text.slice(0,limit),text.length,Number(text.length>limit),task,id);finish(task,id,status,sourceTruncated);}
 const meta=item=>({id:item.id,label:item.label,status:item.status,received:item.received,length:item.status==='expired'?0:Math.min(item.received,limit),captureTruncated:!!item.capture_truncated,sourceTruncated:!!item.source_truncated});
 function read({taskId,id,offset=0,query=''}={}){
  if(typeof taskId!=='string'||taskId.length>200||id!==undefined&&(typeof id!=='string'||id.length>500)||!Number.isInteger(offset)||offset<0||offset>limit||typeof query!=='string'||query.length>200)throw Error('Invalid output request.');
  const items=db.prepare('SELECT id,label,status,received,capture_truncated,source_truncated FROM captured_outputs WHERE task_id=? ORDER BY seq DESC LIMIT 32').all(taskId).map(meta);if(!id)return{items,selected:null};const item=row(taskId,id);if(!item)throw Error('Captured output unavailable.');
  const match=query?literalIndex(item.body,query,offset):-1;const start=query&&match>=0?Math.max(0,match-80):Math.min(offset,item.body.length);
  return{items,selected:{...meta(item),offset:start,text:item.body.slice(start,start+12000),match:query?match:null}};
 }
 return{start,append,finish,put,read,deleteTask:task=>db.prepare('DELETE FROM captured_outputs WHERE task_id=?').run(task)};
}
