import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {restoreNativeSession,prepareNativeSession} from '../src/shared/native-session.mjs';
const sources=await import('../src/runtime/discovery-sources.mjs').catch(()=>({}));
const shared=await import('../src/shared/tool-discovery.mjs').catch(()=>({}));
test('ordinary PATH executables and default JSONL work alongside unrelated reviewed plugin capabilities',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'discovery-plugin-'));try{
 const profile=path.join(root,'profile'),workspace=path.join(root,'workspace'),cache=path.join(root,'plugin');await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(workspace);await mkdir(path.join(cache,'.muse-plugin'),{recursive:true});
 await writeFile(path.join(cache,'.muse-plugin','plugin.json'),JSON.stringify({schemaVersion:1,name:'plugin',capabilities:{mcp_servers:[{id:'colliding',transport:'stdio',command:['node','tool.mjs']}]}}));
 const entry={command:path.basename(process.execPath),enabled:false};await writeFile(path.join(profile,'.config','muse','settings.json'),JSON.stringify({mcpServers:{docs:entry,colliding:entry}}));
 const options={workspaceRoot:workspace,environment:{...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config'),PATH:path.dirname(process.execPath)},extensionReview:{inventory:path.join(root,'installed.json'),allowMcp:async()=>true,pluginState:async()=>({revision:'plugins-reviewed',entries:{plugin:'hash'},records:{plugin:{cache_path:cache,enabled:true,manifest_family:'muse'}}})}};
 for(const key of Object.keys(options.environment))if(key.toUpperCase()==='PATH'&&key!=='PATH')delete options.environment[key];
 let result=await sources.inspectDiscoverySources(options);assert.equal(result.rows.find(row=>row.name==='docs').eligible,true);assert.equal(result.rows.find(row=>row.name==='colliding').eligible,false);assert.match(result.rows.find(row=>row.name==='colliding').reason,/collision|plugin/i);
 await writeFile(path.join(cache,'.muse-plugin','plugin.json'),JSON.stringify({schemaVersion:1,name:'plugin',capabilities:{skills:[{id:'skill'}],hooks:[]}}));result=await sources.inspectDiscoverySources(options);assert.equal(result.rows.find(row=>row.name==='docs').eligible,true);
 await writeFile(path.join(cache,'.muse-plugin','plugin.json'),JSON.stringify({schemaVersion:1,name:'plugin',capabilities:{mcp_servers:'dynamic'}}));result=await sources.inspectDiscoverySources(options);assert.equal(result.rows.find(row=>row.name==='docs').eligible,false);assert.match(result.rows.find(row=>row.name==='docs').reason,/unknown|inspect/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('discovery selection is exact, source bound, reviewed and bounded',()=>{
 assert.equal(typeof shared.discoverySelection,'function','selection validator exists');
 const a={id:'global:docs',revision:'a'.repeat(64)};
 assert.deepEqual(shared.discoverySelection({sources:[a],reviewed:true}),{sources:[a],reviewed:true});
 for(const value of [{sources:[a],reviewed:false},{sources:[a,a],reviewed:true},{sources:[a],reviewed:true,command:'bad'},{sources:[],reviewed:true},{sources:[{...a,revision:'old'}],reviewed:true}])assert.throws(()=>shared.discoverySelection(value));
});
test('inspection never starts a source; only reviewed disabled canonical stdio is eligible and safe',async()=>{
 assert.equal(typeof sources.inspectDiscoverySources,'function','source inspector exists');
 const root=await mkdtemp(path.join(tmpdir(),'discovery-source-'));try{
 const profile=path.join(root,'profile'),workspace=path.join(root,'workspace');await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(workspace);
 const definition={command:process.execPath,args:['never-start'],enabled:false,framing:'line_delimited_json',env:{SECRET:'private-value'}};
 const settings=path.join(profile,'.config','muse','settings.json');await writeFile(settings,JSON.stringify({mcpServers:{docs:definition,direct:{...definition,enabled:true},conflict:{...definition,env:{NODE_OPTIONS:'--bad'}},clr:{...definition,env:{COR_ENABLE_PROFILING:'1'}},http:{url:'https://example.invalid',enabled:false}}}));
 const options={workspaceRoot:workspace,environment:{...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config')},extensionReview:{allowMcp:async(name)=>name!=='unreviewed',pluginState:async()=>({entries:{}})}};
 const snapshot=await sources.inspectDiscoverySources(options);assert.equal(snapshot.rows.find(r=>r.name==='docs').eligible,true);for(const name of ['direct','conflict','clr','http'])assert.equal(snapshot.rows.find(r=>r.name===name).eligible,false);
 assert.equal(JSON.stringify(snapshot.rows).includes('private-value'),false);assert.deepEqual(snapshot.rows[0].environmentKeys,['SECRET']);
 await sources.resolveDiscoverySelection({...options,selection:{sources:[{id:snapshot.rows[0].id,revision:snapshot.rows[0].revision}],reviewed:true}});
 await writeFile(settings,JSON.stringify({mcpServers:{docs:{...definition,args:['changed']}}}));await assert.rejects(sources.resolveDiscoverySelection({...options,selection:{sources:[{id:snapshot.rows[0].id,revision:snapshot.rows[0].revision}],reviewed:true}}),/changed|review/i);
 await writeFile(path.join(workspace,'.mcp.json'),JSON.stringify({mcpServers:{docs:definition}}));assert.equal((await sources.inspectDiscoverySources(options)).rows.find(r=>r.name==='docs').eligible,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('saved discovery identities survive migration and require matching fresh review',()=>{
 const selection={sources:[{id:'global:docs',revision:'a'.repeat(64)}]};const value={id:'native',root:'C:/project',transport:'msp',seeded:true,status:'ready',toolDiscovery:selection};
 assert.deepEqual(restoreNativeSession(value).toolDiscovery,selection);
 assert.throws(()=>prepareNativeSession(value,value.root,{transport:'msp',nativeSessionId:'native'}),/review/i);
 assert.equal(prepareNativeSession(value,value.root,{transport:'msp',nativeSessionId:'native',toolDiscovery:selection}).session.id,'native');
 for(const bad of [null,{sources:[]},{sources:[{id:'global:docs',revision:'new'}]},'future']){const restored=restoreNativeSession({...value,toolDiscovery:bad});assert.equal(restored.id,'native');assert.equal(restored.unsupportedToolDiscovery,true);assert.equal(restored.status,'needs-recovery');assert.deepEqual(restoreNativeSession(restored),restored);assert.throws(()=>prepareNativeSession(restored,value.root,{transport:'msp',nativeSessionId:'native'}),/unsupported/i);}
});
