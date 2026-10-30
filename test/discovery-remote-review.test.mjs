import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {remoteAddressKind,resolveRemoteDestination} from '../src/runtime/discovery-remote-network.mjs';
import {inspectDiscoverySources} from '../src/runtime/discovery-sources.mjs';
import {createDiscoveryMcpConfig} from '../electron/discovery-mcp-config.mjs';
import {peer} from './fixtures/discovery-remote-peer.mjs';
import {PassThrough} from 'node:stream';
import {createDiscoveryMcpServer} from '../src/runtime/discovery-mcp.mjs';
import {discoverySetupError,discoverySetupKind,readDiscoverySetupKind,readDiscoverySetupResponse} from '../src/runtime/discovery-errors.mjs';

test('R1 exact reserved IPv4 prefixes keep public neighbors and mapped IPv6 reachable',async()=>{
 const reserved=['0.1.2.3','100.64.0.1','100.127.255.254','169.254.1.1','192.0.0.1','192.0.2.1','198.18.0.1','198.19.255.254','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255'];
 const neighbors=['100.63.255.254','100.128.0.1','192.0.1.1','192.0.3.1','192.0.10.1','192.2.10.1','198.17.255.254','198.20.0.1','198.51.99.1','198.51.101.1','203.0.112.1','203.0.114.1'];
 for(const [addresses,kind] of [[neighbors,'public'],[reserved,'prohibited']])for(const address of addresses){
  const p=address.split('.').map(Number),mapped=`::ffff:${((p[0]<<8)|p[1]).toString(16)}:${((p[2]<<8)|p[3]).toString(16)}`;
  for(const value of [address,`::ffff:${address}`,mapped]){
   assert.equal(remoteAddressKind(value),kind,value);
   const resolve=()=>resolveRemoteDestination(new URL('https://public.example/mcp'),{lookup:async()=>[{address:value,family:value.includes(':')?6:4}]});
   if(kind==='public')assert.equal((await resolve()).address,value);else await assert.rejects(resolve(),/scope/);
  }
 }
 for(const [address,kind] of [['10.1.2.3','private'],['172.16.1.1','private'],['192.168.1.1','private'],['127.0.0.1','loopback'],['::ffff:127.0.0.1','loopback']])assert.equal(remoteAddressKind(address),kind,address);
});

