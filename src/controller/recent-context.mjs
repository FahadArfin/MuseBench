import {createHash} from 'node:crypto';
import {selectRecentContext,recentSourceRecord,validRecentSection,RECENT_CONTEXT_COUNTS} from '../shared/recent-context.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function recentSessionId(task,runtime={}){
 // A transport connection ID is not a durable native conversation ID.
 return runtime.transport==='msp'?(runtime.nativeSessionId??task?.nativeSession?.id):task?.nativeSession?.id;
}
export function latestRecentCompaction(task,sessionId){return task?.contextCompactions?.findLast(row=>row.status==='compacted'&&row.sessionId===sessionId)??null;}
export function restoreRecentCapsule(value){
 if(!value||value.version!==1||!['projectId','taskId','sessionId'].every(k=>id(value[k]))||!id(value.compaction?.itemId)||!Number.isSafeInteger(value.compaction.revision)||value.compaction.revision<1||!RECENT_CONTEXT_COUNTS.includes(value.count)||!validRecentSection(value.section)||!Array.isArray(value.sources)||value.sources.length<1||value.sources.length>8||!value.sources.every(s=>s&&id(s.id)&&digest(s.hash))||new Set(value.sources.map(s=>s.id)).size!==value.sources.length||!digest(value.sourceDigest)||!digest(value.digest))return null;
 const capsule={version:1,projectId:value.projectId,taskId:value.taskId,sessionId:value.sessionId,compaction:{itemId:value.compaction.itemId,revision:value.compaction.revision},count:value.count,section:value.section,sources:value.sources.map(({id,hash})=>({id,hash})),sourceDigest:value.sourceDigest};
 if(hash(capsule.sources)!==capsule.sourceDigest||hash(capsule)!==value.digest)return null;
 return{...capsule,digest:value.digest};
}
export function restoreRecentContext(value){
 const prepared=restoreRecentCapsule(value?.prepared);
 // A damaged staged capsule is a review error, not permission to silently omit
 // context. Retain only its bounded handle so Send fails until explicit removal.
 return{count:RECENT_CONTEXT_COUNTS.includes(value?.count)?value.count:4,autoPrepare:value?.autoPrepare===true,prepared,stagedDigest:digest(value?.stagedDigest)?value.stagedDigest:null};
}
export function prepareRecentContext(task,sessionId,count=4){
 const compaction=latestRecentCompaction(task,sessionId);if(!compaction)throw Error('Recent excerpts require an observed completed compaction in this native session.');
 const selected=selectRecentContext(task.messages,count,task.runs);if(!selected.entries.length)throw Error('No saved local user or assistant text is available.');
 const sources=selected.sourceIds.map(id=>({id,hash:hash(recentSourceRecord(task.messages.find(m=>m.id===id),task.runs))}));
 const capsule={version:1,projectId:task.projectId,taskId:task.id,sessionId,compaction:{itemId:compaction.itemId,revision:compaction.revision},count,section:selected.section,sources,sourceDigest:hash(sources)};
 return{...capsule,digest:hash(capsule)};
}
export function validateRecentContext(value,task,sessionId){
 const capsule=restoreRecentCapsule(value),compaction=latestRecentCompaction(task,sessionId);
 if(!capsule||capsule.taskId!==task.id||capsule.projectId!==task.projectId||capsule.sessionId!==sessionId||!compaction||capsule.compaction.itemId!==compaction.itemId||capsule.compaction.revision!==compaction.revision)throw Error('Recent excerpts changed ownership or compaction. Prepare and review them again.');
 for(const source of capsule.sources){const messages=task.messages.filter(m=>m.id===source.id);if(messages.length!==1||hash(recentSourceRecord(messages[0],task.runs))!==source.hash)throw Error('Recent excerpts source text or outcome changed. Prepare and review them again.');}
 return capsule;
}
export function stagedRecentContext(task,sessionId){
 if(!task?.recentContext?.stagedDigest)return null;
 if(task.recentContext.stagedDigest!==task.recentContext.prepared?.digest)throw Error('Recent excerpts changed. Prepare and review them again.');
 return validateRecentContext(task.recentContext.prepared,task,sessionId);
}
export function consumeRecentContext(task,capsule){if(capsule&&task.recentContext?.stagedDigest===capsule.digest){task.recentContext.stagedDigest=null;task.recentContext.prepared=null;}}
export function restageRecentContext(task,capsule){if(capsule&&!task.recentContext?.stagedDigest){task.recentContext={...restoreRecentContext(task.recentContext),prepared:capsule,stagedDigest:capsule.digest};}}
