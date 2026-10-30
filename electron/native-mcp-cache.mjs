import {createReadStream,constants} from 'node:fs';
import {mkdir,lstat,realpath,copyFile,link,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

const environment={ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''};
const digest=async file=>{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('App control requires regular, unlinked files.');const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
async function directory(parent,name){const target=path.join(parent,name);await mkdir(target,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});const info=await lstat(target);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(target)!==target)throw Error('App control cache directory changed or is linked.');return target;}
async function cachedFile(source,target,expected){
 try{if(await digest(target)!==expected)throw Error('App control cache integrity changed.');return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=target+'.'+randomUUID()+'.tmp';
 try{
  await copyFile(source,temporary,constants.COPYFILE_EXCL);if(await digest(temporary)!==expected)throw Error('App control source changed while copying.');
  // Publishing an immutable file must never replace a file used by another client.
  try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;}
  if(await digest(target)!==expected)throw Error('App control cache integrity changed.');
 }finally{await rm(temporary,{force:true});}
}

export async function prepareNativeMcpConfig({dataDir,executable,appRoot,platform=process.platform}){
 if(![dataDir,executable,appRoot].every(value=>typeof value==='string'&&path.isAbsolute(value)))throw Error('App control requires absolute trusted paths.');
 const config={command:executable,args:[path.join(appRoot,'electron','native-mcp-server.mjs'),'--data-dir',dataDir],env:{...environment}};
 if(platform!=='win32')return config;
 dataDir=await realpath(dataDir);const installation=await realpath(path.dirname(executable)),relative=path.relative(installation,dataDir);if(relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep))throw Error('App control cache must be outside the installation directory.');
 const control=await directory(dataDir,'native-control'),runtimes=await directory(control,'runtimes'),bridges=await directory(control,'bridges');
 let license=path.join(installation,'LICENSE.electron.txt');try{await lstat(license);}catch(error){if(error.code!=='ENOENT')throw error;license=path.join(installation,'LICENSE');}
 const sources=[[executable,'MuseBenchControl.exe'],...['icudtl.dat','snapshot_blob.bin','v8_context_snapshot.bin'].map(name=>[path.join(installation,name),name]),[license,'LICENSE.electron.txt'],[path.join(installation,'LICENSES.chromium.html'),'LICENSES.chromium.html']];
 const hashes=await Promise.all(sources.map(([source])=>digest(source))),runtimeKey=createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),runtime=await directory(runtimes,runtimeKey);
 for(let index=0;index<sources.length;index++)await cachedFile(sources[index][0],path.join(runtime,sources[index][1]),hashes[index]);
 const bundle=path.join(appRoot,'dist','native-mcp.mjs'),bundleHash=await digest(bundle),bridge=path.join(await directory(bridges,bundleHash),'server.mjs');await cachedFile(bundle,bridge,bundleHash);
 return{command:path.join(runtime,'MuseBenchControl.exe'),args:[bridge,'--data-dir',dataDir],env:{...environment}};
}
