import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationDigest} from '../src/runtime/extension-review.mjs';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {createCustomize} from '../electron/customize.mjs';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const api=await import('../electron/integration-panels.mjs').catch(()=>({}));

function fixture({entry,reviewed=true}={}){
 let source=JSON.stringify({schema_version:1,theme:'unchanged',mcpServers:{docs:entry??{type:'streamable-http',url:'https://example.com/mcp',headers:{Authorization:'PRIVATE_VALUE'}},other:{command:'private-program',args:['PRIVATE_ARGUMENT']}}});
 const f={clock:0,state:{activeProject:{id:'project',root:'C:/project'},task:{id:'chat'},runtime:{status:'idle'}},active:false,closed:false,writes:0,approvals:0,failWrite:false,failApproval:false};
 const settings=async()=>{const config=JSON.parse(source);return{source,config,key:'mcpServers',servers:config.mcpServers};};
 const approved=new Set(reviewed?[configurationDigest(JSON.parse(source).mcpServers.docs)]:[]);
 f.get=()=>JSON.parse(source);f.source=()=>source;f.change=fn=>{const config=f.get();fn(config);source=JSON.stringify(config);};f.revoke=()=>approved.clear();
 f.review={allowMcp:async(_name,config)=>{await f.duringRead?.();return approved.has(configurationDigest(config));},approveMcp:async(_name,config,options={})=>{if(f.failApproval)throw Error('Approval unavailable');await f.duringApprove?.();await options.beforeCommit?.();approved.add(configurationDigest(config));f.approvals++;}};
 f.service=api.createIntegrationPanels({settings,writeSettings:async(original,config,beforeCommit)=>{if(source!==original)throw Error('Settings changed');await f.duringWrite?.();await beforeCommit?.();if(source!==original)throw Error('Settings changed');if(f.failWrite)throw Error('Disk unavailable');source=JSON.stringify(config);f.writes++;},review:f.review,getState:()=>f.state,isActive:()=>f.active,isClosed:()=>f.closed,now:()=>f.clock});
 f.inspect=()=>f.service.inspect({name:'docs',revision:configurationDigest(f.get().mcpServers.docs)});
 f.prepare=async values=>{const panel=await f.inspect();return f.service.prepare({name:'docs',revision:panel.revision,values:{...panel.values,...values}});};
 return f;
}

