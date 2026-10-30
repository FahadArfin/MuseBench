import {randomUUID} from 'node:crypto';
import {normalizeWorkspaceToolset} from './workspace-analysis.mjs';
import {discoveryIdentity,sameDiscovery} from './tool-discovery.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function restoreNativeSession(value){
 if(!value||!(value.transport==='msp'?typeof value.id==='string'&&value.id.length>0&&value.id.length<=200:uuid.test(value.id))||typeof value.root!=='string'||!value.root||!['ready','running','needs-recovery'].includes(value.status)||value.transport&&!['exec','msp'].includes(value.transport))return null;
 const selection=value.workspaceToolset!==undefined?value.workspaceToolset:typeof value.unsupportedWorkspaceToolset==='string'?value.unsupportedWorkspaceToolset:undefined;
 let unsupported=value.unsupportedWorkspaceToolset!==undefined&&typeof value.unsupportedWorkspaceToolset!=='string';
 if(selection!==undefined){try{normalizeWorkspaceToolset(selection);if(value.transport!=='msp'||!value.workspaceTools)unsupported=true;}catch{unsupported=true;}}
 // Keep the conversation identity even when a newer/invalid configuration cannot
 // be resumed. Persist a bounded recovery marker instead of silently starting over.
 const marker=typeof selection==='string'&&selection.length>0&&selection.length<=200?selection:true;
 let discovery,unsupportedDiscovery=value.unsupportedToolDiscovery!==undefined;
 if(value.toolDiscovery!==undefined){try{discovery=discoveryIdentity(value.toolDiscovery);if(value.transport!=='msp')unsupportedDiscovery=true;}catch{unsupportedDiscovery=true;}}
 return{id:value.id,root:value.root,seeded:value.seeded===true,status:unsupported||unsupportedDiscovery||value.status==='running'?'needs-recovery':value.status,...(value.transport?{transport:value.transport}:{}),...(typeof value.fullAccess==='boolean'?{fullAccess:value.fullAccess}:{}),...(typeof value.workspaceTools==='boolean'?{workspaceTools:value.workspaceTools}:{}),...(unsupported?{unsupportedWorkspaceToolset:marker}:selection?{workspaceToolset:selection}:{}),...(unsupportedDiscovery?{unsupportedToolDiscovery:true}:discovery?{toolDiscovery:discovery}:{})};
}
export function prepareNativeSession(value,root,connection={}){
 if(value?.unsupportedToolDiscovery)throw Error('This saved session uses unsupported on-demand tools. Update MuseBench or explicitly start a fresh session.');
 if(value?.toolDiscovery&&!sameDiscovery(value.toolDiscovery,connection.toolDiscovery))throw Error('Review the saved on-demand sources again before continuing this native session.');
 if(value&&!value.toolDiscovery&&connection.toolDiscovery?.sources?.some(row=>row.authBindingRevision!==undefined))throw Error('Start a fresh session before adding signed-in on-demand sources.');
 if(value?.unsupportedWorkspaceToolset)throw Error('This saved session uses an unsupported workspace tool set. Update MuseBench or explicitly start a fresh session.');
 if(value&&value.root!==root)throw Error('This session belongs to another folder. Start a fresh session before continuing.');
 if(value&&(value.transport??'exec')!==(connection.transport??'exec'))throw Error('This session belongs to another transport. Start a fresh session before continuing.');
 if(connection.transport==='msp'&&(!connection.nativeSessionId||value&&value.id!==connection.nativeSessionId))throw Error('The connected native session changed. Recover the saved session before continuing.');
 if(value&&value.status!=='ready')throw Error('Open Session to continue the interrupted run or start fresh.');
 const session=value?{...value,status:'running'}:{id:connection.transport==='msp'?connection.nativeSessionId:randomUUID(),root,seeded:connection.transport==='msp'&&connection.sessionSeeded===true,status:'running',...(connection.transport?{transport:connection.transport,fullAccess:connection.fullAccess===true,workspaceTools:connection.workspaceTools===true,...(connection.transport==='msp'&&connection.workspaceTools&&connection.workspaceToolset?{workspaceToolset:normalizeWorkspaceToolset(connection.workspaceToolset)}:{})}:{})};
 if(!value&&connection.toolDiscovery)session.toolDiscovery=discoveryIdentity(connection.toolDiscovery);
 return{session,history:!session.seeded};
}
export function settleNativeSession(session,event,ownsTurn){
 if(!session)return null;
 const admitted=ownsTurn&&event.nativeSessionId===session.id;
 return{...session,seeded:session.seeded||admitted,status:admitted&&event.status==='completed'&&event.cleanup==='confirmed'?'ready':'needs-recovery'};
}
