import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {createController} from '../src/controller/index.mjs';

const directory=path.resolve(process.argv[2]??'artifacts/draft-saves/measurement');
await mkdir(directory,{recursive:true});
const results=[];
for(const count of [0,150]){
 const root=await mkdtemp(path.join(directory,'case-')),dataDir=path.join(root,'data'),project=path.join(root,'project');
 await mkdir(project);await writeFile(path.join(project,'note.txt'),'Owned draft benchmark fixture.');
 let snapshots=0;
 const runtime={snapshot(){snapshots++;return{status:'unavailable',permissionVerified:false,cleanup:'confirmed',messages:[]};},subscribe(){return()=>{};},async disconnect(){}};
 let controller=await createController({dataDir,runtime});
 const act=async action=>{const state=await controller.dispatch(action);assert.equal(state.error,null);return state;};
 await act({type:'openProject',path:project});
 const initial=await act({type:'newTask',request:'Owned draft benchmark',mode:'manual'});
 await controller.close();
 const seed=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));
 const app=JSON.parse(seed.prepare('SELECT json FROM app WHERE id=1').get().json);
 app.task.messages=Array.from({length:count},(_,i)=>({id:'fixture-'+i,role:i%2?'assistant':'user',text:'Retained fixture text. '.repeat(800).slice(0,16000),at:new Date(1700000000000+i).toISOString()}));
 seed.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(app.task),app.task.id);
 seed.prepare('UPDATE app SET json=? WHERE id=1').run(JSON.stringify(app));seed.close();
 controller=await createController({dataDir,runtime});
 const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));
 db.exec('CREATE TABLE draft_benchmark_writes(name TEXT, bytes INTEGER)');
 for(const table of ['app','tasks','projects']){
  db.exec('CREATE TRIGGER draft_benchmark_'+table+' AFTER UPDATE ON '+table+' BEGIN INSERT INTO draft_benchmark_writes VALUES(\''+table+'\',length(NEW.json)); END');
 }
 const input={projectId:initial.activeProject.id,taskId:initial.task.id,files:[],images:[],mode:'chat'};
 const save=controller.saveCodeDraft?value=>controller.saveCodeDraft(value):async value=>{const state=await controller.dispatch({...value,type:'saveDraft'});assert.equal(state.error,null);};
 try{
  for(let i=0;i<5;i++)await save({...input,text:'Warm-up '+i});
  db.exec('DELETE FROM draft_benchmark_writes');snapshots=0;
  const timings=[];
  for(let i=0;i<30;i++){const start=performance.now();await save({...input,text:'Immediately durable typed draft '+i});timings.push(performance.now()-start);}
  const writes=db.prepare('SELECT name,count(*) AS writes,sum(bytes) AS bytes FROM draft_benchmark_writes GROUP BY name').all();
  const runtimeSnapshots=snapshots;
  const key=input.projectId+':'+input.taskId;
  const stored=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_drafts'").get()
   ?JSON.parse(db.prepare('SELECT json FROM code_drafts WHERE draft_key=?').get(key).json)
   :JSON.parse(db.prepare('SELECT json FROM app WHERE id=1').get().json).drafts[key];
  assert.equal(stored.text,'Immediately durable typed draft 29');
  const sorted=[...timings].sort((a,b)=>a-b);
  results.push({messages:count,charactersPerMessage:count?16000:0,route:controller.saveCodeDraft?'dedicated acknowledgement':'legacy dispatch',saves:timings.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*0.95)-1],runtimeSnapshots,unrelatedWrites:writes,immediateDurability:true,fixture:root});
 }finally{db.close();await controller.close();}
}
const report={at:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),kind:'isolated synthetic controller saves; no model requests',results};
await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
