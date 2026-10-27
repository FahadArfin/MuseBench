const DAY=86400000;
const kinds=['messages','tools','agents','skills'];
export function createAnalyticsStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS analytics_chats(task_id TEXT PRIMARY KEY,title TEXT NOT NULL);CREATE TABLE IF NOT EXISTS analytics_events(task_id TEXT NOT NULL,event_id TEXT NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL,label TEXT NOT NULL,PRIMARY KEY(task_id,event_id,kind));CREATE INDEX IF NOT EXISTS analytics_time ON analytics_events(at);`);
 const insert=db.prepare('INSERT OR IGNORE INTO analytics_events VALUES(?,?,?,?,?)');
 const event=(task,id,kind,at,label='')=>{const time=Date.parse(at);if(typeof id!=='string'||!Number.isFinite(time))return;insert.run(task,id,kind,new Date(time).toISOString(),String(label).replace(/[\x00-\x1f]/g,' ').slice(0,160));};
 function sync(task){
  if(!task?.id||task.mode!=='muse')return;
  db.prepare('INSERT INTO analytics_chats VALUES(?,?) ON CONFLICT(task_id) DO UPDATE SET title=excluded.title WHERE title!=excluded.title').run(task.id,String(task.title??'Untitled chat').slice(0,200));
  for(const m of task.messages??[])if(m.role==='user'&&(!task.forkedFrom||Date.parse(m.at)>=Date.parse(task.createdAt)))event(task.id,m.id,'messages',m.at);
  for(const run of task.runs??[]){
   for(const item of run.activities??[])if(item.kind==='tool'||item.kind==='agent')event(task.id,`${run.id}:${item.id}`,item.kind==='tool'?'tools':'agents',run.startedAt,item.kind==='tool'&&typeof item.tool==='string'&&/^[\w:./-]{1,160}$/.test(item.tool)?item.tool:item.kind==='tool'?'Unspecified tool':'Sub-agent / workflow');
   for(const receipt of task.skillReceipts??[])if(receipt.runId===run.runId||run.ownedRunIds?.includes(receipt.runId))event(task.id,receipt.callId,'skills',run.startedAt,receipt.id);
  }
 }
 function read({days=7,offset=0,now=new Date()}={}){
  if(![7,30].includes(days)||!Number.isInteger(offset)||offset<0||offset>52)throw Error('Invalid analytics range');
  const end=new Date(now);end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()+1-offset*days);
  const start=new Date(end.getTime()-days*DAY),zero=()=>Object.fromEntries(kinds.map(k=>[k,0]));
  const daily=Array.from({length:days},(_,i)=>({date:new Date(start.getTime()+i*DAY).toISOString().slice(0,10),...zero()})),totals=zero(),chats=new Map(),tools=new Map(),skills=new Map();
  for(const row of db.prepare('SELECT e.*,c.title FROM analytics_events e JOIN analytics_chats c USING(task_id) WHERE at>=? AND at<? AND at<=? ORDER BY at').all(start.toISOString(),end.toISOString(),now.toISOString())){
   if(!kinds.includes(row.kind))continue;totals[row.kind]++;const day=daily.find(d=>d.date===row.at.slice(0,10));if(day)day[row.kind]++;
   if(!chats.has(row.task_id))chats.set(row.task_id,{id:row.task_id,title:row.title,...zero()});chats.get(row.task_id)[row.kind]++;
   const group=row.kind==='tools'?tools:row.kind==='skills'?skills:null;if(group)group.set(row.label,(group.get(row.label)??0)+1);
  }
  const rank=map=>[...map].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,20);
  return {days,offset,start:start.toISOString(),end:new Date(end.getTime()-1).toISOString(),totals,daily,topChats:[...chats.values()].sort((a,b)=>b.messages-a.messages||b.tools-a.tools).slice(0,50),tools:rank(tools),skills:rank(skills),coverage:'Recorded Muse Code activity on this device. Earlier history and trimmed activity may be incomplete. Tool and skill dates use the parent turn start; agent counts are observed activity entries, not billing. Meta AI website and Work activity are not included.'};
 }
 return {sync,read,deleteTask(id){db.prepare('DELETE FROM analytics_events WHERE task_id=?').run(id);db.prepare('DELETE FROM analytics_chats WHERE task_id=?').run(id);}};
}
