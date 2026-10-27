export const CHILD_ACTION_LABELS=Object.freeze({sendMessage:'Send message',followupTask:'Follow-up task',interrupt:'Interrupt',stop:'Stop',resume:'Resume',reopen:'Reopen',close:'Close child',readResult:'Read result',retry:'Retry attempt',skip:'Skip attempt'});
// Unresolved recovery/future states keep the workspace busy until reconciled.
export const childWorking=item=>item?.status==='inProgress'&&!(item.kind==='subagent'&&['resultReady','closed'].includes(item.controlStatus));
export function childActions(item){
 if(item?.kind==='workflowChild'){if(item.terminal||['terminal','cancelled','failed','completed'].includes(item.status))return ['retry'];return ['scheduled','started','running','starting','pending'].includes(item.status)?['skip']:[];}
 if(item?.kind!=='subagent')return[];
 const workflowOwned=typeof item.workflowRunId==='string'&&item.workflowRunId.length>0;
 switch(item.controlStatus){
  case 'running':return item.status==='inProgress'?['sendMessage','interrupt','stop']:[];
  case 'accepted':case 'starting':return item.status==='inProgress'?['stop']:[];
  // Completion is not a paused/recoverable state. Workflow retries use their own attempt controls.
  case 'resultReady':return workflowOwned?['readResult','close']:['followupTask','readResult','close'];
  case 'closed':return workflowOwned?['readResult']:['reopen','readResult'];
  default:return [];
 }
}
