import {createHash} from 'node:crypto';
import {computeFileDiff,sourceLineCount} from '../shared/file-diff.mjs';
const TEXT_LIMIT=1024*1024,FILE_LIMIT=128*1024,MAX_DIFFS=100;
const hash=value=>createHash('sha256').update(value).digest('hex');
const token=file=>hash(JSON.stringify([file.path,file.beforeHash,file.afterHash]));
const own=(files,name)=>Object.hasOwn(files??{},name)?files[name]:undefined;
function baseline(snapshot){
 let bytes=0;const files=Object.create(null);
 for(const [name,file] of Object.entries(snapshot.files)){const size=Buffer.byteLength(file.text??''),keep=!file.binary&&size<=FILE_LIMIT&&bytes+size<=TEXT_LIMIT;if(keep)bytes+=size;files[name]={hash:file.hash,binary:!!file.binary,...(keep?{text:file.text??''}:{})};}
 return files;
}
export function createRunChangeStore(db){
 db.exec('CREATE TABLE IF NOT EXISTS run_changes(task_id TEXT NOT NULL,run_id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(task_id,run_id))');
 const get=(taskId,runId)=>{const row=db.prepare('SELECT json FROM run_changes WHERE task_id=? AND run_id=?').get(taskId,runId);return row?JSON.parse(row.json):null;};
 const put=value=>db.prepare('INSERT INTO run_changes(task_id,run_id,json) VALUES(?,?,?) ON CONFLICT(task_id,run_id) DO UPDATE SET json=excluded.json').run(value.taskId,value.runId,JSON.stringify(value));
 const unavailable=(taskId,runId,reason)=>{const old=get(taskId,runId);if(old)put({taskId,runId,status:'unavailable',createdAt:old.createdAt,reason:String(reason).slice(0,500)});};
 for(const row of db.prepare('SELECT task_id,run_id,json FROM run_changes').all())if(JSON.parse(row.json).status==='pending')unavailable(row.task_id,row.run_id,'The app restarted before the after-snapshot was confirmed.');
 const read=(taskId,runId,currentFiles,currentRoot)=>{
  const saved=get(taskId,runId);if(!saved)return{taskId,runId,status:'unavailable',files:[],omittedFiles:0,reason:'No source capture is available for this run.'};
  if(saved.status!=='complete')return{taskId,runId,status:saved.status,files:[],omittedFiles:0,reason:saved.reason??'Source changes are captured after the run ends.'};
  if(currentRoot!==saved.root)return{taskId,runId,status:'unavailable',files:[],omittedFiles:0,reason:'This capture belongs to a different project folder. Return the chat to its original project to review it.'};
  let invalidated=false;const files=saved.files.map(file=>{const stale=(own(currentFiles,file.path)?.hash??null)!==file.afterHash;if(stale&&saved.reviewed?.[file.path]){delete saved.reviewed[file.path];invalidated=true;}return{...file,stale,reviewed:!stale&&saved.reviewed?.[file.path]===token(file)};});if(invalidated)put(saved);
  return{taskId,runId,status:'complete',revision:saved.revision,createdAt:saved.createdAt,capturedAt:saved.capturedAt,files,omittedFiles:saved.omittedFiles};
 };
 const selected=(input,currentFiles,currentRoot)=>{const view=read(input.taskId,input.runId,currentFiles,currentRoot);if(view.status!=='complete'||view.revision!==input.revision)throw Error(view.reason??'The captured review changed. Refresh this run.');const file=view.files.find(file=>file.path===input.path);if(!file)throw Error('Captured file unavailable.');if(file.stale)throw Error('This file changed after the captured run. Refresh and review the current changes.');return file;};
 return{
  begin({taskId,runId,root,snapshot}){put({taskId,runId,root,status:'pending',createdAt:new Date().toISOString(),baseline:baseline(snapshot)});db.prepare('DELETE FROM run_changes WHERE task_id=? AND rowid NOT IN (SELECT rowid FROM run_changes WHERE task_id=? ORDER BY rowid DESC LIMIT 20)').run(taskId,taskId);db.exec('DELETE FROM run_changes WHERE rowid NOT IN (SELECT rowid FROM run_changes ORDER BY rowid DESC LIMIT 100)');},
  finish(taskId,runId,snapshot,currentRoot){
   const saved=get(taskId,runId);if(saved?.status!=='pending')return;if(currentRoot!==saved.root){unavailable(taskId,runId,'The project folder changed before capture completed.');return;}
   const before=saved.baseline,after=snapshot.files,names=[...new Set([...Object.keys(before),...Object.keys(after)])].sort().filter(name=>own(before,name)?.hash!==own(after,name)?.hash);let bytes=0;
   const files=names.slice(0,MAX_DIFFS).map(name=>{const a=own(before,name),b=own(after,name),binary=!!(a?.binary||b?.binary),size=Buffer.byteLength(a?.text??'')+Buffer.byteLength(b?.text??''),omitted=!binary&&(a&&a.text===undefined||b&&Buffer.byteLength(b.text??'')>FILE_LIMIT||size+bytes>TEXT_LIMIT);if(!omitted&&!binary)bytes+=size;const left=omitted||binary?'':a?.text??'',right=omitted||binary?'':b?.text??'',diff=computeFileDiff(left,right);return{path:name,status:!a?'added':!b?'deleted':'modified',beforeHash:a?.hash??null,afterHash:b?.hash??null,before:left,after:right,binary,omitted:!!omitted,additions:diff.additions,deletions:diff.deletions,approximate:diff.approximate};});
   const revision=hash(JSON.stringify(names.map(name=>[name,own(before,name)?.hash??null,own(after,name)?.hash??null])));put({taskId,runId,root:saved.root,status:'complete',createdAt:saved.createdAt,capturedAt:new Date().toISOString(),revision,files,omittedFiles:Math.max(0,names.length-MAX_DIFFS),reviewed:{}});
  },
  unavailable,read,
  pending:(taskId,runId)=>get(taskId,runId)?.status==='pending',
  review(input,currentFiles,currentRoot){const file=selected(input,currentFiles,currentRoot),saved=get(input.taskId,input.runId);if(input.reviewed)saved.reviewed[file.path]=token(file);else delete saved.reviewed[file.path];put(saved);},
  feedback(input,currentFiles,currentRoot){const file=selected(input,currentFiles,currentRoot);if(file.omitted||file.binary||!(input.side==='before'?file.beforeHash:file.afterHash))throw Error('Feedback requires captured text on this side.');const text=file[input.side],lines=sourceLineCount(text);if(input.end>lines)throw Error('Choose lines within the captured file.');return{text:`Review feedback for run ${input.runId}\nFile: ${JSON.stringify(file.path)} · ${input.side} lines ${input.start}–${input.end}\nCaptured SHA-256: ${input.side==='before'?file.beforeHash:file.afterHash}\n\n${input.note}`};},
  deleteTask(taskId){db.prepare('DELETE FROM run_changes WHERE task_id=?').run(taskId);}
 };
}
