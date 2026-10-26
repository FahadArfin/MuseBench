import {randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function restoreNativeSession(value){
 if(!value||!uuid.test(value.id)||typeof value.root!=='string'||!value.root||!['ready','running','needs-recovery'].includes(value.status))return null;
 return{id:value.id,root:value.root,seeded:value.seeded===true,status:value.status==='running'?'needs-recovery':value.status};
}
export function prepareNativeSession(value,root){
 if(value&&value.root!==root)throw Error('This session belongs to another folder. Start a fresh session before continuing.');
 if(value&&value.status!=='ready')throw Error('Open Session to continue the interrupted run or start fresh.');
 const session=value?{...value,status:'running'}:{id:randomUUID(),root,seeded:false,status:'running'};
 return{session,history:!session.seeded};
}
export function settleNativeSession(session,event,ownsTurn){
 if(!session)return null;
 const admitted=ownsTurn&&event.nativeSessionId===session.id;
 return{...session,seeded:session.seeded||admitted,status:admitted&&event.status==='completed'&&event.cleanup==='confirmed'?'ready':'needs-recovery'};
}
