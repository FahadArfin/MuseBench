import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectDiscoverySources,resolveDiscoverySelection} from '../src/runtime/discovery-sources.mjs';
import {createDiscoveryGateway} from '../src/runtime/discovery-gateway.mjs';
const remote=await import('../src/runtime/discovery-remote.mjs').catch(()=>({}));
import {peer,source} from './fixtures/discovery-remote-peer.mjs';

test('remote inspection is inert, mixed, private, source-bound and excludes direct sources',async()=>{
 const f=await peer(),root=await mkdtemp(path.join(tmpdir(),'remote-source-'));try{
 const profile=path.join(root,'profile'),workspace=path.join(root,'project'),config=path.join(profile,'.config','muse','settings.json');await mkdir(path.dirname(config),{recursive:true});await mkdir(workspace);
 const entry={type:'http',framing:'auto',url:f.url,headers:{Authorization:'fixture-private-token'},enabled:false};const settings={mcpServers:{remote:entry,local:{command:process.execPath,enabled:false},direct:{...entry,enabled:true}}};await writeFile(config,JSON.stringify(settings));
 const options={workspaceRoot:workspace,environment:{...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config')},extensionReview:{allowMcp:async()=>true,pluginState:async()=>({entries:{}})}};
 const value=await inspectDiscoverySources(options),row=value.rows.find(row=>row.name==='remote');assert.equal(row.eligible,true);assert.equal(row.transport,'streamable-http');assert.deepEqual(row.headerKeys,['Authorization']);assert.equal(row.address,f.url);assert.equal(value.rows.find(row=>row.name==='local').eligible,true);assert.equal(value.rows.find(row=>row.name==='direct').eligible,false);assert.equal(JSON.stringify(value.rows).includes('fixture-private-token'),false);assert.equal(f.requests.length,0);
 const selection={sources:[{id:row.id,revision:row.revision}],reviewed:true};assert.equal((await resolveDiscoverySelection({...options,selection}))[0].headers.Authorization,'fixture-private-token');settings.mcpServers.remote.headers.Authorization='changed';await writeFile(config,JSON.stringify(settings));await assert.rejects(resolveDiscoverySelection({...options,selection}),/changed|review/i);
 }finally{await f.close();await rm(root,{recursive:true,force:true});}
});
test('catalog-stage authorization failure explains required setup without exposing its response',async()=>{
 const f=await peer({catalogStatus:401}),service=createDiscoveryGateway({sources:[source(f.url)],verify:async()=>{}});try{await assert.rejects(service.search({query:''}),e=>/authorization setup/i.test(e.message)&&!e.message.includes('secret'));await assert.rejects(service.search({query:''}),/closed/);assert.equal(f.effects,0);}finally{await service.dispose();await f.close();}
});
test('established remote expansion is private, bounded, validated and consent changes with environment',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'remote-expand-'));try{
 const profile=path.join(root,'profile'),workspace=path.join(root,'project'),config=path.join(profile,'.config','muse','settings.json');await mkdir(path.dirname(config),{recursive:true});await mkdir(workspace);
 const entry={type:'streamable-http',url:'https://${HOST:-example.com}/private/${PATH_TOKEN}',headers:{Authorization:'Bearer ${TOKEN}',Fallback:'${ABSENT:-fallback} $$5'},enabled:false};await writeFile(config,JSON.stringify({mcpServers:{remote:entry}}));
 const environment={...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config'),TOKEN:'synthetic-private-one',PATH_TOKEN:'synthetic-path-secret'};
 const options={workspaceRoot:workspace,environment,extensionReview:{allowMcp:async()=>true,pluginState:async()=>({entries:{}})}};
 const snap=await inspectDiscoverySources(options),row=snap.rows[0],definition=snap.definitions.get(row.id);assert.equal(row.eligible,true);assert.equal(definition.headers.Authorization,'Bearer synthetic-private-one');assert.equal(definition.headers.Fallback,'fallback $5');assert.equal(definition.url,'https://example.com/private/synthetic-path-secret');assert.equal(row.address,'https://${HOST:-example.com}/private/${PATH_TOKEN}');assert.equal(row.resolvedOrigin,'https://example.com');assert.deepEqual(row.environmentKeys,['ABSENT','HOST','PATH_TOKEN','TOKEN']);assert.doesNotMatch(JSON.stringify(snap.rows),/synthetic-private|synthetic-path-secret/);
 const selection={sources:[{id:row.id,revision:row.revision}],reviewed:true};environment.TOKEN='synthetic-private-two';await assert.rejects(resolveDiscoverySelection({...options,selection}),/changed|review/);
 delete environment.TOKEN;assert.match((await inspectDiscoverySources(options)).rows[0].reason,/unavailable/);environment.TOKEN='synthetic\r\nbad';assert.equal((await inspectDiscoverySources(options)).rows[0].eligible,false);environment.TOKEN='safe';environment.HOST='user:secret@example.com';const invalid=(await inspectDiscoverySources(options)).rows[0];assert.equal(invalid.eligible,false);assert.doesNotMatch(JSON.stringify(invalid),/user:secret/);environment.HOST='example.com';environment.TOKEN='x'.repeat(20000);assert.match((await inspectDiscoverySources(options)).rows[0].reason,/expanded.*limit/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
for(const options of [{current:true},{mode:'json'},{mode:'sse'}])test(`actual remote connection/catalog/call ${JSON.stringify(options)}`,async()=>{
 assert.equal(typeof remote.createRemoteDiscoveryClient,'function');const f=await peer(options),client=remote.createRemoteDiscoveryClient(source(f.url));try{await client.connect();assert.equal((await client.catalog()).tools[0].name,'allowed');assert.equal((await client.call({name:'allowed',arguments:{value:7}})).content[0].text,'remote fixture receipt');assert.equal(f.effects,1);if(options.current)assert.equal(f.requests.some(r=>r.message?.method==='initialize'),false);}finally{await client.close();await f.close();}
});
for(const call of ['disconnect','auth','task','status-403','status-404','status-429','status-500','malformed','protocol','input','hang','oversized'])test(`submitted remote ${call} stays once-only and unknown`,async()=>{
 const f=await peer({call,current:['protocol','input'].includes(call)}),service=createDiscoveryGateway({sources:[source(f.url)],verify:async()=>{}});try{const result=await service.search({query:''});const args={sourceId:'global:fixture',catalogRevision:result.sources[0].catalogRevision,tool:'allowed',arguments:{value:7}};const receipt=await service.call(args);assert.equal(receipt.outcome,'unknown');assert.doesNotMatch(JSON.stringify(receipt),/secret|opaque/);await assert.rejects(service.call(args),/closed|reconnect/i);assert.equal(f.effects,1);assert.equal(f.requests.filter(r=>r.message?.method==='server/discover').length,1);assert.equal(f.requests.filter(r=>r.message?.method==='initialize').length,['protocol','input'].includes(call)?0:1);}finally{await service.dispose();await f.close();}
});
test('fully received bounded large result retains completed/truncated semantics',async()=>{
 const f=await peer({call:'large'}),service=createDiscoveryGateway({sources:[source(f.url)],verify:async()=>{}});try{const result=await service.search({query:''}),receipt=await service.call({sourceId:'global:fixture',catalogRevision:result.sources[0].catalogRevision,tool:'allowed',arguments:{value:7}});assert.equal(receipt.outcome,'completed');assert.equal(receipt.truncated,true);assert.equal(f.effects,1);}finally{await service.dispose();await f.close();}
});
test('mixed local and current remote selection remains lazy and has one owner per source',async()=>{
 const f=await peer({current:true}),root=await mkdtemp(path.join(tmpdir(),'remote-mixed-')),log=path.join(root,'local.jsonl');
 const local={id:'global:local',name:'local',revision:'b'.repeat(64),transport:'stdio',command:process.execPath,args:[path.resolve('test/fixtures/discovery-server.mjs'),log],cwd:root,env:{...process.env},enabledTools:['allowed'],disabledTools:[],startupMs:2000,callMs:500};
 const service=createDiscoveryGateway({sources:[local,source(f.url)],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),sessionId:'mixed-fixture',verify:async()=>{}});
 try{assert.equal(f.requests.length,0);const result=await service.search({query:''});assert.equal(result.sources.length,2);for(const row of result.sources){assert.equal(row.tools[0].name,'allowed');assert.equal((await service.call({sourceId:row.sourceId,catalogRevision:row.catalogRevision,tool:'allowed',arguments:{value:7}})).outcome,'completed');}assert.equal(f.effects,1);}finally{await service.dispose();await f.close();await rm(root,{recursive:true,force:true});}
});
test('remote session identity stays private and bounded DELETE accepts 405',async()=>{
 const f=await peer({session:true}),client=remote.createRemoteDiscoveryClient(source(f.url));try{await client.connect();await client.catalog();assert.equal(f.requests.find(r=>r.message?.method==='tools/list').headers['mcp-session-id'],'private-fixture-session');await client.close();assert.equal(f.requests.filter(r=>r.method==='DELETE').length,1);assert.equal(client.activeRequests,0);}finally{await client.close();await f.close();}
});
test('invalid remote catalog identity fails closed rather than silently rebuilding later',async()=>{
 const tool={name:'duplicate',inputSchema:{type:'object'}},f=await peer({catalog:[tool,tool]}),service=createDiscoveryGateway({sources:[source(f.url)],verify:async()=>{}});try{await assert.rejects(service.search({query:''}),/identity/);await assert.rejects(service.search({query:''}),/closed/);assert.equal(f.requests.filter(r=>r.message?.method==='tools/list').length,1);}finally{await service.dispose();await f.close();}
});

for(const isError of [false,true])test(`remote oversized ${isError?'failed':'completed'} receipt retains preview with one call`,async()=>{
 const f=await peer({result:{isError,content:[{type:'text',text:'START'+ '😀'.repeat(50000)+'END'}]}}),service=createDiscoveryGateway({sources:[source(f.url)],verify:async()=>{}});
 try{const row=(await service.search({query:''})).sources[0],value=await service.call({sourceId:row.sourceId,catalogRevision:row.catalogRevision,tool:'allowed',arguments:{value:7}});assert.equal(value.outcome,isError?'failed':'completed');assert.equal(value.sourceId,row.sourceId);assert.equal(value.catalogRevision,row.catalogRevision);assert.equal(value.truncated,true);assert.ok(value.preview?.text.startsWith('START'));assert.ok(value.preview.text.endsWith('END'));assert.ok(Array.from(value.preview.text).length<=16000);assert.equal(f.effects,1);}finally{await service.dispose();await f.close();}
});
for(const isError of [false,true])test(`remote invalid oversized structured ${isError?'error':'success'} stays unknown without a retry`,async()=>{
 const f=await peer({catalog:[{name:'allowed',inputSchema:{type:'object'},outputSchema:{type:'object',properties:{value:{type:'integer'}},required:['value']}}],result:{isError,content:[{type:'text',text:'x'.repeat(180000)}],structuredContent:{value:'invalid'}}}),service=createDiscoveryGateway({sources:[source(f.url)],verify:async()=>{}});
 try{const row=(await service.search({query:''})).sources[0],args={sourceId:row.sourceId,catalogRevision:row.catalogRevision,tool:'allowed',arguments:{}},value=await service.call(args);assert.equal(value.outcome,'unknown');assert.equal(value.preview,undefined);await assert.rejects(service.call(args),/closed/);assert.equal(f.effects,1);}finally{await service.dispose();await f.close();}
});
