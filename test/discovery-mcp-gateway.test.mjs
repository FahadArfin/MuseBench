import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const gateway=await import('../src/runtime/discovery-gateway.mjs').catch(()=>({}));
// Positive fixtures use the reviewed-source startup default. Deadline failure
// cases below deliberately keep their separate 500ms budget.
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'discovery-gateway-')),log=path.join(root,'log'),control=path.join(root,'control');await writeFile(control,'{}');const source={id:'global:fixture',name:'fixture',revision:'a'.repeat(64),command:process.execPath,args:[path.resolve('test/fixtures/discovery-server.mjs'),log,control],cwd:root,env:{...process.env,FIXTURE_ENV:'reviewed',FIXTURE_GRANDCHILD:'1'},enabledTools:['allowed'],disabledTools:['filtered'],startupMs:30000,callMs:200};return{root,log,control,source,records:async()=>JSON.parse('['+(await readFile(log,'utf8')).trim().split('\n').join(',')+']')};}
test('gateway filters catalogs, validates input, binds revisions and never retries uncertain calls',async()=>{
 assert.equal(typeof gateway.createDiscoveryGateway,'function','gateway exists');const f=await fixture();let valid=true;
 const service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),sessionId:'owned-native-session',verify:async()=>{if(!valid)throw Error('Source review changed');}});
 try{
 const result=await service.search({query:'fixture'});assert.equal(result.sources[0].tools.length,1);const catalogRevision=result.sources[0].catalogRevision;
 const args={sourceId:f.source.id,catalogRevision,tool:'allowed',arguments:{value:7}};
 assert.equal((await service.call(args)).outcome,'completed');assert.equal((await f.records()).filter(r=>r.kind==='start').length,1);assert.equal((await f.records())[0].session,'owned-native-session');
 await assert.rejects(service.call({...args,arguments:{value:'7'}}),/arguments/i);await assert.rejects(service.call({...args,tool:'filtered'}),/tool/i);
 await writeFile(f.control,JSON.stringify({changed:true}));await assert.rejects(service.call(args),/catalog.*changed|search/i);
 const fresh=await service.search({query:''});const next={...args,catalogRevision:fresh.sources[0].catalogRevision};
 await writeFile(f.control,JSON.stringify({changed:true,large:true}));const large=await service.call(next);assert.equal(large.truncated,true);assert.equal(large.outcome,'completed');
 await writeFile(f.control,JSON.stringify({changed:true,hang:true}));const uncertain=await service.call(next);assert.equal(uncertain.outcome,'unknown');await assert.rejects(service.call(next),/closed|reconnect/i);
 assert.equal((await f.records()).filter(r=>r.kind==='call').length,3);valid=false;await assert.rejects(service.search({query:''}),/changed/i);
 }finally{await service.dispose();const records=await f.records();for(const row of records.filter(r=>['start','grandchild'].includes(r.kind)))assert.throws(()=>process.kill(row.pid,0));await rm(f.root,{recursive:true,force:true});}
});
test('positive gateway startup admits a delayed owned fixture within the reviewed-source default',async()=>{
 const f=await fixture();f.source.env.FIXTURE_START_DELAY_MS='3100';
 const service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'delayed-owned'});
 try{
  const result=await service.search({query:'fixture'}),catalogRevision=result.sources[0].catalogRevision;
  assert.equal((await service.call({sourceId:f.source.id,catalogRevision,tool:'allowed',arguments:{value:7}})).outcome,'completed');
  const records=await f.records();
  for(const kind of ['start','initialize','call'])assert.equal(records.filter(row=>row.kind===kind).length,1,kind);
 }finally{
  await service.dispose();
  for(const row of (await f.records()).filter(row=>['start','grandchild'].includes(row.kind)))assert.throws(()=>process.kill(row.pid,0));
  await rm(f.root,{recursive:true,force:true});
 }
});

