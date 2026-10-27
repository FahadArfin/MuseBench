export function createExecutionLedger(db){
 db.exec('CREATE TABLE IF NOT EXISTS execution_receipts(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,json TEXT NOT NULL)');
 const get=db.prepare('SELECT json FROM execution_receipts WHERE id=?'),write=db.prepare('UPDATE execution_receipts SET json=? WHERE id=?');
 const patch=(id,values)=>{const row=get.get(id);if(!row)return;const value={...JSON.parse(row.json),...values,updatedAt:new Date().toISOString()};write.run(JSON.stringify(value),id);return value;};
 for(const row of db.prepare('SELECT id,json FROM execution_receipts').all()){const old=JSON.parse(row.json);if(old.phase!=='settled')patch(row.id,{phase:'settled',result:'unknown',reason:'App restarted before a settled result was recorded.'});if(old.delivery==='submitted')patch(row.id,{delivery:'unknown'});}
 return{
  begin(taskId,input){const at=new Date().toISOString();db.prepare('INSERT INTO execution_receipts(id,task_id,json) VALUES(?,?,?)').run(input.id,taskId,JSON.stringify({...input,taskId,phase:'intent',result:'unknown',acceptance:'unknown',delivery:'not-requested',createdAt:at,updatedAt:at}));},patch,
  delivery(id,status){if(!['suppressed','submitted','shown','failed','unsupported','unknown'].includes(status))throw Error('Invalid delivery state.');return patch(id,{delivery:status});},
  list(taskId){return db.prepare('SELECT json FROM execution_receipts WHERE task_id=? ORDER BY rowid DESC LIMIT 20').all(taskId).map(row=>JSON.parse(row.json));},
  deleteTask(taskId){db.prepare('DELETE FROM execution_receipts WHERE task_id=?').run(taskId);}
 };
}
