import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rmdir,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createExtensionReview} from '../src/runtime/extension-review.mjs';
import {checkConfiguration} from '../src/runtime/configuration-review.mjs';
import {createCustomize} from '../electron/customize.mjs';

async function fixture(t){
 const base=await mkdtemp(path.join(process.platform==='win32'?path.parse(os.tmpdir()).root:os.tmpdir(),'muse-project-mcp-test-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const profile=path.join(base,'home'),root=path.join(base,'repo'),workspace=path.join(root,'app');
 await mkdir(path.join(profile,'.config','muse'),{recursive:true});await mkdir(workspace,{recursive:true});await mkdir(path.join(root,'.git'));
 const environment={HOME:profile,USERPROFILE:profile},settings=path.join(profile,'.config','muse','settings.json');
 const review=createExtensionReview({profile,dataDir:path.join(base,'data'),environment});
 const put=(file,value)=>writeFile(file,JSON.stringify(value));
 const inspect=()=>review.projectMcpState(workspace,{environment});
 const check=()=>checkConfiguration({environment,workspaceRoot:workspace,extensionReview:review});
 return{base,root,workspace,profile,environment,settings,review,put,inspect,check};
}
const server={type:'stdio',command:'node',args:['server.mjs'],env:{REGION:'user',PRIVATE_VALUE:'private-value'},required:true};

test('setting sources follow personal, root and nested declarations per canonical field without exposing values',async t=>{
 const f=await fixture(t),rootFile=path.join(f.root,'.mcp.json'),nestedFile=path.join(f.workspace,'.mcp.json');
 await f.put(f.settings,{mcp_servers:{docs:{transport:'stdio',mode:'required',command:'node',args:['private-argument'],env:{REGION:'private-user',TOKEN:'private-token'},enabled:true,startup_timeout_sec:10,enabled_tools:['private-tool']}}});
 await f.put(rootFile,{mcpServers:{docs:{args:['private-root-argument'],env:{REGION:'private-root',ROOT:'private-root-only'},required:false,startup_timeout_sec:20,enabled_tools:['private-root-tool']}}});
 await f.put(nestedFile,{mcpServers:{docs:{args:[],env:{REGION:'private-nested'},enabled:false,enabled_tools:[]}}});
 const shown=await f.inspect(),entry=shown.servers[0],sources=Object.fromEntries(shown.sources.map(({path,revision})=>[path,{path,revision}]));
 assert.ok(Array.isArray(entry.settingSources),'Each server must explain its effective setting sources');
 const origins=Object.fromEntries(entry.settingSources.map(origin=>[origin.field,origin]));
 const expect=(field,file,prior=[])=>assert.deepEqual(origins[field],{field,source:file?sources[file]:null,overrides:prior.map(file=>sources[file])});
 expect('type',f.settings);expect('command',f.settings);expect('args',nestedFile,[f.settings,rootFile]);
 expect('env.REGION',nestedFile,[f.settings,rootFile]);expect('env.TOKEN',f.settings);expect('env.ROOT',rootFile);
 expect('required',rootFile,[f.settings]);expect('enabled',nestedFile,[f.settings]);expect('startup_timeout_sec',rootFile,[f.settings]);expect('enabled_tools',nestedFile,[f.settings,rootFile]);
 for(const field of ['cwd','framing','tool_timeout_sec'])expect(field,null);
 assert.equal(origins.transport,undefined);assert.equal(origins.mode,undefined);assert.equal(origins.disabled_tools,undefined);
 assert.deepEqual(entry.args,[]);assert.equal(entry.enabled,false);assert.equal(entry.required,false);assert.equal(entry.startupTimeout,20);
 const serialized=JSON.stringify(entry.settingSources);assert(!serialized.includes('private-'));assert(!serialized.includes('value'));
 const again=await f.inspect();assert.equal(again.revision,shown.revision);assert.deepEqual(again.servers[0].settingSources,entry.settingSources);
 await f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment});
 await f.put(nestedFile,{mcpServers:{docs:{args:[],env:{REGION:'private-mutated'},enabled:false,enabled_tools:[]}}});
 const changed=await f.inspect();assert.equal(changed.reviewed,false);assert.notEqual(changed.revision,shown.revision);
 assert.notEqual(changed.servers[0].settingSources.find(item=>item.field==='env.REGION').source.revision,origins['env.REGION'].source.revision);
 assert.deepEqual(entry.settingSources,again.servers[0].settingSources,'The earlier inspected snapshot remains immutable');
 await assert.rejects(f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment}),/changed/i);
});

