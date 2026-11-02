import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createPublicWebMcpServer,createPublicWebMcpConfig,publicWebExecConfig} from '../src/runtime/public-web-mcp.mjs';
function fixture(t,readPage=async url=>({sourceUrl:url,text:'Public text',notice:'Untrusted'})){
 const input=new PassThrough(),output=new PassThrough(),rows=[];let bytes='';
 output.on('data',chunk=>{bytes+=chunk;for(let i;(i=bytes.indexOf('\n'))>=0;){rows.push(JSON.parse(bytes.slice(0,i)));bytes=bytes.slice(i+1);}});
 const server=createPublicWebMcpServer({input,output,readPage});t.after(()=>server.close());
 const send=(method,params,id)=>input.write(JSON.stringify({jsonrpc:'2.0',method,...(id===undefined?{}:{id}),...(params===undefined?{}:{params})})+'\n');
 const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
 const init=async()=>{send('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'fixture',version:'1'}},0);await settle();};
 return{input,output,server,rows,send,settle,init};
}
test('native exec server config uses admitted CLI framing and environment references',()=>{
 const config=createPublicWebMcpConfig(),entry=publicWebExecConfig(config);
 assert.deepEqual(entry.environment,{MUSEBENCH_WEB_NODE_MODE:'1'});
 assert.equal(entry.args[0],'-c');const server=JSON.parse(entry.args[1].split('=').slice(1).join('='));
 assert.equal(server.command,process.execPath);assert.deepEqual(server.args,config.args);
 assert.deepEqual(server.env,{ELECTRON_RUN_AS_NODE:'${MUSEBENCH_WEB_NODE_MODE}'});
 assert.equal(server.mode,'required');assert.equal(server.framing,'line_delimited_json');
 assert.throws(()=>publicWebExecConfig({command:'relative',args:['relative']}),/trusted/);
});
test('MCP initialization, discovery and correlated bounded page read roundtrip',async t=>{
 const calls=[],f=fixture(t,async(url,{signal})=>{calls.push(url);assert.equal(signal.aborted,false);return{sourceUrl:url,title:'Read',text:'Public page',notice:'Untrusted'};});
 f.send('tools/list',{},1);await f.settle();assert.equal(f.rows[0].error.code,-32002);
 await f.init();f.send('tools/list',{_meta:{callId:'opaque'}},2);await f.settle();
 const tools=f.rows.at(-1).result.tools;assert.deepEqual(tools.map(tool=>tool.name),['read_web_page']);assert.equal(tools[0].annotations.readOnlyHint,true);assert.equal(tools[0].inputSchema.additionalProperties,false);
 f.send('tools/call',{name:'read_web_page',arguments:{url:'https://example.org/'},_meta:{callId:'opaque',headers:{authorization:'must-not-forward'}}},3);await f.settle();
 assert.equal(f.rows.at(-1).id,3);assert.equal(JSON.parse(f.rows.at(-1).result.content[0].text).text,'Public page');assert.deepEqual(calls,['https://example.org/']);assert.doesNotMatch(JSON.stringify(f.rows),/must-not-forward/);
});
test('closed schema and notifications cannot change network authority or invoke reads',async t=>{
 let calls=0;const f=fixture(t,async()=>{calls++;return{};});await f.init();
 for(const args of [{url:'https://example.org',headers:{cookie:'secret'}},{url:'https://example.org',method:'POST'},{url:'https://example.org',command:'whoami'},{url:'https://example.org',timeoutMs:999999},{url:1},{url:''}]){
  f.send('tools/call',{name:'read_web_page',arguments:args},1);await f.settle();assert.equal(f.rows.at(-1).error.code,-32602);
 }
 f.send('tools/call',{name:'read_web_page',arguments:{url:'https://example.org'}});await f.settle();assert.equal(calls,0);
 f.send('tools/call',{name:'shell',arguments:{}},2);await f.settle();assert.equal(f.rows.at(-1).error.code,-32602);
 f.send('account/login',{},3);await f.settle();assert.equal(f.rows.at(-1).error.code,-32601);
});
test('cancellation aborts an active page read ahead of queued requests',async t=>{
 let aborted=false;const f=fixture(t,async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true})));await f.init();
 f.send('tools/call',{name:'read_web_page',arguments:{url:'https://example.org'}},1);await f.settle();f.send('ping',{},2);
 f.send('notifications/cancelled',{requestId:1,_meta:{callId:'opaque'}});await f.settle();assert.equal(aborted,true);assert.equal(f.rows.some(row=>row.id===1),false);assert.equal(f.rows.at(-1).id,2);
});
test('safe errors, invalid UTF-8/JSON, oversized frames and output are bounded',async t=>{
 const f=fixture(t,async()=>{throw Error('private remote response secret');});await f.init();f.send('tools/call',{name:'read_web_page',arguments:{url:'https://example.org'}},1);await f.settle();assert.equal(f.rows.at(-1).result.isError,true);assert.doesNotMatch(JSON.stringify(f.rows),/private remote response secret/);
 f.input.write(Buffer.from([255,10]));await f.settle();assert.equal(f.rows.at(-1).error.code,-32700);
 f.input.write('x'.repeat(16385));await f.server.done;assert.equal(f.server.closed,true);
 const huge=fixture(t,async()=>({text:'x'.repeat(131073)}));await huge.init();huge.send('tools/call',{name:'read_web_page',arguments:{url:'https://example.org'}},1);await huge.settle();assert.match(huge.rows.at(-1).result.content[0].text,/OUTPUT_LIMIT/);
});
test('real Node stdio handshake, tools/list and forbidden-address tool read exit cleanly',async t=>{
 const config=createPublicWebMcpConfig({env:{MUSE_TEST:'curated'}});assert.equal(config.env.MUSE_TEST,'curated');assert.equal(config.env.ELECTRON_RUN_AS_NODE,'1');assert.deepEqual(config.args,[fileURLToPath(new URL('../src/runtime/public-web-mcp.mjs',import.meta.url))]);
 const child=spawn(config.command,config.args,{env:{...process.env,...config.env},windowsHide:true,stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 const requests=[{id:0,method:'initialize',params:{protocolVersion:'2025-11-25'}},{id:1,method:'tools/list',params:{}},{id:2,method:'tools/call',params:{name:'read_web_page',arguments:{url:'http://127.0.0.1/'}}}];
 child.stdin.end(requests.map(row=>JSON.stringify({jsonrpc:'2.0',...row})+'\n').join(''));
 assert.equal(await Promise.race([exit,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('stdio exit timeout')),5000);timer.unref();})]),0);
 const rows=stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(rows.length,3);assert.equal(rows[1].result.tools[0].name,'read_web_page');assert.match(rows[2].result.content[0].text,/PUBLIC_WEB_DESTINATION/);assert.equal(stderr,'');
});
