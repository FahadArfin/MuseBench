import {spawnMspConnection,EXPECTED_SCHEMA_FINGERPRINT} from '@muse-code/sdk';
import {TARGET} from '../../reference/patchlight/adapter/compatibility.mjs';
import {normalizeModels} from '../shared/models.mjs';
// Sessionless discovery only. This never sends session/start or any model/tool command.
export async function readNativeModels({binary,environment,workspace,spawn=spawnMspConnection,timeoutMs=10000}){
 let owner,timer;
 try{
  owner=spawn({command:binary,args:['serve','--provider','meta'],cwd:workspace,env:environment,shutdownTimeoutMs:5000});
  const work=async()=>{const host=await owner.initialize({clientInfo:{name:'musebench_catalog',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:false}});const result=host.initializeResult;if(result.schema?.fingerprint!==EXPECTED_SCHEMA_FINGERPRINT||result.schema?.fingerprint!==TARGET.fingerprint||result.serverInfo?.version!==TARGET.hostVersion)throw Error('Native model catalog compatibility check failed.');return normalizeModels(await host.connection.request('model/list',{}));};
  return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native model catalog timed out.')),timeoutMs);})]);
 }finally{clearTimeout(timer);if(owner)try{await owner.close();}catch{throw Object.assign(Error('Model catalog host shutdown is unconfirmed. Restart after checking the native process.'),{code:'CATALOG_CLEANUP'});}}
}