test('native panel inspection exposes versioned bounded fields without private configuration',async()=>{
 assert.equal(typeof api.createIntegrationPanels,'function');const f=fixture();f.active=true;
 const before=f.source(),panel=await f.inspect();assert.equal(panel.schemaVersion,1);assert.equal(panel.kind,'mcp-run-settings');assert.equal(panel.editable,true);
 assert.deepEqual(panel.values,{required:false,startupTimeout:30,toolTimeout:300});assert.deepEqual(panel.fields.map(x=>x.key),['required','startupTimeout','toolTimeout']);
 assert(!JSON.stringify(panel).includes('PRIVATE'));assert(!JSON.stringify(panel).includes('example.com'));assert.equal(f.source(),before);assert.equal(f.writes,0);
});
test('review prepares exact changes and applies only policy fields after explicit confirmation',async()=>{
 const f=fixture(),before=f.get(),review=await f.prepare({required:true,toolTimeout:22.5});assert.equal(f.writes,0);assert.deepEqual(review.changes.map(x=>x.key),['required','toolTimeout']);assert(!JSON.stringify(review).includes('PRIVATE'));
 await assert.rejects(f.service.apply({token:review.token}),/review/i);assert.equal(f.writes,0);
 await f.service.apply({token:review.token,reviewed:true});const saved=f.get();assert.deepEqual(saved.mcpServers.docs,{...before.mcpServers.docs,required:true,tool_timeout_sec:22.5});assert.deepEqual(saved.mcpServers.other,before.mcpServers.other);assert.equal(saved.theme,'unchanged');assert.equal(f.approvals,1);
 await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/expired|review/i);assert.equal(f.writes,1);
});
test('legacy mode is preserved and unchanged defaults are not written',async()=>{
 const f=fixture({entry:{transport:'stdio',command:'node',args:['PRIVATE_VALUE'],mode:'optional'}});const review=await f.prepare({required:true});await f.service.apply({token:review.token,reviewed:true});
 assert.deepEqual(f.get().mcpServers.docs,{transport:'stdio',command:'node',args:['PRIVATE_VALUE'],mode:'required'});
 await assert.rejects(f.prepare({}),/no changes/i);
});
test('an unreviewed executable cannot be approved indirectly through its settings panel',async()=>{
 const f=fixture({reviewed:false}),panel=await f.inspect();assert.equal(panel.editable,false);assert.match(panel.reason,/review/i);
 await assert.rejects(f.prepare({toolTimeout:20}),/review/i);assert.equal(f.approvals,0);assert.equal(f.writes,0);
});
for(const values of [{toolTimeout:0},{startupTimeout:3601},{required:'false'},{toolTimeout:null},{toolTimeout:NaN},{startupTimeout:Infinity},{command:'replace-program'},{url:'https://other.example'}])test(`rejects malformed or additional panel input ${JSON.stringify(values)}`,async()=>{
 const f=fixture();await assert.rejects(f.prepare(values),/invalid|timeout|field|required/i);assert.equal(f.writes,0);
});
for(const entry of [{type:'stdio',command:'node',required:true,mode:'required'},{type:'stdio',transport:'stdio',command:'node'},{command:'node',tool_timeout_sec:'50'},{command:'node',tool_timeout_sec:99999},...['required','startup_timeout_sec','tool_timeout_sec'].map(key=>({command:'node',[key]:null}))])test(`unsupported existing settings are read-only: ${JSON.stringify(entry)}`,async()=>{
 const f=fixture({entry}),panel=await f.inspect();assert.equal(panel.editable,false);assert.match(panel.reason,/official|unsupported|ambiguous/i);assert(!JSON.stringify(panel).includes('PRIVATE'));await assert.rejects(f.prepare({toolTimeout:40}));assert.equal(f.writes,0);
});
for(const change of ['source','unrelated','owner','chat','grant','busy','closed','expired'])test(`prepared settings reject ${change} changes without a write`,async()=>{
 const f=fixture(),review=await f.prepare({toolTimeout:40});
 if(change==='source')f.change(c=>c.mcpServers.docs.url='https://changed.example');
 if(change==='unrelated')f.change(c=>c.theme='light');
 if(change==='owner')f.state.activeProject.root='C:/another';
 if(change==='chat')f.state.task.id='another';
 if(change==='grant')f.revoke();if(change==='busy')f.active=true;if(change==='closed')f.closed=true;if(change==='expired')f.clock=600001;
 await assert.rejects(f.service.apply({token:review.token,reviewed:true}));assert.equal(f.writes,0);assert.equal(f.approvals,0);
});
test('prepare rechecks ownership after asynchronous approval reads',async()=>{
 const f=fixture(),panel=await f.inspect();f.duringRead=()=>{f.state.activeProject.root='C:/another';};
 await assert.rejects(f.service.prepare({name:'docs',revision:panel.revision,values:{...panel.values,toolTimeout:25}}),/changed/i);assert.equal(f.writes,0);
});
test('a task becoming active immediately before commit prevents the write',async()=>{
 const f=fixture(),review=await f.prepare({toolTimeout:40});f.duringWrite=()=>{f.active=true;};await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/finish|idle|running/i);assert.equal(f.writes,0);
});
test('source changes immediately before commit do not overwrite configuration',async()=>{
 const f=fixture(),review=await f.prepare({toolTimeout:40});f.duringWrite=()=>f.change(c=>c.theme='external');await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/changed/i);assert.equal(f.get().theme,'external');assert.equal(f.writes,0);
});
test('a failed write consumes its review and leaves grants unchanged',async()=>{
 const f=fixture(),review=await f.prepare({toolTimeout:40});f.failWrite=true;await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/disk/i);f.failWrite=false;await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/review|expired/i);assert.equal(f.writes,0);assert.equal(f.approvals,0);
});
test('a failed grant reports saved-but-unreviewed truthfully without replaying',async()=>{
 const f=fixture(),review=await f.prepare({toolTimeout:40});f.failApproval=true;await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/saved.*review/i);assert.equal(f.get().mcpServers.docs.tool_timeout_sec,40);assert.equal(await f.review.allowMcp('docs',f.get().mcpServers.docs),false);assert.equal(f.approvals,0);
});
test('a changed source during final approval cannot gain its grant',async()=>{
 const f=fixture(),review=await f.prepare({toolTimeout:40});f.duringApprove=()=>f.change(c=>c.mcpServers.docs.url='https://changed.example');await assert.rejects(f.service.apply({token:review.token,reviewed:true}),/saved.*review/i);assert.equal(f.approvals,0);
});
test('new preparations replace old reviews and close discards all tokens',async()=>{
 const f=fixture(),first=await f.prepare({toolTimeout:40}),second=await f.prepare({toolTimeout:50});await assert.rejects(f.service.apply({token:first.token,reviewed:true}));f.service.close();await assert.rejects(f.service.apply({token:second.token,reviewed:true}));assert.equal(f.writes,0);
});
for(const key of ['mcpServers','mcp_servers'])test(`Customize bridge persists reviewed panel edits in ${key} without connecting`,async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-panel-')),profile=path.join(root,'profile'),dataDir=path.join(root,'app'),configFolder=path.join(profile,'.config','muse');await mkdir(configFolder,{recursive:true});
 const entry={command:'unused-program',args:['PRIVATE_ARGUMENT'],env:{PRIVATE_TOKEN:'PRIVATE_VALUE'},...(key==='mcpServers'?{type:'stdio',required:false}:{transport:'stdio',mode:'optional'})};
 const document={schema_version:1,untouched:{name:'keep'},[key]:{docs:entry}};const file=path.join(configFolder,'settings.json');await writeFile(file,JSON.stringify(document));
 const environment={USERPROFILE:profile},review=createExtensionReview({dataDir,profile,environment,platform:'win32'});await review.approveMcp('docs',entry);
 const calls=[],service=createCustomize({dataDir,environment,review,platform:'win32',getState:()=>({runtime:{binary:'C:/muse.exe',status:'idle'}}),run:async(_binary,args)=>{calls.push(args);assert.equal(args[1],'list');return{stdout:JSON.stringify(args[0]==='skills'?{skills:[]}:{plugins:[]})};}});
 try{
  const {integrationPanel:panel}=await service.dispatch({type:'inspectIntegrationPanel',name:'docs',revision:configurationDigest(entry)});assert.equal(panel.editable,true);assert.equal(calls.length,0);
  const {integrationReview:prepared}=await service.dispatch({type:'prepareIntegrationPanel',name:'docs',revision:panel.revision,values:{...panel.values,startupTimeout:12}});assert.equal(calls.length,0);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),document);
  const result=await service.dispatch({type:'applyIntegrationPanel',token:prepared.token,reviewed:true});assert.match(result.message,/reconnect/i);
  const saved=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(saved,{...document,[key]:{docs:{...entry,startup_timeout_sec:12}}});assert.equal(await review.allowMcp('docs',saved[key].docs),true);assert.deepEqual(JSON.parse(await readFile(file+'.musebench-backup','utf8')),document);assert(!JSON.stringify(result).includes('PRIVATE'));
 }finally{await service.close();}
});
