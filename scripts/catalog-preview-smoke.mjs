import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CURATED_EXTENSIONS} from '../src/shared/extension-catalog.mjs';
import {checkSkillContext} from './skill-context-checks.mjs';
import {checkProjectInstructions} from './project-instructions-checks.mjs';

// All mutations use the preview's in-memory bridge in a new browser context.
// No provider requests, downloads, account configuration or hooks are executed.
await mkdir('artifacts/catalog-preview',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/catalog-preview','compact-'));
const report={variant:'preview',checks:[],errors:[],screenshots:[]};
const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-catalog-test',server:{host:'127.0.0.1',port:4325,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(15000);
page.on('pageerror',error=>report.errors.push(error.message));
const pass=message=>{report.checks.push(message);console.log(`PASS ${message}`);};
const screenshot=async name=>{const file=path.join(output,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);};
const commands=()=>page.evaluate(()=>window.__catalogCommands);
try{
 await page.goto('http://127.0.0.1:4325/preview.html');
 await page.waitForFunction(()=>Boolean(window.musebench));
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 await page.evaluate(()=>{
  window.__catalogCommands=[];const original=window.musebench.customize;
  window.musebench.customize=async command=>{
   window.__catalogCommands.push(structuredClone(command));const result=await original(command);
   const gate=window.__catalogGate;
   if(command.type==='catalogSearch'&&gate&&command.source===gate.source&&!command.cursor&&!gate.started){gate.started=true;await new Promise(resolve=>{gate.release=resolve;});gate.returned=true;}
   if(command.type==='catalogSearch'&&window.__catalogRepeatCursor&&command.source==='recommended'&&command.cursor&&result.catalog)result.catalog.nextCursor=command.cursor;
   if(command.type==='catalogSearch'&&window.__catalogCap&&command.source==='community'&&result.catalog){const sample=result.catalog.entries[0]??window.__catalogCapSample;window.__catalogCapSample=sample;const offset=Number(command.cursor??0),count=offset?2:999;result.catalog={...result.catalog,entries:Array.from({length:count},(_,index)=>({...sample,id:`cap-fixture-${offset+index}`,title:`Cap fixture ${offset+index}`})),nextCursor:window.__catalogCapTerminal&&offset?null:String(offset+count)};}
   return command.type==='prepareCatalog'?{...result,message:'Native-style preparation receipt ready.'}:result;
  };
 });
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Customize',exact:true});
 const rows=()=>dialog.locator('.catalog-card');
 const catalogReady=async()=>{await rows().first().waitFor();await dialog.getByRole('button',{name:'Search',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.extension-catalog [role="status"]'));};
 const discover=async label=>{await dialog.getByRole('tab',{name:label,exact:true}).click();await dialog.getByRole('button',{name:'Curated',exact:true}).click();await catalogReady();};
 const search=async query=>{await dialog.getByRole('textbox',{name:'Search catalog',exact:true}).fill(query);await dialog.getByRole('button',{name:'Search',exact:true}).click();await catalogReady();};
 const open=async entry=>{await search(entry.title);await dialog.getByRole('button',{name:`View ${entry.title}`,exact:true}).first().click();await dialog.locator('.catalog-detail').waitFor();};
 const back=()=>dialog.getByRole('button',{name:'Back to discovery',exact:true}).click();

 await catalogReady();
 await checkSkillContext({page,dialog,pass,screenshot});await catalogReady();
 await checkProjectInstructions({page,dialog,pass,screenshot});await catalogReady();
 assert.deepEqual(await dialog.locator('.extensions-sidebar [role="tab"]').allTextContents(),['Skills','Connectors','Plugins','MCP servers','Hooks']);
 assert.equal(await dialog.getByRole('tab',{name:'Skills',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await dialog.getByText(/Catalog operations are simulated/).count(),1);
 assert.equal(await dialog.getByRole('button',{name:'See all Popular',exact:true}).count(),1,'Curated discovery must have a Popular section');
 assert.equal(await dialog.getByRole('button',{name:'Load more',exact:true}).count(),0,'Curated groups must include the complete bounded catalog');
 const rowEvidence=await rows().evaluateAll(items=>items.map(item=>({height:item.getBoundingClientRect().height,icon:!!item.querySelector('.extension-brand-icon'),name:item.querySelector('.catalog-item-title')?.textContent,summary:item.querySelector('.catalog-item-summary')?.textContent})));
 assert(rowEvidence.length>6,'Curated discovery should show several useful categories');
 assert(rowEvidence.every(item=>item.icon&&item.name&&item.summary),'Every compact row needs a recognizable icon, name and short description');
 assert(rowEvidence.every(item=>item.height<=100),'Discovery rows should be compact');
 report.initialRows=rowEvidence;
 await dialog.getByRole('button',{name:'See all Popular',exact:true}).click();
 await dialog.getByRole('button',{name:'Back to all categories',exact:true}).waitFor();
 assert(await rows().count()>0);await screenshot('popular-section');
 await dialog.getByRole('button',{name:'Back to all categories',exact:true}).click();
 await dialog.getByRole('button',{name:'See all Popular',exact:true}).waitFor();
 pass('Five-category rail defaults to Skills; curated discovery has compact icons and descriptions, with working Popular drilldown and back');

 for(const width of [1440,820,375]){
  await page.setViewportSize({width,height:960});
  for(const label of ['Skills','Connectors','Plugins','MCP servers','Hooks']){
   await discover(label);
   const bounds=await dialog.evaluate(element=>({left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right,width:innerWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,contentOverflow:element.querySelector('.extensions-content').scrollWidth-element.querySelector('.extensions-content').clientWidth}));
   assert(bounds.left>=-1&&bounds.right<=bounds.width+1,`${label} dialog must fit ${width}px`);
   assert(bounds.pageOverflow<=1&&bounds.contentOverflow<=1,`${label} must not overflow horizontally at ${width}px: ${JSON.stringify(bounds)}`);
  }
  await discover('Plugins');await screenshot(`plugins-${width}`);
 }
 pass('All five categories remain usable without horizontal overflow at 375, 820 and 1440 pixels');
 await page.setViewportSize({width:1440,height:960});

 await discover('Skills');
 await page.evaluate(()=>{window.__catalogGate={source:'recommended',started:false,returned:false};});
 await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).click();
 await page.waitForFunction(()=>window.__catalogGate?.started);
 await dialog.getByRole('button',{name:'Community',exact:true}).click();await catalogReady();
 assert((await rows().count())>=6);
 await page.evaluate(()=>window.__catalogGate.release());await page.waitForFunction(()=>window.__catalogGate.returned);
 assert.equal(await dialog.getByRole('button',{name:'Community',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await dialog.getByRole('heading',{name:'Community results',exact:true}).count(),1);assert((await rows().count())>=6);
 await page.evaluate(()=>{window.__catalogGate=null;window.__catalogRepeatCursor=true;});
 const beforeCursor=(await commands()).filter(command=>command.type==='catalogSearch').length;
 await dialog.getByRole('button',{name:'Curated',exact:true}).click();await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).click();
 await dialog.getByRole('alert').filter({hasText:'catalog returned a repeated page'}).waitFor();
 assert.equal((await commands()).filter(command=>command.type==='catalogSearch').length-beforeCursor,2,'Repeated cursors must stop the auto-load loop immediately');
 await page.evaluate(()=>{window.__catalogRepeatCursor=false;});
 await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).click();await catalogReady();
 pass('Late curated results cannot replace a newer Community view; a repeated cursor stops the auto-load loop and refresh recovers');

 await page.evaluate(()=>{window.__catalogGate={source:'community',started:false,returned:false};});
 await dialog.getByRole('button',{name:'Community',exact:true}).click();await dialog.getByRole('button',{name:'Refresh catalog',exact:true}).click();await page.waitForFunction(()=>window.__catalogGate?.started);
 await search('security-best-practices');assert((await rows().allTextContents()).every(text=>/security/i.test(text)));
 await page.evaluate(()=>window.__catalogGate.release());await page.waitForFunction(()=>window.__catalogGate.returned);
 assert((await rows().allTextContents()).every(text=>/security/i.test(text)));
 await page.evaluate(()=>{window.__catalogGate=null;window.__catalogCap=true;});
 const beforeCap=(await commands()).filter(command=>command.type==='catalogSearch').length;
 await dialog.getByRole('button',{name:'Community',exact:true}).click();await catalogReady();assert.equal(await rows().count(),999);
 await dialog.locator('.extensions-content').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForFunction(()=>document.querySelectorAll('.catalog-card').length===1000);await catalogReady();assert.equal(await rows().count(),1000);
 assert.equal(await dialog.getByRole('button',{name:'Load more',exact:true}).count(),0);
 assert.equal(await dialog.getByText('Showing the first 1,000 results. Search to narrow the directory.',{exact:true}).count(),1);
 assert.equal((await commands()).filter(command=>command.type==='catalogSearch').length-beforeCap,2);
 await page.evaluate(()=>{window.__catalogCapTerminal=true;});
 await dialog.getByRole('button',{name:'Community',exact:true}).click();await catalogReady();assert.equal(await rows().count(),999);
 await dialog.locator('.extensions-content').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForFunction(()=>document.querySelectorAll('.catalog-card').length===1000);await catalogReady();assert.equal(await rows().count(),1000);
 assert.equal(await dialog.getByRole('button',{name:'Load more',exact:true}).count(),0);
 assert.equal(await dialog.getByText('Showing the first 1,000 results. Search to narrow the directory.',{exact:true}).count(),1,'A clipped final page must still disclose that results were omitted');
 assert.equal((await commands()).filter(command=>command.type==='catalogSearch').length-beforeCap,4);
 await page.evaluate(()=>{window.__catalogCap=false;});
 await search('');
 pass('A newer search wins over an in-flight response; Community pagination discloses its 1,000-result bound even when a clipped final page has no cursor');

 await discover('Skills');await dialog.getByRole('button',{name:'Community',exact:true}).click();await catalogReady();
 await dialog.getByRole('textbox',{name:'Search catalog',exact:true}).fill('security-best-practices');
 await search('security-best-practices');
 assert((await rows().allTextContents()).every(text=>/security/i.test(text)));
 assert.equal((await commands()).filter(command=>command.type==='catalogSearch').at(-1).query,'security-best-practices');
 pass('Explicit Community search queries the full directory and replaces the results');

 await dialog.getByRole('button',{name:'Curated',exact:true}).click();await catalogReady();
 const skill=CURATED_EXTENSIONS.find(item=>item.kind==='skills'&&item.package&&item.compatibility!=='setup-required');assert(skill);
 await open(skill);await dialog.getByRole('button',{name:'Simulate package review',exact:true}).click();
 const install=dialog.getByRole('button',{name:'Install skill',exact:true});await install.waitFor();assert.equal(await install.isDisabled(),true);
 assert.equal((await commands()).filter(command=>command.type==='install').length,0);
 await dialog.getByLabel('I trust these skill instructions.').check();await install.click();
 await dialog.getByRole('button',{name:'Installed',exact:true}).click();
 await dialog.getByRole('button',{name:`Manage ${skill.title}`,exact:true}).waitFor();
 assert((await commands()).some(command=>command.type==='install'&&command.reviewed===true));
 await dialog.getByRole('button',{name:`Manage ${skill.title}`,exact:true}).click();
 assert.equal(await dialog.locator('.extension-card h4').textContent(),skill.title);
 pass('Package review keeps installation disabled until consent, and the Installed list opens the chosen skill');

 await discover('Skills');
 const setup=CURATED_EXTENSIONS.find(item=>item.kind==='skills'&&item.compatibility==='setup-required');assert(setup);
 await open(setup);
 assert.equal(await dialog.getByRole('button',{name:'Open setup instructions',exact:true}).count(),1);
 assert.equal(await dialog.getByRole('button',{name:/Simulate package review|Install skill|Add server|Simulate adding server/}).count(),0);
 await screenshot('setup-only');await back();
 pass('Host-dependent setup entries provide instructions without an install action');

 const servers=CURATED_EXTENSIONS.filter(item=>item.kind==='mcp'&&item.recipe?.transport==='http'&&item.compatibility==='recipe').slice(0,2);assert.equal(servers.length,2);
 for(const [index,entry] of servers.entries()){
  if(index===0)await discover('MCP servers');else await back();await open(entry);
  const add=dialog.getByRole('button',{name:'Simulate adding server',exact:true});assert.equal(await add.isDisabled(),true);
  await dialog.getByLabel('I approve this endpoint and its access. Tools may receive data outside the project sandbox.').check();await add.click();
  await dialog.getByRole('button',{name:'Manage server',exact:true}).waitFor();
 }
 await dialog.getByRole('button',{name:'Manage server',exact:true}).click();

 assert.equal(await dialog.locator('.server-card').count(),1);assert.equal(await dialog.locator('.server-card h4').textContent(),servers[1].recipe.name);
 await dialog.getByRole('button',{name:'Back to installed',exact:true}).click();await dialog.getByRole('textbox',{name:'Search extensions',exact:true}).fill('');await dialog.getByRole('button',{name:`Manage ${servers[0].recipe.name}`,exact:true}).click();
 assert.equal(await dialog.locator('.server-card').count(),1);assert.equal(await dialog.locator('.server-card h4').textContent(),servers[0].recipe.name);
 await screenshot('manage-exact-server');
 pass('Reviewed server additions become Manage actions; both detail and Installed rows open the exact configured server');

 await discover('Hooks');const hook=CURATED_EXTENSIONS.find(item=>item.kind==='hooks'&&item.hook);assert(hook);await open(hook);
 await dialog.getByRole('button',{name:'Add to project draft',exact:true}).click();await dialog.getByRole('textbox',{name:'Hook 1 command',exact:true}).waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Save reviewed hooks',exact:true}).isDisabled(),true);
 assert.equal((await page.evaluate(()=>window.musebench.customize({type:'refresh'}))).state.hooks.items.length,0);
 await dialog.getByRole('textbox',{name:'Hook 1 command',exact:true}).fill('echo edited-starter');
 await dialog.getByLabel('I reviewed these commands and approve their access as my user account.').check();
 await dialog.getByRole('button',{name:'Save reviewed hooks',exact:true}).click();
 await dialog.getByRole('tab',{name:'Skills',exact:true}).click();await dialog.getByRole('tab',{name:'Hooks',exact:true}).click();
 assert.equal(await dialog.getByRole('textbox',{name:'Hook 1 command',exact:true}).inputValue(),'echo edited-starter');
 pass('Hook starters remain unapproved drafts until explicitly reviewed, and edited commands survive tab changes');

 await discover('Plugins');await dialog.getByRole('button',{name:'Community',exact:true}).click();await catalogReady();
 await search('Unsupported package sample');await dialog.getByRole('button',{name:'View Unsupported package sample',exact:true}).click();
 const beforeFailure=(await commands()).filter(command=>command.type==='install').length;
 await dialog.getByRole('button',{name:'Simulate package review',exact:true}).click();
 await dialog.getByRole('alert').filter({hasText:'unsupported executable capability'}).waitFor();
 assert.equal((await commands()).filter(command=>command.type==='install').length,beforeFailure);
 await screenshot('validation-failure');pass('Unsupported package validation fails visibly without attempting installation');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(error);process.exitCode=1;await screenshot('failure').catch(()=>{});}
finally{report.commands=await commands().catch(()=>[]);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);await browser.close();await server.close();}
