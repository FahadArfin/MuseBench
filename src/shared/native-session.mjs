import {randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function restoreNativeSession(value){
 if(!value||!(value.transport==='msp'?typeof value.id==='string'&&value.id.length>0&&value.id.length<=200:uuid.test(value.id))||typeof value.root!=='string'||!value.root||!['ready','running','needs-recovery'].includes(value.status)||value.transport&&!['exec','msp'].includes(value.transport))return null;
 return{id:value.id,root:value.root,seeded:value.seeded===true,status:value.status==='running'?'needs-recovery':value.status,...(value.transport?{transport:value.transport}:{}),...(typeof value.fullAccess==='boolean'?{fullAccess:value.fullAccess}:{}),...(typeof value.workspaceTools==='boolean'?{workspaceTools:value.workspaceTools}:{})};
}
export function prepareNativeSession(value,root,connection={}){
 if(value&&value.root!==root)throw Error('This session belongs to another folder. Start a fresh session before continuing.');
 if(value&&(value.transport??'exec')!==(connection.transport??'exec'))throw Error('This session belongs to another transport. Start a fresh session before continuing.');
 if(connection.transport==='msp'&&(!connection.nativeSessionId||value&&value.id!==connection.nativeSessionId))throw Error('The connected native session changed. Recover the saved session before continuing.');
 if(value&&value.status!=='ready')throw Error('Open Session to continue the interrupted run or start fresh.');
 const session=value?{...value,status:'running'}:{id:connection.transport==='msp'?connection.nativeSessionId:randomUUID(),root,seeded:connection.transport==='msp'&&connection.sessionSeeded===true,status:'running',...(connection.transport?{transport:connection.transport,fullAccess:connection.fullAccess===true,workspaceTools:connection.workspaceTools===true}:{})};
 return{session,history:!session.seeded};
}
export function settleNativeSession(session,event,ownsTurn){
 if(!session)return null;
 const admitted=ownsTurn&&event.nativeSessionId===session.id;
 return{...session,seeded:session.seeded||admitted,status:admitted&&event.status==='completed'&&event.cleanup==='confirmed'?'ready':'needs-recovery'};
}
