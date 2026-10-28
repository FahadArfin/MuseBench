import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CURATED_EXTENSIONS} from '../src/shared/extension-catalog.mjs';
import {checkSkillContext} from './skill-context-checks.mjs';

// The real desktop renderer and preload talk to a deterministic main-process
// catalog fixture. A fresh profile, disabled DNS and blocked HTTP(S) prevent
// access to user sessions or real extension installation and provider services.
const root=path.resolve('.'),variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/catalog-desktop',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/catalog-desktop',`${variant}-`));
const dataDir=path.join(output,'data'),projectsDir=path.join(output,'projects');
await mkdir(dataDir);await mkdir(projectsDir);
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:projectsDir};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,fixture:'isolated main-process catalog; real renderer and preload',checks:[],errors:[],screenshots:[]};
const pass=message=>{report.checks.push(message);console.log(`PASS ${message}`);};
async function until(check,label){const deadline=Date.now()+30000;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,70));}throw Error(`Timed out: ${label}`);}
let app,page;
const screenshot=async name=>{const file=path.join(output,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);};
try{
 app=await electron.launch({cwd:root,args:[...(process.env.MUSEBENCH_EXECUTABLE?[]:['.']),'--host-resolver-rules=MAP * ~NOTFOUND'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env,timeout:30000});
 page=await until(()=>app.windows().find(candidate=>!candidate.isClosed()&&candidate.url().startsWith('file:')&&/\/dist\/index\.html(?:[?#]|$)/.test(candidate.url())),'local desktop renderer');
 page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.waitForFunction(()=>Boolean(window.musebench));
 await app.evaluate(({app,ipcMain,session},{dataDir,projectsDir,entries})=>{
  if(app.getPath('userData')!==dataDir)throw Error('Refusing to test against a non-isolated app profile');
  for(const target of [session.defaultSession,session.fromPartition('persist:musebench-personal-muse'),session.fromPartition('persist:musebench-personal-chat')])target.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  const state={available:true,errors:[],pluginsReviewed:true,pluginRevision:'fixture',skills:[],plugins:[],servers:['cloudflare','cloudflare-docs','postgresql'].map(name=>({name,revision:'fixture',transport:'streamable_http',address:`https://fixture.invalid/${name}`,enabled:true,reviewed:true,oauth:false})),hooks:{root:projectsDir,revision:'fixture',items:[]},hookPresets:{revision:'fixture',items:[]}};
  globalThis.__catalogFixture={state,commands:[]};
  ipcMain.removeHandler('musebench:customize');
  ipcMain.handle('musebench:customize',async(_event,command)=>{
   globalThis.__catalogFixture.commands.push(structuredClone(command));
   if(command.type==='refresh')return{state};
   if(command.type==='skillActivation'&&globalThis.__catalogFixture.skillContextActive){
    const skill=state.skills.find(s=>s.id===command.id);if(!skill)throw Error('Unknown inspector fixture');
    skill.activation=command.activation;skill.contextCost.startupTokens=command.activation==='on'?100:0;skill.contextCost.startupBytes=skill.contextCost.startupTokens*4;return{state};
   }
   if(command.type==='catalogSearch'){
    const matches=entries.filter(entry=>entry.kind===command.kind&&`${entry.title} ${entry.description} ${entry.publisher}`.toLowerCase().includes(command.query.toLowerCase()));
    const offset=Number(command.cursor??0),limit=6;
    return{catalog:{entries:matches.slice(offset,offset+limit),nextCursor:offset+limit<matches.length?String(offset+limit):null,stale:false,offline:false,fetchedAt:new Date().toISOString(),errors:[]}};
   }
   const item=entries.find(entry=>entry.id===command.id);
   if(command.type==='prepareCatalog'){
    if(!item?.package||item.compatibility==='setup-required')throw Error('Fixture refuses unsupported package');
    return{prepared:{token:`fixture:${item.id}`,kind:item.kind,title:item.title,folder:'Isolated fixture staging',fingerprint:'fixture hash',instructions:'Reviewed fixture instructions. No source downloaded.',files:['SKILL.md','LICENSE'],capabilities:[]}};
   }
   if(command.type==='install'){
    if(!command.reviewed)throw Error('Fixture requires explicit review');
    const install=entries.find(entry=>`fixture:${entry.id}`===command.token);if(!install?.package)throw Error('Unknown fixture package');
    state.skills.push({id:install.id,title:install.title,description:install.description,scope:'user',activation:'user-only'});
    return{state,message:'Fixture installation complete; no files or providers changed.'};
   }
   if(command.type==='catalogServer'){
    if(!command.reviewed||!item?.recipe||item.recipe.transport!=='http')throw Error('Fixture requires a reviewed HTTP recipe');
    if(state.servers.some(server=>server.name===item.recipe.name))throw Error('Fixture server already configured');
    state.servers.push({name:item.recipe.name,revision:'fixture',transport:'streamable_http',address:new URL(item.recipe.url).href,enabled:true,reviewed:true,oauth:!!item.recipe.oauth});
    return{state,message:'Fixture server saved; no connection attempted.'};
   }
   throw Error(`Fixture rejects unexpected mutation: ${command.type}`);
  });
 },{dataDir,projectsDir,entries:CURATED_EXTENSIONS});
 await page.getByRole('group',{name:'Choose workspace',exact:true}).waitFor();
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Customize',exact:true});
 const ready=async()=>{await dialog.locator('.catalog-card').first().waitFor();await page.waitForFunction(()=>!document.querySelector('.extension-catalog [role="status"]'));};
 const search=async title=>{await dialog.getByRole('textbox',{name:'Search catalog',exact:true}).fill(title);await dialog.getByRole('button',{name:'Search',exact:true}).click();await ready();};
 const open=async entry=>{await search(entry.title);await dialog.getByRole('button',{name:`View ${entry.title}`,exact:true}).first().click();};
 await ready();assert.equal(await dialog.locator('.extensions-sidebar [role="tab"]').count(),5);
 await checkSkillContext({page,dialog,pass,screenshot,desktopApp:app});await ready();
 await dialog.getByRole('button',{name:'See all Popular',exact:true}).click();await dialog.getByRole('button',{name:'Back to all categories',exact:true}).click();
 assert.equal(await dialog.getByText(/Catalog operations are simulated/).count(),0,'Desktop must use native action text');
 pass('Desktop renderer and preload show the same compact rail and curated drilldown with native action labels');
 for(const width of [1440,820]){
  await app.evaluate(({BrowserWindow},width)=>{const main=BrowserWindow.getAllWindows().find(window=>!window.getParentWindow());main.setContentSize(width,960);},width);
  await until(()=>page.evaluate(width=>Math.abs(innerWidth-width)<2,width),'desktop viewport resize');
  const overflow=await dialog.evaluate(element=>element.querySelector('.extensions-content').scrollWidth-element.querySelector('.extensions-content').clientWidth);assert(overflow<=1);
  const file=path.join(output,`skills-${width}.png`);await page.screenshot({path:file});report.screenshots.push(file);
 }
 pass('Native desktop layout fits 820 and 1440 pixels without content overflow');
 const postgresIcon=dialog.locator('.extensions-sidebar').getByRole('button',{name:'Manage postgresql',exact:true}).locator('.extension-brand-icon');
 const postgresSymbol=postgresIcon.locator('.extension-brand-symbol');await postgresSymbol.waitFor();
 const mask=await postgresSymbol.evaluate(element=>getComputedStyle(element).maskImage);assert.match(mask,/data:image\/svg\+xml/,'Large brand SVGs must remain inline in a file:// desktop');
 const visibleIcon=await postgresIcon.screenshot({path:path.join(output,'postgresql-icon.png')});
 await postgresSymbol.evaluate(element=>{element.style.visibility='hidden';});
 const hiddenIcon=await postgresIcon.screenshot();assert.notDeepEqual(visibleIcon,hiddenIcon,'PostgreSQL must paint visible pixels, not an empty mask');
 await postgresSymbol.evaluate(element=>{element.style.visibility='';});
 await dialog.locator('.extensions-sidebar').getByRole('button',{name:'Manage cloudflare',exact:true}).click();
 assert.deepEqual(await dialog.locator('.server-card h4').allTextContents(),['cloudflare'],'Installed shortcuts must match identity rather than a substring');
 await dialog.getByRole('textbox',{name:'Search extensions',exact:true}).fill('cloud');
 assert.deepEqual(await dialog.locator('.server-card h4').allTextContents(),['cloudflare','cloudflare-docs'],'Typing should return to ordinary broad search');
 pass('PostgreSQL paints real pixels from its inline SVG; installed shortcuts choose one identity while typed search can find related names');
 await dialog.getByRole('tab',{name:'Skills',exact:true}).click();await dialog.getByRole('button',{name:'Discover',exact:true}).click();await ready();
 const skill=CURATED_EXTENSIONS.find(entry=>entry.kind==='skills'&&entry.package&&entry.compatibility!=='setup-required');assert(skill);
 await open(skill);await dialog.getByRole('button',{name:'Download and review',exact:true}).click();
 const install=dialog.getByRole('button',{name:'Install skill',exact:true});await install.waitFor();assert.equal(await install.isDisabled(),true);
 await dialog.getByLabel('I trust these skill instructions.').check();await install.click();
 await dialog.locator('.extensions-sidebar').getByRole('button',{name:`Manage ${skill.title}`,exact:true}).click();
 assert.equal(await dialog.locator('.extension-card h4').textContent(),skill.title);
 pass('Desktop package review requires explicit consent before the IPC fixture records installation');
 await dialog.getByRole('tab',{name:'MCP servers',exact:true}).click();await dialog.getByRole('button',{name:'Discover',exact:true}).click();await ready();
 const server=CURATED_EXTENSIONS.find(entry=>entry.kind==='mcp'&&entry.recipe?.name==='stripe'&&entry.recipe.transport==='http'&&entry.compatibility==='recipe');assert(server);await open(server);
 const add=dialog.locator('.catalog-detail').getByRole('button',{name:'Add server',exact:true});assert.equal(await add.isDisabled(),true);
 await dialog.getByLabel('I approve this endpoint and its access. Tools may receive data outside the project sandbox.').check();await add.click();
 await dialog.getByRole('button',{name:'Manage server',exact:true}).waitFor();
 await app.evaluate((_electron,name)=>{globalThis.__catalogFixture.state.servers.find(server=>server.name===name).address='https://fixture.invalid/different-endpoint';},server.recipe.name);
 await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
 await until(async()=>await dialog.getByRole('button',{name:'Manage server',exact:true}).count()===0,'wrong endpoint no longer appears configured');
 assert.equal(await dialog.locator('.catalog-detail').getByRole('button',{name:'Add server',exact:true}).count(),1);
 await app.evaluate((_electron,{name,url})=>{globalThis.__catalogFixture.state.servers.find(server=>server.name===name).address=new URL(url).href;},{name:server.recipe.name,url:server.recipe.url});
 await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).click();
 await dialog.getByRole('button',{name:'Manage server',exact:true}).click();
 assert.equal(await dialog.getByRole('textbox',{name:'Search extensions',exact:true}).inputValue(),server.recipe.name);
 assert.equal(await dialog.locator('.server-card h4').textContent(),server.recipe.name);
 pass('Desktop server setup requires review; normalized Stripe URLs match, different endpoints do not, and Manage opens the exact server');
 const fixture=await app.evaluate(()=>globalThis.__catalogFixture);report.commands=fixture.commands;
 assert.equal(fixture.commands.filter(command=>command.type==='install').length,1);
 assert.equal(fixture.commands.filter(command=>command.type==='catalogServer').length,1);
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await app?.close().catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);}
