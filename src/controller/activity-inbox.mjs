import {createHash} from 'node:crypto';
import {ACTIVITY_LABELS,validateActivityRead} from '../shared/activity-inbox.mjs';

const MAX_EVENTS=200,MAX_AGE=30*86400000;
export function createActivityInbox(db,{clock=Date.now}={}){
 db.exec('CREATE TABLE IF NOT EXISTS activity_inbox(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,source TEXT NOT NULL,source_id TEXT NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL,read_at TEXT); CREATE INDEX IF NOT EXISTS activity_inbox_task ON activity_inbox(task_id)');
 const read=db.prepare('SELECT id,task_id AS taskId,source,source_id AS sourceId,kind,at,read_at AS readAt FROM activity_inbox ORDER BY at DESC,rowid DESC LIMIT 200');
 const insert=db.prepare('INSERT OR IGNORE INTO activity_inbox(id,task_id,source,source_id,kind,at,read_at) VALUES(?,?,?,?,?,?,NULL)');
 const find=db.prepare('SELECT id FROM activity_inbox WHERE id=?'),mark=db.prepare('UPDATE activity_inbox SET read_at=? WHERE id=?');
 let rows=[];
 const refresh=()=>{rows=read.all().map(row=>({...row}));};
 const pruneRows=()=>{
  const aged=db.prepare('DELETE FROM activity_inbox WHERE at<?').run(new Date(clock()-MAX_AGE).toISOString()).changes;
  const excess=db.prepare('DELETE FROM activity_inbox WHERE id NOT IN (SELECT id FROM activity_inbox ORDER BY at DESC,rowid DESC LIMIT ?)').run(MAX_EVENTS).changes;
  return Number(aged)+Number(excess);
 };
 const prune=()=>{const removed=pruneRows();refresh();return removed;};
 const writeEvents=(taskId,events,persistSource,alwaysPersist)=>{
  if(!Array.isArray(events)||events.length<1||events.length>MAX_EVENTS)throw Error('Invalid activity observations.');
  const entries=new Map();
  for(const event of events){
   const {source,sourceId,kind,identity=''}=event;
   if(typeof taskId!=='string'||!taskId||taskId.length>200||typeof sourceId!=='string'||!sourceId||sourceId.length>200||!['run','check'].includes(source)||!Object.hasOwn(ACTIVITY_LABELS,kind)||(source==='check')!==kind.startsWith('check_')||typeof identity!=='string'||identity.length>1024)throw Error('Invalid activity observation.');
   // Question identity is hashed, never persisted as a question or native payload.
   const id=createHash('sha256').update(JSON.stringify([taskId,source,sourceId,kind,identity])).digest('hex');
   const at=event.at??new Date(clock()).toISOString();if(typeof at!=='string'||!Number.isFinite(Date.parse(at)))throw Error('Invalid observation time.');
   if(!rows.some(row=>row.id===id)&&!find.get(id))entries.set(id,[id,taskId,source,sourceId,kind,at]);
  }
  if(!entries.size&&!alwaysPersist)return false;
  db.exec('SAVEPOINT activity_observed');
  try{for(const args of entries.values())insert.run(...args);persistSource();pruneRows();db.exec('RELEASE activity_observed');}
  catch(error){db.exec('ROLLBACK TO activity_observed; RELEASE activity_observed');throw error;}
  refresh();return entries.size>0;
 };
 prune();
 return{
  list:()=>rows.map(row=>({...row})),refresh,prune,
  record:(taskId,event,persistSource=()=>{})=>writeEvents(taskId,[event],persistSource,false),
  recordMany:(taskId,events,persistSource)=>writeEvents(taskId,events,persistSource,true),
  setRead(ids,read){validateActivityRead({type:'setActivityRead',ids,read});db.exec('SAVEPOINT activity_read');try{const at=read?new Date(clock()).toISOString():null;for(const id of new Set(ids))mark.run(at,id);pruneRows();db.exec('RELEASE activity_read');}catch(error){db.exec('ROLLBACK TO activity_read; RELEASE activity_read');throw error;}refresh();},
  // The caller owns deletion's transaction and refreshes after commit or rollback.
  deleteTask(taskId){db.prepare('DELETE FROM activity_inbox WHERE task_id=?').run(taskId);},
 };
}