for(const alias of ['canonical','legacy','http'])test(`setting sources preserve ${alias} HTTP aliases and inherited header keys`,async t=>{
 const f=await fixture(t),rootFile=path.join(f.root,'.mcp.json');
 const transport=alias==='legacy'?{transport:'streamable_http',mode:'optional'}:{type:alias==='http'?'http':'streamable-http',required:false};
 await f.put(f.settings,{mcpServers:{docs:{...transport,url:'https://example.invalid/mcp',headers:{Authorization:'private-auth','X.Region':'private-region'}}}});
 await f.put(rootFile,{mcpServers:{docs:{headers:{Authorization:'private-root-auth'}}}});
 const shown=await f.inspect(),entry=shown.servers[0],personal=shown.sources[0],root=shown.sources[1];
 const origin=field=>entry.settingSources?.find(item=>item.field===field);
 assert.deepEqual(origin('headers.Authorization'),{field:'headers.Authorization',source:{path:root.path,revision:root.revision},overrides:[{path:personal.path,revision:personal.revision}]});
 assert.deepEqual(origin('headers["X.Region"]'),{field:'headers["X.Region"]',source:{path:personal.path,revision:personal.revision},overrides:[]});
 assert.equal(origin('type').source.path,f.settings);assert.equal(origin('required').source.path,f.settings);assert.equal(entry.transport,'streamable_http');
 assert(!JSON.stringify(entry.settingSources).includes('private-'));assert.equal(origin('env'),undefined);
});

test('inferred transport and absent flags are built-in defaults while explicit empty maps retain their source',async t=>{
 const f=await fixture(t),file=path.join(f.root,'.mcp.json');await f.put(file,{mcpServers:{docs:{command:'node',env:{}}}});
 const shown=await f.inspect(),origins=shown.servers[0].settingSources;
 assert.deepEqual(origins?.find(item=>item.field==='type'),{field:'type',source:null,overrides:[]});
 for(const field of ['enabled','required'])assert.deepEqual(origins.find(item=>item.field===field),{field,source:null,overrides:[]});
 assert.equal(origins.find(item=>item.field==='env').source.path,file);
});

test('project review shows merged sources and instructions without exposing secret values',async t=>{
 const f=await fixture(t);
 await f.put(f.settings,{schema_version:1,mcpServers:{docs:server}});
 await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:{args:['repo.mjs'],env:{REGION:'repo'}}}});
 await f.put(path.join(f.workspace,'.mcp.json'),{mcpServers:{docs:{args:['app.mjs'],env:{REGION:'app'}}}});
 await writeFile(path.join(f.root,'AGENTS.md'),'Repository rules');await writeFile(path.join(f.workspace,'MUSE.md'),'App rules');
 assert.equal(typeof f.review.projectMcpState,'function','Project MCP review must be available');
 const shown=await f.inspect();assert.equal(shown.boundary,f.root);assert.equal(shown.reviewed,false);assert.equal(shown.sources.length,3);
 assert.deepEqual(shown.servers[0].args,['app.mjs']);assert.deepEqual(shown.servers[0].environmentKeys,['PRIVATE_VALUE','REGION']);
 assert.deepEqual(shown.instructions.map(x=>x.text),['Repository rules','App rules']);
 assert(!JSON.stringify(shown).includes('private-value'));
 await assert.rejects(f.check(),/project MCP.*review|review.*project MCP/i);
 await f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment});
 assert.equal((await f.inspect()).reviewed,true);await f.check();assert.equal(await f.review.allowProject(f.workspace,{environment:f.environment}),true);
 const persisted=await readFile(path.join(f.base,'data','extension-reviews.json'),'utf8');assert(!persisted.includes('private-value'));assert(!persisted.includes('Repository rules'));
 await assert.rejects(readFile(path.join(f.profile,'.config','muse','trust.json')),e=>e.code==='ENOENT');
});

