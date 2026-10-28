const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):undefined;
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const count=value=>Number.isSafeInteger(value)&&value>=0;

/** A bounded, plain-text read model. It grants no authority to control or open paths. */
export function projectChildRead(read,target){
 const session=read?.session;
 if(session?.sessionId!==target.childSessionId||session.kind==='root'||
    session.parentSessionId!=null&&session.parentSessionId!==target.sessionId)throw Error('Child read identity did not match the observed parent.');
 const result={session:{sessionId:session.sessionId,kind:text(session.kind),status:text(session.status),modelId:text(session.modelId),providerId:text(session.providerId),workspaceRoot:text(session.workspaceRoot,2048)}};
 const h=read.history,mode=text(h?.mode)??'unknown';
 let source,snapshot;
 if(mode==='inline'&&Array.isArray(h.items))source=h.items;
 else if(['snapshot','anchoredSnapshot'].includes(mode)&&h?.snapshot?.schemaVersion===1&&typeof read.viewCursor==='string'&&h.snapshot.viewCursor===read.viewCursor&&Array.isArray(h.snapshot.state?.items)){
  snapshot=h.snapshot.state;source=snapshot.items;
 }
 const history={mode,available:!!source,items:[],shortened:false};result.history=history;
 if(!source)history.reason=mode==='none'?`Muse did not return activity${text(h?.noneReason)?' ('+text(h.noneReason)+')':''}.`:'This history format is unavailable in this viewer.';
 else{
  history.totalItems=source.length;
  let remaining=65536;const seen=new Set();
  for(let i=source.length-1;i>=Math.max(0,source.length-200)&&remaining>0;i--){
   const item=source[i];if(!identity(item?.itemId)||seen.has(item.itemId)||typeof item.kind!=='string')continue;
   seen.add(item.itemId);
   const raw=['userMessage','agentMessage'].includes(item.kind)?item.text:['toolCall','userShell'].includes(item.kind)?item.visibleOutput:item.fallbackText;
   const value=typeof raw==='string'?raw:'',body=value.slice(0,Math.min(8192,remaining));remaining-=body.length;
   const shortened=body.length<value.length||item.truncated===true||!!item.outputRef;
   history.shortened ||= shortened;
   history.items.push({itemId:item.itemId,kind:text(item.kind),status:text(item.status),tool:text(item.tool),text:body,shortened,...(typeof item.recordedAt==='string'&&Number.isFinite(Date.parse(item.recordedAt))?{recordedAt:new Date(item.recordedAt).toISOString()}: {})});
  }
  history.items.reverse();history.omittedItems=source.length-history.items.length;
 }
 const usage=snapshot?.tokenUsage;
 if(usage&&['promptTokens','outputTokens','totalTokens'].every(k=>count(usage[k])))result.tokens={promptTokens:usage.promptTokens,outputTokens:usage.outputTokens,totalTokens:usage.totalTokens};
 if(read.worktree&&typeof read.worktree==='object'){
  const worktree={};
  for(const key of ['worktreeRoot','baseCommit','headCommit','ownership','cleanupPolicy','cleanupState'])if(typeof read.worktree[key]==='string')worktree[key]=text(read.worktree[key],key==='worktreeRoot'?2048:200);
  if(typeof read.worktree.parentDirtyExcluded==='boolean')worktree.parentDirtyExcluded=read.worktree.parentDirtyExcluded;
  if(Object.keys(worktree).length)result.worktree=worktree;
 }
 return result;
}
