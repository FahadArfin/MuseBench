// Acknowledged composer edits must not serialize conversation history. This
// table is authoritative after its one-time, atomic import of legacy drafts.
export function createDraftStore(db,legacyDrafts={}){
 const atomic=operation=>{
  db.exec('SAVEPOINT musebench_code_drafts');
  try{const result=operation();db.exec('RELEASE musebench_code_drafts');return result;}
  catch(error){
   try{db.exec('ROLLBACK TO musebench_code_drafts; RELEASE musebench_code_drafts');}
   catch{throw new Error('Draft storage rollback could not be confirmed.',{cause:error});}
   throw error;
  }
 };
 if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_drafts'").get()){
  atomic(()=>{
   db.exec('CREATE TABLE code_drafts(draft_key TEXT PRIMARY KEY NOT NULL,json TEXT NOT NULL)');
   const insert=db.prepare('INSERT INTO code_drafts(draft_key,json) VALUES(?,?)');
   for(const [key,value] of Object.entries(legacyDrafts))insert.run(key,JSON.stringify(value));
  });
 }
 const rows=db.prepare('SELECT draft_key,json FROM code_drafts');
 const upsert=db.prepare('INSERT INTO code_drafts(draft_key,json) VALUES(?,?) ON CONFLICT(draft_key) DO UPDATE SET json=excluded.json');
 const remove=db.prepare('DELETE FROM code_drafts WHERE draft_key=?');
 return{
  read:()=>Object.fromEntries(rows.all().map(row=>[row.draft_key,JSON.parse(row.json)])),
  write(key,value){if(value===null)remove.run(key);else upsert.run(key,JSON.stringify(value));},
  sync(drafts){
   const next=new Map(Object.entries(drafts).map(([key,value])=>[key,JSON.stringify(value)]));
   atomic(()=>{
    // Read current rows rather than caching them: a surrounding controller
    // transaction may roll back after this savepoint has been released.
    const previous=new Map(rows.all().map(row=>[row.draft_key,row.json]));
    for(const [key,json] of next)if(previous.get(key)!==json)upsert.run(key,json);
    for(const key of previous.keys())if(!next.has(key))remove.run(key);
   });
  },
 };
}
