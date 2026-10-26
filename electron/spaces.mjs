import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createSpacesHub} from '../src/spaces/hub.mjs';
import {createSpacesClient} from '../src/spaces/client.mjs';

export async function createDesktopSpaces({dataDir,safeStorage,work}){
 await fs.mkdir(dataDir,{recursive:true});
 let hub=null,starting=null,closing=false;
 const configFile=path.join(dataDir,'hub.json');
 async function localHub(){
  if(closing)throw Error('Spaces is closing.');
  if(hub)return hub;if(starting)return starting;
  starting=(async()=>{
   let port=0;
   try{const info=await fs.lstat(configFile);if(!info.isFile()||info.isSymbolicLink()||info.size>1000)throw Error('Local hub settings are invalid.');const saved=JSON.parse(await fs.readFile(configFile,'utf8'));if(!Number.isInteger(saved.port)||saved.port<1||saved.port>65535)throw Error('Local hub port is invalid.');port=saved.port;}catch(error){if(error.code!=='ENOENT')throw error;}
   let created;try{created=await createSpacesHub({dataDir:path.join(dataDir,'hub'),port});}catch(error){if(error.code==='EADDRINUSE')throw Error('The saved local Spaces port is already in use. Close the other host and try again.');throw error;}
   try{if(!port)await fs.writeFile(configFile,JSON.stringify({port:Number(new URL(created.url).port)}),{flag:'wx',mode:0o600});hub=created;return hub;}catch(error){await created.close();throw error;}
  })();try{return await starting;}finally{starting=null;}
 }
 const encrypted=text=>{if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential protection is unavailable. Spaces credentials were not saved.');return safeStorage.encryptString(text);};
 const client=await createSpacesClient({dataDir,encrypt:encrypted,decrypt:bytes=>safeStorage.decryptString(bytes),getLocalHub:localHub,
  publishWork:async id=>{if(work.getState().busy)throw Error('Finish or stop the Work request before publishing.');const artifact=await work.getArtifact(id);if(!artifact)throw Error('This Work item has no validated preview to publish.');return artifact;},
  copyToWork:async(artifact,team)=>{
   if(work.getState().busy)throw Error('Finish or stop the Work request before copying this page.');
   const result=await work.copyArtifact(artifact,team);if(result.error)throw Error(result.error);
  }
 });
 // Restore the local hub only if this profile already owns local spaces. Reading
 // a remote connection never opens a listener or sends any model request.
 if(client.getState().spaces.some(value=>value.local))try{await localHub();}catch{/* Refresh exposes the connection failure without preventing app startup. */}
 return{...client,async close(){closing=true;await client.close();await starting?.catch(()=>{});await hub?.close();}};
}
