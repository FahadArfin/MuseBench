import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {checkConfiguration} from '../src/runtime/configuration-review.mjs';
import {createCustomize} from '../electron/customize.mjs';

const hash='sha256:'+'a'.repeat(64),stableId='plugin:fixture:mcp_server:probe';
const decision={enabled:true,trusted_definition_hash:hash};
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'muse-plugin-grant-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const profile=path.join(root,'home'),dataDir=path.join(root,'app'),workspaceRoot=path.join(root,'project'),settings=path.join(profile,'.config','muse','settings.json'),cache=path.join(profile,'.local','share','muse','plugins','cache','fixture');
 await mkdir(path.dirname(settings),{recursive:true});await mkdir(cache,{recursive:true});await mkdir(workspaceRoot);await writeFile(path.join(workspaceRoot,'.git'),'gitdir: unused');
 await writeFile(path.join(cache,'server.mjs'),'// reviewed fixture');
 const record={id:'fixture',enabled:true,cache_path:cache,package_sha256:hash,manifest_sha256:hash};
 const environment={HOME:profile,USERPROFILE:profile},review=createExtensionReview({dataDir,profile,environment});
 await writeFile(review.inventory,JSON.stringify({plugins:{fixture:record}}));
 const save=async(config={runtime_capabilities:{[stableId]:decision}})=>writeFile(settings,JSON.stringify({schema_version:1,...config}));await save();
 const inventory=await review.pluginState();await review.approvePlugins(inventory.revision);
 const grant=()=>review.approvePluginMcp(stableId,decision,inventory.revision,{settingsPath:settings});
 const check=()=>checkConfiguration({environment,workspaceRoot,extensionReview:review});
 return{root,profile,dataDir,workspaceRoot,settings,cache,record,environment,review,inventory,save,grant,check};
}

test('native enabled plugin MCP requires its own exact grant, independent of installation',async t=>{
 const f=await fixture(t);await assert.rejects(f.check(),/capabilit|plugin/i);
 await f.grant();const first=await f.check();assert.match(first.executionRevision,/^[a-f0-9]{64}$/);
 assert.equal((await f.check()).executionRevision,first.executionRevision);
 await f.review.approvePlugins(f.inventory.revision);assert.equal((await f.check()).executionRevision,first.executionRevision);
});
for(const change of ['package','inventory','native hash','native extra','unrelated enabled','unknown kind','project override','settings location'])test(`plugin approval does not survive ${change}`,async t=>{
 const f=await fixture(t);await f.grant();await f.check();
 if(change==='package')await writeFile(path.join(f.cache,'server.mjs'),'// changed');
 if(change==='inventory')await writeFile(f.review.inventory,JSON.stringify({plugins:{fixture:{...f.record,enabled:false}}}));
 if(change==='native hash')await f.save({runtime_capabilities:{[stableId]:{...decision,trusted_definition_hash:'sha256:'+'b'.repeat(64)}}});
 if(change==='native extra')await f.save({runtime_capabilities:{[stableId]:{...decision,command:'unexpected'}}});
 if(change==='unrelated enabled')await f.save({runtime_capabilities:{[stableId]:decision,'plugin:other:mcp_server:probe':decision}});
 if(change==='unknown kind')await f.save({runtime_capabilities:{[stableId]:decision,'plugin:fixture:reminder:run':{...decision,enabled:false}}});
 if(change==='project override'){await mkdir(path.join(f.workspaceRoot,'.muse'));await writeFile(path.join(f.workspaceRoot,'.muse','settings.json'),JSON.stringify({runtime_capabilities:{[stableId]:decision}}));}
 if(change==='settings location'){f.environment.XDG_CONFIG_HOME=path.join(f.root,'xdg');await mkdir(path.join(f.environment.XDG_CONFIG_HOME,'muse'),{recursive:true});await writeFile(path.join(f.environment.XDG_CONFIG_HOME,'muse','settings.json'),await readFile(f.settings));}
 if(['package','inventory'].includes(change))await f.review.approvePlugins((await f.review.pluginState()).revision);
 await assert.rejects(f.check(),/capabilit|plugin/i);
});
test('a native MCP rejection is non-executable and revokes the app grant',async t=>{
 const f=await fixture(t);await f.grant();const first=await f.check();
 await f.save({runtime_capabilities:{[stableId]:{...decision,enabled:false}}});await f.review.revokePluginMcp(stableId);
 assert.notEqual((await f.check()).executionRevision,first.executionRevision);
 await f.save();await assert.rejects(f.check(),/capabilit|plugin/i);
});
test('reviewed MCP, plugin and hook changes change the host execution revision',async t=>{
 const f=await fixture(t);await f.grant();let last=(await f.check()).executionRevision;
 const server={transport:'stdio',command:'node',args:['first.mjs']};await f.review.approveMcp('docs',server);await f.save({runtime_capabilities:{[stableId]:decision},mcp_servers:{docs:server}});
 let next=(await f.check()).executionRevision;assert.notEqual(next,last);last=next;
 server.args=['second.mjs'];await f.review.approveMcp('docs',server);await f.save({runtime_capabilities:{[stableId]:decision},mcp_servers:{docs:server}});
 next=(await f.check()).executionRevision;assert.notEqual(next,last);last=next;
 const hooks=await f.review.hookState(f.workspaceRoot);await f.review.saveHooks(f.workspaceRoot,hooks.revision,[{id:'fixture',event:'Stop',command:'echo fixture',timeout:1,enabled:true}]);
 next=(await f.check()).executionRevision;assert.notEqual(next,last);
});

