import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';

async function fixture(t){
 const base=await fs.mkdtemp(path.join(tmpdir(),'musebench-controller-gc-')),project=path.join(base,'project'),dataDir=path.join(base,'data');await fs.mkdir(project);await fs.writeFile(path.join(project,'note.txt'),'retained baseline');
 let clock=Date.now();const c=await createController({dataDir,sourceGc:{now:()=>clock}});await c.dispatch({type:'openProject',path:project});await c.dispatch({type:'newTask',mode:'manual',request:'Retain source evidence'});
 const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));t.after(async()=>{await c.close();db.close();await fs.rm(base,{recursive:true,force:true,maxRetries:3,retryDelay:50});});
 const object=async text=>{const hash=createHash('sha256').update(text).digest('hex'),file=path.join(dataDir,'source-objects',hash);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);const old=new Date(Date.now()-3*86400000);await fs.utimes(file,old,old);return{hash,object:hash,binary:false,size:Buffer.byteLength(text)};};
 const exists=async descriptor=>fs.access(path.join(dataDir,'source-objects',descriptor.object)).then(()=>true,()=>false);
 return{c,db,object,exists,age(){clock+=3*86400000;},taskId:c.getState().task.id};
}

test('controller collection inventories checkpoints, both restore sides and dormant task descriptors',async t=>{
 const f=await fixture(t),checkpoint=await f.object('checkpoint source'),before=await f.object('restore before'),after=await f.object('restore after'),taskObject=await f.object('dormant task source'),orphan=await f.object('unreferenced source');
 f.db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run('saved',f.taskId,'fixture',JSON.stringify({id:'saved',files:{'saved.txt':checkpoint}}));
 f.db.prepare('INSERT INTO restore_operations(id,task_id,json) VALUES(?,?,?)').run('restore',f.taskId,JSON.stringify({before:{'note.txt':before},after:{'note.txt':after}}));
 const task=JSON.parse(f.db.prepare('SELECT json FROM tasks WHERE id=?').get(f.taskId).json);task.retainedCapture={'task.txt':taskObject};f.db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(task),f.taskId);
 f.age();const result=await f.c.collectSourceObjects();assert.equal(result.errors,0);assert.equal(result.deleted,1);
 for(const descriptor of [checkpoint,before,after,taskObject])assert.equal(await f.exists(descriptor),true);assert.equal(await f.exists(orphan),false);
});

test('malformed retained owner data prevents controller collection and corrected data can be retried',async t=>{
 const f=await fixture(t),orphan=await f.object('must wait for a valid inventory');
 f.db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run('broken',f.taskId,'fixture','{');
 f.age();let result=await f.c.collectSourceObjects();assert.equal(result.deleted,0);assert.equal(await f.exists(orphan),true);assert(result.skipped);
 f.db.prepare('DELETE FROM checkpoints WHERE id=?').run('broken');result=await f.c.collectSourceObjects();assert.equal(result.deleted,1);assert.equal(await f.exists(orphan),false);
});

test('a new external checkpoint invalidates a previously cached reference inventory',async t=>{
 const f=await fixture(t);await f.c.collectSourceObjects();const retained=await f.object('checkpoint added after inventory'),orphan=await f.object('later orphan');
 f.db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run('later',f.taskId,'fixture',JSON.stringify({files:{'later.txt':retained}}));
 f.age();const result=await f.c.collectSourceObjects();assert.equal(result.deleted,1);assert.equal(await f.exists(retained),true);assert.equal(await f.exists(orphan),false);
});

test('an external reference writer blocks deletion until its checkpoint is visible',async t=>{
 const f=await fixture(t),retained=await f.object('reference committed by a concurrent writer');f.age();
 f.db.exec('BEGIN IMMEDIATE');
 try{
  f.db.prepare('INSERT INTO checkpoints(id,task_id,revision,json) VALUES(?,?,?,?)').run('concurrent',f.taskId,'fixture',JSON.stringify({files:{'concurrent.txt':retained}}));
  const blocked=await f.c.collectSourceObjects();assert.equal(blocked.deleted,0);assert.equal(blocked.skipped,'reference-lock');assert.equal(await f.exists(retained),true);
 }finally{f.db.exec('COMMIT');}
 for(let i=0;i<3;i++)await f.c.collectSourceObjects();assert.equal(await f.exists(retained),true);
});

test('large retained histories use incremental inventory reads and draft edits do not restart the scan',async t=>{
 const f=await fixture(t),template=JSON.parse(f.db.prepare('SELECT json FROM tasks WHERE id=?').get(f.taskId).json),baseline=f.db.prepare('SELECT revision,json FROM baselines WHERE task_id=?').get(f.taskId);
 template.messages=Array.from({length:150},(_,i)=>({id:'retained-'+i,role:i%2?'assistant':'user',text:'x'.repeat(16000),at:template.createdAt}));
 const insertTask=f.db.prepare('INSERT INTO tasks(id,json) VALUES(?,?)'),insertBaseline=f.db.prepare('INSERT INTO baselines(task_id,revision,json) VALUES(?,?,?)');
 f.db.exec('BEGIN');try{for(let i=0;i<20;i++){const id='large-retained-'+i;insertTask.run(id,JSON.stringify({...template,id}));insertBaseline.run(id,baseline.revision,baseline.json);}f.db.exec('COMMIT');}catch(error){f.db.exec('ROLLBACK');throw error;}
 const orphan=await f.object('collect after all retained histories are inventoried');f.age();
 const first=await f.c.collectSourceObjects();assert.equal(first.phase,'inventory');assert.equal(first.deleted,0);
 await f.c.saveCodeDraft({projectId:f.c.getState().activeProject.id,taskId:f.taskId,text:'Acknowledged while maintenance is pending',mode:'chat'});
 let next=await f.c.collectSourceObjects();assert(next.inventoryRows>=first.inventoryRows,'an unrelated draft must preserve inventory progress');
 for(let i=0;i<80&&await f.exists(orphan);i++){await new Promise(setImmediate);next=await f.c.collectSourceObjects();assert.notEqual(next.skipped,'references');}
 assert.equal(await f.exists(orphan),false);const cached=await f.c.collectSourceObjects();assert.equal(cached.inventoryReused,true);
 await f.c.saveCodeDraft({projectId:f.c.getState().activeProject.id,taskId:f.taskId,text:'A later unrelated draft',mode:'chat'});
 assert.equal((await f.c.collectSourceObjects()).inventoryReused,true);
});
