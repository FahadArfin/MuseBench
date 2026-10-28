// Real SQLite/store workload, isolated from the user's profile; no model calls.
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHistoryStore} from '../src/controller/chat-history.mjs';
import {createExecutionLedger} from '../src/controller/execution-ledger.mjs';

const output=process.argv[2];
const root=await mkdtemp(path.join(tmpdir(),'muse-history-storage-'));
const db=new DatabaseSync(path.join(root,'history.sqlite'));let statements=0;
const measured=new Proxy(db,{get(target,key){if(key==='prepare')return sql=>{const stmt=target.prepare(sql);return new Proxy(stmt,{get(s,k){const v=s[k];return typeof v==='function'?(...args)=>{if(['run','get','all'].includes(k))statements++;return v.apply(s,args);}:v;}});};const v=target[key];return typeof v==='function'?v.bind(target):v;}});
const sample=(work,n=15)=>{const timings=[];for(let i=0;i<n;i++){const start=performance.now();work(i);timings.push(performance.now()-start);}timings.sort((a,b)=>a-b);return{medianMs:timings[Math.floor(n/2)],maxMs:timings.at(-1),samples:n};};
const message=(id,text)=>({id,role:'assistant',text,at:'2026-10-28T12:00:00Z'});
try{
 db.exec('PRAGMA journal_mode=WAL');const h=createHistoryStore(measured),ledger=createExecutionLedger(measured);
 const task={id:'sync',messages:Array.from({length:150},(_,i)=>message(String(i),'Retained message '+i))};h.sync(task,true);
 statements=0;const sync=sample(()=>h.sync(task));sync.statementsPerSample=statements/sync.samples;
 const large=Array.from({length:40000},(_,i)=>'keyword'+i).join(' ');h.put('stream',message('large',large));
 const streaming=sample(i=>h.put('stream',message('large',large+' appended'+i)),7);
 db.exec('BEGIN');for(let i=0;i<10000;i++)h.put('long',message(String(i),'long message '+i));
 const receipt=db.prepare('INSERT INTO execution_receipts(id,task_id,json) VALUES(?,?,?)');for(let i=0;i<100000;i++)receipt.run('r'+i,i<20?'selected':'other',JSON.stringify({id:'r'+i,phase:'settled',result:'completed',delivery:'shown'}));db.exec('COMMIT');
 const paging=sample(()=>h.page({taskId:'long',limit:20})),receipts=sample(()=>ledger.list('selected'));
 const page=h.page({taskId:'long',limit:20});if(page.total!==10000||page.messages.at(-1).id!=='9999'||ledger.list('selected')[0].id!=='r19'||h.search('stream','appended6')?.messageId!=='large')throw Error('Benchmark correctness failed');
 const report={at:new Date().toISOString(),node:process.version,platform:process.platform,workload:{windowMessages:150,longChatMessages:10000,receipts:100000,distinctStreamingTerms:40000,streamingCharacters:large.length},sync,streaming,paging,receipts,correctness:'passed'};
 if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{db.close();const target=path.resolve(root);if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('muse-history-storage-'))throw Error('Invalid benchmark cleanup path');await rm(target,{recursive:true,force:true,maxRetries:3});}