async function serviceFixture(t,{mutate,inspection,nativeProjection=false,hook,imported}={}){
 const f=await fixture(t);await f.save({});const calls=[];
 if(hook){
  f.record.manifest_family=imported??'native';const marker=imported?`.${imported}-plugin`:'.muse-plugin';await mkdir(path.join(f.cache,marker));
  if(imported==='claude')f.record.compatibility={summary:'full',declarations:[{id:'hook:probe',kind:'hook',classification:'supported'}]};
  await writeFile(path.join(f.cache,marker,'plugin.json'),JSON.stringify(imported?{name:'fixture',version:'1.0.0',hooks:{[hook.event]:[{matcher:'Bash|Read',hooks:[{type:'command',command:hook.command[0],timeout:3}]}]}}:{schemaVersion:1,name:'fixture',capabilities:{hooks:[hook]}}));
  await writeFile(f.review.inventory,JSON.stringify({plugins:{fixture:f.record}}));f.inventory=await f.review.pluginState();await f.review.approvePlugins(f.inventory.revision);
 }
 if(nativeProjection){f.record.manifest_family=imported??'muse';f.record.cache_path=path.relative(path.dirname(path.dirname(f.review.inventory)),f.cache);f.record.agent_definition_inventory={schema_version:1,status:'empty'};await writeFile(f.review.inventory,JSON.stringify({plugins:{fixture:f.record}}));f.inventory=await f.review.pluginState();await f.review.approvePlugins(f.inventory.revision);}
 const state={runtime:{binary:process.platform==='win32'?'C:/muse.exe':'/usr/bin/muse'},activeProject:{root:f.workspaceRoot}};
 const native=async()=>{
  const config=JSON.parse(await readFile(f.settings,'utf8')),d=config.runtime_capabilities?.[stableId];
  const value={record:f.record,plugin:{id:'fixture',capabilities:{mcp_servers:[{id:'probe',transport:'stdio',command:['node','server.mjs'],url:null,source_path:path.join(f.cache,'server.mjs'),source_relative_path:'server.mjs'}]}},valid:true,active:true,active_scope:'installed-plugin',runtime_capabilities:[{candidate:{kind:'mcp_server',plugin_id:'fixture',capability_id:'probe',stable_id:stableId,definition_hash:hash,source_digest:hash},status:d?.enabled?'trusted_enabled':d?'trusted_disabled':'needs_approval'}]};
  if(nativeProjection||imported){value.record={...f.record,manifest_family:imported?imported+'-compatible':'native',cache_path:f.cache};delete value.record.agent_definition_inventory;if(imported)delete value.record.compatibility;}
  if(hook){
   const h=config.runtime_capabilities?.['plugin:fixture:hook:probe'];
   value.plugin.manifest_family='native';value.plugin.capabilities.hooks=[{id:'probe',event:hook.event,matcher:null,command:hook.command,shell_command:null,source_path:path.join(f.cache,'server.mjs'),source_relative_path:'server.mjs',timeout_ms:hook.timeoutMs??600000,async:hook.async??false,compatibility_name:hook.compatibilityName??null}];
   if(imported){value.plugin.manifest_family=imported+'-compatible';Object.assign(value.plugin.capabilities.hooks[0],{matcher:'Bash|Read',shell_command:hook.command[0],source_path:null,source_relative_path:`.${imported}-plugin/plugin.json`});}
   value.runtime_capabilities.push({candidate:{kind:'hook',plugin_id:'fixture',capability_id:'probe',stable_id:'plugin:fixture:hook:probe',definition_hash:hash,source_digest:imported?'sha256:'+'b'.repeat(64):hash},status:h?.enabled?'trusted_enabled':h?'trusted_disabled':'review_needed'});
  }
  inspection?.(value);return value;
 };
 const run=async(_binary,args)=>{
  calls.push(args);
  if(args[0]==='skills')return{stdout:'{"skills":[]}'};
  if(args[1]==='list')return{stdout:JSON.stringify({plugins:[await native()]})};
  if(args[1]==='inspect')return{stdout:JSON.stringify(await native())};
  assert.ok(['approve','reject'].includes(args[1]));assert.ok([stableId,...(hook?['plugin:fixture:hook:probe']:[])].includes(args[2]));assert.deepEqual(args,['plugins',args[1],args[2],'--json']);
  const config=JSON.parse(await readFile(f.settings,'utf8')),record={...decision,enabled:args[1]==='approve'};
  config.runtime_capabilities={...config.runtime_capabilities,[args[2]]:record};await f.save(config);
  const result={decision:args[1],runtime_capabilities:[{stable_id:args[2],...record}]};await mutate?.({f,config,result});return{stdout:JSON.stringify(result)};
 };
 const service=createCustomize({getState:()=>state,environment:f.environment,dataDir:f.dataDir,review:f.review,run});t.after(()=>service.close());
 return{...f,service,calls,state};
}
test('installed plugin inspection and exact per-server native decisions remain separate',async t=>{
 const f=await serviceFixture(t),first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 assert.equal(first.id,'fixture');assert.equal(first.servers.length,1);assert.deepEqual(first.servers[0].command,['node','server.mjs']);assert.equal(first.servers[0].reviewed,false);
 assert.deepEqual(f.calls,[['plugins','inspect','fixture','--json']]);
 const command={type:'pluginMcpAction',id:'fixture',stableId,revision:first.revision,action:'approve',reviewed:true};
 await assert.rejects(f.service.dispatch({...command,reviewed:false}),/Review/);
 const result=await f.service.dispatch(command);assert.equal(result.pluginMcp.servers[0].reviewed,true);await f.check();
 const revoked=await f.service.dispatch({...command,revision:result.pluginMcp.revision,action:'reject'});assert.equal(revoked.pluginMcp.servers[0].enabled,false);await f.check();
 assert.equal(f.calls.filter(a=>a[1]==='approve').length,1);assert.equal(f.calls.filter(a=>a[1]==='reject').length,1);
 await f.save();await assert.rejects(f.check(),/capabilit/);
});
test('native inspect projection is matched to the same cache and complete persisted inventory',async t=>{
 const f=await serviceFixture(t,{nativeProjection:true});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 await f.service.dispatch({type:'pluginMcpAction',id:'fixture',stableId,revision:first.revision,action:'approve',reviewed:true});await f.check();
 f.record.agent_definition_inventory.status='changed';await writeFile(f.review.inventory,JSON.stringify({plugins:{fixture:f.record}}));await f.review.approvePlugins((await f.review.pluginState()).revision);
 await assert.rejects(f.check(),/capabilit/);
});
test('native CLI may canonicalize only the MCP settings key without granting changed server values',async t=>{
 const f=await serviceFixture(t,{mutate:async({f,config})=>{config.mcpServers=config.mcp_servers;delete config.mcp_servers;await f.save(config);}});
 const server={transport:'stdio',command:'node',args:['reviewed.mjs'],enabled:false};await f.review.approveMcp('docs',server);await f.save({mcp_servers:{docs:server}});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 await f.service.dispatch({type:'pluginMcpAction',id:'fixture',stableId,revision:first.revision,action:'approve',reviewed:true});await f.check();
});
for(const change of ['settings','package','target','busy'])test(`native plugin decisions reject stale ${change} before mutation`,async t=>{
 const f=await serviceFixture(t),first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 const command={type:'pluginMcpAction',id:'fixture',stableId,revision:first.revision,action:'approve',reviewed:true};
 if(change==='settings')await f.save({unrelated:'new'});
 if(change==='package')await writeFile(path.join(f.cache,'server.mjs'),'// changed');
 if(change==='target')command.stableId='plugin:other:mcp_server:probe';
 if(change==='busy')f.state.runtime.status='running';
 await assert.rejects(f.service.dispatch(command));assert.equal(f.calls.some(a=>['approve','reject'].includes(a[1])),false);
});
for(const failure of ['unrelated settings','package','extra acknowledgement','wrong hash','missing record','unknown outcome'])test(`native plugin ${failure} cannot create an app execution grant`,async t=>{
 const f=await serviceFixture(t,{mutate:async({f,config,result})=>{
  if(failure==='unrelated settings'){config.runtime_capabilities['plugin:other:mcp_server:probe']=decision;await f.save(config);}
  if(failure==='package')await writeFile(path.join(f.cache,'server.mjs'),'// changed after cli');
  if(failure==='extra acknowledgement')result.runtime_capabilities.push({stable_id:'plugin:other:mcp_server:probe',...decision});
  if(failure==='wrong hash')result.runtime_capabilities[0].trusted_definition_hash='sha256:'+'b'.repeat(64);
  if(failure==='missing record')await f.save({});
  if(failure==='unknown outcome')throw Error('process failed after writing');
 }}),first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 await assert.rejects(f.service.dispatch({type:'pluginMcpAction',id:'fixture',stableId,revision:first.revision,action:'approve',reviewed:true}));
 assert.equal((await f.review.reviewedPluginMcp({[stableId]:decision},{settingsPath:f.settings}))[stableId],false);
 assert.equal(f.calls.filter(a=>a[1]==='approve').length,1);
});
for(const defect of ['foreign plugin','forged stable id','wrong source digest','duplicate','extra definition','outside source','oversized command'])test(`inspection refuses ${defect}`,async t=>{
 const f=await serviceFixture(t,{inspection:value=>{
  const c=value.runtime_capabilities[0].candidate,d=value.plugin.capabilities.mcp_servers[0];
  if(defect==='foreign plugin')c.plugin_id='other';
  if(defect==='forged stable id')c.stable_id='plugin:other:mcp_server:probe';
  if(defect==='wrong source digest')c.source_digest='sha256:'+'b'.repeat(64);
  if(defect==='duplicate')value.runtime_capabilities.push(value.runtime_capabilities[0]);
  if(defect==='extra definition')d.env={TOKEN:'not-allowed'};
  if(defect==='outside source')d.source_relative_path='../outside';
  if(defect==='oversized command')d.command=['a'.repeat(20000)];
 }});
 await assert.rejects(f.service.dispatch({type:'inspectPluginMcp',id:'fixture'}),/plugin|capabilit|definition|source|command/i);
});
test('unsupported native capability kinds stay visible without an approval action',async t=>{
 const f=await serviceFixture(t,{inspection:value=>value.runtime_capabilities.push({candidate:{kind:'reminder',plugin_id:'fixture',capability_id:'on-stop',stable_id:'plugin:fixture:reminder:on-stop',definition_hash:hash,source_digest:hash},status:'needs_approval'})});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 assert.equal(first.servers[1].supported,false);
 await assert.rejects(f.service.dispatch({type:'pluginMcpAction',id:'fixture',stableId:first.servers[1].stableId,revision:first.revision,action:'approve',reviewed:true}));
 assert.equal(f.calls.some(a=>a[1]==='approve'),false);
});
test('command review hides common credentials and keeps argument boundaries',async t=>{
 const f=await serviceFixture(t,{inspection:value=>value.plugin.capabilities.mcp_servers[0].command=['node','server.mjs','--token','fixture-credential','https://user:password@example.com/mcp?key=private#secret']});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 assert.deepEqual(first.servers[0].command,['node','server.mjs','--token','[redacted]','https://[redacted]@example.com/mcp?key=[redacted]#secret']);assert.doesNotMatch(JSON.stringify(first),/fixture-credential|user:password|key=private/);
});
test('command review preserves executable syntax after an embedded URL',async t=>{
 const command=['node','-e',"fetch('https://example.com/?q=x');console.log('hidden-action')"];
 const f=await serviceFixture(t,{inspection:value=>value.plugin.capabilities.mcp_servers[0].command=command});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;assert.deepEqual(first.servers[0].command,command);
});
test('command review applies one credential policy to separated and inline flags',async t=>{
 const command=['node','server.mjs','--key=fixture-secret','--authorization=fixture-secret','--api-key','separated-secret','--authorization','Bearer bearer-secret','--mode=ordinary'];
 const f=await serviceFixture(t,{inspection:value=>value.plugin.capabilities.mcp_servers[0].command=command});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 assert.deepEqual(first.servers[0].command,['node','server.mjs','--key=[redacted]','--authorization=[redacted]','--api-key','[redacted]','--authorization','Bearer [redacted]','--mode=ordinary']);assert.doesNotMatch(JSON.stringify(first),/fixture-secret|separated-secret|bearer-secret/);
});
for(const script of ["fetch('https://user:password@example.com/?key=secret');console.log('visible-action')","--key=secret;console.log('visible-action')","TOKEN='secret';doSomething()"])
test('ambiguous embedded credentials refuse review instead of hiding executable syntax: '+script.slice(0,18),async t=>{
 const f=await serviceFixture(t,{inspection:value=>value.plugin.capabilities.mcp_servers[0].command=['node','-e',script]});
 await assert.rejects(f.service.dispatch({type:'inspectPluginMcp',id:'fixture'}),error=>/credential|review/i.test(error.message)&&!error.message.includes('password'));
 assert.equal(f.calls.some(args=>args[1]==='approve'),false);
});
test('URL argument review preserves non-secret parameters, path and fragment syntax',async t=>{
 const f=await serviceFixture(t,{inspection:value=>value.plugin.capabilities.mcp_servers[0].command=['node','server.mjs','https://example.com/mcp?q=one%20two&api_key=secret&mode=read#section','https://example.com/#access_token=fragment-secret&scope=read']});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 assert.deepEqual(first.servers[0].command.slice(2),['https://example.com/mcp?q=one%20two&api_key=[redacted]&mode=read#section','https://example.com/#access_token=[redacted]&scope=read']);
});
test('approval grant rechecks changes immediately before persistence',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.review.approvePluginMcp(stableId,decision,f.inventory.revision,{settingsPath:f.settings,beforeCommit:()=>f.save({runtime_capabilities:{[stableId]:{...decision,trusted_definition_hash:'sha256:'+'b'.repeat(64)}}})}),/changed/);
 await assert.rejects(f.check(),/capabilit/);
});
test('malformed or excessive native decisions cannot bypass the configuration guard',async t=>{
 const f=await fixture(t);
 for(const value of [[],4,'text',{[stableId]:{enabled:false}},Object.fromEntries(Array.from({length:501},(_,i)=>['plugin:fixture:mcp_server:p'+i,{...decision,enabled:false}]))]){
  await f.save({runtime_capabilities:value});await assert.rejects(f.check(),/capabilit|plugin/);
 }
});
test('a custom native plugin store is explained before attempting an unbound approval',async t=>{
 const f=await fixture(t);let calls=0;
 const service=createCustomize({getState:()=>({}),dataDir:f.dataDir,review:f.review,environment:{...f.environment,XDG_DATA_HOME:path.join(f.root,'custom-store')},run:async()=>{calls++;throw Error('Unexpected CLI call');}});t.after(()=>service.close());
 await assert.rejects(service.dispatch({type:'inspectPluginMcp',id:'fixture'}),/default.*plugin store/);assert.equal(calls,0);
});