for(const change of ['project','personal','instructions','new-source','environment','boundary'])test(`project MCP approval expires after ${change} changes`,async t=>{
 const f=await fixture(t);f.environment.MCP_REGION='east';
 await f.put(f.settings,{schema_version:1,mcp_servers:{docs:{transport:'stdio',command:'node',args:['user.mjs'],env:{REGION:'${MCP_REGION}'}}}});
 await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:{args:['repo.mjs']}}});
 const shown=await f.inspect();await f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment});await f.check();
 if(change==='project')await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:{args:['changed.mjs']}}});
 if(change==='personal')await f.put(f.settings,{schema_version:1,mcp_servers:{docs:{transport:'stdio',command:'different',env:{REGION:'${MCP_REGION}'}}}});
 if(change==='instructions')await writeFile(path.join(f.workspace,'AGENTS.md'),'New rules');
 if(change==='new-source')await f.put(path.join(f.workspace,'.mcp.json'),{mcpServers:{docs:{enabled:false}}});
 if(change==='environment')f.environment.MCP_REGION='west';
 if(change==='boundary')await mkdir(path.join(f.workspace,'.git'));
 assert.equal((await f.inspect()).reviewed,false);await assert.rejects(f.check(),/review|project MCP/i);
 await assert.rejects(f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment}),/changed/i);
 assert.equal(await f.review.allowProject(f.workspace,{environment:f.environment}),false);
});

test('review revocation and a changed worktree never inherit project access',async t=>{
 const f=await fixture(t);await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:server}});
 const shown=await f.inspect();await f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment});
 const other=path.join(f.base,'worktree');await mkdir(other);await writeFile(path.join(other,'.git'),'gitdir: ../repo/.git/worktrees/other');await f.put(path.join(other,'.mcp.json'),{mcpServers:{docs:server}});
 assert.equal((await f.review.projectMcpState(other,{environment:f.environment})).reviewed,false);
 await f.review.revokeProjectMcp(f.workspace);assert.equal((await f.inspect()).reviewed,false);await assert.rejects(f.check(),/review/i);
});

test('canonical personal MCP remains individually reviewed without a project grant',async t=>{
 const f=await fixture(t);await f.put(f.settings,{schema_version:1,mcpServers:{docs:server}});
 await assert.rejects(f.check(),/review/i);await f.review.approveMcp('docs',server);await f.check();
});

test('invalid, ambiguous and linked project configuration cannot be approved',async t=>{
 const f=await fixture(t),file=path.join(f.root,'.mcp.json');
 for(const doc of [{mcp_servers:{docs:server}},{mcpServers:null},{mcpServers:{docs:{...server,env:{TOKEN:null}}}},{mcpServers:{docs:{...server,transport:'stdio'}}},{mcpServers:{docs:{command:'node',url:'https://example.com'}}},{mcpServers:{docs:{type:'streamable-http',url:'https://user:secret@example.com/mcp'}}}]){
  await f.put(file,doc);await assert.rejects(f.inspect(),/MCP|configuration|transport|URL/i);
 }
 await writeFile(file,'x'.repeat(1024*1024+1));await assert.rejects(f.inspect(),/limit|large|MCP/i);
 await rm(file);const actual=path.join(f.base,'linked.json');await f.put(actual,{mcpServers:{docs:server}});
 try{await symlink(actual,file);}catch(error){if(error.code==='EPERM')return;throw error;}
 await assert.rejects(f.inspect(),/symbolic|link/i);
});

test('Customize inspects during runs but requires explicit idle approval of the selected revision',async t=>{
 const f=await fixture(t);await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:server}});let running=true;
 const current={activeProject:{root:f.workspace}},service=createCustomize({getState:()=>current,environment:f.environment,review:f.review,dataDir:path.join(f.base,'data'),isActive:()=>running,run:async()=>{throw Error('Inspection must not launch Muse');}});t.after(()=>service.close());
 const shown=(await service.dispatch({type:'inspectProjectMcp'})).projectMcp;assert.equal(shown.reviewed,false);
 await assert.rejects(service.dispatch({type:'approveProjectMcp',root:f.workspace,revision:shown.revision,reviewed:true}),/running|finish/i);
 running=false;await assert.rejects(service.dispatch({type:'approveProjectMcp',root:f.workspace,revision:shown.revision}),/review/i);
 await assert.rejects(service.dispatch({type:'approveProjectMcp',root:f.root,revision:shown.revision,reviewed:true}),/selected project/i);
 const result=await service.dispatch({type:'approveProjectMcp',root:f.workspace,revision:shown.revision,reviewed:true});assert.equal(result.projectMcp.reviewed,true);
 await service.dispatch({type:'revokeProjectMcp',root:f.workspace});assert.equal((await f.inspect()).reviewed,false);
});

