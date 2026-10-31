// Full shared app, simulated bridge only: no provider requests or account changes.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium,_electron as electron} from 'playwright';
const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/settings-connections',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/settings-connections',variant+'-'));
let server,browser,app,page;
const report={variant,checks:[],errors:[],providerRequests:0};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:`node_modules/.vite-settings-${variant}`,server:{host:'127.0.0.1',port:0}});await server.listen();
 const url=`http://127.0.0.1:${server.httpServer.address().port}/preview.html`;
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});const ready=app.waitForEvent('window');await app.evaluate(({BrowserWindow},url)=>{const w=new BrowserWindow({width:1508,height:1043,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void w.loadURL(url);},url);page=await ready;}
 else {browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1508,height:1043}});}
 page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 await page.evaluate(()=>{window.connectionCommands=[];const original=window.musebench.personal;window.musebench.personal=async command=>{window.connectionCommands.push(command);return original(command);};});
 const settings=()=>page.getByRole('dialog',{name:'Settings',exact:true});
 const category=name=>settings().getByRole('navigation',{name:'Settings categories'}).getByRole('button',{name,exact:true}).click();
 const open=async()=>{await page.keyboard.press('Control+,');await settings().waitFor();};
 const settled=async()=>page.locator('[role=dialog]').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const shot=async name=>{await settled();await page.screenshot({path:path.join(output,name+'.png')});};
 await open();await shot('general-dark');
 const surfaces=await settings().evaluate(el=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el.querySelector('.settings-content')).backgroundColor,filter:getComputedStyle(el.querySelector('.settings-content')).backdropFilter}));
 assert.equal(surfaces.radius,'18px');assert(!surfaces.background.startsWith('rgba'));assert.equal(surfaces.filter,'none');
 await category('Customize');await shot('customize-settings');
 for(const [name,tab] of [['Skills','skills'],['Connectors','connectors'],['Plugins','plugins'],['MCP servers','mcp'],['Hooks','hooks']]){
  await settings().getByRole('button',{name:`Open ${name}`,exact:true}).click();const catalog=page.getByRole('dialog',{name:'Customize',exact:true});await catalog.waitFor();assert.equal(await page.locator('[role=dialog]').count(),1);assert.equal(await catalog.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true');
  if(tab==='skills'){await catalog.locator('.catalog-card').first().waitFor();await shot('skills-dark');}
  if(tab==='connectors')await shot('connectors-dark');
  await page.keyboard.press('Escape');await catalog.waitFor({state:'hidden'});await open();await category('Customize');
 }
 pass('All five Settings launchers open the real selected catalog without nesting dialogs');
 await category('Connections');await shot('connections-dark');
 const actions=[['Connect Meta AI apps',{type:'metaSettings',section:'apps'}],['Open Meta AI settings and plan',{type:'metaSettings',section:'general'}],['Open Muse connected apps',{type:'serviceAction',action:'connections'}]];
 for(const [name,expected] of actions){await settings().getByRole('button',{name,exact:true}).click();await settings().waitFor({state:'hidden'});await page.waitForFunction(expected=>window.connectionCommands.some(c=>JSON.stringify(c)===JSON.stringify(expected)),expected);await open();await category('Connections');}
 await settings().getByRole('button',{name:'Open coding connectors',exact:true}).click();const catalog=page.getByRole('dialog',{name:'Customize',exact:true});await catalog.waitFor();assert.equal(await catalog.getByRole('tab',{name:'Connectors',exact:true}).getAttribute('aria-selected'),'true');
 await page.evaluate(()=>window.connectionCommands=[]);await catalog.getByRole('button',{name:'Connect apps',exact:true}).click();await catalog.waitFor({state:'hidden'});await page.waitForFunction(()=>window.connectionCommands.some(c=>c.type==='metaSettings'&&c.section==='apps'));
 pass('Settings and Customize use bounded official account commands, separate from coding connectors');
 await open();await settings().getByRole('textbox',{name:'Search settings'}).fill('Gmail');await settings().getByRole('heading',{name:'Connections',exact:true}).waitFor();await settings().getByRole('textbox',{name:'Search settings'}).press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-nav-connections');await settings().getByRole('button',{name:'Clear settings search'}).click();
 await category('General');await settings().getByRole('button',{name:'Light theme'}).click();await category('Connections');await shot('connections-light');await category('General');await settings().getByRole('button',{name:'Dark theme'}).click();await settings().getByRole('switch',{name:'Reduce motion'}).click();
 const resize=async(width,height)=>desktop?app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height}):page.setViewportSize({width,height});
 await resize(390,760);for(const section of ['Customize','Connections']){await category(section);await settled();const size=await settings().locator('.settings-content').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert(size.scroll<=size.client+1,JSON.stringify(size));await shot(section.toLowerCase()+'-narrow');}
 await settings().getByRole('button',{name:'Close dialog'}).focus();await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>Boolean(document.activeElement.closest('[role=dialog]'))));await page.keyboard.press('Escape');await settings().waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Close navigation',exact:true}).waitFor();await open();await category('Connections');await settings().getByRole('button',{name:'Connect Meta AI apps',exact:true}).click();await settings().waitFor({state:'hidden'});await page.getByRole('button',{name:'Close navigation',exact:true}).waitFor({state:'hidden'});
 pass('Search, keyboard focus, light theme, reduced motion and narrow layouts work with opaque content');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(e);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();await browser?.close();await server?.close();}
