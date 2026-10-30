const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
/** Stored links are bounded metadata, never authority to load or drive a session. */
export function restoreChatRelation(value,taskId){
 if(!value||!['side','fork'].includes(value.kind)||!text(value.parentTaskId,200)||value.parentTaskId===taskId||!text(value.parentTitle,100)||!text(value.createdAt,80)||!Number.isFinite(Date.parse(value.createdAt))||!(value.kind==='side'?value.context==='fresh':['native','retained'].includes(value.context))||value.messageId!==undefined&&!text(value.messageId,200))return null;
 return{kind:value.kind,parentTaskId:value.parentTaskId,parentTitle:value.parentTitle,context:value.context,createdAt:value.createdAt,...(value.messageId?{messageId:value.messageId}:{})};
}
/** Side ancestry stops at its independent main; fork provenance is a direct backlink. */
export function relationParent(task,tasks){
 const relation=restoreChatRelation(task.chatRelation,task.id);if(!relation)return null;
 const byId=new Map(tasks.map(t=>[t.id,t])),seen=new Set([task.id]),first=byId.get(relation.parentTaskId);let current=first;
 for(let i=0;i<=tasks.length;i++){
  if(!current||current.archived||current.projectId!==task.projectId||seen.has(current.id))return null;
  if(relation.kind==='fork')return first;
  seen.add(current.id);
  const ancestor=restoreChatRelation(current.chatRelation,current.id);if(ancestor?.kind!=='side')return first;
  current=byId.get(ancestor.parentTaskId);
 }
 return null;
}
/** Sides created from sides are siblings; a broken ancestry promotes the source. */
export function mainChat(task,tasks){let current=task;const seen=new Set();while(current.chatRelation?.kind==='side'&&!seen.has(current.id)){seen.add(current.id);const parent=relationParent(current,tasks);if(!parent)break;current=parent;}return current;}