const hookId='plugin:fixture:hook:probe';
test('same-name plugin hooks and MCP servers require independent exact grants',async t=>{
 const f=await fixture(t);await f.save({runtime_capabilities:{[stableId]:decision,[hookId]:decision}});await f.grant();
 await assert.rejects(f.check(),/capabilit/);assert.equal(typeof f.review.approvePluginHook,'function');
 await assert.rejects(f.review.approvePluginMcp(hookId,decision,f.inventory.revision,{settingsPath:f.settings}),/Invalid/);
 await assert.rejects(f.review.approvePluginHook(stableId,decision,f.inventory.revision,{settingsPath:f.settings}),/Invalid/);
 await f.review.approvePluginHook(hookId,decision,f.inventory.revision,{settingsPath:f.settings});const before=await f.check();
 await f.review.revokePluginHook(hookId);await assert.rejects(f.check(),/capabilit/);
 assert.equal((await f.review.reviewedPluginMcp({[stableId]:decision},{settingsPath:f.settings}))[stableId],true);
 await f.review.approvePluginHook(hookId,decision,f.inventory.revision,{settingsPath:f.settings});await f.save({runtime_capabilities:{[stableId]:decision,[hookId]:{...decision,enabled:false}}});
 assert.notEqual((await f.check()).executionRevision,before.executionRevision);
});
for(const change of ['package','record','settings location','persist race'])test('native plugin hook grant does not survive '+change,async t=>{
 const f=await fixture(t);await f.save({runtime_capabilities:{[hookId]:decision}});assert.equal(typeof f.review.approvePluginHook,'function');
 const grant=()=>f.review.approvePluginHook(hookId,decision,f.inventory.revision,{settingsPath:f.settings});
 if(change==='persist race'){
  await assert.rejects(f.review.approvePluginHook(hookId,decision,f.inventory.revision,{settingsPath:f.settings,beforeCommit:()=>f.save({runtime_capabilities:{[hookId]:{...decision,enabled:false}}})}),/changed/);
  await f.save({runtime_capabilities:{[hookId]:decision}});await assert.rejects(f.check(),/capabilit/);return;
 }
 await grant();await f.check();
 if(change==='package'){await writeFile(path.join(f.cache,'server.mjs'),'// changed hook dependency');await f.review.approvePlugins((await f.review.pluginState()).revision);}
 if(change==='record')await f.save({runtime_capabilities:{[hookId]:{...decision,trusted_definition_hash:'sha256:'+'b'.repeat(64)}}});
 if(change==='settings location'){f.environment.XDG_CONFIG_HOME=path.join(f.root,'xdg');await mkdir(path.join(f.environment.XDG_CONFIG_HOME,'muse'),{recursive:true});await writeFile(path.join(f.environment.XDG_CONFIG_HOME,'muse','settings.json'),await readFile(f.settings));}
 await assert.rejects(f.check(),/capabilit/);
});
test('disabled native hook records confer no execution while malformed or unknown kinds stay blocked',async t=>{
 const f=await fixture(t);await f.save({runtime_capabilities:{[hookId]:{...decision,enabled:false}}});await f.check();
 for(const record of [{enabled:false},{...decision,enabled:false,command:'unexpected'}]){await f.save({runtime_capabilities:{[hookId]:record}});await assert.rejects(f.check(),/capabilit/);}
 await f.save({runtime_capabilities:{'plugin:fixture:reminder:probe':{...decision,enabled:false}}});await assert.rejects(f.check(),/capabilit/);
});

