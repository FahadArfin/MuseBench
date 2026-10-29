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
 await page.evaluate(()=>{const original=window.musebench.customize;window.__toolCalls=[];window.musebench.customize=async command=>{window.__toolCalls.push(command);if(command.type==='inspectPluginMcp'&&window.__failInspection)throw Error('Fixture inspection unavailable');const result=await original(command);if(command.type==='inspectPluginMcp'&&window.__holdInspection)await new Promise(resolve=>{window.__releaseInspection=resolve});if(result.pluginMcp&&window.__multilineCommand)result.pluginMcp.servers.find(item=>item.title==='imported-check').command=[window.__multilineCommand];if(result.pluginMcp&&window.__unknownTool)result.pluginMcp.servers.push({stableId:'plugin:preview-tools:future:unsupported',title:'Future tool',kind:'future',supported:false,enabled:false,reviewed:false,reason:'This capability needs setup in the official Muse CLI.'});return result;};});
 await page.evaluate(()=>{window.__chatRefreshCalls=0;const original=window.musebench.dispatch;window.musebench.dispatch=async action=>{if(action.type==='refresh')window.__chatRefreshCalls++;return original(action);};window.dispatchEvent(new Event('focus'));});
 await page.waitForFunction(()=>window.__chatRefreshCalls>0);
 await page.getByRole('button',{name:'Customize',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Customize'});
 for(const title of ['Skills','Connectors','Plugins','MCP servers','Hooks']){
  await dialog.getByRole('tab',{name:title,exact:true}).click();await dialog.getByRole('heading',{name:title,exact:true}).waitFor();
  const before=await page.evaluate(()=>window.__chatRefreshCalls);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__chatRefreshCalls),before,`${title}: background focus refresh must pause while browsing Customize`);
 }
 const idleRefreshes=await page.evaluate(()=>window.__chatRefreshCalls);await page.waitForTimeout(6100);assert.equal(await page.evaluate(()=>window.__chatRefreshCalls),idleRefreshes,'Periodic chat refresh must pause while Customize stays open');pass('All five Customize pages pause background chat refresh without disabling catalog navigation');
 await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await page.waitForFunction(before=>window.__chatRefreshCalls>before,idleRefreshes);pass('Periodic chat refresh resumes after Customize closes');
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 await dialog.getByRole('tab',{name:'Plugins',exact:true}).click();await dialog.getByRole('button',{name:'Installed',exact:true}).click();
 await dialog.getByRole('button',{name:'Manage Preview tools',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'Tools & hooks',exact:true});
 await panel.getByRole('button',{name:'Review access for local-notes',exact:true}).waitFor();
 assert.match(await panel.innerText(),/Simulated/);assert.equal(await panel.locator('code').first().innerText(),'["node","sample-notes.mjs"]');
 const hook=panel.locator('article').filter({has:page.getByText('on-stop',{exact:true})});
 assert.match(await hook.innerText(),/Stop.*3 s.*Waits for completion/);await hook.getByRole('button',{name:'Review access for on-stop',exact:true}).waitFor();
 const imported=panel.locator('article').filter({has:page.getByText('imported-check',{exact:true})});
 await imported.getByRole('button',{name:'Review access for imported-check',exact:true}).waitFor();
 assert.equal(await imported.locator('code').innerText(),'node "$CLAUDE_PLUGIN_ROOT/hooks/check.mjs" && echo done');
 assert.match(await imported.innerText(),/Shell command/);assert.match(await imported.innerText(),/Matches Bash\|Read/);assert.match(await imported.innerText(),/hooks\/hooks.json/);assert.match(await imported.innerText(),/silent.*ignored/i);
 const before=await page.evaluate(()=>window.__toolCalls.length);await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.__toolCalls.length),before);pass('On-demand inspection stays still while reading');
 await panel.getByRole('button',{name:'Review access for local-notes',exact:true}).focus();await page.keyboard.press('Enter');
 const confirm=dialog.getByRole('button',{name:'Confirm',exact:true});await confirm.waitFor();assert.equal(await confirm.isDisabled(),true);
 await dialog.getByRole('checkbox').check();await confirm.click();await panel.getByRole('button',{name:'Revoke access for local-notes',exact:true}).waitFor();pass('Explicit per-server approval and read-back');
 await hook.getByRole('button',{name:'Review access for on-stop',exact:true}).click();assert.match(await dialog.innerText(),/Runs automatically.*Stop/);assert.match(await dialog.innerText(),/model to keep working.*allowance/);assert.equal(await confirm.isDisabled(),true);
 await dialog.getByRole('checkbox').check();await confirm.click();await hook.getByRole('button',{name:'Revoke access for on-stop',exact:true}).waitFor();
 assert.equal(await panel.getByText('Approved',{exact:true}).count(),2);
 await hook.getByRole('button',{name:'Revoke access for on-stop',exact:true}).click();await dialog.getByRole('checkbox').check();await confirm.click();
 await hook.getByText('Revoked',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:'Revoke access for local-notes',exact:true}).count(),1);pass('Automatic hook consent and revocation are independent of MCP access');
 await page.screenshot({path:path.join(output,'approved.png')});
 await panel.getByRole('button',{name:'Revoke access for local-notes',exact:true}).click();await dialog.getByRole('checkbox').check();await confirm.click();await panel.getByText('Revoked',{exact:true}).first().waitFor();pass('Per-server revocation');
 await imported.getByRole('button',{name:'Review access for imported-check',exact:true}).click();assert.match(await dialog.innerText(),/shell command/);assert.match(await dialog.innerText(),/matcher.*Bash\|Read/);assert.match(await dialog.innerText(),/silent.*ignored/i);assert.equal(await confirm.isDisabled(),true);
 await dialog.getByRole('checkbox').check();await confirm.click();await imported.getByRole('button',{name:'Revoke access for imported-check',exact:true}).waitFor();assert.equal(await panel.getByText('Approved',{exact:true}).count(),1);
 await imported.getByRole('button',{name:'Revoke access for imported-check',exact:true}).click();await dialog.getByRole('checkbox').check();await confirm.click();await imported.getByText('Revoked',{exact:true}).waitFor();pass('Imported shell, source, matcher and ignored presentation settings appear before separate consent');
 const multilineCommand='# Keep the next command on its own line\nnode "$CLAUDE_PLUGIN_ROOT/hooks/'+('long-file-name-'.repeat(12))+'.mjs" "keep  two spaces"\n# End of command';
 await page.evaluate(command=>{window.__multilineCommand=command;},multilineCommand);await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await imported.getByText(multilineCommand,{exact:true}).waitFor();
 await imported.getByRole('button',{name:'Review access for imported-check',exact:true}).click();
 const consentCommand=dialog.locator('.extensions-setup code');assert.equal(await consentCommand.count(),1,'Approval must show a separate, whitespace-preserving command');assert.equal(await consentCommand.textContent(),multilineCommand);assert.equal(await consentCommand.innerText(),multilineCommand);assert.equal(await consentCommand.evaluate(element=>getComputedStyle(element).whiteSpace),'pre-wrap');assert.equal(await confirm.isDisabled(),true);
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(640,860));else await page.setViewportSize({width:640,height:860});
 assert.equal(await dialog.locator('.extensions-setup').evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);await dialog.screenshot({path:path.join(output,'multiline-consent.png')});
 await dialog.getByRole('button',{name:'Back to Plugins',exact:true}).click();await page.evaluate(()=>{delete window.__multilineCommand;});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1200,980));else await page.setViewportSize({width:1200,height:980});
 pass('Consent preserves shell newlines, comment boundaries and quoted whitespace, and wraps long commands');
 await page.evaluate(()=>{window.__beforeHookVariant=window.musebench.customize;window.musebench.customize=async command=>{const result=await window.__beforeHookVariant(command);const hook=result.pluginMcp?.servers.find(r=>r.kind==='hook');if(hook)hook.hook={event:window.__hookEvent??'PermissionRequest',timeoutMs:3000,async:!!window.__backgroundHook,matcher:null,compatibilityName:window.__hookEvent?null:'fixture_tools'};return result;};});
 await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await hook.getByText(/Matches fixture_tools/).waitFor();await hook.getByRole('button',{name:'Review access for on-stop',exact:true}).click();assert.match(await dialog.innerText(),/can also approve or deny tool requests/);await dialog.getByRole('button',{name:'Back to Plugins',exact:true}).click();
 await page.evaluate(()=>{window.__backgroundHook=true});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await hook.getByText(/Background.*output ignored/).waitFor();await hook.getByRole('button',{name:'Review access for on-stop',exact:true}).click();assert.match(await dialog.innerText(),/output does not change the session/);await dialog.getByRole('button',{name:'Back to Plugins',exact:true}).click();
 for(const [event,expected] of [['PreToolUse',/replace tool inputs.*approval rules/],['Stop',/model to keep working.*allowance/],['SubagentStop',/sub-agent working.*allowance/],['SessionEnd',/Observation only.*cannot change context or control/]]){
  await page.evaluate(event=>{window.__backgroundHook=false;window.__hookEvent=event;},event);await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await hook.getByText(new RegExp(event+' ·')).waitFor();await hook.getByRole('button',{name:'Review access for on-stop',exact:true}).click();assert.match(await dialog.innerText(),expected);assert.equal(await confirm.isDisabled(),true);await dialog.getByRole('button',{name:'Back to Plugins',exact:true}).click();
 }
 pass('Consent explains changed tool inputs, continued model work and observation-only events');
 await page.evaluate(()=>{window.musebench.customize=window.__beforeHookVariant;});pass('Permission and background hooks explain their different effects');
 await page.evaluate(()=>{window.__failInspection=true});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Fixture inspection unavailable'}).waitFor();
 await page.evaluate(()=>{window.__failInspection=false});await panel.getByRole('button',{name:'Refresh plugin tools',exact:true}).click();await panel.getByText('Revoked',{exact:true}).first().waitFor();pass('Inspection failures can be refreshed');
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
