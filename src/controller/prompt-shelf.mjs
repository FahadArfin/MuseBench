// Shelf changes share the controller queue and a transaction with the current draft.
import {randomUUID} from 'node:crypto';
export function createPromptShelf(db){
 db.exec('CREATE TABLE IF NOT EXISTS saved_prompts(id TEXT PRIMARY KEY,owner_key TEXT NOT NULL,json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS saved_prompts_owner ON saved_prompts(owner_key)');
 const list=key=>db.prepare('SELECT id,json FROM saved_prompts WHERE owner_key=? ORDER BY rowid DESC').all(key).map(row=>({id:row.id,draft:JSON.parse(row.json)}));
 return{list,all:()=>db.prepare('SELECT owner_key,json FROM saved_prompts').all().map(row=>({key:row.owner_key,draft:JSON.parse(row.json)})),
  put(key,draft){if(list(key).length>=20)throw Error('Saved prompts is full (20). Remove a saved prompt first.');const id=randomUUID();db.prepare('INSERT INTO saved_prompts(id,owner_key,json) VALUES(?,?,?)').run(id,key,JSON.stringify(draft));return id;},
  replace(key,id,draft){const result=db.prepare('UPDATE saved_prompts SET json=? WHERE owner_key=? AND id=?').run(JSON.stringify(draft),key,id);if(!result.changes)throw Error('Saved prompt unavailable.');},
  remove(key,id){if(!db.prepare('DELETE FROM saved_prompts WHERE owner_key=? AND id=?').run(key,id).changes)throw Error('Saved prompt unavailable.');},
  deleteOwner:key=>db.prepare('DELETE FROM saved_prompts WHERE owner_key=?').run(key),
  move:(from,to)=>db.prepare('UPDATE saved_prompts SET owner_key=? WHERE owner_key=?').run(to,from),
 };
}