test('R2 remote template syntax fails inertly while escaped and substituted literals remain valid',async()=>{
 const f=await peer(),root=await mkdtemp(path.join(tmpdir(),'remote-review-template-'));try{
  const profile=path.join(root,'profile'),workspace=path.join(root,'project'),file=path.join(profile,'.config','muse','settings.json');await mkdir(path.dirname(file),{recursive:true});await mkdir(workspace);
  const entry={type:'streamable-http',url:f.url,enabled:false},bad=['${TOKEN:+present}','${TOKEN','${TOKEN-default}','${}','${TOKEN:-${OTHER}}'];
  const servers={escaped:{...entry,headers:{Authorization:'Bearer $${TOKEN}'}},substituted:{...entry,headers:{Authorization:'Bearer ${TOKEN}'}},defaults:{...entry,headers:{Authorization:'${ABSENT:-fallback} $$5'}},emptyDefault:{...entry,headers:{Authorization:'${EMPTY:-fallback}'}},emptyBare:{...entry,headers:{Authorization:'${EMPTY}'}},presentDefault:{...entry,headers:{Authorization:'${PRESENT:-fallback}'}},local:{command:process.execPath,enabled:false,env:{LITERAL:'${TOKEN:+present}'}}};
  for(let i=0;i<bad.length;i++){servers['header'+i]={...entry,headers:{Authorization:'Bearer '+bad[i]}};servers['url'+i]={...entry,url:f.url+'/'+bad[i]};}
  await writeFile(file,JSON.stringify({mcpServers:servers}));
  const snapshot=await inspectDiscoverySources({workspaceRoot:workspace,environment:{...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config'),TOKEN:'${ENV_LITERAL}',EMPTY:'',PRESENT:'wins'},extensionReview:{allowMcp:async()=>true,pluginState:async()=>({entries:{}})}});
  for(const row of snapshot.rows.filter(row=>/^(header|url)/.test(row.name))){assert.equal(row.eligible,false,row.name);assert.match(row.reason,/template|interpolation|expression/i);}
  for(const name of ['escaped','substituted','defaults','local'])assert.equal(snapshot.rows.find(row=>row.name===name).eligible,true,name);
  assert.equal(snapshot.definitions.get('global:escaped').headers.Authorization,'Bearer ${TOKEN}');assert.deepEqual(snapshot.rows.find(row=>row.name==='escaped').environmentKeys,[]);
  assert.equal(snapshot.definitions.get('global:substituted').headers.Authorization,'Bearer ${ENV_LITERAL}');assert.deepEqual(snapshot.rows.find(row=>row.name==='substituted').environmentKeys,['TOKEN']);assert.equal(snapshot.definitions.get('global:defaults').headers.Authorization,'fallback $5');
  assert.equal(snapshot.definitions.get('global:emptyDefault').headers.Authorization,'fallback');assert.equal(snapshot.definitions.get('global:emptyBare').headers.Authorization,'');assert.equal(snapshot.definitions.get('global:presentDefault').headers.Authorization,'wins');
  assert.equal(snapshot.definitions.get('global:local').env.LITERAL,'${TOKEN:+present}','Existing stdio literal behavior is preserved');assert.equal(f.requests.length,0);
 }finally{await f.close();await rm(root,{recursive:true,force:true});}
});

async function brokerFixture(remote){
 const root=await mkdtemp(path.join(tmpdir(),'remote-review-broker-'));let lease,client;
 try{
  const profile=path.join(root,'profile'),workspace=path.join(root,'project'),file=path.join(profile,'.config','muse','settings.json');await mkdir(path.dirname(file),{recursive:true});await mkdir(workspace);
  await writeFile(file,JSON.stringify({mcpServers:{fixture:{type:'streamable-http',url:remote.url,enabled:false,headers:{Authorization:'synthetic-private-token'}}}}));
  const factory=createDiscoveryMcpConfig({appRoot:process.cwd(),helperPath:path.resolve('native/bin/MuseBenchJob.exe'),environment:{...process.env,HOME:profile,USERPROFILE:profile,XDG_CONFIG_HOME:path.join(profile,'.config')},extensionReview:{allowMcp:async()=>true,pluginState:async()=>({entries:{}})}}),inspection=await factory.inspect(workspace);
  lease=await factory(workspace,{sources:inspection.rows.map(({id,revision})=>({id,revision})),reviewed:true});
  const transport=new StdioClientTransport({...lease.config,cwd:workspace,env:{...lease.config.env,MUSE_SESSION_ID:'review-broker-fixture'},stderr:'pipe'});transport.stderr?.resume();client=new Client({name:'review-fixture',version:'1'},{capabilities:{}});await client.connect(transport);
  return{client,async close(){await client.close();await lease.close();await rm(root,{recursive:true,force:true});}};
 }catch(error){await client?.close().catch(()=>{});await lease?.close();await rm(root,{recursive:true,force:true});throw error;}
}
async function failingPeer(status){
 let requests=0;const server=createServer((_req,res)=>{requests++;res.writeHead(status,status===307?{Location:'/private-redirect-token'}:{});res.end('private server error token');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{url:`http://127.0.0.1:${server.address().port}/mcp`,get requests(){return requests;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

test('R3 actual worker broker and native wrapper preserve only classified search setup errors',async t=>{
 for(const [stage,status] of [['startup',401],['startup',403],['startup',307],['catalog',401],['catalog',403],['catalog',307],['startup',500],['catalog',500]])await t.test(`${stage} ${status}`,async()=>{
  const remote=stage==='startup'?await failingPeer(status):await peer({catalogStatus:status}),f=await brokerFixture(remote);try{
   const reply=await f.client.callTool({name:'discovery_search',arguments:{query:''}});assert.equal(reply.isError,true);const message=reply.content[0].text;
   if(status===500){assert.match(message,/Source selection changed/);assert.equal(reply.structuredContent,undefined);}else assert.match(message,status===307?/Configure the final endpoint/:/authorization setup/);assert.doesNotMatch(message,/private server|private-redirect-token|synthetic-private-token|secret catalog/);
   const before=Array.isArray(remote.requests)?remote.requests.length:remote.requests;const closed=await f.client.callTool({name:'discovery_search',arguments:{query:''}});assert.equal(closed.isError,true);assert.equal(Array.isArray(remote.requests)?remote.requests.length:remote.requests,before,'No reconnect or auth replay after setup failure');
  }finally{await f.close();await remote.close();}
 });
});
test('R3 setup markers require an app-owned error and exact bounded enum records',async()=>{
 const canonical=discoverySetupError('authorization');assert.equal(discoverySetupKind(canonical),'authorization');assert.equal(discoverySetupKind(Object.assign(Error(canonical.message),{musebenchDiscoverySetup:'authorization'})),undefined);
 for(const value of [{musebenchDiscoverySetup:'unknown'},{musebenchDiscoverySetup:'authorization',message:'secret'},Object.assign(Object.create({musebenchDiscoverySetup:'authorization'}),{other:true}),null,'authorization'])assert.equal(readDiscoverySetupKind(value),undefined);
 const response=value=>new Response(JSON.stringify(value),{status:409,headers:{'Content-Type':'application/json'}});
 assert.equal(await readDiscoverySetupResponse(response({musebenchDiscoverySetup:'redirect'})),'redirect');
 assert.equal(await readDiscoverySetupResponse(response({musebenchDiscoverySetup:'authorization',message:'private'})),undefined);assert.equal(await readDiscoverySetupResponse(response({musebenchDiscoverySetup:'authorization',private:'x'.repeat(2000)})),undefined);
 const input=new PassThrough(),output=new PassThrough(),replies=[];output.on('data',chunk=>replies.push(...String(chunk).trim().split('\n').map(JSON.parse)));
 const server=await createDiscoveryMcpServer({input,output,service:{search:async()=>{throw Object.assign(Error(canonical.message),{musebenchDiscoverySetup:'authorization'});},dispose:async()=>{}}});
 input.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}})+'\n');input.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'discovery_search',arguments:{query:''}}})+'\n');await new Promise(resolve=>setImmediate(resolve));assert.equal(replies.find(reply=>reply.id===2).result.structuredContent,undefined);await server.close();
});
test('R3 submitted broker effect auth failure remains once-only unknown',async()=>{
 const remote=await peer({call:'auth'}),f=await brokerFixture(remote);try{const search=await f.client.callTool({name:'discovery_search',arguments:{query:''}}),row=JSON.parse(search.content[0].text).sources[0],args={sourceId:row.sourceId,catalogRevision:row.catalogRevision,tool:'allowed',arguments:{value:7}};
  const receipt=await f.client.callTool({name:'discovery_call',arguments:args});assert.equal(JSON.parse(receipt.content[0].text).outcome,'unknown');assert.equal(remote.effects,1);await f.client.callTool({name:'discovery_call',arguments:args});assert.equal(remote.effects,1);
 }finally{await f.close();await remote.close();}
});
