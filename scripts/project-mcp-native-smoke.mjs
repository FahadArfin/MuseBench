// Explicit, isolated native acceptance. Echo never makes a model request.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as sdk from '@muse-code/sdk';
import {createRuntime,curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {checkConfiguration} from '../src/runtime/configuration-review.mjs';
import {waitForProbeCondition} from './probe-wait.mjs';

assert.deepEqual(process.argv.slice(2),['--native-echo']);
const binary=discoverMuseBinaries()[0];assert.ok(binary);
const exec=promisify(execFile),require=createRequire(import.meta.url),sdkVersion=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8')).version;
const temporary=await realpath(tmpdir()),root=await mkdtemp(path.join(temporary,'muse-project-native-'));
const report={at:new Date().toISOString(),platform:process.platform,modelRequests:0,credentialUse:false,cases:[],workspaceRemoved:false};
const bounded=async(promise,ms=10000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Probe deadline')),ms))]);}finally{clearTimeout(timer);}};
const fixture=path.join(root,'fixture.mjs');let allClosed=true;
await writeFile(fixture,`import fs from 'node:fs';import readline from 'node:readline';
const record=x=>fs.appendFileSync(process.env.MCP_LOG,JSON.stringify(x)+'\\n');
record({kind:'start',pid:process.pid,args:process.argv.slice(2),cwd:process.cwd(),region:process.env.REGION});
setTimeout(()=>process.exit(0),25000).unref();
const input=readline.createInterface({input:process.stdin});input.on('close',()=>process.exit(0));
input.on('line',line=>{const q=JSON.parse(line);record({kind:'method',method:q.method});if(q.id===undefined)return;
const result=q.method==='initialize'?{protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'project-acceptance-fixture',version:'1'}}:q.method==='tools/list'?{tools:[{name:'project_fixture',description:'Returns inert fixture data.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}:{content:[{type:'text',text:'INERT_FIXTURE'}]};
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});
`);
try{
 for(const name of ['root','nested','worktree']){
  const directory=path.join(root,name),repository=path.join(directory,'repo'),profile=path.join(directory,'profile'),config=path.join(profile,'.config','muse'),log=path.join(directory,'fixture.jsonl');
  await mkdir(repository,{recursive:true});await mkdir(config,{recursive:true});
  await exec('git',['init','--quiet',repository],{windowsHide:true});
  let workspace=repository;
  if(name==='nested'){workspace=path.join(repository,'packages','app');await mkdir(workspace,{recursive:true});}
  if(name==='worktree'){
   await exec('git',['-C',repository,'-c','user.name=MuseBench fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','fixture'],{windowsHide:true});
   workspace=path.join(directory,'linked');await exec('git',['-C',repository,'worktree','add','--detach',workspace],{windowsHide:true});
   await writeFile(path.join(repository,'.mcp.json'),JSON.stringify({mcpServers:{must_not_load:{command:'missing-must-not-run',required:true}}}));
  }
  const base={type:'stdio',command:process.execPath,args:[fixture,'personal'],env:{MCP_LOG:log,REGION:'personal'},required:true,framing:'line_delimited_json'};
  await writeFile(path.join(config,'settings.json'),JSON.stringify({schema_version:1,mcpServers:{project_fixture:base}}));
  const projectFile=path.join(workspace,'.mcp.json');
  if(name==='nested')await writeFile(path.join(repository,'.mcp.json'),JSON.stringify({mcpServers:{project_fixture:{args:[fixture,'repository'],env:{REGION:'repository'}}}}));
  await writeFile(projectFile,JSON.stringify({mcpServers:{project_fixture:{args:[fixture,name],env:{REGION:name}}}}));
  await writeFile(path.join(name==='nested'?repository:workspace,'AGENTS.md'),'Use this isolated fixture only.');
  const environment={...curateEnvironment(),HOME:profile,USERPROFILE:profile,APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share'),XDG_CACHE_HOME:path.join(profile,'.cache')};
  if(process.platform==='win32'){environment.HOMEDRIVE=path.parse(profile).root.slice(0,2);environment.HOMEPATH=profile.slice(2);}
  const review=createExtensionReview({dataDir:path.join(directory,'app'),profile,environment}),check=()=>checkConfiguration({environment,workspaceRoot:workspace,extensionReview:review});
  await assert.rejects(check(),/review/i);const shown=await review.projectMcpState(workspace,{environment});await review.approveProjectMcp(workspace,shown.revision,{environment});await check();
  const item={name,guardRejectedUnreviewed:true,approvedSources:shown.sources.length,coveredInstructionFiles:shown.instructions.length,stderr:''};
  let runtime,host,sessionId,timer,expired=false,shutdown;const terminals=new Map();
  const stop=()=>shutdown??=Promise.resolve().then(()=>runtime?.disconnect());
  try{
   const wrappedSdk={...sdk,spawnMspConnection:options=>{
    item.trustFlag=options.args.includes('--trust-workspace');
    const handshake=sdk.spawnMspConnection({...options,args:[...options.args,'--provider','echo','--disable-shell','--disable-write','--disable-request-user-input','--contributor-mode','off'],onStderr:chunk=>{item.stderr=(item.stderr+chunk).slice(-1500);}});
    return new Proxy(handshake,{get(target,key){if(key==='initialize')return async params=>{
     host=await target.initialize(params);const raw=host.connection;
     const connection=new Proxy(raw,{get(owner,member){if(member==='onNotification')return fn=>owner.onNotification(frame=>{if(frame.method==='turn/completed'&&frame.params.sessionId===sessionId)terminals.set(frame.params.turnId,frame.params.terminal);fn(frame);});const value=Reflect.get(owner,member);return typeof value==='function'?value.bind(owner):value;}});
     return new Proxy(host,{get(owner,member){if(member==='connection')return connection;const value=Reflect.get(owner,member);return typeof value==='function'?value.bind(owner):value;}});
    };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
   }};
   runtime=createRuntime({environment,extensionReview:review,loadSdk:async()=>({sdk:wrappedSdk,sdkVersion}),timeoutMs:5000});
   timer=setTimeout(()=>{expired=true;void stop();},25000);
   const state=await bounded(runtime.connect({binary,workspaceRoot:workspace,fullAccess:process.platform==='win32'}));assert.equal(state.permissionVerified,true);sessionId=state.sessionId;
   const session=(await bounded(host.connection.request('session/read',{sessionId}))).session;assert.equal(session.providerId,'echo','Refuse non-echo turns.');assert.equal(item.trustFlag,true);assert.equal(expired,false);
   await check();const commandId=host.connection.mintCommandId(),ack=await bounded(host.connection.command('turn/start',{sessionId,input:[{type:'text',text:'MUSEBENCH_PROJECT_MCP_ACCEPTANCE'}]},{commandId,maxAttempts:1}));assert.equal(ack.commandId,commandId);assert.equal(ack.status,'accepted');
   await waitForProbeCondition(()=>terminals.has(ack.turnId),{timeoutMs:12000,cancelled:()=>expired});assert.equal(terminals.get(ack.turnId),'completed');
   item.hostVersion=host.initializeResult.serverInfo.version;item.provider=session.providerId;item.terminal=terminals.get(ack.turnId);item.inventory=await bounded(host.connection.request('mcpServer/list',{sessionId}));
   await writeFile(projectFile,JSON.stringify({mcpServers:{project_fixture:{args:[fixture,'changed'],env:{REGION:'changed'}}}}));await assert.rejects(check(),/review/i);item.changedSourceRejected=true;
  }finally{clearTimeout(timer);await bounded(stop(),7000);item.cleanup=runtime?.snapshot().cleanup;allClosed&&=item.cleanup==='confirmed';}
  item.events=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);assert(item.events.some(e=>e.method==='initialize'));assert(item.events.some(e=>e.method==='tools/list'));assert.equal(item.events.find(e=>e.kind==='start').region,name);assert.deepEqual(item.events.find(e=>e.kind==='start').args,[name]);
  report.cases.push(item);console.log(JSON.stringify(item));if(!allClosed)throw Error('Owned native host cleanup was not confirmed.');
 }
 report.status='passed';
}catch(error){report.error=String(error.message).slice(0,700);report.status='failed';process.exitCode=1;}
finally{
 const target=path.resolve(root);assert.equal(path.dirname(target),temporary);assert.ok(path.basename(target).startsWith('muse-project-native-'));
 if(allClosed){await rm(target,{recursive:true,force:true});report.workspaceRemoved=true;}else report.retainedWorkspace=target;
 await mkdir('artifacts/project-mcp',{recursive:true});await writeFile('artifacts/project-mcp/native-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error,modelRequests:0,workspaceRemoved:report.workspaceRemoved}));
}
