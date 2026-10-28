import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {watch,writeFileSync} from 'node:fs';
const api=await import('../electron/customize.mjs').catch(()=>({}));
const policy=await import('../src/runtime/extension-review.mjs').catch(()=>({}));
import {customizeBlocked} from '../src/shared/customize-policy.mjs';
import {CURATED_EXTENSIONS} from '../src/shared/extension-catalog.mjs';
import {APPROVED_LOCAL_CATALOG_RECIPES} from '../electron/catalog-local-server.mjs';
test('Customize exposes its finite setup service',()=>assert.equal(typeof api.createCustomize,'function'));
test('catalog discovery is read-only during active tasks and does not spawn Muse',async()=>{
 const f=await fixture();let calls=0;
 const catalog={search:async query=>({entries:[],query}),resolve:async()=>null};
 const service=api.createCustomize({getState:()=>({runtime:{status:'running'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,catalog,run:async()=>{calls++;throw Error('not expected');}});
 const result=await service.dispatch({type:'catalogSearch',kind:'skills',source:'recommended',query:'design'});
 assert.deepEqual(result.catalog.entries,[]);assert.equal(result.catalog.query.query,'design');assert.equal(calls,0);await service.close();
});
test('catalog installation resolves trusted IDs and keeps exact staged bytes under review',async()=>{
 const f=await fixture(),folder=path.join(f.root,'download');await mkdir(folder);await writeFile(path.join(folder,'SKILL.md'),'---\nname: demo\ndescription: Demo\n---\nReview me');
 const descriptor={repo:'openai/skills',ref:'main',path:'skills/.curated/demo',kind:'skill'},calls=[];
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,
 catalog:{resolve:async id=>id==='known'?{id,title:'Demo',package:descriptor}:null},stagePackage:async(value)=>{assert.deepEqual(value,descriptor);return{folder,source:{commit:'a'.repeat(40),repo:value.repo,path:value.path},files:[],licenses:[]};},
 run:async(_binary,args)=>{calls.push(args);return{stdout:JSON.stringify({valid:true,skills:[],plugins:[]})};}});
 await assert.rejects(service.dispatch({type:'prepareCatalog',id:'forged',folder}),/catalog|unknown/i);
 const result=await service.dispatch({type:'prepareCatalog',id:'known',package:{repo:'evil/repo'}});
 assert.equal(result.prepared.source.commit,'a'.repeat(40));assert.equal(result.prepared.kind,'skills');assert.ok(result.prepared.fingerprint);
 assert.equal(calls.filter(args=>args[1]==='install').length,0);
 await writeFile(path.join(folder,'SKILL.md'),'changed');await assert.rejects(service.dispatch({type:'install',token:result.prepared.token,reviewed:true}),/changed after review/);
 await service.close();
});
test('catalog server recipes require review and ignore renderer-supplied endpoints',async()=>{
 const f=await fixture();const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,
 catalog:{resolve:async id=>id==='docs'?{recipe:{name:'docs',transport:'http',url:'https://developers.openai.com/mcp'}}:null},run:async()=>({stdout:'{"skills":[],"plugins":[]}'})});
 await assert.rejects(service.dispatch({type:'catalogServer',id:'docs'}),/review/i);
 await assert.rejects(service.dispatch({type:'catalogServer',id:'forged',reviewed:true}),/catalog|recipe/i);
 await service.dispatch({type:'catalogServer',id:'docs',reviewed:true,url:'https://evil.example/mcp'});
 const config=JSON.parse(await readFile(f.settings,'utf8'));assert.equal(config.mcp_servers.docs.url,'https://developers.openai.com/mcp');assert.equal(await f.review.allowMcp('docs',config.mcp_servers.docs),true);await service.close();
});
test('known public MCP endpoints do not advertise or start OAuth, while manual servers keep sign-in available',async()=>{
 const f=await fixture(),calls=[];
 const entries={
  renamedDocs:{transport:'streamable_http',url:'https://DEVELOPERS.OPENAI.COM:443/mcp',enabled:true},
  docs:{transport:'streamable_http',url:'https://manual.example/mcp',enabled:true},
  otherDocsPath:{transport:'streamable_http',url:'https://developers.openai.com/private-mcp',enabled:true},
  local:{transport:'stdio',command:'node',args:['server.mjs'],enabled:true},
 };
 await writeFile(f.settings,JSON.stringify({mcp_servers:entries}));
 await f.review.approveMcp('renamedDocs',entries.renamedDocs);
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async(_binary,args)=>{calls.push(args);return{stdout:'{"skills":[],"plugins":[]}'};}});
 const state=await service.snapshot(),byName=Object.fromEntries(state.servers.map(server=>[server.name,server]));
 assert.equal(byName.renamedDocs.oauth,false);assert.equal(byName.docs.oauth,true);assert.equal(byName.otherDocsPath.oauth,true);assert.equal(byName.local.oauth,false);
 await assert.rejects(service.dispatch({type:'serverAction',name:'renamedDocs',action:'login',revision:byName.renamedDocs.revision}),/does not require|no sign-in/i);
 assert.equal(calls.some(args=>args[0]==='mcp'),false);
 await service.close();
});
for(const [id,name,url,oauth] of [
 ['mcp:cloudflare-docs','cloudflare-docs','https://docs.mcp.cloudflare.com/mcp',false],
 ['mcp:microsoft-learn','microsoft-learn','https://learn.microsoft.com/api/mcp',false],
 ['mcp:todoist','todoist','https://ai.todoist.net/mcp',true],
])test(`bundled ${name} recipe saves only the reviewed endpoint and delegates eligible sign-in to Muse`,async()=>{
 const f=await fixture(),calls=[];
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,run:async(binary,args,options)=>{calls.push({binary,args,options});return{stdout:args[0]==='mcp'?'':'{"skills":[],"plugins":[]}'};}});
 try{
  await assert.rejects(service.dispatch({type:'catalogServer',id}),/review/i);
  assert.equal(await policy.optionalText(f.settings),null);assert.equal(calls.length,0);
  const result=await service.dispatch({type:'catalogServer',id,reviewed:true,url:'https://unreviewed.example/mcp',name:'unreviewed'});
  const config=JSON.parse(await readFile(f.settings,'utf8')),server=config.mcp_servers[name];
  assert.deepEqual(Object.keys(config.mcp_servers),[name]);assert.deepEqual(server,{transport:'streamable_http',enabled:true,mode:'optional',url});
  assert.equal(await f.review.allowMcp(name,server),true);
  const state=result.state.servers.find(item=>item.name===name);assert.equal(state.oauth,oauth);assert.equal(Object.hasOwn(state,'connected'),false);
  assert.equal(calls.some(call=>call.args[0]==='mcp'),false);
  const signIn={type:'serverAction',name,action:'login',revision:state.revision};
  if(oauth){
   const signedIn=await service.dispatch(signIn),login=calls.find(call=>call.args[0]==='mcp');
   assert.deepEqual(login.args,['mcp','login',name]);assert.equal(login.binary,'C:/muse.exe');assert.equal(login.options.shell,false);assert.equal(login.options.timeout,180000);
   assert.match(signedIn.message,/OAuth sign-in/);assert.equal(Object.hasOwn(signedIn.state.servers[0],'connected'),false);
  }else await assert.rejects(service.dispatch(signIn),/does not require|no sign-in/i);
 }finally{await service.close();}
});
test('catalog refuses setup-only packages even if renderer submits their ID',async()=>{
 const f=await fixture();let staged=false;const service=api.createCustomize({getState:()=>({}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,catalog:{resolve:async()=>({compatibility:'setup-required',package:{}})},stagePackage:async()=>{staged=true;}});
 await assert.rejects(service.dispatch({type:'prepareCatalog',id:'not-supported'}),/setup|catalog/i);assert.equal(staged,false);await service.close();
});
test('local catalog recipe is pinned and configures Node without executing npm',async()=>{
 const f=await fixture(),nodeRoot=path.join(f.root,'node'),npmRoot=path.join(nodeRoot,'node_modules','npm');await mkdir(path.join(npmRoot,'bin'),{recursive:true});
 await writeFile(path.join(nodeRoot,'node.exe'),'not executable');await writeFile(path.join(npmRoot,'bin','npx-cli.js'),'throw Error("do not run")');await writeFile(path.join(npmRoot,'package.json'),JSON.stringify({name:'npm',bin:{npx:'bin/npx-cli.js'}}));
 const recipe=CURATED_EXTENSIONS.find(item=>item.id==='mcp:playwright').recipe;assert.deepEqual(recipe,APPROVED_LOCAL_CATALOG_RECIPES.playwright);
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile,PATH:nodeRoot},dataDir:f.dataDir,run:async(binary,args)=>{assert.equal(binary,'C:/muse.exe');assert.equal(args[1],'list');return{stdout:'{"skills":[],"plugins":[]}'};}});
 await service.dispatch({type:'catalogServer',id:'mcp:playwright',reviewed:true});const settings=JSON.parse(await readFile(f.settings,'utf8'));assert.equal(settings.mcp_servers.playwright.command,path.join(nodeRoot,'node.exe'));assert.ok(settings.mcp_servers.playwright.args.includes('--ignore-scripts'));await service.close();
});
test('catalog validation failures clean downloaded packages and preserve diagnostics',async()=>{
 const f=await fixture(),folder=path.join(f.dataDir,'catalog-staging','12345678-1234-4123-8123-123456789abc');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'SKILL.md'),'invalid');
 const service=api.createCustomize({getState:()=>({runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,catalog:{resolve:async()=>({package:{kind:'skill'}})},stagePackage:async()=>({folder}),run:async()=>{throw Object.assign(Error('CLI rejected'),{stdout:JSON.stringify({valid:false,diagnostics:[{message:'unsupported field tools'}]})});}});
 await assert.rejects(service.dispatch({type:'prepareCatalog',id:'bad'}),/unsupported field tools/);await assert.rejects(readFile(path.join(folder,'SKILL.md')),error=>error.code==='ENOENT');await service.close();
});
test('hook setup requires explicit review, current project revision and no active task',async()=>{
 const f=await fixture();let active=false;const service=api.createCustomize({getState:()=>({activeProject:{root:f.root},runtime:{binary:'C:/muse.exe'}}),environment:{USERPROFILE:f.profile},dataDir:f.dataDir,review:f.review,isActive:()=>active,run:async()=>({stdout:'{"skills":[],"plugins":[]}'})});
 const before=(await service.snapshot()).hooks,command={type:'saveHooks',root:before.root,revision:before.revision,hooks:[{id:'check',event:'Stop',command:'echo checked',timeout:2,enabled:true}]};
 await assert.rejects(service.dispatch(command),/review/i);await assert.rejects(service.dispatch({...command,reviewed:true,root:'another'}),/project changed/);
 active=true;await assert.rejects(service.dispatch({...command,reviewed:true}),/running task/);active=false;
 const result=await service.dispatch({...command,reviewed:true});assert.deepEqual(result.state.hooks.items,command.hooks);await assert.rejects(service.dispatch({...command,reviewed:true}),/changed/);await service.close();
});
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
