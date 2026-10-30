import test from 'node:test';import assert from 'node:assert/strict';import {PassThrough} from 'node:stream';
import {createDiscoveryMcpServer,discoveryTools} from '../src/runtime/discovery-mcp.mjs';
import {supportedSchema,validateDiscoveryArguments} from '../src/runtime/discovery-schema.mjs';
import {createWorkspaceToolActivity} from '../src/shared/workspace-tool-activity.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('discovery advertises arbitrary effects and observes source-bound unknown receipts',()=>{
 const tool=discoveryTools.find(t=>t.name==='discovery_call');assert.equal(tool.annotations.readOnlyHint,false);assert.equal(tool.annotations.idempotentHint,false);assert.equal(tool.annotations.openWorldHint,true);
 const activity=createWorkspaceToolActivity();assert.equal(activity.observe({kind:'toolCall',tool:'mcp__musebench_discovery__discovery_call',turnId:'owned',itemId:'call',revision:1,status:'completed',visibleOutput:JSON.stringify({sourceId:'global:docs',tool:'publish',outcome:'unknown',error:'Not retried'})},['owned']),true);assert.match(activity.snapshot().items[0].detail,/unknown/i);
});
test('schema validation enforces whole-document depth, bounded subset and exact argument types',()=>{
 for(const schema of [{type:'object',pattern:'.*'},{type:'object',$ref:'#/x'},{type:'object',properties:{a:{type:'str'}}},{type:'object',maxLength:-1},{type:'object',enum:[]},{type:'object',description:'x'.repeat(32768)}])assert.throws(()=>supportedSchema(schema));
 let nested={};for(let i=0;i<18;i++)nested={child:nested};assert.throws(()=>supportedSchema({type:'object',const:nested}),/depth|excessive/i);
 const schema=supportedSchema({type:'object',properties:{n:{type:'integer',minimum:1},items:{type:'array',maxItems:2,items:{type:'string',maxLength:3}}},required:['n'],additionalProperties:false});validateDiscoveryArguments(schema,{n:2,items:['abc']});for(const args of [{n:'2'},{n:0},{n:2,unknown:true},{n:2,toString:'unexpected'},{n:2,items:['long']},{n:2,items:['a','b','c']}])assert.throws(()=>validateDiscoveryArguments(schema,args));
 validateDiscoveryArguments(supportedSchema({type:'object',const:{a:1,b:2}}),{b:2,a:1});
});
test('MCP protocol cancellation is immediate, unsupported methods inert and encoded frames bounded',async()=>{
 const input=new PassThrough(),output=new PassThrough(),responses=[];output.on('data',chunk=>responses.push(...String(chunk).trim().split('\n').map(JSON.parse)));let disposed=0,calls=0,cancelled=false;
 const service={search:async()=>({sources:[]}),call:async(_args,{signal})=>{calls++;return new Promise(resolve=>signal.addEventListener('abort',()=>{cancelled=true;resolve({outcome:'unknown'});},{once:true}));},dispose:async()=>{disposed++;}};
 const server=await createDiscoveryMcpServer({input,output,service});const send=message=>input.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
 send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});await tick();send({id:2,method:'tools/list',params:{_meta:{callId:'native-metadata'}}});send({id:3,method:'sampling/createMessage',params:{}});await tick();assert.equal(responses.find(r=>r.id===3).error.code,-32601);assert.equal(calls,0);
 send({id:4,method:'tools/call',params:{name:'discovery_call',arguments:{}}});await tick();send({method:'notifications/cancelled',params:{requestId:4}});await tick();assert.equal(cancelled,true);assert.equal(responses.some(r=>r.id===4),false);
 input.write(Buffer.alloc(131073,65));await server.done;assert.equal(disposed,1);assert.equal(server.closed,true);assert.equal(calls,1);
});
