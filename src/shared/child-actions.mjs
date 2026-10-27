export const CHILD_ACTION_LABELS=Object.freeze({sendMessage:'Send message',followupTask:'Follow-up task',interrupt:'Interrupt',stop:'Stop',resume:'Resume',reopen:'Reopen',close:'Close child',readResult:'Read result',retry:'Retry attempt',skip:'Skip attempt'});
// A result-ready child remains open (generic inProgress) but is no longer working.
export const childWorking=item=>item?.status==='inProgress'&&!(item.kind==='subagent'&&['resultReady','closed'].includes(item.controlStatus));
export function childActions(item){
 if(item?.kind==='workflowChild'){if(item.terminal||['terminal','cancelled','failed','completed'].includes(item.status))return ['retry'];return ['scheduled','running','starting','pending'].includes(item.status)?['skip']:[];}
 if(item?.kind!=='subagent')return[];
 switch(item.controlStatus){case 'running':return ['sendMessage','interrupt','stop'];case 'accepted':case 'starting':return ['stop'];case 'resultReady':return ['followupTask','resume','readResult','close'];case 'closed':return ['reopen','readResult'];default:return [];}
}
