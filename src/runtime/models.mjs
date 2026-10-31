import {spawnMspConnection,EXPECTED_SCHEMA_FINGERPRINT} from '@muse-code/sdk';
import {TARGET} from '../../reference/patchlight/adapter/compatibility.mjs';
import {normalizeModels} from '../shared/models.mjs';
import {curateEnvironment} from './index.mjs';
import {isAbsolute} from 'node:path';

// Use the same selected payer as Code runs, without connecting a chat runtime.
export function createNativeModelDiscovery({credentials,environment=process.env,readModels=readNativeModels}={}){
 return async({binary,workspace})=>{
  if(typeof binary!=='string'||!isAbsolute(binary))throw Error('Select an installed Muse native executable in Setup before loading models.');
  if(typeof credentials!=='function')throw Error('Model catalog billing selection is unavailable.');
  try{
   const selected=await credentials({binary,environment:curateEnvironment(environment)});
   const catalog=await readModels({binary,environment:selected.environment,workspace});
   await selected.verify();
   return catalog;
  }catch(error){
   if(['CATALOG_CLEANUP','ACCOUNT_CLEANUP'].includes(error.code))throw Object.assign(Error('Model catalog host shutdown is unconfirmed. Restart after checking the native process.'),{code:'CATALOG_CLEANUP'});
   throw Error('Muse model catalog is unavailable. Check the installed CLI version and selected billing sign-in, then refresh models.');
  }
 };
}

// Sessionless discovery only. This never sends session/start or any model/tool command.
export async function readNativeModels({binary,environment,workspace,spawn=spawnMspConnection,timeoutMs=10000,closeTimeoutMs=6000}){
 let owner,timer,closeTimer,finished=false;
 try{
  owner=spawn({command:binary,args:['serve','--provider','meta'],cwd:workspace,env:environment,shutdownTimeoutMs:5000});
  const work=async()=>{const host=await owner.initialize({clientInfo:{name:'musebench_catalog',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:false}});if(finished)throw Error('Native model catalog was closed.');const result=host.initializeResult;if(result.schema?.fingerprint!==EXPECTED_SCHEMA_FINGERPRINT||result.schema?.fingerprint!==TARGET.fingerprint||result.serverInfo?.version!==TARGET.hostVersion)throw Error('Native model catalog compatibility check failed.');return normalizeModels(await host.connection.request('model/list',{}));};
  return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native model catalog timed out.')),timeoutMs);})]);
 }finally{
  finished=true;clearTimeout(timer);
  if(owner)try{await Promise.race([owner.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Catalog cleanup timed out.')),closeTimeoutMs);})]);}
  catch{throw Object.assign(Error('Model catalog host shutdown is unconfirmed. Restart after checking the native process.'),{code:'CATALOG_CLEANUP'});}
  finally{clearTimeout(closeTimer);}
 }
}
