import type {Task} from '../shared/types';
import {computeFileDiff} from '../shared/file-diff.mjs';
import {validateFileReviewInspection,validateFileReviewRead,type FileReviewInspection,type FileReviewView} from '../shared/file-review.mjs';

// The browser preview has sample source only; it never reads local disk or
// invents a real source history. Production uses the controller snapshot store.
export function createPreviewFileReview(getTask:()=>Task|null){
 const revision='e'.repeat(64);
 const inspect=async(value:FileReviewInspection):Promise<FileReviewView>=>{
  const input=validateFileReviewInspection(value),task=getTask();if(task?.id!==input.taskId)throw Error('The selected chat changed.');
  const run=input.scope==='run'?task.runs?.find(run=>run.promptId===input.runId||run.id===input.runId):null;
  if(input.scope==='run'&&!run)return{...input,revision,status:'unavailable',reason:'No source capture is retained for this sample prompt.',files:[]};
  return{...input,revision,status:'complete',files:task.changes.map(file=>({path:file.path,status:file.status,binary:!!file.binary,available:!file.binary&&!file.omitted,reason:file.omitted?'This sample has no retained text.':undefined,beforeHash:file.beforeHash??(file.status==='added'?null:'a'.repeat(64)),afterHash:file.afterHash??(file.status==='deleted'?null:'b'.repeat(64)),beforeSize:file.before.length,afterSize:file.after.length,countsKnown:!file.omitted,additions:file.additions,deletions:file.deletions,history:run?[{runId:run.promptId,capturedAt:run.startedAt,status:file.status}]:[]}))};
 };
 return{inspectFileReview:inspect,readFileReview:async(value:unknown)=>{
  const input=validateFileReviewRead(value),view=await inspect({taskId:input.taskId,scope:input.scope,...(input.scope==='run'?{runId:input.runId}:{})});
  if(input.revision!==view.revision)throw Error('The comparison changed. Refresh the file review.');
  const file=getTask()?.changes.find(file=>file.path===input.path);if(!file||!view.files.some(item=>item.path===file.path))throw Error('This file is not in the selected review.');
  if(file.binary||file.omitted)return{path:input.path,revision,status:'unavailable' as const,reason:file.binary?'Binary file. Text comparison is unavailable.':'This sample has no retained text.',rows:[],totalRows:0,additions:0,deletions:0,approximate:false as const};
  const result=computeFileDiff(file.before,file.after),offset=input.cursor?Number(input.cursor):0,limit=input.limit??200;
  if(!Number.isSafeInteger(offset)||offset<0||offset>result.rows.length||input.cursor!==undefined&&String(offset)!==input.cursor)throw Error('Invalid sample comparison page.');
  const rows=result.rows.slice(offset,offset+limit),next=offset+rows.length;
  return{path:input.path,revision,status:'complete' as const,rows,...(next<result.rows.length?{nextCursor:String(next)}:{}),totalRows:result.rows.length,additions:result.additions,deletions:result.deletions,approximate:false as const};
 }};
}
