import {recentSourceRecord,selectRecentContext} from '../shared/recent-context.mjs';
import type {RecentCapsule} from '../shared/recent-context.mjs';
import type {Task} from '../shared/types';
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export async function preparePreviewRecentContext(task:Task,count=4):Promise<RecentCapsule>{
 const sessionId=task.nativeSession?.id,compaction=task.contextCompactions?.slice().reverse().find(row=>row.sessionId===sessionId&&row.status==='compacted');if(!sessionId||!compaction)throw Error('Recent excerpts require an observed completed compaction.');
 const selected=selectRecentContext(task.messages,count,task.runs);if(!selected.entries.length)throw Error('No local text available.');
 const sources=await Promise.all(selected.sourceIds.map(async id=>({id,hash:await hash(recentSourceRecord(task.messages.find(m=>m.id===id)!,task.runs))})));
 const capsule={version:1 as const,projectId:task.projectId,taskId:task.id,sessionId,compaction:{itemId:compaction.itemId,revision:compaction.revision},count,section:selected.section,sources,sourceDigest:await hash(sources)};
 return{...capsule,digest:await hash(capsule)};
}
export async function validatePreviewRecentContext(task:Task,capsule:RecentCapsule){
 const compaction=task.contextCompactions?.slice().reverse().find(row=>row.sessionId===task.nativeSession?.id&&row.status==='compacted');
 if(task.id!==capsule.taskId||task.projectId!==capsule.projectId||task.nativeSession?.id!==capsule.sessionId||compaction?.itemId!==capsule.compaction.itemId||compaction.revision!==capsule.compaction.revision)throw Error('Recent excerpts changed ownership or compaction. Prepare and review them again.');
 for(const source of capsule.sources){const records=task.messages.filter(m=>m.id===source.id);if(records.length!==1||await hash(recentSourceRecord(records[0],task.runs))!==source.hash)throw Error('Recent excerpts source changed. Prepare and review them again.');}
 return capsule;
}
export async function stagedPreviewRecentContext(task?:Task|null){const saved=task?.recentContext;if(!saved?.stagedDigest)return null;if(!task||saved.prepared?.digest!==saved.stagedDigest)throw Error('Recent excerpts changed. Prepare and review them again.');return validatePreviewRecentContext(task,saved.prepared);}
export function consumePreviewRecentContext(task:Task){if(task.recentContext){task.recentContext.stagedDigest=null;task.recentContext.prepared=null;}}
