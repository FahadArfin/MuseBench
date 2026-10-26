import {access,realpath,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute} from 'node:path';
import {TARGET,compatibility} from './compatibility.mjs';
import {MuseSessionAdapter} from './session-adapter.mjs';

async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Operation timed out')),ms))]);}finally{clearTimeout(timer);}}
const unavailable=(reason,extra={})=>({available:false,liveVerified:false,reason,...extra});
/** Future integration seam. The caller must inject a reviewed, already-installed
 * official SDK and an explicitly selected native binary. This module imports no
 * package and never installs, authenticates, reads secrets or inherits process.env.
 * Calling with allowHostStart=true CAN launch the supplied binary; do not treat
 * this code as an authorization mechanism. It was only tested with a fake SDK.
 */
export async function openMuseHost({sdk,sdkVersion,museBin,workspaceRoot,environment,allowHostStart=false,timeoutMs=10000}={}){
 if(!allowHostStart)return unavailable('host-start-not-authorized');
 if(sdkVersion!==TARGET.sdkVersion)return unavailable('sdk-version-mismatch');
 if(sdk?.EXPECTED_SCHEMA_FINGERPRINT!==TARGET.fingerprint||typeof sdk.spawnMspConnection!=='function')return unavailable('sdk-contract-mismatch');
 if(!environment||typeof environment!=='object'||Array.isArray(environment)||!Object.values(environment).every(v=>typeof v==='string'))return unavailable('explicit-environment-required');
 if(typeof museBin!=='string'||!isAbsolute(museBin))return unavailable('binary-unavailable');
 let binary,workspace;
 try{binary=await realpath(museBin);await access(binary,constants.X_OK);if(!(await stat(binary)).isFile())return unavailable('binary-unavailable');}catch{return unavailable('binary-unavailable');}
 try{if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))return unavailable('workspace-unavailable');workspace=await realpath(workspaceRoot);if(!(await stat(workspace)).isDirectory())return unavailable('workspace-unavailable');}catch{return unavailable('workspace-unavailable');}
 if(!Number.isFinite(timeoutMs)||timeoutMs<1)return unavailable('invalid-timeout');
 let handshake,host,closed=false;
 const cleanup=async()=>{try{await bounded((host??handshake).close(),timeoutMs);return 'confirmed';}catch{return 'unconfirmed';}};
 try{
  handshake=sdk.spawnMspConnection({command:binary,args:['serve'],cwd:workspace,env:{...environment},shutdownTimeoutMs:timeoutMs});
  host=await bounded(handshake.initialize({clientInfo:{name:'patchlight',version:'0.2.0'}}),timeoutMs);
 }catch{return unavailable('handshake-unavailable',{cleanup:handshake?await cleanup():'not-started'});}
 const gate=compatibility({sdkVersion,initializeResult:host.initializeResult});
 if(!gate.available)return unavailable(gate.reason,{cleanup:await cleanup()});
 const adapter=new MuseSessionAdapter({connection:host.connection,sdkVersion,initializeResult:host.initializeResult,timeoutMs});
 if(adapter.snapshot().status==='unavailable')return unavailable(adapter.snapshot().reason,{cleanup:await cleanup()});
 Promise.resolve(host.exited).then(()=>{if(!closed)adapter.disconnect('host-exited');},()=>{if(!closed)adapter.disconnect('host-exit-unknown');});
 return {available:true,liveVerified:false,reason:'candidate-compatible',adapter,workspaceRoot:workspace,
  close:async()=>{if(closed)return {cleanup:'already-requested'};closed=true;adapter.disconnect('closed-by-controller');return {cleanup:await cleanup()};}};
}
