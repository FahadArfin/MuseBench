import {fileURLToPath} from 'node:url';
import {createHookPresetStore} from './hook-presets.mjs';
import {MUSEBENCH_SKILL_PACK} from '../src/shared/skill-pack.mjs';
import {CURATED_EXTENSIONS} from '../src/shared/extension-catalog.mjs';
import {normalizeSkillCatalog} from '../src/shared/skill-context.mjs';
import {inspectProjectInstructions,matchesProjectInstructionReview} from '../src/runtime/project-instructions.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,realpath,lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {userProfile,isNativeExecutable} from '../src/shared/platform.mjs';
import {curateEnvironment,discoverMuseBinaries} from '../src/runtime/index.mjs';
import {customizeBlocked} from '../src/shared/customize-policy.mjs';
import {atomicJson,optionalText,treeDigest,createExtensionReview,configurationDigest} from '../src/runtime/extension-review.mjs';

const clean=(value,max=500)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
const idOK=value=>typeof value==='string'&&/^[a-zA-Z0-9][\w:./-]{0,199}$/.test(value)&&!value.includes('..');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const scope=value=>value==='bundled'?'built-in':value;
const unchangedOthers=(before,after,id)=>configurationDigest(Object.fromEntries(Object.entries(before.entries).filter(([key])=>key!==id)))===configurationDigest(Object.fromEntries(Object.entries(after.entries).filter(([key])=>key!==id)));
// Bundled endpoint metadata controls sign-in availability, never connection status.
// Match the complete URL so an unrelated server cannot inherit another service's policy.
const publicEndpoints=new Set(CURATED_EXTENSIONS.filter(item=>item.recipe?.transport==='http'&&item.recipe.oauth===false).map(item=>new URL(item.recipe.url).href));
function supportsOAuth(entry){
 if(entry.transport!=='streamable_http')return false;
 try{return !publicEndpoints.has(new URL(entry.url).href);}catch{return true;}
}
export function validateServer(value){
 if(!object(value)||Object.keys(value).some(key=>!['name','transport','url','command','args'].includes(key)))throw Error('Invalid MCP configuration. Use official OAuth for sign-in.');
 const {name,transport}=value;
 if(typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)||['constructor','prototype','__proto__'].includes(name))throw Error('Use a server name with letters, numbers, underscores or hyphens.');
 const config={transport,enabled:true,mode:'optional'};
 if(transport==='streamable_http'){
  let url;try{url=new URL(value.url);}catch{throw Error('Enter a valid HTTPS MCP URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||value.url.length>2000)throw Error('Use an HTTPS URL without credentials, a query or a fragment. Sign in with OAuth after adding it.');
  config.url=url.href;
 }else if(transport==='stdio'){
  if(typeof value.command!=='string'||!value.command.trim()||value.command.startsWith('-')||/[\r\n\0]/.test(value.command)||value.command.length>4096)throw Error('Enter a program name or absolute executable path.');
  if(!Array.isArray(value.args)||value.args.length>80||value.args.some(arg=>typeof arg!=='string'||arg.length>4096||/[\r\n\0]/.test(arg)))throw Error('Arguments must be a JSON array of strings.');
  config.command=value.command.trim();config.args=value.args;
 }else throw Error('Choose HTTPS or local stdio transport.');
 return{name,config};
}
export function createCustomize({getState,environment=process.env,dataDir,review,catalog,stagePackage,run=promisify(execFile),chooseFolder=async()=>null,isActive=()=>false,platform=process.platform}){
 const env=curateEnvironment(environment),profile=userProfile(env,platform);
 review??=createExtensionReview({dataDir,profile});
 const hookPresets=createHookPresetStore(dataDir);
 const settingsPath=path.join(profile,'.config','muse','settings.json');
 const importsFile=path.join(dataDir,'skill-imports.json');
 const imports=async()=>{try{const value=JSON.parse(await optionalText(importsFile)??'[]');return Array.isArray(value)?value.slice(-100):[];}catch{return[];}};
 const pending=new Map(),processes=new Map();let busy=false,closed=false,lastSkillCatalog;
 async function catalogService(){return catalog??= (await import('./extension-catalog.mjs')).createExtensionCatalog({dataDir});}
 async function removeStage(folder){await(await import('./extension-staging.mjs')).removeCatalogStage(folder,{dataDir});}
 async function clearPending(){const items=[...pending.values()];pending.clear();await Promise.all(items.filter(item=>item.catalog).map(item=>removeStage(item.folder)));}
 function binary(){const value=getState().runtime?.binary??discoverMuseBinaries({environment:env,platform})[0];if(!isNativeExecutable(value,platform))throw Error('Install or select the official Muse CLI in Connection settings.');return value;}
 async function cli(args,{oauth=false,validation=false,executable}={}){
  if(closed)throw Error('Customize is closed.');
  const abort=new AbortController();let operation;
  try{operation=Promise.resolve(run(executable??binary(),args,{shell:false,windowsHide:true,env,signal:abort.signal,encoding:'utf8',timeout:oauth?180000:30000,maxBuffer:4*1024*1024,cwd:profile}));processes.set(abort,operation);const result=await operation;return oauth?{}:JSON.parse(result.stdout);}
  catch(error){if(error.message?.startsWith('Install or select'))throw error;if(validation&&typeof error.stdout==='string'&&error.stdout.length<4*1024*1024){try{const result=JSON.parse(error.stdout);if(result.valid===false||Array.isArray(result.diagnostics))return{...result,valid:false};}catch{}}
   throw Error(oauth?'Sign-in did not finish. Retry in Customize or use muse mcp login in the official CLI.':'Muse could not complete this operation. Check the folder or configuration and try again.');}
  finally{processes.delete(abort);}
 }
 async function settings(){const source=await optionalText(settingsPath);let config;try{config=source===null?{}:JSON.parse(source);}catch{throw Error('Muse settings are invalid. Correct settings.json before changing extensions.');}if(!object(config)||config.mcpServers||config.mcp_servers&&!object(config.mcp_servers))throw Error('Muse settings use an unsupported MCP configuration. Review settings.json in the official CLI.');return{source,config};}
 async function writeSettings(original,config){
  if(await optionalText(settingsPath)!==original)throw Error('Muse settings changed elsewhere. Refresh and try again.');
  // Follow an existing symlink, like Muse itself, without replacing the link.
  let target=settingsPath;try{if((await lstat(target)).isSymbolicLink())target=await realpath(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(original!==null)await writeFile(settingsPath+'.musebench-backup',original,{mode:0o600});
  if(await optionalText(settingsPath)!==original)throw Error('Muse settings changed elsewhere. Refresh and try again.');
  await atomicJson(target,config,async()=>{if(await optionalText(settingsPath)!==original)throw Error('Muse settings changed elsewhere. Refresh and try again.');if(original!==null&&await realpath(settingsPath)!==await realpath(target))throw Error('Muse settings path changed elsewhere. Refresh and try again.');});
 }
 function plugins(value){return(value.plugins??[]).filter(item=>idOK(item.record?.id)).slice(0,250).map(item=>({id:item.record.id,title:clean(item.record.display_name||item.record.id,200),description:clean(item.record.description,800),version:clean(item.record.version,60),enabled:item.record.enabled===true,valid:item.valid===true,capabilities:capabilities(item.plugin?.capabilities),reviewRequired:!item.active}));}
 function capabilities(value){return Object.entries(value??{}).filter(([,items])=>Array.isArray(items)&&items.length).map(([kind,items])=>({kind:clean(kind,60),count:items.length}));}
 async function skillList({retainOnFailure=false}={}){
  const args=['skills','list','--json'],executable=binary(),workspace=getState().activeProject?.root??null;
  const trusted=workspace?await review.allowProject(workspace):false,key=JSON.stringify([executable,workspace,trusted]);
  if(lastSkillCatalog?.key!==key)lastSkillCatalog=undefined;
  if(workspace){args.push('--workspace',workspace);if(trusted)args.push('--trust-workspace');}
  try{
   const result=normalizeSkillCatalog(await cli(args,{executable}));result.skillCatalog.checkedAt=new Date().toISOString();
   lastSkillCatalog={key,result:structuredClone(result)};return result;
  }catch(error){
   // Only snapshots may display old observations. Activation always requires a fresh list.
   if(retainOnFailure&&lastSkillCatalog?.key===key){const result=structuredClone(lastSkillCatalog.result);result.skillCatalog.stale=true;return result;}
   throw error;
  }
 }
 async function snapshot(){
  const errors=[];let skillRows=[],skillCatalog,pluginRows=[],servers=[],available=true,pluginsReviewed=false,pluginRevision=null,inventoryDisplayed=false;
  let beforePlugins;try{beforePlugins=await review.pluginState();}catch{/* Invalid inventories stay unreviewed. */}
  try{binary();}catch(error){available=false;errors.push(error.message);}
  if(available){
   const values=await Promise.allSettled([skillList({retainOnFailure:true}),cli(['plugins','list','--json'])]);
   if(values[0].status==='fulfilled'){skillRows=values[0].value.skills;skillCatalog=values[0].value.skillCatalog;}
   if(values[0].status==='rejected'||skillCatalog?.stale)errors.push('Skills could not be refreshed.');
   if(values[1].status==='fulfilled'&&Array.isArray(values[1].value.plugins)){
    pluginRows=plugins(values[1].value);
    inventoryDisplayed=values[1].value.plugins.every(item=>item.valid===true)&&pluginRows.length===values[1].value.plugins.length&&configurationDigest(pluginRows.map(item=>item.id).sort())===configurationDigest(Object.keys(beforePlugins?.entries??{}).sort());
    if(!inventoryDisplayed)errors.push('Some plugins could not be validated. Resolve them in the official CLI before reviewing.');
   }else errors.push('Plugins could not be refreshed.');
  }
  try{const {config}=await settings();servers=await Promise.all(Object.entries(config.mcp_servers??{}).slice(0,250).map(async([name,entry])=>({name:clean(name,100),revision:configurationDigest(entry),transport:entry.transport==='stdio'?'stdio':'streamable_http',address:entry.transport==='stdio'?clean(entry.command,200):safeAddress(entry.url),enabled:entry.enabled!==false,reviewed:await review.allowMcp(name,entry),oauth:supportsOAuth(entry)})));pluginsReviewed=await review.pluginsReviewed();const afterPlugins=await review.pluginState();if(beforePlugins?.revision===afterPlugins.revision){if(inventoryDisplayed)pluginRevision=afterPlugins.revision;}else errors.push('Plugins changed while loading. Refresh before reviewing them.');}catch{errors.push('Muse configuration could not be read. Correct settings.json in the official CLI before editing.');}
  let hooks=null;try{const root=getState().activeProject?.root;if(root)hooks=await review.hookState(root);}catch{errors.push('Project hooks could not be read.');}
  let presetState=null;try{presetState=await hookPresets.snapshot();}catch(error){errors.push(error.message);}
  return{hooks,hookPresets:presetState,skillImports:await imports(),available,skills:skillRows,skillCatalog,plugins:pluginRows,servers,pluginsReviewed,pluginRevision,errors};
 }
 function safeAddress(value){try{const u=new URL(value);return u.origin+u.pathname;}catch{return'Configured server';}}
 function requireReview(command){if(command.reviewed!==true)throw Error('Review extension access before continuing.');}
 async function prepare(kind,knownFolder){
  const folder=knownFolder??await chooseFolder(kind);if(!folder)return null;
  const hash=await treeDigest(folder),result=await cli([kind,'validate',folder,'--json'],{validation:true});
  if(result.valid===false){const details=(Array.isArray(result.diagnostics)?result.diagnostics:[]).slice(0,8).map(item=>clean(item.message||item.code,350)).filter(Boolean).join('; ');throw Error('Muse rejected this package. '+(details||'Fix its manifest or SKILL.md first.'));}
  const token=randomUUID();
  let instructions,files;
  if(kind==='skills'){instructions=await optionalText(path.join(folder,'SKILL.md'));if(instructions===null||instructions.length>30000)throw Error('Skill instructions must fit within 30,000 characters for review.');files=[];const walk=async(dir,rel='')=>{for(const entry of await readdir(dir,{withFileTypes:true})){const name=rel?rel+'/'+entry.name:entry.name;if(files.length>=200)throw Error('Skill review supports up to 200 files.');if(entry.isDirectory())await walk(path.join(dir,entry.name),name);else files.push(name);}};await walk(folder);}
  await clearPending();pending.set(token,{kind,folder,hash,id:result.plugin?.id,created:Date.now()});
  return{fingerprint:hash,instructions,files,token,kind,title:clean(result.plugin?.display_name||result.plugin?.id||result.id||path.basename(folder),200),folder,capabilities:capabilities(result.plugin?.capabilities??result.capabilities)};
 }
 async function dispatch(command){
  if(closed)throw Error('Customize is closed.');
  const supported=['catalogSearch','prepareCatalog','catalogServer','saveHookPreset','deleteHookPreset','saveHooks','refresh','inspectProject','reviewProject','approveProject','revokeProject','preparePackSkill','prepareSkill','preparePlugin','install','skillActivation','createSkill','pluginAction','reviewPlugins','saveServer','serverAction'];
  if(!object(command)||!supported.includes(command.type)||JSON.stringify(command).length>40000)throw Error('Unsupported Customize action.');
  if(command.type==='refresh')return{state:await snapshot()};
  if(command.type==='inspectProject'){
   const root=getState().activeProject?.root;if(!root)throw Error('Choose a project first.');
   const projectInstructions=await inspectProjectInstructions(root);
   try{
    const state=await review.projectState(root);
    projectInstructions.trust=matchesProjectInstructionReview(projectInstructions,state)?{status:state.reviewed?'reviewed':'required'}:{status:'unavailable',reason:'Project rules changed during inspection or could not be fully compared. Refresh before reviewing.'};
   }
   catch(error){projectInstructions.trust={status:'unavailable',reason:clean(error.message,350)};}
   if(closed||getState().activeProject?.root!==root)throw Error('The selected project changed. Inspect it again.');
   return{projectInstructions};
  }
  if(command.type==='catalogSearch'){const {kind,query,source,cursor,refresh}=command;return{catalog:await(await catalogService()).search({kind,query,source,cursor,refresh})};}
  if(busy)throw Error('Wait for the current setup operation to finish.');
  if(customizeBlocked(getState())||isActive())throw Error('Let the running task finish and confirm it has stopped before changing extensions.');
  busy=true;
  try{
   if(command.type==='prepareCatalog'){
    const entry=await(await catalogService()).resolve(command.id);if(!entry?.package||entry.compatibility==='setup-required')throw Error('Unknown or setup-required catalog package. Search again and follow its setup instructions.');
    const stage=stagePackage??(await import('./extension-staging.mjs')).stageCatalogPackage;
    const downloaded=await stage(entry.package,{dataDir,protectedFolders:[...pending.values()].map(item=>item.folder)});
    try{if(closed)throw Error('Customize is closed.');
     const prepared=await prepare(entry.package.kind==='skill'?'skills':'plugins',downloaded.folder);
     pending.get(prepared.token).catalog={id:entry.id,source:downloaded.source};
     return{prepared:{...prepared,source:downloaded.source,licenses:downloaded.licenses,downloadedFiles:downloaded.files},message:'Downloaded and validated. Review the pinned package before installing.'};
    }catch(error){await removeStage(downloaded.folder);throw error;}
   }
   if(command.type==='catalogServer'){
    requireReview(command);const entry=await(await catalogService()).resolve(command.id);
    if(!entry?.recipe||entry.compatibility==='setup-required')throw Error('This catalog entry needs manual setup; no supported connection recipe is available.');
    const setup=entry.recipe.transport==='npm'?await(await import('./catalog-local-server.mjs')).resolveLocalCatalogServer(entry.recipe,{environment}):{name:entry.recipe.name,transport:'streamable_http',url:entry.recipe.url};
    const {name,config:server}=validateServer(setup);
    const {source,config}=await settings();if(Object.hasOwn(config.mcp_servers??{},name))throw Error('This server is already configured. Manage it in Installed.');
    if(Object.keys(config.mcp_servers??{}).length>=250)throw Error('Remove an unused server first.');
    config.mcp_servers={...config.mcp_servers,[name]:server};await writeSettings(source,config);await review.approveMcp(name,server);
    return{state:await snapshot(),message:entry.recipe.oauth?'Server added. Open Installed → MCP servers and choose Sign in to connect your account.':'Server added. Available to the next Muse run.'};
   }
   if(command.type==='saveHookPreset'||command.type==='deleteHookPreset'){if(command.type==='saveHookPreset')await hookPresets.save(command);else await hookPresets.remove(command);return{state:await snapshot(),message:command.type==='saveHookPreset'?'Hook preset saved. Load it into a project draft, then review and save that project.':'Hook preset deleted. Existing project hooks are unchanged.'};}
   if(command.type==='saveHooks'){requireReview(command);const root=getState().activeProject?.root;if(!root||command.root!==root)throw Error('The selected project changed. Reopen Customize.');await review.saveHooks(root,command.revision,command.hooks);return{state:await snapshot(),message:'Project hooks saved. Applies to future Code runs.'};}
   if(['reviewProject','approveProject','revokeProject'].includes(command.type)){const root=getState().activeProject?.root;if(!root)throw Error('Choose a project first.');if(command.type==='approveProject'){requireReview(command);if(command.root!==root)throw Error('The selected project changed.');await review.approveProject(root,command.fingerprint);}if(command.type==='revokeProject'){if(command.root!==root)throw Error('The selected project changed.');await review.revokeProject(root);}return{projectReview:await review.projectState(root),state:await snapshot()};}
   if(command.type==='preparePackSkill'){if(!MUSEBENCH_SKILL_PACK.some(s=>s.id===command.id))throw Error('Unknown MuseBench skill.');const source=fileURLToPath(new URL('../templates/musebench-skills/'+command.id+'/SKILL.md',import.meta.url)),text=await optionalText(source);if(!text)throw Error('Bundled skill is missing.');const folder=path.join(dataDir,'skill-drafts',randomUUID(),command.id);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'SKILL.md'),text,'utf8');return{prepared:await prepare('skills',folder)};}
   if(command.type==='prepareSkill'||command.type==='preparePlugin')return{prepared:await prepare(command.type==='prepareSkill'?'skills':'plugins')};
   if(command.type==='install'){
    requireReview(command);const item=pending.get(command.token);if(!item||Date.now()-item.created>600000){if(item){pending.delete(command.token);if(item.catalog)await removeStage(item.folder);}throw Error('Folder review expired. Choose the folder again.');}
    if(await treeDigest(item.folder)!==item.hash)throw Error('The folder changed after review. Choose it again.');
    if(item.kind==='plugins'&&!await review.pluginsReviewed())throw Error('Review the existing plugin inventory before installing another plugin.');
    const before=item.kind==='plugins'?await review.pluginState():null;
    const installed=await cli([item.kind,'install',item.folder,'--scope','user','--json']);
    if(item.kind==='skills')await atomicJson(importsFile,[...await imports(),{title:path.basename(item.folder),folder:item.folder,fingerprint:item.hash,at:new Date().toISOString()}].slice(-100));
    if(item.kind==='plugins'){
     const after=await review.pluginState();
     if(!idOK(item.id)||installed.installed?.id!==item.id||after.packages[item.id]!==item.hash||!unchangedOthers(before,after,item.id))throw Error('Plugin files or another plugin changed during installation. The new inventory is not approved; refresh and review it.');
     await review.approvePlugins(after.revision);
    }
    if(item.catalog){const receiptFile=path.join(dataDir,'catalog-installations.json');let receipts=[];try{const parsed=JSON.parse(await optionalText(receiptFile)??'[]');if(Array.isArray(parsed))receipts=parsed;}catch{}await atomicJson(receiptFile,[...receipts,{...item.catalog,kind:item.kind,fingerprint:item.hash,at:new Date().toISOString()}].slice(-250));await removeStage(item.folder);}
    pending.delete(command.token);
   }else if(command.type==='skillActivation'){
    if(!idOK(command.id)||!['on','off','user-only'].includes(command.activation))throw Error('Invalid skill action.');
    const item=(await skillList()).skills.find(s=>s.id===command.id);if(!item||!['bundled','user','project','plugin'].includes(item.scope))throw Error('This skill is no longer available. Refresh the list.');
    const args=['skills',({'on':'enable','off':'disable','user-only':'user-only'})[command.activation],item.id,'--scope',scope(item.scope),'--json'];
    if(getState().activeProject?.root)args.push('--workspace',getState().activeProject.root);await cli(args);
   }else if(command.type==='createSkill'){
    if(typeof command.name!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(command.name)||typeof command.description!=='string'||!command.description.trim()||command.description.length>500||typeof command.instructions!=='string'||!command.instructions.trim()||command.instructions.length>20000)throw Error('Add a lowercase skill name, description and instructions.');
    const folder=path.join(dataDir,'skill-drafts',randomUUID());await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'SKILL.md'),`---\nname: ${command.name}\ndescription: ${JSON.stringify(command.description.trim())}\n---\n\n${command.instructions.trim()}\n`,'utf8');
    await cli(['skills','validate',folder,'--json']);await cli(['skills','install',folder,'--scope','user','--json']);
   }else if(command.type==='pluginAction'){
    if(!idOK(command.id)||!['enable','disable','remove'].includes(command.action))throw Error('Invalid plugin action.');requireReview(command);
    if(!await review.pluginsReviewed())throw Error('Review the current plugin inventory first.');
    const before=await review.pluginState();if(command.revision!==before.revision)throw Error('Plugins changed after review. Refresh and review them again.');
    const list=plugins(await cli(['plugins','list','--json']));if(!list.some(item=>item.id===command.id))throw Error('Plugin no longer installed.');
    await cli(['plugins',command.action,command.id,'--json']);const after=await review.pluginState();
    if(!unchangedOthers(before,after,command.id)||(command.action!=='remove'&&before.packages[command.id]!==after.packages[command.id]))throw Error('Plugin contents changed during setup. Refresh and review them again.');
    await review.approvePlugins(after.revision);
   }else if(command.type==='reviewPlugins'){
    requireReview(command);if(typeof command.revision!=='string')throw Error('Refresh the plugin review first.');const list=await cli(['plugins','list','--json']);if(!Array.isArray(list.plugins)||list.plugins.some(item=>!item.valid))throw Error('Fix invalid plugin bundles in the official CLI before reviewing them.');await review.approvePlugins(command.revision);
   }else if(command.type==='saveServer'){
    requireReview(command);const {name,config:entry}=validateServer(command.server);const {source,config}=await settings();
    if(Object.hasOwn(config.mcp_servers??{},name))throw Error('A server with this name already exists. Choose another name.');
    if(Object.keys(config.mcp_servers??{}).length>=250)throw Error('Remove an unused server first.');
    config.mcp_servers={...config.mcp_servers,[name]:entry};await writeSettings(source,config);await review.approveMcp(name,entry);
   }else if(command.type==='serverAction'){
    if(!idOK(command.name)||!['enable','disable','remove','login','logout','review'].includes(command.action))throw Error('Invalid server action.');
    const {source,config}=await settings(),entry=config.mcp_servers?.[command.name];if(!object(entry))throw Error('Server no longer configured.');
    if(command.revision!==configurationDigest(entry))throw Error('Server configuration changed after review. Refresh and review it again.');
    if(command.action==='login'||command.action==='logout'){
     if(entry.transport!=='streamable_http')throw Error('OAuth requires an HTTPS server.');
     if(command.action==='login'&&!supportsOAuth(entry))throw Error('This public MCP endpoint does not require sign-in.');
     if(!await review.allowMcp(command.name,entry))throw Error('Review this server before signing in.');
     await cli(['mcp',command.action,command.name],{oauth:true});
    }else{
     requireReview(command);
     if(command.action==='review')await review.approveMcp(command.name,entry);
     else{if(command.action==='remove')delete config.mcp_servers[command.name];else entry.enabled=command.action==='enable';await writeSettings(source,config);if(command.action!=='remove')await review.approveMcp(command.name,entry);}
    }
   }
   return{state:await snapshot(),message:command.type==='serverAction'&&command.action==='login'?'Muse completed the OAuth sign-in.':'Saved. Changes apply to the next Muse run.'};
  }finally{busy=false;}
 }
 return{snapshot,dispatch,isBusy:()=>busy,async close(){closed=true;for(const abort of processes.keys())abort.abort();await Promise.allSettled([...processes.values()]);await clearPending();}};
}