test('unsupported schemas and fully encoded argument limits are rejected before effects',async()=>{
 assert.equal(typeof gateway.createDiscoveryGateway,'function');const f=await fixture(),service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});
 try{await writeFile(f.control,JSON.stringify({schema:{type:'object',$ref:'https://invalid/schema'}}));const results=await service.search({query:''});assert.equal(results.sources[0].tools.length,0);assert.equal(results.sources[0].unsupported,1);await assert.rejects(service.call({sourceId:f.source.id,catalogRevision:results.sources[0].catalogRevision,tool:'allowed',arguments:{value:'\\"'.repeat(40000)}}),/limit/i);assert.equal((await f.records()).filter(r=>r.kind==='call').length,0);}finally{await service.dispose();await rm(f.root,{recursive:true,force:true});}
});
test('search bounds fully encoded schemas across the whole selection and catalog excess closes ownership',async()=>{
 const f=await fixture();f.source.enabledTools=null;const service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});
 try{
 const tools=Array.from({length:12},(_,i)=>({name:'tool'+i,description:'\\"'.repeat(2500),inputSchema:{type:'object'}}));await writeFile(f.control,JSON.stringify({catalog:tools}));const result=await service.search({query:''}),encoded=JSON.stringify({jsonrpc:'2.0',id:'x'.repeat(128),result:{content:[{type:'text',text:JSON.stringify(result)}]}});assert.ok(Buffer.byteLength(encoded)<=65536);assert.ok(result.sources[0].tools.length<=8);assert.ok(result.omitted>0);
 await writeFile(f.control,JSON.stringify({catalog:Array.from({length:201},(_,i)=>({name:'tool'+i,inputSchema:{type:'object'}}))}));await assert.rejects(service.search({query:''}),/200 tools|512 KiB/i);assert.equal((await f.records()).filter(row=>row.kind==='call').length,0);
 }finally{await service.dispose();await rm(f.root,{recursive:true,force:true});}
});
for(const mode of ['malformed','stderr','startHang'])test(`source ${mode} is bounded, is not retried and shuts down its descendants`,async()=>{
 const f=await fixture();f.source.startupMs=500;const service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});
 try{await writeFile(f.control,JSON.stringify({[mode]:true}));await assert.rejects(service.search({query:''}));await assert.rejects(service.search({query:''}),/closed|reconnect/i);assert.equal((await f.records()).filter(row=>row.kind==='start').length,1);}finally{await service.dispose();for(const row of (await f.records()).filter(r=>['start','grandchild'].includes(r.kind)))assert.throws(()=>process.kill(row.pid,0));await rm(f.root,{recursive:true,force:true});}
});
test('sampling, elicitation and task creation requests have no forwarding authority',async()=>{
 for(const method of ['sampling/createMessage','elicitation/create','tasks/create']){const f=await fixture(),service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});
 try{await writeFile(f.control,JSON.stringify({serverRequest:method}));await service.search({query:''});let rows=[];for(let i=0;i<20;i++){rows=await f.records();if(rows.some(r=>r.kind==='server-response'))break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(rows.find(r=>r.kind==='server-response').error,-32601);assert.equal(rows.filter(r=>r.kind==='call').length,0);}finally{await service.dispose();await rm(f.root,{recursive:true,force:true});}}
});

for(const filtered of [true,false])test(`unsupported output schema is ${filtered?'filtered before admission':'counted without closing the catalog'}`,async()=>{
 const f=await fixture(),service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});
 try{const inputSchema={type:'object'};await writeFile(f.control,JSON.stringify({catalog:[{name:'allowed',inputSchema,...(!filtered?{outputSchema:{type:'object',$ref:'#/missing'}}:{})},{name:'filtered',inputSchema,outputSchema:{type:'object',$ref:'#/missing'}}]}));const result=await service.search({query:''});assert.equal(result.sources[0].tools.length,filtered?1:0);assert.equal(result.sources[0].unsupported,filtered?0:1);assert.equal((await f.records()).filter(r=>r.kind==='call').length,0);}finally{await service.dispose();await rm(f.root,{recursive:true,force:true});}
});
for(const limit of ['count','bytes'])test(`catalog ${limit} bound precedes output schema processing`,async()=>{
 const f=await fixture(),service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});
 try{await writeFile(f.control,JSON.stringify({catalog:Array.from({length:limit==='count'?201:1},(_,i)=>({name:'tool'+i,inputSchema:{type:'object'},outputSchema:{type:'object',$ref:'#/missing',description:limit==='bytes'?'x'.repeat(524288):''}}))}));await assert.rejects(service.search({query:''}),/200 tools or 512 KiB/);await assert.rejects(service.search({query:''}),/closed/);}finally{await service.dispose();await rm(f.root,{recursive:true,force:true});}
});
test('output schemas use the bounded policy and structured results use its local validator',async()=>{
 const f=await fixture(),service=gateway.createDiscoveryGateway({sources:[f.source],helperPath:path.resolve('native/bin/MuseBenchJob.exe'),verify:async()=>{},sessionId:'owned'});f.source.enabledTools=null;
 try{let deep={type:'object'};for(let i=0;i<18;i++)deep={type:'object',properties:{nested:deep}};const inputSchema={type:'object'},outputSchema={type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false};await writeFile(f.control,JSON.stringify({catalog:[{name:'allowed',inputSchema,outputSchema},{name:'pattern',inputSchema,outputSchema:{type:'object',pattern:'x'}},{name:'large',inputSchema,outputSchema:{type:'object',description:'x'.repeat(32768)}},{name:'deep',inputSchema,outputSchema:deep},{name:'task',inputSchema,execution:{taskSupport:'required'}}],result:{content:[],structuredContent:{value:7}}}));const result=await service.search({query:''}),row=result.sources[0];assert.deepEqual(row.tools.map(t=>t.name),['allowed']);assert.deepEqual(row.tools[0].outputSchema,outputSchema);assert.equal(row.unsupported,4);const args={sourceId:f.source.id,catalogRevision:row.catalogRevision,tool:'allowed',arguments:{}};assert.equal((await service.call(args)).outcome,'completed');const state=JSON.parse(await readFile(f.control,'utf8'));state.result.structuredContent.value='wrong';await writeFile(f.control,JSON.stringify(state));assert.equal((await service.call(args)).outcome,'unknown');await assert.rejects(service.call(args),/closed/);assert.equal((await f.records()).filter(r=>r.kind==='call').length,2);}finally{await service.dispose();await rm(f.root,{recursive:true,force:true});}
});
