const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
/** Stored links are bounded metadata, never authority to load or drive a session. */
export function restoreChatRelation(value,taskId){
 if(!value||!['side','fork'].includes(value.kind)||!text(value.parentTaskId,200)||value.parentTaskId===taskId||!text(value.parentTitle,100)||!text(value.createdAt,80)||!Number.isFinite(Date.parse(value.createdAt))||!(value.kind==='side'?value.context==='fresh':['native','retained'].includes(value.context))||value.messageId!==undefined&&!text(value.messageId,200))return null;
 return{kind:value.kind,parentTaskId:value.parentTaskId,parentTitle:value.parentTitle,context:value.context,createdAt:value.createdAt,...(value.messageId?{messageId:value.messageId}:{})};
}
/** Only available same-project acyclic links are navigable/nestable. Orphans survive. */
export function relationParent(task,tasks){
 const byId=new Map(tasks.map(t=>[t.id,t])),seen=new Set([task.id]);let current=task,first=null;
 for(let i=0;i<=tasks.length;i++){
  const relation=restoreChatRelation(current.chatRelation,current.id);if(!relation)return current===task?null:first;
  const parent=byId.get(relation.parentTaskId);if(!parent||parent.archived||parent.projectId!==task.projectId||seen.has(parent.id))return null;
  first??=parent;seen.add(parent.id);current=parent;
 }
 return null;
}
/** Sides created from sides are siblings; a broken ancestry promotes the source. */
export function mainChat(task,tasks){let current=task;const seen=new Set();while(current.chatRelation?.kind==='side'&&!seen.has(current.id)){seen.add(current.id);const parent=relationParent(current,tasks);if(!parent)break;current=parent;}return current;}
