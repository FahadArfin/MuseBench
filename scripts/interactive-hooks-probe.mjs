// Explicit local echo-provider probe. No account credentials or model requests.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {tmpdir} from 'node:os';
import * as sdk from '@muse-code/sdk';
import {createRuntime,curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {waitForProbeCondition} from './probe-wait.mjs';

if(process.argv.length!==3||process.argv[2]!=='--native-echo')throw Error('Use --native-echo to run the isolated, zero-model hook check.');
const binary=discoverMuseBinaries()[0];assert.ok(binary,'Install the pinned official Muse CLI first.');
const temporary=await mkdtemp(path.join(tmpdir(),'muse-interactive-hooks-'));
const workspace=path.join(temporary,'project'),profile=path.join(temporary,'profile'),config=path.join(profile,'.config','muse');
const report={at:new Date().toISOString(),platform:process.platform,provider:'echo',modelRequests:0,status:'not-established',cleanup:'not-started',workspaceRemoved:false,stderrTail:'',hookRuns:[]};
let runtime,host,timer,shutdown,expired=false,sessionId;
const terminals=new Map();
const stop=()=>shutdown??=(Promise.resolve().then(()=>runtime?.disconnect()));
const bounded=async(promise,ms=10000)=>{let deadline;try{return await Promise.race([promise,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Probe deadline.')),ms);})]);}finally{clearTimeout(deadline);}};
const observe=frame=>{if(frame?.params?.sessionId!==sessionId)return;if(frame.method==='turn/completed')terminals.set(frame.params.turnId,frame.params.terminal);if(frame.method==='item/completed'&&frame.params.item?.kind==='hookRun'&&report.hookRuns.length<10)report.hookRuns.push(frame.params.item);};
try{
 await mkdir(workspace);await mkdir(config,{recursive:true});
 const writer=path.join(workspace,'record-hook.cjs');
 await writeFile(writer,"const fs=require('node:fs');let raw='';process.stdin.on('data',b=>{raw+=b;if(raw.length>65536)process.exit(2)});process.stdin.on('end',()=>{const v=JSON.parse(raw);fs.appendFileSync(process.argv[2],JSON.stringify({event:v.hook_event_name,sessionId:v.session_id,turnId:v.turn_id,prompt:v.prompt,cwd:v.cwd})+'\\n')});\n");
 const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
 const command=file=>process.platform==='win32'?`node record-hook.cjs ${file}`:`${quote(process.execPath)} ${quote(writer)} ${quote(path.join(workspace,file))}`;
 const commandKey=process.platform==='win32'?'commandWindows':'command';
 const fixtureHook=file=>({UserPromptSubmit:[{hooks:[{type:'command',[commandKey]:command(file),timeout:3}]}]});
 await writeFile(path.join(config,'managed.json'),JSON.stringify({hooks:fixtureHook('managed-unreviewed.jsonl')}));
 await writeFile(path.join(config,'settings.json'),JSON.stringify({schema_version:1,hooks:fixtureHook('user-unreviewed.jsonl'),managed_hooks_path:'managed.json'}));
 const review=createExtensionReview({dataDir:path.join(temporary,'app-data'),profile});
 await review.saveHooks(workspace,(await review.hookState(workspace)).revision,[
  {id:'prompt',event:'UserPromptSubmit',command:command('reviewed.jsonl'),timeout:3,enabled:true},
  {id:'finish',event:'Stop',command:command('reviewed.jsonl'),timeout:3,enabled:true},
 ]);
 const environment={...curateEnvironment(),HOME:profile,USERPROFILE:profile,APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_CONFIG_HOME:path.dirname(config),XDG_DATA_HOME:path.join(profile,'.local','share'),XDG_CACHE_HOME:path.join(profile,'.cache')};
 if(process.platform==='win32'){environment.HOMEDRIVE=path.parse(profile).root.slice(0,2);environment.HOMEPATH=profile.slice(2);environment.PATH=[path.dirname(process.execPath),path.join(environment.SystemRoot,'System32'),environment.SystemRoot].join(';');}
 const require=createRequire(import.meta.url),sdkVersion=JSON.parse(await readFile(require.resolve('@muse-code/sdk/package.json'),'utf8')).version;
 const wrappedSdk={...sdk,spawnMspConnection:options=>{
  const handshake=sdk.spawnMspConnection({...options,onStderr:chunk=>{report.stderrTail=(report.stderrTail+chunk).slice(-4000);},args:[...options.args,'--provider','echo','--preset','empty','--disable-shell','--disable-write','--disable-request-user-input','--contributor-mode','off']});
  return new Proxy(handshake,{get(target,key){if(key==='initialize')return async params=>{
   host=await target.initialize(params);const raw=host.connection;
   const connection=new Proxy(raw,{get(owner,member){if(member==='onNotification')return fn=>owner.onNotification(frame=>{observe(frame);fn(frame);});const value=Reflect.get(owner,member);return typeof value==='function'?value.bind(owner):value;}});
   return new Proxy(host,{get(owner,member){if(member==='connection')return connection;const value=Reflect.get(owner,member);return typeof value==='function'?value.bind(owner):value;}});
  };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 }};
 runtime=createRuntime({environment,extensionReview:review,loadSdk:async()=>({sdk:wrappedSdk,sdkVersion}),timeoutMs:5000});
 timer=setTimeout(()=>{expired=true;void stop();},25000);
 const state=await bounded(runtime.connect({binary,workspaceRoot:workspace,fullAccess:process.platform==='win32'}));
 assert.equal(state.permissionVerified,true);sessionId=state.sessionId;
 const session=(await bounded(host.connection.request('session/read',{sessionId}))).session;
 assert.equal(session.providerId,'echo','Refuse to submit a turn to any non-echo provider.');assert.equal(expired,false);
 report.hookInventory=await bounded(host.connection.request('hook/list',{sessionId}));
 // The production Meta model selector deliberately excludes echo. The probe
 // uses the real host protocol for this local turn, not a fake model catalog.
 const commandId=host.connection.mintCommandId();
 const ack=await bounded(host.connection.command('turn/start',{sessionId,input:[{type:'text',text:'MUSEBENCH_LOCAL_HOOK_CHECK'}]},{commandId,maxAttempts:1}));
 assert.equal(ack.commandId,commandId);assert.equal(ack.status,'accepted');assert.equal(ack.startedNewTurn,true);
 await waitForProbeCondition(()=>terminals.has(ack.turnId),{cancelled:()=>expired});
 assert.equal(expired,false);assert.equal(terminals.get(ack.turnId),'completed');
 const records=(await readFile(path.join(workspace,'reviewed.jsonl'),'utf8')).trim().split('\n').map(row=>JSON.parse(row));
 assert.deepEqual(records.map(row=>row.event),['UserPromptSubmit','Stop']);
 for(const row of records){assert.equal(row.sessionId,sessionId);assert.equal(path.resolve(row.cwd),workspace);}
 assert.equal(records[0].turnId,ack.turnId);assert.equal(records[0].prompt,'MUSEBENCH_LOCAL_HOOK_CHECK');
 assert.deepEqual(report.hookRuns.map(row=>[row.event,row.runStatus]),[['userPromptSubmit','completed'],['stop','completed']]);
 for(const file of ['user-unreviewed.jsonl','managed-unreviewed.jsonl'])await assert.rejects(readFile(path.join(workspace,file)),{code:'ENOENT'});
 report.hostVersion=host.initializeResult.serverInfo.version;report.fingerprint=host.initializeResult.schema.fingerprint;
 report.permissionVerified=true;report.nativeEvents=records.map(({event})=>event);report.userAndManagedHooksExcluded=true;
 report.limitations=`${process.platform}/local echo evidence does not prove Meta inference, execution on other platforms, arbitrary source trust or hook timeout/descendant behavior. hook/list can differ from effective launch overrides; execution is established by the hookRun receipts and marker contents.`;
 report.status='passed';
}catch(error){report.error=String(error.message).slice(0,600);process.exitCode=1;}
finally{
 expired=true;clearTimeout(timer);try{await stop();report.cleanup=runtime?.snapshot().cleanup??'not-started';}catch{report.cleanup='unconfirmed';}
 if(!['confirmed','not-started'].includes(report.cleanup)){report.status='not-established';process.exitCode=1;}
 const target=path.resolve(temporary);
 if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('muse-interactive-hooks-'))throw Error('Invalid probe cleanup target.');
 if(['confirmed','not-started'].includes(report.cleanup)){await rm(target,{recursive:true,force:true});report.workspaceRemoved=true;}
 console.log(JSON.stringify(report,null,2));
}
