import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {promises as fs,createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {computeFileDiff} from '../shared/file-diff.mjs';
import {createFileReviewCacheCollector,removeReviewDirectory} from './file-review-cache.mjs';

const own=(files,name)=>Object.hasOwn(files??{},name)?files[name]:null;
const readable=file=>!file||!file.binary&&(file.object===file.hash||typeof file.text==='string');
export function describeReviewFiles({before,after,changedOnly=false,history=[]}){
 const histories=new Map();for(const capture of history)for(const file of capture.files){const values=histories.get(file.path)??[];values.push({runId:capture.runId,capturedAt:capture.capturedAt,status:file.status});histories.set(file.path,values);}
 return[...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(name=>{
  const left=own(before,name),right=own(after,name),same=left?.hash===right?.hash;if(changedOnly&&same)return[];
  const binary=!!(left?.binary||right?.binary),available=!binary&&readable(left)&&readable(right);let countsKnown=same,additions=same?0:undefined,deletions=same?0:undefined;
  if(!same&&available&&(!left||typeof left.text==='string')&&(!right||typeof right.text==='string')){const diff=computeFileDiff(left?.text??'',right?.text??'');if(!diff.approximate){countsKnown=true;additions=diff.additions;deletions=diff.deletions;}}
  return[{path:name,status:!left?'added':!right?'deleted':same?'unchanged':'modified',beforeHash:left?.hash??null,afterHash:right?.hash??null,beforeSize:left?.size,afterSize:right?.size,binary,available,...(!available?{reason:binary?'Binary text comparison is unavailable.':'This older capture did not retain the file text.'}:{}),history:histories.get(name)??[],countsKnown,...(countsKnown?{additions,deletions}:{})}];
 });
}

/** Build comparisons on demand in a worker; page application-owned JSONL only. */
export function createFileReviewPager({content,directory}){
 directory=path.resolve(directory);const secret=randomBytes(32),jobs=new Map(),collector=createFileReviewCacheCollector({directory});let closed=false,initialized,cleanupTimer,tail=Promise.resolve();
 const init=()=>initialized??=(async()=>{await fs.mkdir(directory,{recursive:true});if((await fs.lstat(directory)).isSymbolicLink()||path.resolve(await fs.realpath(directory))!==directory)throw Error('Invalid review storage.');})();
 const maintainCache=async()=>{try{await init();if(closed)return;const result=await collector.collect();if(!closed&&!result.done&&!result.skipped){cleanupTimer=setTimeout(()=>void maintainCache(),100);cleanupTimer.unref?.();}}catch{}};
 void maintainCache();
 const mac=value=>createHmac('sha256',secret).update(value).digest('hex');
 const token=(identity,row)=>`${row}.${mac(identity+':'+row)}`;
 const offset=(identity,cursor)=>{if(cursor===undefined)return 0;const match=/^(\d{1,12})\.([a-f0-9]{64})$/.exec(cursor);if(!match||!timingSafeEqual(Buffer.from(match[2]),Buffer.from(mac(identity+':'+match[1]))))throw Error('Invalid or expired review page. Refresh the file.');return Number(match[1]);};
 async function prepare(job,left,right){
  await init();if(closed)throw Error('File review closed.');await collector.collect();job.directory=path.join(directory,`comparison-${process.pid}-${randomUUID()}`);await fs.mkdir(job.directory);
  for(const [name,file] of [['before',left],['after',right]]){const target=path.join(job.directory,name);if(file)await content.copy(file,target);else await fs.writeFile(target,'',{flag:'wx'});}
  if(closed)throw Error('File review closed.');
  return new Promise((resolve,reject)=>{const worker=job.worker=new Worker(new URL('./file-review-worker.mjs',import.meta.url),{workerData:{directory:job.directory,equal:left?.hash===right?.hash},resourceLimits:{maxOldGenerationSizeMb:256}});let settled=false;worker.once('message',message=>{settled=true;if(message.error)reject(Error(message.error));else resolve(message.result);});worker.once('error',reject);worker.once('exit',code=>{job.worker=null;if(!settled)reject(Error(`Text comparison worker stopped (${code}).`));});});
 }
 async function prune(){for(const [key,job] of jobs){if(job.users||job.worker&&!job.failed||!job.failed&&jobs.size<=8||jobs.get(key)!==job)continue;jobs.delete(key);await job.promise.catch(()=>{});if(job.directory)await removeReviewDirectory(directory,job.directory).catch(()=>false);}}
 return{
  async read({left,right,path:relative,revision,cursor,limit=200}){
   if(closed)throw Error('File review closed.');if(!readable(left)||!readable(right)||left?.binary||right?.binary)return{path:relative,revision,status:'unavailable',reason:'Captured text is unavailable for this file.',rows:[],totalRows:0,additions:0,deletions:0,approximate:false};
   const key=createHash('sha256').update(JSON.stringify([left?.hash??null,right?.hash??null])).digest('hex'),identity=JSON.stringify([revision,relative,key]),start=offset(identity,cursor);let job=jobs.get(key);
   if(!job){if(jobs.size>=16&&[...jobs.values()].filter(value=>value.users).length>=16)throw Error('Several file comparisons are pending. Wait for one to finish.');job={users:0};jobs.set(key,job);job.promise=tail.then(()=>prepare(job,left,right)).catch(error=>{job.failed=true;throw error;});tail=job.promise.catch(()=>{});}
   job.users++;
   try{
    let result;try{result=await job.promise;}catch(error){return{path:relative,revision,status:'unavailable',reason:String(error.message).slice(0,500),rows:[],totalRows:0,additions:0,deletions:0,approximate:false};}
    if(start>result.totalRows)throw Error('Invalid review page.');const checkpoint=result.checkpoints[Math.floor(start/128)]??{row:0,offset:0},stream=createReadStream(path.join(job.directory,'rows'),{start:checkpoint.offset}),lines=createInterface({input:stream,crlfDelay:Infinity});let at=checkpoint.row,bytes=0;const rows=[];
    try{for await(const line of lines){if(at++<start)continue;const size=Buffer.byteLength(line);if(rows.length&&(rows.length>=Math.min(limit,200)||bytes+size>256*1024))break;rows.push(JSON.parse(line));bytes+=size;}}finally{lines.close();stream.destroy();}
    const next=start+rows.length;return{path:relative,revision,status:'complete',rows,...(next<result.totalRows?{nextCursor:token(identity,next)}:{}),totalRows:result.totalRows,additions:result.additions,deletions:result.deletions,approximate:false};
   }finally{job.users--;await prune();}
  },
  async close(){closed=true;clearTimeout(cleanupTimer);for(const job of jobs.values())job.worker?.postMessage('cancel');await tail;await initialized?.catch(()=>{});await collector.close();for(const job of jobs.values())if(job.directory)await removeReviewDirectory(directory,job.directory).catch(()=>false);jobs.clear();}
 };
}
