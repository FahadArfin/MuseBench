import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {watch,writeFileSync} from 'node:fs';
const api=await import('../electron/customize.mjs').catch(()=>({}));
const policy=await import('../src/runtime/extension-review.mjs').catch(()=>({}));
import {customizeBlocked} from '../src/shared/customize-policy.mjs';
test('Customize exposes its finite setup service',()=>assert.equal(typeof api.createCustomize,'function'));
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'musebench-customize-'));
 const profile=path.join(root,'profile'),dataDir=path.join(root,'app');
 await mkdir(path.join(profile,'.config','muse'),{recursive:true});
 const settings=path.join(profile,'.config','muse','settings.json');
 const review=policy.createExtensionReview({dataDir,profile});
 return{root,profile,dataDir,settings,review};
}
test('MCP validation rejects command injection shapes and credentials in URLs',()=>{
 assert.equal(typeof api.validateServer,'function');
 for(const value of [{name:'--help',transport:'streamable_http',url:'https://example.com/mcp'},{name:'x',transport:'streamable_http',url:'https://u:secret@example.com/mcp'},{name:'x',transport:'streamable_http',url:'https://example.com/mcp?token=secret'},{name:'x',transport:'stdio',command:'node',args:'-e doAnything()'},{name:'x',transport:'stdio',command:'node',args:['ok'],env:{TOKEN:'secret'}}])assert.throws(()=>api.validateServer(value));
 assert.deepEqual(api.validateServer({name:'docs',transport:'streamable_http',url:'https://example.com/mcp'}),{name:'docs',config:{transport:'streamable_http',url:'https://example.com/mcp',enabled:true,mode:'optional'}});
});
test('review grants bind to one exact MCP configuration and persist',async()=>{
 const f=await fixture(),config={transport:'stdio',command:'node',args:['server.mjs'],enabled:true,mode:'optional'};
 assert.equal(await f.review.allowMcp('tools',config),false);
 await f.review.approveMcp('tools',config);
 assert.equal(await policy.createExtensionReview({dataDir:f.dataDir,profile:f.profile}).allowMcp('tools',config),true);
 assert.equal(await f.review.allowMcp('other',config),false);
 assert.equal(await f.review.allowMcp('tools',{...config,command:'other'}),false);
});
test('plugin review detects changed package files and refuses paths outside the cache',async()=>{
 const f=await fixture(),data=path.join(f.profile,'.local','share','muse'),cache=path.join(data,'plugins','cache','local','sample','hash','package');
 await mkdir(cache,{recursive:true});await writeFile(path.join(cache,'SKILL.md'),'original');
 const inventory=path.join(data,'plugins','installed.json');
 await writeFile(inventory,JSON.stringify({version:1,plugins:{sample:{cache_path:path.relative(data,cache),enabled:true}}}));
 await f.review.approvePlugins();assert.equal(await f.review.allowFile(inventory),true);
 await writeFile(path.join(cache,'SKILL.md'),'changed');assert.equal(await f.review.allowFile(inventory),false);
 await writeFile(inventory,JSON.stringify({plugins:{sample:{cache_path:f.root}}}));await assert.rejects(f.review.approvePlugins(),/cache|outside/i);
});
test('package hashes cannot confuse file contents with another file record',async()=>{
 const f=await fixture(),folder=path.join(f.root,'package');await mkdir(folder);
 await writeFile(path.join(folder,'a.txt'),'benign\0/b.js\0changed program');const before=await policy.treeDigest(folder);
 await writeFile(path.join(folder,'a.txt'),'benign');await writeFile(path.join(folder,'b.js'),'changed program');
 assert.notEqual(await policy.treeDigest(folder),before);
});
test('MCP edits retain unrelated settings and secrets, but snapshots do not expose them',async()=>{
 const f=await fixture();await writeFile(f.settings,JSON.stringify({theme:'keep',provider:{api_key:'do-not-expose'},mcp_servers:{existing:{transport:'streamable_http',url:'https://example.com/mcp',headers:{Authorization:'Bearer private'},enabled:false}}}));
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async()=>({stdout:'{"skills":[],"plugins":[]}'})});
 const state=await service.dispatch({type:'saveServer',server:{name:'docs',transport:'streamable_http',url:'https://example.org/mcp'},reviewed:true});
 const saved=JSON.parse(await readFile(f.settings,'utf8'));assert.equal(saved.theme,'keep');assert.equal(saved.provider.api_key,'do-not-expose');assert.equal(saved.mcp_servers.existing.headers.Authorization,'Bearer private');assert.equal(saved.mcp_servers.docs.enabled,true);
 assert.doesNotMatch(JSON.stringify(state),/do-not-expose|Bearer private|Authorization/);
 assert.equal(await f.review.allowMcp('docs',saved.mcp_servers.docs),true);
 assert.equal(await f.review.allowMcp('existing',saved.mcp_servers.existing),false);
 assert.ok((await readFile(f.settings+'.musebench-backup','utf8')).includes('keep'));
});
test('invalid settings and unreviewed changes never overwrite user configuration',async()=>{
 const f=await fixture();await writeFile(f.settings,'{broken');
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review});
 await assert.rejects(service.dispatch({type:'saveServer',server:{name:'docs',transport:'streamable_http',url:'https://example.org/mcp'},reviewed:true}),/settings/i);
 assert.equal(await readFile(f.settings,'utf8'),'{broken');
 await assert.rejects(service.dispatch({type:'saveServer',server:{name:'docs',transport:'streamable_http',url:'https://example.org/mcp'}}),/review/i);
});
test('active tasks and arbitrary commands are rejected before spawning a process',async()=>{
 const f=await fixture();let calls=0;
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe',status:'running'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async()=>{calls++;return{stdout:'{}'};}});
 await assert.rejects(service.dispatch({type:'skillActivation',id:'a',activation:'off'}),/finish|running/i);
 await assert.rejects(service.dispatch({type:'exec',args:['--yolo']}),/unsupported|invalid/i);assert.equal(calls,0);
});
test('setup stays blocked through Sites generation and unconfirmed native shutdown',()=>{
 assert.equal(customizeBlocked({busy:false},{busy:true,runtime:{status:'running'}}),true);
 for(const cleanup of ['pending','unconfirmed'])assert.equal(customizeBlocked({busy:false,runtime:{status:'unavailable',cleanup}}),true);
 assert.equal(customizeBlocked({busy:false,runtime:{status:'idle',cleanup:'confirmed'}}),false);
});
test('skill actions resolve actual inventory scope and never use a shell',async()=>{
 const f=await fixture(),calls=[];
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile,NODE_OPTIONS:'unsafe'},dataDir:f.dataDir,review:f.review,run:async(binary,args,options)=>{calls.push({binary,args,options});return{stdout:JSON.stringify({skills:[{id:'bundled:plan',name:'plan',scope:'bundled',activation:'on'}],plugins:[]})};}});
 await service.dispatch({type:'skillActivation',id:'bundled:plan',activation:'user-only'});
 const call=calls.find(x=>x.args[1]==='user-only');assert.deepEqual(call.args,['skills','user-only','bundled:plan','--scope','built-in','--json']);assert.equal(call.options.shell,false);assert.equal(call.options.env.NODE_OPTIONS,undefined);
 await assert.rejects(service.dispatch({type:'skillActivation',id:'--help',activation:'on'}),/skill|invalid/i);
});
test('the Windows guard permits only reviewed user extensions and still rejects hooks, trust and changes',async()=>{
 const {checkConfiguration}=await import('../src/runtime/exec.mjs');
 const f=await fixture(),workspaceRoot=path.join(f.root,'project');await mkdir(workspaceRoot);
 const entry={transport:'stdio',command:'node',args:['server.mjs'],enabled:true,mode:'optional'};
 await writeFile(f.settings,JSON.stringify({mcp_servers:{docs:entry}}));
 const options={environment:{USERPROFILE:f.profile},workspaceRoot,extensionReview:f.review};
 await assert.rejects(checkConfiguration(options),/review/i);
 await f.review.approveMcp('docs',entry);await checkConfiguration(options);
 await writeFile(f.settings,JSON.stringify({mcp_servers:{docs:{...entry,command:'other'}}}));await assert.rejects(checkConfiguration(options),/review/i);
 await writeFile(f.settings,JSON.stringify({mcp_servers:{docs:entry},managed_skills_path:'unreviewed'}));await assert.rejects(checkConfiguration(options),/MCP|plugin|managed/i);
 await writeFile(f.settings,'{}');await writeFile(path.join(f.profile,'.config','muse','trust.json'),'{}');await assert.rejects(checkConfiguration(options),/trust/i);
});
test('stale MCP confirmation cannot approve replacement executable or delete a changed server',async()=>{
 const f=await fixture();const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async()=>({stdout:'{"skills":[],"plugins":[]}'})});
 const entry={transport:'stdio',command:'node',args:['reviewed.mjs'],enabled:true,mode:'optional'};
 await writeFile(f.settings,JSON.stringify({mcp_servers:{tool:entry}}));
 const state=await service.snapshot(),revision=state.servers[0].revision;
 const replaced={...entry,args:['unreviewed.mjs']};await writeFile(f.settings,JSON.stringify({mcp_servers:{tool:replaced}}));
 for(const action of ['review','enable','disable','remove','login'])await assert.rejects(service.dispatch({type:'serverAction',name:'tool',action,revision,reviewed:true}),/changed after review/);
 assert.equal(await f.review.allowMcp('tool',replaced),false);assert.equal(JSON.parse(await readFile(f.settings,'utf8')).mcp_servers.tool.args[0],'unreviewed.mjs');
});
test('stale plugin review and concurrent package replacement do not approve new bytes',async()=>{
 const f=await fixture(),data=path.join(f.profile,'.local','share','muse'),cache=path.join(data,'plugins','cache','local','sample','hash','package');
 await mkdir(cache,{recursive:true});await writeFile(path.join(cache,'SKILL.md'),'original');
 await writeFile(f.review.inventory,JSON.stringify({version:1,plugins:{sample:{cache_path:path.relative(data,cache),enabled:true}}}));
 const revision=(await f.review.pluginState()).revision;await writeFile(path.join(cache,'SKILL.md'),'replacement');
 await assert.rejects(f.review.approvePlugins(revision),/changed after review/);assert.equal(await f.review.pluginsReviewed(),false);
});
test('failed CLI operations do not leak process diagnostics or invent successful changes',async()=>{
 const f=await fixture();const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async()=>{throw Error('Authorization: Bearer private-output');}});
 await assert.rejects(service.dispatch({type:'createSkill',name:'test',description:'test',instructions:'test'}),error=>!error.message.includes('private-output')&&/Muse could not complete/.test(error.message));
 assert.equal(await policy.optionalText(f.settings),null);
});
test('settings edits arriving while the temporary file is written survive the save attempt',async()=>{
 const f=await fixture();await writeFile(f.settings,'{"theme":"original"}');
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async()=>({stdout:'{"skills":[],"plugins":[]}'})});
 let injected=false;const watcher=watch(path.dirname(f.settings),(_event,name)=>{if(!injected&&String(name).endsWith('.tmp')){injected=true;writeFileSync(f.settings,'{"theme":"external edit"}');}});
 try{await assert.rejects(service.dispatch({type:'saveServer',server:{name:'docs',transport:'streamable_http',url:'https://example.org/mcp'},reviewed:true}),/changed elsewhere/);assert.equal(injected,true);assert.equal(JSON.parse(await readFile(f.settings,'utf8')).theme,'external edit');}finally{watcher.close();}
});
test('failed plugin listing cannot offer a revision to approve an unseen inventory',async()=>{
 const f=await fixture(),data=path.join(f.profile,'.local','share','muse'),cache=path.join(data,'plugins','cache','local','sample','hash','package');await mkdir(cache,{recursive:true});await writeFile(path.join(cache,'SKILL.md'),'original');await writeFile(f.review.inventory,JSON.stringify({plugins:{sample:{cache_path:path.relative(data,cache),enabled:true}}}));
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async(_binary,args)=>{if(args[0]==='plugins')throw Error('Listing unavailable');return{stdout:'{"skills":[]}'};}});
 const state=await service.snapshot();assert.equal(state.pluginRevision,null);assert.deepEqual(state.plugins,[]);await assert.rejects(service.dispatch({type:'reviewPlugins',reviewed:true,revision:state.pluginRevision}),/Refresh/);assert.equal(await f.review.pluginsReviewed(),false);
});
test('closing Customize aborts outstanding CLI work and rejects new setup',async()=>{
 const f=await fixture();let entered;const started=new Promise(resolve=>{entered=resolve;});
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:(_binary,_args,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('Aborted')));entered();})});
 const operation=service.dispatch({type:'createSkill',name:'test',description:'test',instructions:'test'});const failed=assert.rejects(operation,/Muse could not complete/);await started;await service.close();await failed;await assert.rejects(service.dispatch({type:'refresh'}),/closed/);
});
test('skill review exposes bounded instructions and binds install to source fingerprint',async()=>{
 const f=await fixture(),folder=path.join(f.root,'skill');await mkdir(folder);await writeFile(path.join(folder,'SKILL.md'),'---\nname: fixture\ndescription: Example\n---\n\nInspect before editing.');
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,chooseFolder:async()=>folder,run:async()=>({stdout:'{"valid":true,"skills":[],"plugins":[]}'})});
 const {prepared}=await service.dispatch({type:'prepareSkill'});assert.match(prepared.instructions,/Inspect before editing/);assert.match(prepared.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(prepared.files,['SKILL.md']);await writeFile(path.join(folder,'SKILL.md'),'changed');await assert.rejects(service.dispatch({type:'install',token:prepared.token,reviewed:true}),/changed/);
});

test('background and unresolved task contexts block extension changes',()=>{
 assert.equal(customizeBlocked({tasks:[{runtimeStatus:'running'}]}),true);
 assert.equal(customizeBlocked({tasks:[{runtimeStatus:'unavailable',runtimeBusy:true}]}),true);
});
test('optional pack review and install retain source provenance across service restart',async()=>{
 const f=await fixture(),options={getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async()=>({stdout:'{"valid":true,"skills":[],"plugins":[]}'})};
 const service=api.createCustomize(options),{prepared}=await service.dispatch({type:'preparePackSkill',id:'musebench-runtime-check'});
 assert.match(prepared.instructions,/Get-Command npm.cmd/);assert.match(prepared.fingerprint,/^[a-f0-9]{64}$/);
 await service.dispatch({type:'install',token:prepared.token,reviewed:true});
 const state=await api.createCustomize(options).snapshot();assert.equal(state.skillImports.length,1);assert.equal(state.skillImports[0].fingerprint,prepared.fingerprint);
 await assert.rejects(service.dispatch({type:'preparePackSkill',id:'../../other'}),/Unknown/);
});
