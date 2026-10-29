import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const api=await import('../src/runtime/workspace-mcp.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
async function fixture(t,options={}){
 assert.equal(typeof api.createWorkspaceMcpServer,'function');
 const root=await mkdtemp(path.join(tmpdir(),'muse-workspace-mcp-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const input=new PassThrough(),output=new PassThrough(),calls=[],rows=[];let text='',disposed=0;
 output.on('data',chunk=>{text+=chunk.toString();for(let i;(i=text.indexOf('\n'))>=0;){rows.push(JSON.parse(text.slice(0,i)));text=text.slice(i+1);}});
 const service={query:async value=>{calls.push(value);return{items:[],snapshot:'test',operation:value.operation};},dispose:async()=>{disposed++;},...options.service};
 const server=await api.createWorkspaceMcpServer({root,input,output,service,...options});t.after(()=>server.close());
 const send=(method,params,id=rows.length+1)=>input.write(JSON.stringify({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})})+'\n');
 const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
 const init=async()=>{send('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'fixture',version:'1'}},0);await settle();};
 return{root,input,output,calls,rows,server,send,settle,init,disposed:()=>disposed};
}
test('JSONL initialization and tool discovery advertise only the bounded gateway',async t=>{
 const f=await fixture(t);f.send('tools/list',{},1);await f.settle();assert.equal(f.rows[0].error.code,-32002);
 await f.init();assert.equal(f.rows[1].result.protocolVersion,'2025-11-25');
 f.send('tools/list',{},2);await f.settle();assert.deepEqual(f.rows.at(-1).result.tools.map(x=>x.name),['workspace_tool_search','workspace_tool_call']);
 f.send('tools/call',{name:'workspace_tool_search',arguments:{query:'definition'}},3);await f.settle();
 const found=JSON.parse(f.rows.at(-1).result.content[0].text);assert.deepEqual(found.operations.map(x=>x.name),['definition']);assert.equal(found.operations[0].inputSchema.additionalProperties,false);assert.equal(f.calls.length,0);
});
test('calls have a closed schema and cannot change roots, execute commands or escape relative paths',async t=>{
 const f=await fixture(t);await f.init();
 const args={operation:'hover',path:'src/main.ts',line:1,column:2};
 f.send('tools/call',{name:'workspace_tool_call',arguments:args},1);await f.settle();assert.deepEqual(f.calls,[args]);
 for(const value of [{...args,root:'C:/outside'},{...args,operation:'exec'},{...args,path:'../secret.ts'},{...args,path:'/secret.ts'},{...args,path:'C:\\secret.ts'},{...args,path:'x/../../secret.ts'},{...args,line:0},{...args,column:1.2},{...args,path:'x\u0000.ts'},{...args,command:'whoami'}]){
  f.send('tools/call',{name:'workspace_tool_call',arguments:value},2);await f.settle();assert.equal(f.rows.at(-1).error.code,-32602);
 }
 assert.equal(f.calls.length,1);
 f.send('tools/call',{name:'arbitrary',arguments:{}},3);await f.settle();assert.equal(f.rows.at(-1).error.code,-32602);
 f.send('workspace/execute',{command:'whoami'},4);await f.settle();assert.equal(f.rows.at(-1).error.code,-32601);
});

test('standard request metadata permits discovery, search and native Muse call correlation',async t=>{
 const f=await fixture(t);await f.init();
 const metadata={callId:'call_fixture',idempotencyKey:'fixture-once',progressToken:0,'example.org/context':{label:'untrusted'}};
 const listing=ListToolsRequestSchema.parse({method:'tools/list',params:{_meta:metadata}});
 f.send(listing.method,listing.params,1);await f.settle();assert.equal(f.rows.at(-1).error,undefined);assert.equal(f.rows.at(-1).result.tools.length,2);
 const search=CallToolRequestSchema.parse({method:'tools/call',params:{name:'workspace_tool_search',arguments:{query:'definition'},_meta:metadata}});
 f.send(search.method,search.params,2);await f.settle();assert.equal(f.rows.at(-1).error,undefined);assert.deepEqual(JSON.parse(f.rows.at(-1).result.content[0].text).operations.map(row=>row.name),['definition']);
 const args={operation:'definition',path:'main.ts',line:2,column:2};
 const call=CallToolRequestSchema.parse({method:'tools/call',params:{name:'workspace_tool_call',arguments:args,_meta:{...metadata,root:'C:/outside',operation:'exec',arguments:{path:'../private.ts'},command:'must-not-run'}}});
 f.send(call.method,call.params,3);await f.settle();assert.equal(f.rows.at(-1).error,undefined);assert.deepEqual(f.calls,[args]);
 assert.doesNotMatch(JSON.stringify(f.rows),/call_fixture|fixture-once|outside|must-not-run|private\.ts/);
});

test('invalid metadata and extra request or tool fields are rejected without navigation',async t=>{
 const f=await fixture(t);await f.init();const args={operation:'hover',path:'main.ts',line:1,column:1};
 for(const metadata of [null,[],false,17,'not-an-object']){
  for(const [method,params] of [['tools/list',{_meta:metadata}],['tools/call',{name:'workspace_tool_call',arguments:args,_meta:metadata}]]){
   f.send(method,params,1);await f.settle();assert.equal(f.rows.at(-1).error?.code,-32602);
  }
 }
 for(const params of [{name:'workspace_tool_call',arguments:args,_meta:{},root:'C:/outside'},{name:'workspace_tool_call',arguments:{...args,_meta:{root:'C:/outside'}},_meta:{}}]){
  f.send('tools/call',params,2);await f.settle();assert.equal(f.rows.at(-1).error?.code,-32602);
 }
 assert.equal(f.calls.length,0);
});

test('request metadata remains inside the existing frame bound',async t=>{
 const f=await fixture(t,{maxFrameBytes:1024});await f.init();
 f.send('tools/call',{name:'workspace_tool_call',arguments:{operation:'hover',path:'main.ts',line:1,column:1},_meta:{context:'x'.repeat(1024)}},1);
 await f.settle();assert.equal(f.server.closed,true);assert.equal(f.disposed(),1);assert.equal(f.calls.length,0);
});
test('partial UTF-8 lines, malformed JSON and notifications do not corrupt the protocol',async t=>{
 const f=await fixture(t);await f.init();const count=f.rows.length;
 f.input.write('{broken}\n');f.input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');await f.settle();assert.equal(f.rows.length,count+1);assert.equal(f.rows.at(-1).error.code,-32700);
 const bytes=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:'é',method:'ping'})+'\n'),at=bytes.indexOf(0xc3);f.input.write(bytes.subarray(0,at+1));f.input.write(bytes.subarray(at+1));await f.settle();assert.equal(f.rows.at(-1).id,'é');assert.deepEqual(f.rows.at(-1).result,{});
});
test('oversized frames close and dispose without interpreting their remainder',async t=>{
 const f=await fixture(t,{maxFrameBytes:1024});f.input.write('x'.repeat(1025));await f.settle();assert.equal(f.server.closed,true);assert.equal(f.disposed(),1);assert.equal(f.calls.length,0);assert.equal(f.input.destroyed,false);assert.equal(f.output.destroyed,false);
});
test('explicitly owned streams close on overflow while ordinary EOF drains replies',async t=>{
 const hard=await fixture(t,{ownsTransport:true,maxFrameBytes:1024});hard.input.write('x'.repeat(1025));await hard.settle();assert.equal(hard.input.destroyed,true);assert.equal(hard.output.destroyed,true);
 const normal=await fixture(t,{ownsTransport:true});normal.input.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})+'\n');await normal.settle();assert.deepEqual(normal.rows,[{jsonrpc:'2.0',id:1,result:{}}]);assert.equal(normal.output.writableEnded,true);assert.equal(normal.disposed(),1);
});
test('semantic exceptions and oversized results do not leak internal diagnostic text',async t=>{
 const f=await fixture(t,{service:{query:async()=>{const error=Error('token=private path=C:/private');error.code='SEMANTIC_PATH';throw error;},dispose:async()=>{}}});await f.init();
 f.send('tools/call',{name:'workspace_tool_call',arguments:{operation:'hover',path:'a.ts',line:1,column:1}},1);await f.settle();assert.equal(f.rows.at(-1).result.isError,true);assert.doesNotMatch(JSON.stringify(f.rows),/private/);assert.match(f.rows.at(-1).result.content[0].text,/SEMANTIC_PATH/);
 const g=await fixture(t,{maxResultBytes:1024,service:{query:async()=>({text:'x'.repeat(2048)}),dispose:async()=>{}}});await g.init();g.send('tools/call',{name:'workspace_tool_call',arguments:{operation:'hover',path:'a.ts',line:1,column:1}},1);await g.settle();assert.equal(g.rows.at(-1).result.isError,true);assert.match(g.rows.at(-1).result.content[0].text,/limit/i);
});
test('sequential queue has a bounded pending request count',async t=>{
 let release;const waiting=new Promise(resolve=>release=resolve);const f=await fixture(t,{maxPending:2,service:{query:async()=>{await waiting;return{};},dispose:async()=>{release();}}});await f.init();
 const args={name:'workspace_tool_call',arguments:{operation:'hover',path:'a.ts',line:1,column:1}};
 f.send('tools/call',args,1);f.send('tools/call',args,2);f.send('tools/call',args,3);await f.settle();assert.equal(f.server.closed,true);release();
});
test('entry point rejects unknown flags and relative roots without printing them',async()=>{
 for(const args of [['--root','relative'],['--root','C:/private','--command','private']]){
  const child=spawn(process.execPath,['src/runtime/workspace-mcp.mjs',...args],{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);const code=await new Promise(resolve=>child.on('close',resolve));assert.notEqual(code,0);assert.equal(out,'');assert.doesNotMatch(err,/private|relative/);
 }
});
test('real JSONL subprocess resolves a definition and exits after stdin closes',{timeout:15000},async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-workspace-mcp-live-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'lib.ts'),'export const count = 1;\n');await writeFile(path.join(root,'main.ts'),"import {count} from './lib';\ncount;\n");
 const child=spawn(process.execPath,['src/runtime/workspace-mcp.mjs','--root',root],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 t.after(()=>{if(child.exitCode===null)child.kill();});let buffer='',stderr='';const answers=new Map(),waiters=new Map();child.stderr.on('data',chunk=>stderr+=chunk);
 child.stdout.on('data',chunk=>{buffer+=chunk;for(let i;(i=buffer.indexOf('\n'))>=0;){const row=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);answers.set(row.id,row);waiters.get(row.id)?.(row);}});
 const closed=new Promise(resolve=>child.once('close',resolve));
 const request=(id,method,params)=>{const answer=new Promise(resolve=>waiters.set(id,resolve));child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return answer;};
 const initialized=await request(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(initialized.result.serverInfo.name,'musebench-workspace');
 const result=await request(2,'tools/call',{name:'workspace_tool_call',arguments:{operation:'definition',path:'main.ts',line:2,column:2},_meta:{callId:'call_node_fixture',idempotencyKey:'node-fixture'}});assert.equal(result.error,undefined);assert.equal(result.result.isError,undefined);
 const navigation=JSON.parse(result.result.content[0].text);assert.deepEqual(navigation.items.map(item=>item.path),['lib.ts']);assert.equal(navigation.scope.config,'fixed-no-project-config');
 child.stdin.end();assert.equal(await closed,0);assert.equal(stderr,'');
});
test('CLI exits on frame and queue overflow with parent stdin deliberately kept open',{timeout:15000},async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-workspace-mcp-overflow-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const electron=createRequire(import.meta.url)('electron');
 const payloads=[Buffer.alloc(65537,120),Buffer.from(Array.from({length:100},(_,id)=>JSON.stringify({jsonrpc:'2.0',id,method:'ping'})).join('\n')+'\n')];
 for(const executable of [process.execPath,electron])for(const payload of payloads){
  const child=spawn(executable,['src/runtime/workspace-mcp.mjs','--root',root],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''},stdio:['pipe','pipe','pipe'],windowsHide:true});
  let stderr='';child.stdout.resume();child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.on('error',()=>{});
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));let timer;
  try{
   child.stdin.write(payload); // Never end(): the rejecting peer must close its own pipe.
   const outcome=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),3000);})]);
   assert.notEqual(outcome,'timeout',`${path.basename(executable)} remained alive with parent stdin open`);assert.equal(outcome.signal,null);assert.equal(child.stdin.writableEnded,false);assert.equal(stderr,'');
  }finally{clearTimeout(timer);if(child.exitCode===null){child.kill();await closed;}}
 }
});
