import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {createRemoteNetwork,remoteConfiguration,remoteAddressKind,resolveRemoteDestination} from '../src/runtime/discovery-remote-network.mjs';
import {createRemoteDiscoveryClient} from '../src/runtime/discovery-remote.mjs';
import {peer,source} from './fixtures/discovery-remote-peer.mjs';
async function listener(handler){const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));return{url:`http://127.0.0.1:${server.address().port}/mcp`,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('remote config rejects credentials, contradictory network fields and hostile headers without echoing values',()=>{
 assert.throws(()=>remoteConfiguration({url:'https://example.com/mcp',headers:JSON.parse('{"__proto__":"secret"}')}),/header/);
 for(const headers of [{Host:'secret'},{'Mcp-Session-Id':'secret'},{'mcp-protocol-version':'secret'},{Authorization:'secret',authorization:'second'},{Authorization:'secret\r\nHeader: injected'},{'bad\nname':'secret'},{Cookie:'secret'},{Authorization:'s'.repeat(4097)},{A:'a'.repeat(4096),B:'b'.repeat(4096) }])assert.throws(()=>remoteConfiguration({url:'https://example.com/mcp',headers}),e=>!e.message.includes('secret'));
 for(const url of ['http://example.com','https://secret@example.com','https://example.com/?secret=x','https://example.com/#secret'])assert.throws(()=>remoteConfiguration({url}),e=>!e.message.includes('secret'));
 assert.equal(remoteConfiguration({url:'https://example.com',headers:{Authorization:'Bearer ${LITERAL}'}}).headers.Authorization,'Bearer ${LITERAL}');
});
test('connection-time DNS validation covers IPv4, IPv6 and mapped addresses and rejects rebinding',async()=>{
 for(const [address,kind] of [['8.8.8.8','public'],['127.0.0.1','loopback'],['10.0.0.1','private'],['169.254.169.254','prohibited'],['::1','loopback'],['::ffff:127.0.0.1','loopback'],['::ffff:7f00:1','loopback'],['fc00::1','private'],['fe80::1','prohibited'],['2001:4860:4860::8888','public'],['2001:db8::1','prohibited']])assert.equal(remoteAddressKind(address),kind,address);
 for(const address of ['127.0.0.1','10.0.0.1','::ffff:127.0.0.1','::ffff:a00:1','fc00::1','fe80::1'])await assert.rejects(resolveRemoteDestination(new URL('https://public.example'),{lookup:async()=>[{address,family:address.includes(':')?6:4}]}),/scope/);
 let revision=0;const lookup=async()=>[{address:revision++?'127.0.0.1':'8.8.8.8',family:4}];await resolveRemoteDestination(new URL('https://public.example'),{lookup});await assert.rejects(resolveRemoteDestination(new URL('https://public.example'),{lookup}),/scope/);
 assert.equal((await resolveRemoteDestination(new URL('https://10.0.0.1'))).address,'10.0.0.1');
});
test('operation cancellation interrupts a pending resolver before any socket opens',async()=>{
 const network=createRemoteNetwork({url:'https://public.example/mcp'},{lookup:()=>new Promise(()=>{})}),controller=new AbortController();network.begin(controller.signal);try{const pending=network.fetch('https://public.example/mcp').then(()=> 'connected',()=> 'aborted');controller.abort();assert.equal(await Promise.race([pending,wait(100).then(()=> 'resolver-still-pending')]),'aborted');assert.equal(network.activeRequests,0);}finally{network.close();}
});
test('redirects never forward private headers to same-origin or second receiver',async()=>{
 let leaked=0;const receiver=await listener((_q,r)=>{leaked++;r.end();}),redirect=await listener((_q,r)=>{r.writeHead(307,{Location:receiver.url});r.end();});const network=createRemoteNetwork(source(redirect.url));try{await assert.rejects(network.fetch(redirect.url,{headers:{Authorization:'secret'}}),/redirect/i);assert.equal(leaked,0);await assert.rejects(network.fetch(receiver.url,{headers:{Authorization:'secret'}}),/destination/i);assert.equal(leaked,0);}finally{network.close();await redirect.close();await receiver.close();}
});
test('same-origin redirects are refused before an additional request',async()=>{
 let followed=0;const f=await listener((req,res)=>{if(req.url!=='/mcp')followed++;res.writeHead(307,{Location:'/different'});res.end();}),network=createRemoteNetwork(source(f.url));try{await assert.rejects(network.fetch(f.url,{headers:{Authorization:'secret'}}),/redirect/i);assert.equal(followed,0);}finally{network.close();await f.close();}
});
test('adapter reports the safe final-endpoint setup instruction for redirects',async()=>{
 const f=await listener((_req,res)=>{res.writeHead(307,{Location:'/private-secret'});res.end();}),client=createRemoteDiscoveryClient(source(f.url));try{await assert.rejects(client.connect(),e=>/Configure the final endpoint/.test(e.message)&&!e.message.includes('private-secret'));}finally{await client.close();await f.close();}
});
test('successful operations do not consume the separate background stream byte budget',async()=>{
 const f=await listener((_q,res)=>res.end('x'.repeat(500))),network=createRemoteNetwork(source(f.url),{limits:{headers:16384,body:2097152,frame:1048576,wire:4194304,operation:1000}});try{for(let i=0;i<8;i++){network.begin(new AbortController().signal);await(await network.fetch(f.url)).text();network.end();}assert.equal((await(await network.fetch(f.url)).text()).length,500);}finally{network.close();await f.close();}
});
test('cross-origin historical SSE endpoint cannot send credentials or an effect to another receiver',async()=>{
 let receiverRequests=0;const receiver=await listener((_q,res)=>{receiverRequests++;res.end();}),f=await listener((req,res)=>{if(req.method==='POST'){res.writeHead(405);res.end();return;}res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(`event: endpoint\ndata: ${receiver.url}\n\n`);}),client=createRemoteDiscoveryClient(source(f.url));try{await assert.rejects(client.connect());await wait(30);assert.equal(receiverRequests,0);assert.equal(client.closed,true);assert.equal(client.activeRequests,0);}finally{await client.close();await f.close();await receiver.close();}
});
test('all responses share a total operation byte budget',async()=>{
 const f=await listener((_q,res)=>res.end('x'.repeat(500))),network=createRemoteNetwork(source(f.url),{limits:{headers:16384,body:2097152,frame:1048576,wire:4194304,operation:1000}});try{network.begin(new AbortController().signal);assert.equal((await(await network.fetch(f.url)).text()).length,500);await assert.rejects(async()=>{await(await network.fetch(f.url)).text();},/limit|bounds/);}finally{network.close();await f.close();}
});
for(const mode of ['gzip','partial','comments','headers'])test(`pre-parse network limit bounds ${mode} and cleans sockets`,async()=>{
 const f=await listener((_q,res)=>{if(mode==='headers'){res.writeHead(200,{'X-Large':'x'.repeat(20000)});res.end();return;}if(mode==='gzip'){res.writeHead(200,{'Content-Encoding':'gzip'});res.end(gzipSync('x'.repeat(2200000)));return;}res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(mode==='partial'?'data: '+'x'.repeat(1100000):(': '+'x'.repeat(20000)+'\n\n').repeat(120));});const network=createRemoteNetwork(source(f.url));try{await assert.rejects(async()=>{await(await network.fetch(f.url)).text();},/limit|bound|failed/i);await wait(20);assert.equal(network.activeRequests,0);}finally{network.close();await f.close();}
});
test('cancellation bounds an incomplete SSE stream before parsing and never reconnects',async()=>{
 let requests=0;const f=await listener((_q,r)=>{requests++;r.writeHead(200,{'Content-Type':'text/event-stream'});r.write('data: unfinished');}),client=createRemoteDiscoveryClient({...source(f.url),startupMs:80});try{await assert.rejects(client.connect());await wait(100);assert.equal(client.closed,true);assert.equal(client.activeRequests,0);assert.equal(requests,1);}finally{await client.close();await f.close();}
});
test('historical SSE fallback is same-origin, bounded and does not reconnect after EOF',async t=>{
 const reconnectTimers=new Set(),originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{const timer=originalSet(fn,ms,...args);if(ms===3000)reconnectTimers.add(timer);return timer;});
 t.mock.method(globalThis,'clearTimeout',timer=>{reconnectTimers.delete(timer);return originalClear(timer);});
 let get=0,effects=0;let stream;const posts=[];
 const f=await listener(async(req,res)=>{if(req.method==='GET'){get++;stream=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: endpoint\ndata: /messages\n\n');return;}if(req.url==='/mcp'){res.writeHead(405);res.end();return;}let raw='';for await(const c of req)raw+=c;const message=JSON.parse(raw);posts.push(message);res.writeHead(202);res.end();if(message.id===undefined)return;const result=message.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'historical',version:'1'}}:message.method==='tools/list'?{tools:[]}:(effects++,{content:[]});stream.write(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:message.id,result})}\n\n`);});
 const client=createRemoteDiscoveryClient(source(f.url));try{await client.connect();assert.deepEqual((await client.catalog()).tools,[]);await client.call({name:'allowed',arguments:{}});assert.equal(effects,1);stream.end();await wait(80);assert.equal(client.closed,true);assert.equal(get,1);assert.equal(reconnectTimers.size,0,'No EventSource reconnect timer survives EOF');await assert.rejects(client.catalog(),/closed/);assert.equal(posts.filter(p=>p.method==='tools/call').length,1);}finally{await client.close();await f.close();for(const timer of reconnectTimers)originalClear(timer);}
});
test('authorization startup has one request, no SSE fallback, browser sign-in or auth replay',async()=>{
 let requests=0;const f=await listener((_q,r)=>{requests++;r.writeHead(401,{'WWW-Authenticate':'Bearer resource_metadata="https://unreviewed.example"'});r.end('private secret response');}),client=createRemoteDiscoveryClient(source(f.url));try{await assert.rejects(client.connect(),e=>/authorization setup/.test(e.message)&&!e.message.includes('secret'));assert.equal(requests,1);assert.equal(client.closed,true);}finally{await client.close();await f.close();}
});
