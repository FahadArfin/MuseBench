import {spawnMspConnection,EXPECTED_SCHEMA_FINGERPRINT} from '@muse-code/sdk';
import {TARGET} from '../../reference/patchlight/adapter/compatibility.mjs';
import {normalizeAllowance} from '../shared/account-usage.mjs';

// Sessionless native account queries. Never exposes credential labels or raw errors.
export async function readNativeAccount({binary,environment,refreshUsage=false,spawn=spawnMspConnection,timeoutMs=12000}){
 let owner,timer;
 try{
  owner=spawn({command:binary,args:['serve','--provider','meta'],env:environment,shutdownTimeoutMs:3000});
  return await Promise.race([(async()=>{
   const host=await owner.initialize({clientInfo:{name:'musebench_billing',version:'0.1.0'},capabilities:{experimentalApi:true,userInputDialogs:false}});
   if(host.initializeResult.schema?.fingerprint!==EXPECTED_SCHEMA_FINGERPRINT||host.initializeResult.serverInfo?.version!==TARGET.hostVersion)throw Error('Update MuseBench and the official CLI to matching versions.');
   const account=await host.connection.request('account/read',{});
   const state=['accountLogin','apiKey','environmentApiKey','envApiKey','unauthenticated','notLoggedIn','none'].includes(account?.state)?account.state:'unknown';
   let usage={windows:[]},usageUnavailable=false;
   if(refreshUsage&&state==='accountLogin'){
    try{const value=await host.connection.request('usage/refresh',{});usage=normalizeAllowance(value);if(!usage.windows.length)usage=normalizeAllowance(await host.connection.request('usage/read',{}));}
    catch{usageUnavailable=true;}
   }
   return{state,usage,usageUnavailable};
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Muse account check timed out.')),timeoutMs);})]);
 }catch{throw Error('Muse account details are unavailable. Check your CLI sign-in and version.');}
 finally{clearTimeout(timer);if(owner)try{await owner.close();}catch{throw Error('Muse account check could not shut down. Restart MuseBench before changing billing.');}}
}