test('canonical personal settings can be managed without changing format or unrelated fields',async t=>{
 const f=await fixture(t);await f.put(f.settings,{schema_version:1,theme:'dark',mcpServers:{docs:server}});
 const service=createCustomize({getState:()=>({runtime:{binary:process.execPath}}),environment:f.environment,review:f.review,dataDir:path.join(f.base,'data'),run:async()=>({stdout:'{"plugins":[],"skills":[]}'})});t.after(()=>service.close());
 const state=await service.snapshot();assert.equal(state.servers.length,1);assert.equal(state.servers[0].transport,'stdio');
 await service.dispatch({type:'serverAction',name:'docs',revision:state.servers[0].revision,action:'disable',reviewed:true});
 await service.dispatch({type:'saveServer',server:{name:'new-tools',transport:'stdio',command:'node',args:['tools.mjs']},reviewed:true});
 const saved=JSON.parse(await readFile(f.settings,'utf8'));assert.equal(saved.theme,'dark');assert.equal(saved.mcp_servers,undefined);assert.equal(saved.mcpServers.docs.enabled,false);assert.equal(saved.mcpServers['new-tools'].type,'stdio');assert.equal(saved.mcpServers.docs.env.PRIVATE_VALUE,'private-value');
});

test('a non-Git project cannot grant unqualified ancestor instructions',async t=>{
 const f=await fixture(t);await rmdir(path.join(f.root,'.git'));
 await f.put(path.join(f.workspace,'.mcp.json'),{mcpServers:{docs:server}});
 await writeFile(path.join(f.root,'AGENTS.md'),'Ancestor instructions outside the project');
 await assert.rejects(f.inspect(),/ancestor instructions/i);
 assert.equal(await f.review.allowProject(f.workspace,{environment:f.environment}),false);
});

test('Windows environment bindings match native case-insensitive lookup',async t=>{
 const f=await fixture(t);await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:{...server,env:{REGION:'${mCp_ReGiOn}'}}}});
 const first={...f.environment,windir:'C:\\Windows',MCP_REGION:'east'};
 const snapshot=environment=>f.review.projectMcpState(f.workspace,{environment,platform:'win32'});
 const shown=await snapshot(first);await f.review.approveProjectMcp(f.workspace,shown.revision,{environment:first,platform:'win32'});
 assert.equal((await snapshot({...f.environment,WINDIR:'C:\\Windows',mcp_region:'east'})).reviewed,true);
 for(const environment of [{...first,windir:'D:\\Windows'},{...first,MCP_REGION:'west'}])assert.equal((await snapshot(environment)).reviewed,false);
 await assert.rejects(snapshot({...first,WINDIR:'D:\\Windows'}),/ambiguous.*environment/i);
});

test('project server references cannot borrow the app billing credential',async t=>{
 const f=await fixture(t),file=path.join(f.root,'.mcp.json');
 for(const value of ['${META_API_KEY}','${META_API_KEY:-fallback}','prefix-${meta_api_key}']){
  await f.put(file,{mcpServers:{docs:{...server,env:{TOKEN:value}}}});
  await assert.rejects(f.inspect(),/billing credential/i);
 }
 await f.put(file,{mcpServers:{docs:{...server,env:{TOKEN:'$${META_API_KEY}'}}}});
 assert.equal((await f.inspect()).present,true,'An escaped literal is not a credential reference');
});

test('the instruction inspector reflects the combined project server grant',async t=>{
 const f=await fixture(t);await f.put(path.join(f.root,'.mcp.json'),{mcpServers:{docs:server}});
 await writeFile(path.join(f.root,'AGENTS.md'),'Shared repository instructions');
 const service=createCustomize({getState:()=>({activeProject:{root:f.workspace}}),environment:f.environment,review:f.review,dataDir:path.join(f.base,'data')});t.after(()=>service.close());
 const inspect=async()=>(await service.dispatch({type:'inspectProject'})).projectInstructions;
 assert.deepEqual((await inspect()).trust,{status:'required',source:'projectMcp'});
 const shown=await f.inspect();await f.review.approveProjectMcp(f.workspace,shown.revision,{environment:f.environment});
 assert.deepEqual((await inspect()).trust,{status:'reviewed',source:'projectMcp'});
 await writeFile(path.join(f.root,'AGENTS.md'),'Updated repository instructions');assert.equal((await inspect()).trust.status,'required');
});
