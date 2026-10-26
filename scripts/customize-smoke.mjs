import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
await mkdir('artifacts/customize-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/customize-ui',process.env.MUSEBENCH_EXECUTABLE?'packaged-':'source-'));
const profile=path.join(output,'profile');await mkdir(profile);
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'app'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects'),USERPROFILE:profile};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;delete env.XDG_CONFIG_HOME;delete env.XDG_DATA_HOME;
const app=await electron.launch({cwd:process.cwd(),args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
const page=await app.firstWindow();page.setDefaultTimeout(15000);const report={output,checks:[],errors:[],modelRequests:0,accountChanged:false};page.on('pageerror',error=>report.errors.push(error.message));
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const modal=()=>page.getByRole('dialog',{name:'Customize',exact:true});
const tab=name=>modal().getByRole('tab',{name,exact:true}).click();
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function saved(){await modal().getByRole('status').getByText('Saved.',{exact:false}).waitFor();}
async function approve(){await modal().getByRole('checkbox').check();await modal().getByRole('button',{name:'Confirm',exact:true}).click();await saved();}
async function overflow(){assert.equal(await modal().evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);assert.equal(await modal().locator('.extensions-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
try{
 await page.getByRole('button',{name:'New chat',exact:true}).waitFor();await page.setViewportSize({width:1440,height:960});
 await page.getByRole('button',{name:'Customize',exact:true}).click();await modal().getByText('Loading your Muse extensions…').waitFor({state:'hidden'});
 await modal().getByRole('button',{name:'Create skill',exact:true}).waitFor();assert.equal(await modal().getByRole('tab').count(),4);assert.equal(await modal().getByRole('button',{name:'Create skill',exact:true}).isEnabled(),true);await shot('01-skills');pass('Customize opens real CLI inventory with four accessible tabs');
 await modal().getByRole('button',{name:'Create skill',exact:true}).click();await modal().getByRole('textbox',{name:'Skill name',exact:true}).fill('ui-fixture');await modal().getByRole('textbox',{name:'Skill description'}).fill('A workflow made from the native Customize dialog');await modal().getByRole('textbox',{name:'Skill instructions'}).fill('Explain the selected file. Do not change files.');await modal().getByRole('button',{name:'Create skill',exact:true}).click();await saved();
 await modal().getByRole('textbox',{name:'Search extensions'}).fill('ui-fixture');assert.equal(await modal().locator('.extension-card').count(),1);await modal().getByRole('combobox',{name:'Activation for ui-fixture'}).selectOption('user-only');await saved();assert.equal(await modal().getByRole('combobox',{name:'Activation for ui-fixture'}).inputValue(),'user-only');await shot('02-created-skill');pass('Native form creates a real skill and persists manual-only activation');
 await tab('Connectors');await modal().getByRole('button',{name:'Manage connections'}).waitFor();await shot('03-connectors');pass('Connectors offers official saved-session handoffs and custom MCP setup');
 await tab('MCP servers');await modal().getByRole('button',{name:'Add server',exact:true}).click();await modal().getByRole('textbox',{name:'Server name',exact:true}).fill('ui-docs');await modal().getByRole('textbox',{name:'MCP endpoint'}).fill('https://example.org/mcp');assert.equal(await modal().getByRole('button',{name:'Add server',exact:true}).isDisabled(),true);await modal().getByRole('checkbox').check();await modal().getByRole('button',{name:'Add server',exact:true}).click();await saved();await modal().getByRole('heading',{name:'ui-docs',exact:true}).waitFor();assert.equal(await modal().getByRole('button',{name:'Sign in',exact:true}).count(),1);await shot('04-mcp');
 await modal().getByRole('button',{name:'Disable',exact:true}).click();await approve();await modal().getByText('HTTPS · Disabled · Reviewed',{exact:true}).waitFor();pass('MCP setup requires explicit access review, saves real CLI config, and toggles without contacting the server');
 const folder=path.join(output,'plugin');await mkdir(path.join(folder,'.muse-plugin'),{recursive:true});await mkdir(path.join(folder,'skills','fixture'),{recursive:true});await writeFile(path.join(folder,'skills','fixture','SKILL.md'),'---\nname: ui-plugin-skill\ndescription: Test a local plugin\n---\nSummarize code.\n');await writeFile(path.join(folder,'.muse-plugin','plugin.json'),JSON.stringify({schemaVersion:1,name:'ui-plugin',version:'1.0.0',description:'Local fixture bundle',compat:{manifestDir:'.muse-plugin'},capabilities:{skills:[{id:'ui-plugin-skill',path:'skills/fixture/SKILL.md'}]}}));
 await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},folder);
 await tab('Plugins');await modal().getByRole('button',{name:'Add plugin',exact:true}).click();await modal().getByRole('heading',{name:'Install ui-plugin',exact:true}).waitFor();await shot('05-plugin-review');await modal().getByRole('checkbox').check();await modal().getByRole('button',{name:'Install plugin',exact:true}).click();await saved();await modal().getByRole('heading',{name:'ui-plugin',exact:false}).waitFor();await shot('06-installed-plugin');pass('System folder picker validates and installs an actual plugin after review');
 await page.keyboard.press('Escape');await modal().waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Customize',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Customize',exact:true}).click();await modal().getByText('Loading your Muse extensions…').waitFor({state:'hidden'});await modal().getByRole('textbox',{name:'Search extensions'}).fill('ui-fixture');await modal().getByRole('combobox',{name:'Activation for ui-fixture'}).waitFor();pass('Closing restores focus; reopening reloads persistent configuration');
 await modal().getByRole('tab',{name:'Skills',exact:true}).focus();await page.keyboard.press('End');assert.equal(await modal().getByRole('tab',{name:'MCP servers'}).getAttribute('aria-selected'),'true');await overflow();
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';});await shot('07-light');await overflow();await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 await page.setViewportSize({width:390,height:844});await shot('08-narrow');await overflow();pass('Keyboard tab navigation and dark/light/narrow layouts work without overflow');
 const persisted=JSON.parse(await readFile(path.join(profile,'.config','muse','settings.json'),'utf8'));assert.equal(persisted.mcp_servers['ui-docs'].enabled,false);assert.ok(persisted.skills);
 await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.getByRole('button',{name:'Customize',exact:true}).click();await modal().waitFor();pass('Customize is available from the Meta AI sidebar too');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.message;await shot('failure').catch(()=>{});throw error;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await app.close();console.log('REPORT '+path.join(output,'report.json'));}