const rawHook=()=>({id:'probe',event:'UserPromptSubmit',command:['node','server.mjs'],timeoutMs:3000,async:false,statusMessage:'Running fixture'});
const hookCommand=view=>({type:'pluginMcpAction',id:'fixture',stableId:hookId,revision:view.revision,action:'approve',reviewed:true});
for(const imported of ['claude','codex'])test(`${imported} source-bound shell hooks approve and revoke independently through Customize`,async t=>{
 const f=await serviceFixture(t,{hook:{...rawHook(),event:'PreToolUse',command:['node hooks/check.mjs && echo done']},imported,nativeProjection:true});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp,row=first.servers.find(r=>r.stableId===hookId);
 assert.equal(row.supported,true);assert.equal(row.hook.execution,'shell');assert.equal(row.hook.matcher,'Bash|Read');assert.deepEqual(row.command,['node hooks/check.mjs && echo done']);
 const approved=(await f.service.dispatch(hookCommand(first))).pluginMcp;assert.equal(approved.servers.find(r=>r.stableId===hookId).reviewed,true);assert.equal(approved.servers[0].reviewed,false);await f.check();
 const revoked=(await f.service.dispatch({...hookCommand(approved),action:'reject'})).pluginMcp;assert.equal(revoked.servers.find(r=>r.stableId===hookId).enabled,false);await f.check();
});
test('adding a hidden imported condition invalidates consent before native approval',async t=>{
 const f=await serviceFixture(t,{hook:{...rawHook(),event:'PreToolUse',command:['node hooks/check.mjs']},imported:'claude',nativeProjection:true});
 const first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 const file=path.join(f.cache,'.claude-plugin/plugin.json'),manifest=JSON.parse(await readFile(file,'utf8'));manifest.hooks.PreToolUse[0].hooks[0].if='Bash(git *)';await writeFile(file,JSON.stringify(manifest));
 await assert.rejects(f.service.dispatch(hookCommand(first)),/changed|review/i);assert.equal(f.calls.filter(a=>a[1]==='approve').length,0);await assert.rejects(f.check(),/plugin inventory/);
});
test('native hook inspection shows complete automatic behavior and exact separate decisions',async t=>{
 const f=await serviceFixture(t,{hook:rawHook()}),first=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 const hook=first.servers.find(r=>r.stableId===hookId);assert.equal(hook.supported,true);
 assert.deepEqual(hook.hook,{event:'UserPromptSubmit',timeoutMs:3000,async:false,matcher:null,compatibilityName:null});assert.deepEqual(hook.command,['node','server.mjs']);
 let next=(await f.service.dispatch(hookCommand(first))).pluginMcp;assert.equal(next.servers.find(r=>r.stableId===hookId).reviewed,true);assert.equal(next.servers[0].reviewed,false);await f.check();
 next=(await f.service.dispatch({...hookCommand(next),stableId})).pluginMcp;assert.ok(next.servers.every(r=>r.reviewed));
 next=(await f.service.dispatch({...hookCommand(next),action:'reject'})).pluginMcp;assert.equal(next.servers.find(r=>r.stableId===hookId).enabled,false);assert.equal(next.servers[0].reviewed,true);await f.check();
 assert.equal(f.calls.filter(a=>a[1]==='approve'&&a[2]===hookId).length,1);
});
for(const change of ['shell','matcher','unknown field','unknown event','unknown manifest field','output capabilities','manifest mismatch','foreign manifest'])test('native hook review refuses unrepresented '+change,async t=>{
 const hook=rawHook();if(change==='unknown manifest field')hook.hidden='extra';if(change==='output capabilities')hook.outputCapabilities=['skills.v1'];
 const f=await serviceFixture(t,{hook,inspection:value=>{const h=value.plugin.capabilities.hooks[0];
  if(change==='shell')h.shell_command='node server.mjs';if(change==='matcher')h.matcher='.*';if(change==='unknown field')h.hidden='extra';if(change==='unknown event')h.event='UnknownEvent';if(change==='manifest mismatch')h.async=true;if(change==='foreign manifest')value.plugin.manifest_family='claude';
 }});
 const view=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp,row=view.servers.find(r=>r.stableId===hookId);assert.equal(row.supported,false);assert.ok(row.reason);
 await assert.rejects(f.service.dispatch(hookCommand(view)),/changed|review/i);assert.equal(f.calls.filter(a=>a[1]==='approve').length,0);
});
for(const change of ['event','timeout','async','package','settings','acknowledgment'])test('native hook decision cannot retain stale '+change,async t=>{
 let changed=false;const f=await serviceFixture(t,{hook:rawHook(),inspection:value=>{if(!changed)return;const h=value.plugin.capabilities.hooks[0];if(change==='event')h.event='Stop';if(change==='timeout')h.timeout_ms=4000;if(change==='async')h.async=true;},mutate:async({f,config,result})=>{
  if(change==='package')await writeFile(path.join(f.cache,'server.mjs'),'changed after CLI write');
  if(change==='settings'){config.extra='changed';await f.save(config);}
  if(change==='acknowledgment')result.runtime_capabilities[0].stable_id=stableId;
 }});
 const view=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;changed=true;
 await assert.rejects(f.service.dispatch(hookCommand(view)),/changed|verified|review/i);
 const decisions=JSON.parse(await readFile(f.settings,'utf8')).runtime_capabilities??{};
 if(decisions[hookId]?.enabled)await assert.rejects(f.check(),/plugin|capabilit/i);
 assert.notEqual((await f.review.reviewedPluginCapabilities({[hookId]:decision},{settingsPath:f.settings}))[hookId],true);
});

for(const mode of ['default timeout','background','tool alias'])test('native hook review retains '+mode,async t=>{
 const hook=rawHook();if(mode==='default timeout')delete hook.timeoutMs;if(mode==='background')hook.async=true;if(mode==='tool alias'){hook.event='PermissionRequest';hook.compatibilityName='fixture_tools';}
 const f=await serviceFixture(t,{hook}),view=(await f.service.dispatch({type:'inspectPluginMcp',id:'fixture'})).pluginMcp;
 const row=view.servers.find(r=>r.stableId===hookId);assert.equal(row.supported,true);assert.deepEqual(row.hook,{event:hook.event,timeoutMs:hook.timeoutMs??600000,async:hook.async,matcher:null,compatibilityName:hook.compatibilityName??null});
 const approved=(await f.service.dispatch(hookCommand(view))).pluginMcp;assert.equal(approved.servers.find(r=>r.stableId===hookId).reviewed,true);await f.check();
});
