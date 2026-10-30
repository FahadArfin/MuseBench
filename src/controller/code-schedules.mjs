import {randomUUID} from 'node:crypto';
import {validateScheduleSpec,nextOccurrence} from '../shared/code-schedules.mjs';
import {runBudget} from '../shared/run-options.mjs';

export function createCodeSchedules(db,{now=()=>Date.now()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS code_schedules(id TEXT PRIMARY KEY,json TEXT NOT NULL)');
 const rows=new Map();
 const write=row=>{db.prepare('INSERT INTO code_schedules(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(row.id,JSON.stringify(row));rows.set(row.id,row);return structuredClone(row);};
 const read=id=>{const row=rows.get(id);if(!row)throw Error('Schedule is unavailable.');return structuredClone(row);};
 const checked=(id,revision)=>{const row=read(id);if(row.revision!==revision)throw Error('This schedule changed. Review it again.');return row;};
 const stamp=()=>new Date(now()).toISOString();
 const append=(row,run)=>{row.history=[run,...row.history].slice(0,30);row.outcomes++;row.historyTruncated=row.outcomes>30;};
 const advance=row=>{const next=nextOccurrence(Date.parse(row.nextAt),row.spec.intervalMinutes,now());row.nextAt=next===null?null:new Date(next).toISOString();if(next===null)row.enabled=false;};
 const view=row=>{const copy=structuredClone(row);if(copy.active)delete copy.active.spec;return copy;};
 for(const record of db.prepare('SELECT id,json FROM code_schedules ORDER BY rowid LIMIT 50').all()){
  try{
   const row=JSON.parse(record.json);row.spec=validateScheduleSpec(row.spec);
   if(row.id!==record.id||typeof row.root!=='string'||!Number.isSafeInteger(row.revision)||row.revision<1||!Number.isSafeInteger(row.attempts)||row.attempts<0||row.attempts>100||!Array.isArray(row.history)||row.nextAt!==null&&!Number.isFinite(Date.parse(row.nextAt)))continue;
   row.enabled=row.enabled===true;row.history=row.history.slice(0,30);row.outcomes=Number.isSafeInteger(row.outcomes)?row.outcomes:row.history.length;
   if(row.active){const {spec,...interrupted}=row.active;append(row,{...interrupted,status:'uncertain',endedAt:stamp(),reason:'MuseBench restarted before the outcome was confirmed. This request will not be replayed.'});row.active=null;row.enabled=false;row.reason='Review the interrupted run before enabling future work.';row.revision++;}
   write(row);
  }catch{/* Preserve invalid records on disk, but never execute them. */}
 }
 return{
  list:()=>[...rows.values()].map(view).sort((a,b)=>a.spec.title.localeCompare(b.spec.title)),get:id=>view(read(id)),has:id=>rows.has(id),
  save(input,root){
   const spec=validateScheduleSpec(input.spec),old=input.id?checked(input.id,input.expectedRevision):null;
   if(old?.active)throw Error('Finish the active run before editing this schedule.');
   if(!old&&rows.size>=50)throw Error('Keep at most 50 schedules.');
   if(Date.parse(spec.startAt)<=now())throw Error('Choose a future start time.');
   if(typeof root!=='string'||!root||root.length>4096)throw Error('Choose a valid project folder.');
   const row={id:old?.id??randomUUID(),revision:(old?.revision??0)+1,spec,root,enabled:false,nextAt:spec.startAt,attempts:old?.attempts??0,active:null,history:old?.history??[],outcomes:old?.outcomes??0,historyTruncated:old?.historyTruncated??false,reason:'Saved paused. Review and enable to authorize runs.',createdAt:old?.createdAt??stamp()};return view(write(row));
  },
  enable(id,revision,confirmed){
   if(confirmed!==true)throw Error('Confirm the schedule before enabling it.');const row=checked(id,revision);
   if(row.active)throw Error('Finish the active run before enabling future work.');
   if(row.attempts>=row.spec.maxRuns)throw Error('The attempt limit has been reached. Edit the schedule to approve a higher limit.');
   if(!row.nextAt)throw Error('Choose a new start time before enabling this schedule.');
   if(Date.parse(row.nextAt)<=now()){const next=nextOccurrence(Date.parse(row.nextAt),row.spec.intervalMinutes,now());if(next===null)throw Error('Choose a future start time.');row.nextAt=new Date(next).toISOString();}
   row.enabled=true;row.reason=null;row.revision++;return view(write(row));
  },
  pause(id,revision){const row=checked(id,revision);row.enabled=false;row.reason='Paused. A current run continues until stopped.';row.revision++;return view(write(row));},
  remove(id,revision){const row=checked(id,revision);if(row.active)throw Error('Finish the active run before removing this schedule.');db.prepare('DELETE FROM code_schedules WHERE id=?').run(id);rows.delete(id);},
  due:()=>[...rows.values()].filter(row=>row.enabled&&row.nextAt&&Date.parse(row.nextAt)<=now()).sort((a,b)=>a.nextAt.localeCompare(b.nextAt)).map(view),
  skip(id,reason){const row=read(id);if(!row.enabled||!row.nextAt||Date.parse(row.nextAt)>now())return;append(row,{id:randomUUID(),taskId:null,status:'skipped',dueAt:row.nextAt,startedAt:null,endedAt:stamp(),reason:String(reason).slice(0,500)});advance(row);write(row);},
  claim(id){
   let row=read(id);if(!row.enabled||!row.nextAt||Date.parse(row.nextAt)>now())return null;
   if(now()-Date.parse(row.nextAt)>60000||row.active){this.skip(id,row.active?'Previous scheduled run is still active.':'Missed while the app or computer was unavailable.');return null;}
   if(row.attempts>=row.spec.maxRuns){row.enabled=false;row.reason='Attempt limit reached.';write(row);return null;}
   const run={id:randomUUID(),taskId:null,status:'starting',dueAt:row.nextAt,startedAt:stamp(),endedAt:null,reason:null,deadlineAt:now()+runBudget(row.spec.runOptions.budget).minutes*60000,spec:structuredClone(row.spec)};
   row.active=run;row.attempts++;advance(row);if(row.attempts>=row.spec.maxRuns)row.enabled=false;write(row);return{schedule:view(row),run:structuredClone(run)};
  },
  attach(id,runId,taskId){const row=read(id);if(row.active?.id!==runId)throw Error('Scheduled run ownership changed.');row.active.taskId=taskId;write(row);},
  running(id,runId){const row=read(id);if(row.active?.id!==runId||row.active.status==='running')return;row.active.status='running';write(row);},
  attention(id,runId,reason){const row=read(id);if(row.active?.id!==runId)return false;reason=String(reason).slice(0,500);if(row.active.status==='waiting'&&row.active.reason===reason&&!row.enabled)return true;row.active.status='waiting';row.active.reason=reason;row.enabled=false;row.reason=row.active.reason;write(row);return true;},
  settle(id,runId,status,reason=''){
   if(!['completed','failed','stopped','uncertain','timed-out'].includes(status))throw Error('Invalid scheduled outcome.');const row=read(id);if(row.active?.id!==runId)return false;
   const {spec,...run}=row.active;append(row,{...run,status,endedAt:stamp(),reason:String(reason).slice(0,500)||null});row.active=null;
   if(status!=='completed'){row.enabled=false;row.reason=String(reason).slice(0,500)||'Review this run before enabling future work.';}else if(row.attempts>=row.spec.maxRuns)row.reason='Attempt limit reached.';
   write(row);return true;
  },
  isBusy:()=>[...rows.values()].some(row=>row.active),
 };
}
