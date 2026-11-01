import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createNativeControlHost} from '../electron/native-control-host.mjs';

const toolRequest=id=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'app_status',arguments:{}}});
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
async function fixture(t,service={call:async()=>result({fixture:true})}){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-control-http-'));
 const hosts=[];
 const open=async options=>{const host=await createNativeControlHost({dataDir,service,...options});hosts.push(host);return host;};
 const host=await open();
 t.after(async()=>{for(const item of hosts)await item.close();await rm(dataDir,{recursive:true,force:true});});
 const state=await host.command({type:'enable'});
 assert.ok(state.httpConnectionConfig,'Enabling app control must offer the shared HTTP connection.');
 return{dataDir,host,open,config:state.httpConnectionConfig};
}
function request(config,body,options={}){
 return fetch(config.url,{method:'POST',body:typeof body==='string'?body:JSON.stringify(body),...options,headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...config.headers,...options.headers}});
}
async function connect(t,config,name='http-fixture'){
 const client=new Client({name,version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}}));
 t.after(()=>client.close());return client;
}
async function until(predicate,message){
 for(let i=0;i<100;i++){if(predicate())return;await delay(10);}
 assert.fail(message);
}

test('multiple HTTP MCP clients share the app listener without creating relay processes',async t=>{
 let calls=0;
 const {config}=await fixture(t,{call:async()=>result({call:++calls})});
 let spawned=0;
 for(const name of ['spawn','fork','exec','execFile','execSync','execFileSync','spawnSync'])t.mock.method(childProcess,name,()=>{spawned++;throw Error('HTTP must not launch helpers.');});
 syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 const clients=await Promise.all([connect(t,config,'first'),connect(t,config,'second'),connect(t,config,'third')]);
 for(let i=0;i<3;i++){
  const lists=await Promise.all(clients.map(client=>client.listTools()));
  assert.ok(lists.every(list=>list.tools.length===6));
  const values=await Promise.all(clients.map(client=>client.callTool({name:'app_status',arguments:{}})));
  assert.ok(values.every(value=>!value.isError));
 }
 assert.equal(calls,9);assert.equal(spawned,0);
});

test('the HTTP endpoint and bearer grant survive restart while legacy relay tokens rotate',async t=>{
 const {dataDir,host,open,config}=await fixture(t);
 const firstRelay=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));
 const client=await connect(t,config);
 await host.close();
 await assert.rejects(client.listTools());
 const restarted=await open();
 const state=await restarted.command({type:'status',transport:'http'});
 assert.deepEqual(state.httpConnectionConfig,config);
 const secondRelay=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));
 assert.notEqual(secondRelay.token,firstRelay.token);
 assert.equal((await client.callTool({name:'app_status',arguments:{}})).isError,undefined);
 await restarted.command({type:'disable'});
 await assert.rejects(readFile(path.join(dataDir,'native-control','connection.json')));
 const next=await restarted.command({type:'enable'});
 assert.equal(next.httpConnectionConfig.url,config.url);
 assert.notEqual(next.httpConnectionConfig.headers.Authorization,config.headers.Authorization);
 assert.equal((await request(config,toolRequest(10))).status,401);
 assert.equal((await request(next.httpConnectionConfig,toolRequest(11))).status,200);
});

