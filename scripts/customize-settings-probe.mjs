// Opt-in, zero-model acceptance: settings written by Customize must allow the
// pinned native host to initialize. This does not prove MCP tool invocation.
import {spawnMspConnection} from '@muse-code/sdk';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCustomize} from '../electron/customize.mjs';
import {curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {compatibility} from '../reference/patchlight/adapter/compatibility.mjs';

const root=await mkdtemp(path.join(tmpdir(),'muse-settings-acceptance-'));
const report={at:new Date().toISOString(),modelCalls:0,profileIsolated:true,credentialUse:false};
let service,owner,host,stderr='',phase='setup';
const bounded=async(promise,ms=12000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Probe deadline.')),ms);})]);}finally{clearTimeout(timer);}};
try{
 const profile=path.join(root,'profile'),workspace=path.join(root,'project'),dataDir=path.join(root,'data');
 await mkdir(profile);await mkdir(workspace);
 const environment={...curateEnvironment(),USERPROFILE:profile,HOME:profile,HOMEDRIVE:path.parse(profile).root,HOMEPATH:profile.slice(path.parse(profile).root.length-1),APPDATA:path.join(profile,'AppData','Roaming'),LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_CONFIG_HOME:path.join(profile,'.config'),XDG_DATA_HOME:path.join(profile,'.local','share')};
 const binary=discoverMuseBinaries()[0];if(!binary)throw Error('Install the pinned native Muse CLI.');
 // No external connections or useful tools, even if a future host starts user
 // MCP servers before a turn. All server bytes and settings are probe-owned.
 const fixture=path.join(root,'inert-server.mjs');
 await writeFile(fixture,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);if(q.id===undefined)return;const result=q.method==='initialize'?{protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'inert-settings-probe',version:'1'}}:q.method==='tools/list'?{tools:[]}:{};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`);
 service=createCustomize({getState:()=>({runtime:{binary}}),environment,dataDir,run:async()=>({stdout:'{"skills":[],"plugins":[]}'})});
 phase='customize-write';await service.dispatch({type:'saveServer',server:{name:'inert_settings_probe',transport:'stdio',command:process.execPath,args:[fixture]},reviewed:true});
 const settings=JSON.parse(await readFile(path.join(profile,'.config','muse','settings.json'),'utf8'));
 report.settingsSchema=settings.schema_version??null;
 phase='native-initialize';
 owner=spawnMspConnection({command:binary,args:['serve','--disable-sandbox','-c','hooks={}','-c','managed_hooks_path=null'],cwd:workspace,env:environment,shutdownTimeoutMs:5000,onStderr:chunk=>{stderr=(stderr+chunk).slice(-4000);}});
 host=await bounded(owner.initialize({clientInfo:{name:'musebench_settings_probe',version:'1'},capabilities:{experimentalApi:true}}));
 report.hostVersion=host.initializeResult.serverInfo?.version??null;
 phase='native-compatibility';
 const sdkVersion=JSON.parse(await readFile(createRequire(import.meta.url).resolve('@muse-code/sdk/package.json'),'utf8')).version;
 const gate=compatibility({sdkVersion,initializeResult:host.initializeResult,fullAccess:true});report.compatibility=gate.reason;
 if(!gate.available)throw Error('Native compatibility did not match.');
 report.nativeInitialized=true;report.status='passed';
}catch{
 report.status='failed';report.phase=phase;report.reason=report.compatibility??(stderr.includes('missing field `schema_version`')?'missing-native-schema-marker':'acceptance-not-confirmed');process.exitCode=1;
}finally{
 try{await bounded((host??owner)?.close(),8000);report.hostClosed=true;}catch{report.hostClosed=false;report.status='failed';process.exitCode=1;}
 await service?.close();
 const target=path.resolve(root);if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('muse-settings-acceptance-'))throw Error('Invalid probe cleanup target.');
 try{await rm(target,{recursive:true,force:true});report.workspaceRemoved=true;}catch{report.workspaceRemoved=false;report.status='failed';process.exitCode=1;}
 console.log(JSON.stringify(report,null,2));
}
