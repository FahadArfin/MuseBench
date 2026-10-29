// Small identity fields only. Never retain message, tool-output or question bodies.
export function workIdentity(value={}){
 const bounded=value=>typeof value==='string'?value.slice(0,200):null,pending=value.pending;
 return{run:bounded(value.runId),turn:bounded(value.rootTurnId??value.turnId),session:bounded(value.nativeSessionId??value.sessionId),pendingKind:bounded(pending?.kind),pendingId:bounded(pending?.userInputId??pending?.id),pendingRevision:Number.isSafeInteger(pending?.revision)?pending.revision:null,compaction:bounded(value.compaction?.commandId),steering:bounded(value.steering?.commandId),children:(Array.isArray(value.childReceipts)?value.childReceipts:[]).slice(-40).map(item=>[bounded(item?.commandId),bounded(item?.status)])};
}
export function workLabel(status,identity){
 if(status.cleanup==='unconfirmed'||['uncertain','error'].includes(status.status))return 'Needs attention';
 if(status.pending)return identity.pendingKind==='input'?'Needs your answer':identity.pendingKind==='approval'?'Needs approval':'Needs attention';
 if(['starting','submitting','connecting','checking-permissions'].includes(status.status))return 'Connecting';
 if(status.childrenBusy)return 'Sub-Agents working';
 return 'Working';
}