test('an occupied durable HTTP port fails closed without changing the saved configuration',async t=>{
 const {host,open,config}=await fixture(t);
 await host.close();
 const blocker=http.createServer((req,res)=>res.end());
 await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(Number(new URL(config.url).port),'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>blocker.close(resolve)));
 const restarted=await open();
 const state=await restarted.command({type:'status',transport:'http'});
 assert.equal(state.enabled,true);assert.equal(state.running,false);assert.equal(state.httpConnectionConfig,null);
 assert.match(state.startupError,/port.*in use|port.*occupied/i);
 await new Promise(resolve=>blocker.close(resolve));
 const recovered=await restarted.command({type:'enable'});
 assert.deepEqual(recovered.httpConnectionConfig,config);
});

test('HTTP MCP preserves loopback authentication, origin, host, protocol and body bounds',async t=>{
 let calls=0;const {config}=await fixture(t,{call:async()=>{calls++;return result({fixture:true});}});
 assert.equal((await request({...config,headers:{}},toolRequest(1))).status,401);
 assert.equal((await request(config,toolRequest(1),{headers:{origin:'http://example.test'}})).status,403);
 assert.equal((await request(config,toolRequest(1),{headers:{'sec-fetch-site':'same-origin'}})).status,403);
 const wrongHost=await new Promise((resolve,reject)=>{
  const req=http.request(config.url,{method:'POST',headers:{...config.headers,host:'example.test','content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(JSON.stringify(toolRequest(1)));
 });assert.equal(wrongHost,403);
 assert.equal((await request(config,toolRequest(1),{headers:{'mcp-protocol-version':'invalid-version'}})).status,400);
 assert.equal((await request(config,' '.repeat(8193))).status,413);
 assert.equal((await request(config,[toolRequest(1),toolRequest(2)])).status,400);
 const badTool=toolRequest(3);badTool.params.arguments={extra:true};
 const invalid=await request(config,badTool);assert.equal(invalid.status,200);assert.equal((await invalid.json()).result.isError,true);
 assert.equal((await fetch(config.url,{headers:config.headers})).status,405);
 assert.equal(calls,0);
 const valid=await request(config,toolRequest(4),{headers:{'content-type':'application/json; charset=utf-8'}});
 assert.equal(valid.status,200);assert.equal(calls,1);assert.equal(valid.headers.get('cache-control'),'no-store');
});

test('HTTP disconnect and disable abort native calls, including at the concurrency limit',async t=>{
 const signals=[],aborts=[1,2,3,4].map(()=>new AbortController());
 const {host,config}=await fixture(t,{call:async(name,args,{signal})=>{signals.push(signal);await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return result({cancelled:true});}});
 const calls=[1,2,3,4].map((id,index)=>request(config,toolRequest(id),{signal:aborts[index].signal}).catch(()=>null));
 await until(()=>signals.length===4,'Four tool calls should reach the native service.');
 assert.equal((await request(config,toolRequest(5))).status,429);
 const cancelled=await request(config,{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:1}});
 assert.equal(cancelled.status,202);
 assert.ok(signals.every(signal=>!signal.aborted),'Stateless cancellation notifications cannot identify their owning HTTP request.');
 aborts[0].abort();
 await until(()=>signals[0].aborted,'Disconnecting its HTTP request should abort the native call.');
 assert.ok(signals.slice(1).every(signal=>!signal.aborted));
 await host.command({type:'disable'});
 assert.ok(signals.every(signal=>signal.aborted));
 await Promise.all(calls);
 await until(()=>!host.isBusy(),'Settled cancelled calls should release their slots.');
});

test('native slots remain occupied when a disconnected service ignores cancellation',async t=>{
 const releases=[],signals=[];
 const {host,config}=await fixture(t,{call:(name,args,{signal})=>{signals.push(signal);return new Promise(resolve=>releases.push(()=>resolve(result({fixture:true}))));}});
 const aborts=[1,2,3,4].map(()=>new AbortController());
 const calls=aborts.map((abort,index)=>request(config,toolRequest(index),{signal:abort.signal}).catch(()=>null));
 t.after(()=>releases.forEach(release=>release()));
 await until(()=>releases.length===4,'Four uncooperative native calls should start.');
 aborts.forEach(abort=>abort.abort());await Promise.all(calls);
 await until(()=>signals.every(signal=>signal.aborted),'Disconnects should cancel each native call.');
 assert.equal(host.isBusy(),true);
 assert.equal((await request(config,toolRequest(10))).status,429);
 releases.forEach(release=>release());await until(()=>!host.isBusy(),'Only terminal service calls should free native capacity.');
 assert.equal((await request(config,{jsonrpc:'2.0',id:11,method:'tools/list'})).status,200);
});

test('HTTP status can skip preparing the compatibility runtime while legacy status still prepares it',async t=>{
 let preparations=0;const {host}=await fixture(t);
 await host.close();
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-control-http-config-'));
 const config={command:'immutable-cache',args:[],env:{}};
 const controlled=await createNativeControlHost({dataDir,service:{call:async()=>result({})},connectionConfig:()=>{preparations++;return config;}});
 t.after(async()=>{await controlled.close();await rm(dataDir,{recursive:true,force:true});});
 await controlled.command({type:'enable'});assert.equal(preparations,1);
 const status=await controlled.command({type:'status',transport:'http'});
 assert.ok(status.httpConnectionConfig);assert.equal(status.connectionConfig,null);
 assert.deepEqual((await controlled.command({type:'status'})).connectionConfig,config);
 await assert.rejects(controlled.command({type:'disable',transport:'http'}),/Invalid/);
});

test('preparing a compatibility runtime cannot delay revoking the HTTP grant',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-control-config-cancel-'));
 let finish;const preparation=new Promise(resolve=>{finish=resolve;});
 const host=await createNativeControlHost({dataDir,service:{call:async()=>result({})},connectionConfig:()=>preparation});
 t.after(async()=>{finish(null);await host.close();await rm(dataDir,{recursive:true,force:true});});
 const enabling=host.command({type:'enable'});
 let config;
 for(let i=0;i<100;i++){config=(await host.command({type:'status',transport:'http'})).httpConnectionConfig;if(config)break;await delay(10);}
 assert.ok(config);
 const disabling=host.command({type:'disable'});
 const revoked=await Promise.race([disabling,delay(1000).then(()=>null)]);
 assert.ok(revoked,'Revocation must not wait for an optional compatibility cache copy.');
 assert.equal(revoked.running,false);
 finish(null);assert.equal((await enabling).httpConnectionConfig,null);
});

test('cancellation does not abort overlapping requests with the same ID from independent clients',async t=>{
 const signals=[];
 const {host,config}=await fixture(t,{call:async(name,args,{signal})=>{signals.push(signal);await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return result({cancelled:true});}});
 const calls=[request(config,toolRequest(7)),request(config,toolRequest(7))].map(promise=>promise.catch(()=>null));
 await until(()=>signals.length===2,'Both independent client requests should start.');
 assert.equal((await request(config,{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:7}})).status,202);
 assert.ok(signals.every(signal=>!signal.aborted));
 await host.command({type:'disable'});await Promise.all(calls);assert.ok(signals.every(signal=>signal.aborted));
});

test('a stale stateless cancellation from one client cannot abort another client reusing its old ID',async t=>{
 let calls=0,secondSignal;
 const {host,config}=await fixture(t,{call:async(name,args,{signal})=>{
  if(++calls===1)return result({client:'first'});
  secondSignal=signal;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return result({client:'second'});
 }});
 const first=await request(config,toolRequest(7));assert.equal(first.status,200);await first.json();
 const second=request(config,toolRequest(7)).catch(()=>null);
 await until(()=>secondSignal,'The second client should reuse the first client request ID.');
 assert.equal((await request(config,{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:7}})).status,202);
 assert.equal(secondSignal.aborted,false,'A stale notification from the first client must not abort the second client.');
 await host.command({type:'disable'});await second;
});

