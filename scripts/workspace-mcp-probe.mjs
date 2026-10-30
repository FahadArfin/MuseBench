// Zero-model probe: directly exercise the owned gateway; --native additionally
// opens and closes an isolated Muse session without submitting any turn.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createWorkspaceMcpConfig} from '../electron/workspace-mcp-config.mjs';
import {createRuntime,curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';

const require=createRequire(import.meta.url),options={appRoot:path.resolve(fileURLToPath(new URL('..',import.meta.url))),executable:process.versions.electron?process.execPath:require('electron'),native:false};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i];if(arg==='--native'){options.native=true;continue;}if(arg==='--analysis'){options.toolset='analysis-v1';continue;}
 const name={'--app-root':'appRoot','--executable':'executable'}[arg];if(!name||!process.argv[i+1]||!path.isAbsolute(process.argv[i+1]))throw Error('Invalid probe options.');options[name]=process.argv[++i];
}
const temporary=await mkdtemp(path.join(tmpdir(),'muse-mcp-probe-')),workspace=path.join(temporary,'project'),profile=path.join(temporary,'profile');
await mkdir(workspace);await mkdir(profile);await writeFile(path.join(workspace,'lib.ts'),'export const value = 7;\n');await writeFile(path.join(workspace,'main.ts'),"import {value} from './lib';\nvalue;\n");
const report={at:new Date().toISOString(),modelCalls:0,direct:null,native:null,workspaceRemoved:false};let child,childClosed,runtime,stage='configuration';
const bounded=async(promise,ms=15000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Probe deadline.'),{code:'PROBE_TIMEOUT'})),ms);})]);}finally{clearTimeout(timer);}};
try{
 const trustedFactory=createWorkspaceMcpConfig(options),factory=root=>trustedFactory(root,{toolset:options.toolset}),entry=await factory(workspace);stage='direct-start';
 child=spawn(entry.command,entry.args,{cwd:workspace,env:{...curateEnvironment(),...entry.env},stdio:['pipe','pipe','pipe'],windowsHide:true});
 childClosed=new Promise(resolve=>{child.once('close',code=>resolve(code));child.once('error',()=>resolve(-1));});
 let buffer='',stderrBytes=0;const waiters=new Map();
 child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;});
 child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>262144){child.kill();return;}for(let i;(i=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const row=JSON.parse(line);waiters.get(row.id)?.(row);}catch{child.kill();}}});
 const request=(id,method,params)=>{const result=new Promise(resolve=>waiters.set(id,resolve));child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return bounded(Promise.race([result,childClosed.then(()=>{throw Object.assign(Error('Gateway closed before reply.'),{code:'PROBE_CHILD_EXIT'});})]));};
 const initialized=await request(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'musebench_probe',version:'1'}});
 const listed=await request(2,'tools/list',{_meta:{progressToken:'probe-discovery'}});stage='direct-search';
 const searched=await request(3,'tools/call',{name:'workspace_tool_search',arguments:{query:'definition'},_meta:{callId:'call_probe_search',idempotencyKey:'probe-search'}});
 if(searched.error||searched.result?.isError||JSON.parse(searched.result?.content?.[0]?.text??'null')?.operations?.[0]?.name!=='definition')throw Error('Gateway search contract failed.');
 stage='direct-navigation';
 const invoked=await request(4,'tools/call',{name:'workspace_tool_call',arguments:{operation:'definition',path:'main.ts',line:2,column:2},_meta:{callId:'call_probe_navigation',idempotencyKey:'probe-navigation'}});
 const expectedTools='workspace_tool_search,workspace_tool_call'+(options.toolset==='analysis-v1'?',workspace_tool_batch':'');
 if(initialized.result?.serverInfo?.name!=='musebench-workspace'||listed.result?.tools?.map(x=>x.name).join(',')!==expectedTools||invoked.result?.isError)throw Error('Gateway contract failed.');
 const result=JSON.parse(invoked.result.content[0].text);if(result.items?.length!==1||result.items[0].path!=='lib.ts'||result.scope?.config!=='fixed-no-project-config')throw Error('Navigation contract failed.');
 let batch;
 if(options.toolset==='analysis-v1'){
  stage='direct-batch';const discovery=await request(5,'tools/call',{name:'workspace_tool_search',arguments:{query:''}});
  if(JSON.parse(discovery.result?.content?.[0]?.text??'{}').operations?.length!==7)throw Error('Analysis discovery failed.');
  const answer=await request(6,'tools/call',{name:'workspace_tool_batch',arguments:{calls:[{id:'symbols',operation:'workspace_symbols',query:'value'},{id:'definition',operation:'definition',path:'main.ts',line:2,column:2},{id:'syntax',operation:'syntax_diagnostics',path:'lib.ts'}]},_meta:{callId:'call_probe_batch'}});
  const receipt=JSON.parse(answer.result?.content?.[0]?.text??'{}');
  if(receipt.kind!=='workspace-batch'||receipt.calls?.length!==3||receipt.calls.some(c=>c.status!=='completed'||c.result.snapshot!==receipt.snapshot)||receipt.calls[1].result.items[0]?.path!=='lib.ts')throw Error('Analysis batch failed.');
  batch={operations:7,calls:receipt.calls.map(c=>({id:c.id,operation:c.operation,status:c.status})),sharedSnapshot:true,scope:receipt.scope,engine:receipt.engine,elapsedMs:receipt.elapsedMs};
 }
 child.stdin.end();const exitCode=await bounded(childClosed);if(exitCode!==0||stderrBytes!==0)throw Error('Gateway cleanup failed.');
 report.direct={server:'musebench-workspace',toolset:options.toolset??'navigation-v1',tools:listed.result.tools.map(x=>x.name),requestMetadataVerified:true,definition:'lib.ts',engine:result.engine,exitCode,stderrBytes,nodeMode:true,packagedApp:options.appRoot.toLowerCase().endsWith('.asar'),...(batch?{batch}:{})};
 if(options.native){
  stage='native-start';const binary=discoverMuseBinaries()[0];if(!binary)throw Error('Native binary unavailable.');
  const environment={...curateEnvironment(),USERPROFILE:profile,HOMEDRIVE:path.parse(profile).root,HOMEPATH:profile.slice(path.parse(profile).root.length-1),APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local')};
  runtime=createRuntime({environment,workspaceMcp:trustedFactory,timeoutMs:10000});
  const state=await bounded(runtime.connect({binary,workspaceRoot:workspace,workspaceTools:true,workspaceToolset:options.toolset,fullAccess:true}),30000);
  report.native={status:state.status,sessionStarted:typeof state.sessionId==='string',workspaceTools:state.workspaceTools===true,workspaceToolset:state.workspaceToolset,permissionVerified:state.permissionVerified===true,modelTurnSent:false,toolInventoryVerified:false,profileIsolated:true};
  if(state.workspaceToolset!==(options.toolset??'navigation-v1'))throw Error('Native session toolset was not preserved.');
  stage='native-inventory';const inventory=await bounded(runtime.readMcpServers({sessionId:state.sessionId}));
  const server=inventory.servers.find(row=>row.name==='musebench_workspace'&&row.source==='session');
  if(server?.transport!=='stdio'||server?.oauth!=='notSupported')throw Error('Native session MCP inventory did not match its configured gateway.');
  report.native.serverInventoryVerified=true;report.native.server=server;
  stage='native-close';await bounded(runtime.disconnect(),15000);report.native.cleanup=runtime.snapshot().cleanup;
  if(!report.native.sessionStarted||!report.native.workspaceTools||!report.native.permissionVerified||report.native.cleanup!=='confirmed')throw Error('Native registration or cleanup not confirmed.');
  runtime=null;
 }
 report.status='passed';
}catch(error){report.status='failed';report.stage=stage;report.errorCode=typeof error.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:'PROBE_FAILED';process.exitCode=1;}
finally{
 if(runtime){try{await bounded(runtime.disconnect(),15000);if(report.native)report.native.cleanup=runtime.snapshot().cleanup;}catch{report.nativeCleanup='unconfirmed';process.exitCode=1;}}
 if(child&&child.exitCode===null){child.kill();try{await bounded(childClosed,5000);}catch{report.directCleanup='unconfirmed';process.exitCode=1;}}
 const target=path.resolve(temporary);if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('muse-mcp-probe-'))throw Error('Invalid probe cleanup target.');
 try{await rm(target,{recursive:true,force:true});report.workspaceRemoved=true;}catch{report.workspaceRemoved=false;process.exitCode=1;}
 console.log(JSON.stringify(report,null,2));
}
