// Offline preview and Electron renderer fixture. No installed plugins or model calls.
import {chromium,_electron as electron} from 'playwright';
import {createServer} from 'vite';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/plugin-tools-ui',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/plugin-tools-ui',variant+'-'));
let server,browser,app,page;const report={variant,checks:[],errors:[],modelRequests:0};
const pass=value=>{report.checks.push(value);console.log('PASS '+value);};
try{
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-plugin-tools',server:{host:'127.0.0.1',port:0}});await server.listen();
 const url=server.resolvedUrls.local[0]+'preview.html';
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});const created=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow},url)=>{const win=new BrowserWindow({width:1200,height:980,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void win.loadURL(url);},url);page=await created;
 }else{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1200,height:980}});await page.goto(url);}
 page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.waitForFunction(()=>!!window.musebench);
 await page.evaluate(()=>{const original=window.musebench.customize;window.__toolCalls=[];window.musebench.customize=async command=>{window.__toolCalls.push(command);if(command.type==='inspectPluginMcp'&&window.__failInspection)throw Error('Fixture inspection unavailable');const result=await original(command);if(command.type==='inspectPluginMcp'&&window.__holdInspection)await new Promise(resolve=>{window.__releaseInspection=resolve});if(result.pluginMcp&&window.__unknownTool)result.pluginMcp.servers.push({stableId:'plugin:preview-tools:future:unsupported',title:'Future tool',kind:'future',supported:false,enabled:false,reviewed:false,reason:'This capability needs setup in the official Muse CLI.'});return result;};});
 await page.getByRole('button',{name:'Customize',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Customize'});
 await dialog.getByRole('tab',{name:'Plugins',exact:true}).click();await dialog.getByRole('button',{name:'Installed',exact:true}).click();
 await dialog.getByRole('button',{name:'Manage Preview tools',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'Plugin tools',exact:true});
 await panel.getByRole('button',{name:'Review access for local-notes',exact:true}).waitFor();
 assert.match(await panel.innerText(),/Simulated/);assert.equal(await panel.locator('code').innerText(),'["node","sample-notes.mjs"]');
 const before=await page.evaluate(()=>window.__toolCalls.length);await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.__toolCalls.length),before);pass('On-demand inspection stays still while reading');
 await panel.getByRole('button',{name:'Review access for local-notes',exact:true}).focus();await page.keyboard.press('Enter');
 const confirm=dialog.getByRole('button',{name:'Confirm',exact:true});await confirm.waitFor();assert.equal(await confirm.isDisabled(),true);
 await dialog.getByRole('checkbox').check();await confirm.click();await panel.getByRole('button',{name:'Revoke access for local-notes',exact:true}).waitFor();pass('Explicit per-server approval and read-back');
 await page.screenshot({path:path.join(output,'approved.png')});
 await panel.getByRole('button',{name:'Revoke access for local-notes',exact:true}).click();await dialog.getByRole('checkbox').check();await confirm.click();await panel.getByText('Revoked',{exact:true}).waitFor();pass('Per-server revocation');
 await page.evaluate(()=>{window.__failInspection=true});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Fixture inspection unavailable'}).waitFor();
 await page.evaluate(()=>{window.__failInspection=false});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await panel.getByText('Revoked',{exact:true}).waitFor();pass('Inspection failures can be refreshed');
 await page.evaluate(()=>{window.__unknownTool=true});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await panel.getByText('Future tool',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:/access for Future tool/}).count(),0);pass('Unsupported capabilities have no approval action');
 await page.evaluate(()=>{window.__holdInspection=true});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await page.waitForFunction(()=>!!window.__releaseInspection);
 await dialog.getByRole('button',{name:'Back to installed',exact:true}).click();assert.equal(await panel.count(),0);
 await page.evaluate(()=>{window.__holdInspection=false;window.__releaseInspection();});await dialog.getByRole('button',{name:'Refresh extensions',exact:true}).waitFor({state:'visible'});assert.equal(await panel.count(),0);pass('A late inspection cannot reopen closed details');
 assert.equal(await dialog.getByRole('button',{name:'Manage Preview tools',exact:true}).count(),1);assert.equal(await dialog.locator('.extension-card').count(),0);pass('Installed row retains the shared discovery layout');
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(640,860));else await page.setViewportSize({width:640,height:860});
 await dialog.getByRole('button',{name:'Manage Preview tools',exact:true}).click();await panel.getByRole('button',{name:'Review access for local-notes',exact:true}).waitFor();
 assert.equal(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await panel.screenshot({path:path.join(output,'narrow.png')});pass('Narrow details wrap without horizontal overflow');
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();await app?.close();await server?.close();}
