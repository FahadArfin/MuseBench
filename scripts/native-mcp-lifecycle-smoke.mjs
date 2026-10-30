import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import electronPath from 'electron';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {buildNativeMcp} from './build-native-mcp.mjs';
import {prepareNativeMcpConfig} from '../electron/native-mcp-cache.mjs';
import {createNativeControlHost} from '../electron/native-control-host.mjs';

// Use actual Windows file locks and the bundled stdio protocol. Only the app
// service response is a fixture; no personal profile or model is contacted.
export async function verifyNativeMcpLifecycle(){
 if(process.platform!=='win32')return{status:'not-applicable',reason:'Windows update lifecycle'};
 const root=await mkdtemp(path.join(os.tmpdir(),'muse-control-lifecycle-')),installation=path.join(root,'installed app'),appRoot=path.join(installation,'resources','app'),dataDir=path.join(root,'private profile');
 const executable=path.join(installation,'MuseBench.exe'),bundle=path.join(appRoot,'dist','native-mcp.mjs'),source=path.dirname(electronPath);let host,client,calls=0;
 const service={call:async()=>{calls++;return{content:[{type:'text',text:JSON.stringify({version:'lifecycle-fixture',calls})}]};}};
 try{
  await mkdir(path.dirname(bundle),{recursive:true});await mkdir(dataDir);
  for(const [from,to] of [[electronPath,executable],...['icudtl.dat','snapshot_blob.bin','v8_context_snapshot.bin','LICENSES.chromium.html'].map(name=>[path.join(source,name),path.join(installation,name)]),[path.join(source,'LICENSE'),path.join(installation,'LICENSE.electron.txt')]])await copyFile(from,to);
  await buildNativeMcp({outfile:bundle});
  host=await createNativeControlHost({dataDir,service,connectionConfig:()=>prepareNativeMcpConfig({dataDir,executable,appRoot})});
  const state=await host.command({type:'enable'});assert.ok(state.connectionConfig,state.connectionError);
  client=new Client({name:'native-update-lifecycle-check',version:'1.0.0'});
  const transport=new StdioClientTransport({...state.connectionConfig,cwd:os.tmpdir(),stderr:'pipe'});let diagnostic='';transport.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-4000);});
  try{await client.connect(transport);}catch(error){throw Error('Isolated cached MCP startup failed: '+diagnostic,{cause:error});}
  assert.equal((await client.listTools()).tools.length,6);
  const request=()=>client.callTool({name:'app_status',arguments:{}});
  assert.equal(JSON.parse((await request()).content[0].text).version,'lifecycle-fixture');assert.equal(calls,1);
  const first=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));
  await host.close();host=null;
  assert.equal((await request()).isError,true);assert.equal(calls,1);
  // These are disposable test copies. A relay launched from the installation
  // would prevent removing its executable on Windows while its client is alive.
  for(const file of [executable,bundle,...['icudtl.dat','snapshot_blob.bin','v8_context_snapshot.bin'].map(name=>path.join(installation,name))]){await rm(file);await writeFile(file,'replacement sentinel');}
  host=await createNativeControlHost({dataDir,service});
  const second=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));assert.notEqual(first.token,second.token);assert.equal(calls,1);
  assert.equal((await request()).isError,undefined);assert.equal(calls,2);
  await host.command({type:'disable'});assert.equal((await request()).isError,true);assert.equal(calls,2);
  return{status:'passed',checks:['Standalone SDK bundle negotiates outside the repository and installation','Original Windows executable, ICU, snapshots and relay are replaceable while the cached stdio client stays alive','The same client serves a reopened host with a rotated token, without replaying requests','Turning off control revokes the retained client'],scope:'Real Windows runtime and MCP transport; isolated fixture app service, no provider calls'};
 }finally{await client?.close();await host?.close();await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyNativeMcpLifecycle()));
