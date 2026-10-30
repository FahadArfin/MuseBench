import {createDiscoveryOAuthStore} from '../../electron/discovery-oauth-store.mjs';
import {createDiscoveryOAuthFlow} from '../../electron/discovery-oauth-flow.mjs';
import {createDiscoveryOAuthCallback} from '../../electron/discovery-oauth-callback.mjs';
import {createDiscoveryOAuth} from '../../electron/discovery-oauth.mjs';
import {createDiscoveryMcpConfig} from '../../electron/discovery-mcp-config.mjs';
import {createRemoteNetwork} from '../../src/runtime/discovery-remote-network.mjs';
import {fakeProtection} from './discovery-oauth-store.mjs';

// Disposable fixtures alone permit their explicitly owned HTTP origins. Product
// main has neither this override nor a renderer-controlled network policy.
export async function oauthIntegration({dataDir,workspace,authority,resource,environment,extensionReview,appRoot=process.cwd(),executable=process.execPath,helperPath,protection,ownerSnapshot,now=Date.now,modules={}}={}){
 const createStore=modules.createDiscoveryOAuthStore??createDiscoveryOAuthStore,createFactory=modules.createDiscoveryMcpConfig??createDiscoveryMcpConfig,createFlow=modules.createDiscoveryOAuthFlow??createDiscoveryOAuthFlow,createService=modules.createDiscoveryOAuth??createDiscoveryOAuth,createCallback=modules.createDiscoveryOAuthCallback??createDiscoveryOAuthCallback,createNetwork=modules.createRemoteNetwork??createRemoteNetwork;
 const tokenProtection=protection??fakeProtection();const store=await createStore({dataDir,protection:tokenProtection,now});
 let oauth;const factory=createFactory({appRoot,executable,helperPath,environment,extensionReview,oauth:()=>oauth});
 const allowed=new Set([authority.origin,new URL(resource.url).origin]);
 const networkFactory=({url,limits})=>{if(!allowed.has(new URL(url).origin))throw Error('Fixture external request refused.');return createNetwork({url},{limits});};networkFactory.allowInsecureLoopback=true;
 const opened=[];oauth=createService({store,flow:createFlow({networkFactory,now}),callbackFactory:createCallback,resolveSource:factory.resolveAuthSource,getSourceSnapshot:factory.getAuthSourceSnapshot,ownerSnapshot,runtimeOwnerSnapshot:factory.runtimeOwnerSnapshot,stopSourceLeases:factory.stopSourceLeases,withIdleLease:factory.withIdleLease,openBrowser:async url=>opened.push(url),now});
 const inspect=async()=>{const result=await factory.inspect(workspace);return result.rows.find(row=>row.id==='global:fixture');};
 const enroll=async()=>{const row=await inspect(),taskId=ownerSnapshot().taskId;let state=await oauth.command({type:'prepare',taskId,sourceId:row.id,sourceRevision:row.revision,reviewedEndpoint:true});if(state.status==='issuer-review')state=await oauth.command({type:'selectIssuer',taskId,attemptId:state.attemptId,reviewRevision:state.reviewRevision,reviewed:true,issuerChoiceId:state.issuerChoices[0].id});if(state.status!=='review-required')throw Error('Fixture sign-in review unavailable.');state=await oauth.command({type:'begin',taskId,attemptId:state.attemptId,reviewRevision:state.reviewRevision,reviewed:true});if(state.status!=='waiting-browser')throw Error('Fixture browser authorization unavailable.');const response=await fetch(opened.at(-1),{redirect:'manual',signal:AbortSignal.timeout(3000)});await fetch(response.headers.get('location'),{signal:AbortSignal.timeout(3000)});for(let i=0;i<200;i++){state=await oauth.inspectSource({id:row.id,revision:row.revision});if(state.status==='ready')return inspect();if(!['exchanging','saving','waiting-browser'].includes(state.status))throw Error('Fixture authorization failed.');await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Fixture enrollment timed out.');};
 return{store,oauth,factory,inspect,enroll,opened,protection:tokenProtection,close:async()=>{await oauth.close();await store.close();}};
}