test('an invalid saved grant stays unavailable until an explicit off/on reset',async t=>{
 const {host,dataDir,open}=await fixture(t);await host.close();
 await writeFile(path.join(dataDir,'native-control','http-grant.json'),'{"version":1,"port":0,"token":"invalid"}');
 const restarted=await open();const failed=await restarted.command({type:'status',transport:'http'});
 assert.equal(failed.running,false);assert.match(failed.startupError,/grant.*invalid/i);
 await restarted.command({type:'disable'});
 assert.ok((await restarted.command({type:'enable'})).httpConnectionConfig);
});

test('Windows restores a retained HTTP grant to account-private ACLs without changing the grant',{skip:process.platform!=='win32'},async t=>{
 const {host,dataDir,open,config}=await fixture(t);await host.close();
 const grantFile=path.join(dataDir,'native-control','http-grant.json'),exec=promisify(childProcess.execFile);
 await exec('icacls.exe',[grantFile,'/grant','*S-1-1-0:RX'],{windowsHide:true});
 const restarted=await open();assert.deepEqual((await restarted.command({type:'status',transport:'http'})).httpConnectionConfig,config);
 const acl=await exec('icacls.exe',[grantFile],{windowsHide:true});assert.ok(!acl.stdout.includes('Everyone'),acl.stdout);
});

test('HTTP MCP enforces the native response size limit without exposing an oversized result',async t=>{
 const {config}=await fixture(t,{call:async()=>({content:[{type:'text',text:'x'.repeat(4*1024*1024)}]})});
 const response=await request(config,toolRequest(1));assert.equal(response.status,200);
 const value=await response.json();assert.equal(value.result.isError,true);assert.match(value.result.content[0].text,/result too large/i);
 assert.ok(JSON.stringify(value).length<1000);
});

test('a native result arriving after the host deadline is rejected before an overdue timer runs',async t=>{
 let finish,entered;const started=new Promise(resolve=>{entered=resolve;});
 const {config}=await fixture(t,{call:()=>{entered();return new Promise(resolve=>{finish=resolve;});}});
 const pending=request(config,toolRequest(1));await started;
 const now=Date.now();t.mock.method(Date,'now',()=>now+13000);
 finish(result({late:'must not be returned'}));
 const response=await pending;assert.equal(response.status,200);
 const value=await response.json();assert.equal(value.result.isError,true);assert.match(value.result.content[0].text,/timed out/i);
 assert.ok(!JSON.stringify(value).includes('must not be returned'));
});

test('HTTP requests time out within the native deadline and cancel their service call',{timeout:16000},async t=>{
 let signal;const errors=[];t.mock.method(console,'error',(...args)=>errors.push(args));
 const {host,config}=await fixture(t,{call:async(name,args,options)=>{signal=options.signal;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return result({cancelled:true});}});
 const response=await request(config,toolRequest(1),{signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200);assert.equal(signal.aborted,true);
 const value=await response.json();assert.equal(value.result.isError,true);assert.match(value.result.content[0].text,/timed out/i);
 await until(()=>!host.isBusy(),'The timed-out native call should finish releasing its request slot.');
 await delay(10);assert.equal(errors.length,0,'A deadline must not write a second response or log a transport error.');
});
