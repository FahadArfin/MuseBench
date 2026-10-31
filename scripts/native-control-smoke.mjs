import {_electron as electron,chromium} from 'playwright';
import {createServer} from 'vite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {callNativeApp} from '../electron/native-mcp-server.mjs';
import {verifyNativeMcpLifecycle} from './native-mcp-lifecycle-smoke.mjs';
await mkdir('artifacts/native-control',{recursive:true});
const checks=[],profile=await mkdtemp(path.resolve('artifacts/native-control','profile-'));
let app,client,preview,browser;
try{
 const executable=process.env.MUSEBENCH_EXECUTABLE;
 app=await electron.launch({...(executable?{executablePath:executable}:{}),args:[...(executable?[]:['.']),'--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost',...(process.platform==='linux'&&process.env.CI?['--no-sandbox']:[])],env:isolatedDesktopEnvironment(profile)});
 let page;const deadline=Date.now()+30000;while(!page&&Date.now()<deadline){page=app.windows().find(p=>p.url().includes('/dist/index.html'));if(!page)await new Promise(r=>setTimeout(r,100));}assert.ok(page);
 await page.getByRole('button',{name:'Profile menu',exact:true}).click();await page.getByRole('menuitem',{name:/^Settings/}).click();await page.getByRole('button',{name:'App control',exact:true}).click();
 await page.getByText('Native connection is off',{exact:true}).waitFor();await page.getByRole('button',{name:'Turn on',exact:true}).click();await page.getByText('Native connection is on',{exact:true}).waitFor();
 const config=await page.evaluate(async()=> (await window.musebench.nativeControl({type:'status'})).connectionConfig);
 client=new Client({name:'musebench-native-smoke',version:'1.0.0'});await client.connect(new StdioClientTransport({...config,stderr:'pipe'}));
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,r.content?.[0]?.text);return r;};
 const value=async(name,args={})=>JSON.parse((await call(name,args)).content[0].text);
 const status=await value('app_status');assert.equal(status.packaged,Boolean(executable));assert.equal(status.runtime.liveVerified,false);checks.push('Real Electron controller is read through MCP using the app-supplied stdio configuration');
 let ui=await value('navigate',{target:'code'});assert.ok(ui.headings.includes('What would you like to build?'));checks.push('MCP opens the Code workspace without clicks');
 ui=await value('navigate',{target:'codeSchedules'});assert.ok(ui.headings.includes('Scheduled'));assert.ok(ui.controls.some(control=>control.label==='New schedule'));checks.push('MCP opens local Code schedules without enabling or running one');await value('navigate',{target:'code'});
 const stalled=page.evaluate(()=>{const until=performance.now()+1800;while(performance.now()<until){/* Deliberately stalled renderer for cancellation regression. */}});
 await new Promise(r=>setTimeout(r,200));const cancellation=new AbortController();const queued=callNativeApp(profile,'navigate',{target:'settings',section:'updates'},{signal:cancellation.signal});const cancelled=assert.rejects(queued);await new Promise(r=>setTimeout(r,200));cancellation.abort();await cancelled;await stalled;
 ui=await value('inspect_ui');assert.ok(ui.headings.includes('What would you like to build?'));assert.ok(!ui.headings.includes('App updates'));checks.push('A cancelled request queued behind a stalled renderer cannot navigate later');
 // Semantic commit is independent of the optional 400 ms pixel-settle budget.
 const slowTransition=await page.addStyleTag({content:'.settings-modal{animation-delay:800ms!important}'});
 let began=performance.now();ui=await value('navigate',{target:'settings',section:'updates'});assert.deepEqual(ui.navigation,{committed:true,visualSettled:false});assert.ok(performance.now()-began<2000,'Delayed visual transition exceeded bounded completion');assert.equal(await page.locator('.settings-nav [aria-current="page"]').getAttribute('id'),'settings-nav-updates');
 await slowTransition.evaluate(element=>element.remove());
 checks.push('Native navigation commits the exact Settings category while reporting a delayed transition as visually unsettled');
 ui=await value('navigate',{target:'settings',section:'control'});assert.ok(ui.headings.includes('App control'));checks.push('MCP changes Settings categories and returns actual rendered controls');
 assert.deepEqual(ui.navigation,{committed:true,visualSettled:true});
 ui=await value('navigate',{target:'settings',section:'control'});assert.equal(ui.navigation.committed,true);assert.ok(ui.headings.includes('App control'));checks.push('Already selected destinations receive a fresh verified commit');
 const unrelated=await page.addStyleTag({content:'@keyframes native-unrelated{from{opacity:.5}to{opacity:1}} .sidebar{animation:native-unrelated 12s linear!important} .personal-workspace{animation:native-unrelated 12s linear infinite!important} .settings-modal button{animation:native-unrelated 12s linear!important}'});
 began=performance.now();ui=await value('navigate',{target:'settings',section:'updates'});assert.deepEqual(ui.navigation,{committed:true,visualSettled:true});assert.ok(performance.now()-began<2000);await unrelated.evaluate(element=>element.remove());
 const paused=await page.addStyleTag({content:'.settings-modal{animation-duration:12s!important;animation-play-state:paused!important}'});ui=await value('navigate',{target:'settings',section:'control'});assert.deepEqual(ui.navigation,{committed:true,visualSettled:true});await paused.evaluate(element=>element.remove());
 const infinite=await page.addStyleTag({content:'.settings-modal{animation-duration:12s!important;animation-iteration-count:infinite!important}'});ui=await value('navigate',{target:'settings',section:'updates'});assert.deepEqual(ui.navigation,{committed:true,visualSettled:true});await infinite.evaluate(element=>element.remove());
 await page.evaluate(()=>{window.nativeZeroRateObserver=new MutationObserver(()=>document.getAnimations().filter(animation=>animation.effect?.target?.matches('.settings-modal')).forEach(animation=>{animation.playbackRate=0;}));window.nativeZeroRateObserver.observe(document.body,{childList:true,subtree:true});});
 ui=await value('navigate',{target:'settings',section:'control'});assert.deepEqual(ui.navigation,{committed:true,visualSettled:true});await page.evaluate(()=>{window.nativeZeroRateObserver.disconnect();delete window.nativeZeroRateObserver;});
 await page.evaluate(()=>{window.nativeRafForTest=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;});
 try{ui=await value('navigate',{target:'settings',section:'updates'});assert.equal(ui.navigation.committed,true);}finally{await page.evaluate(()=>{window.requestAnimationFrame=window.nativeRafForTest;delete window.nativeRafForTest;});}
 await page.emulateMedia({reducedMotion:'reduce'});ui=await value('navigate',{target:'settings',section:'control'});assert.deepEqual(ui.navigation,{committed:true,visualSettled:true});await page.emulateMedia({reducedMotion:'no-preference'});
 checks.push('Unrelated, hidden, infinite and paused animations, stalled rAF and reduced motion do not block committed native destinations');
 ui=await value('navigate',{target:'work'});assert.equal(ui.navigation.committed,true);assert.ok(await page.locator('.work-workspace:not([hidden])').count());await value('navigate',{target:'code'});
 // No form value, password, arbitrary text node or iframe content may appear in inspection.
 await page.evaluate(()=>{const input=document.createElement('input');input.value='DO_NOT_EXPOSE_NATIVE_SECRET';input.type='password';document.body.append(input);});
 assert.ok(!JSON.stringify(await value('inspect_ui')).includes('DO_NOT_EXPOSE_NATIVE_SECRET'));
 ui=await value('navigate',{target:'customize',section:'plugins'});assert.ok(ui.controls.some(c=>c.role==='tab'&&c.label==='Plugins'&&c.selected==='true'));checks.push('MCP opens Customize with the requested tab');
 ui=await value('navigate',{target:'customize',section:'hooks'});assert.ok(ui.controls.some(c=>c.role==='tab'&&c.label==='Hooks'&&c.selected==='true'));assert.equal(ui.navigation.committed,true);checks.push('Customize subdestination changes bind to the actual selected tab');
 const screenshot=await call('screenshot');assert.equal(screenshot.content[0].type,'image');assert.equal(screenshot.content[0].mimeType,'image/jpeg');await writeFile('artifacts/native-control/desktop.jpg',Buffer.from(screenshot.content[0].data,'base64'));
 // Check actual encoded pixels, not only the MCP response envelope. A minimized
 // Electron window can return a previous frame even after its DOM has changed.
 await page.evaluate(()=>{const marker=document.createElement('div');marker.id='native-capture-test';marker.style.cssText='position:fixed;left:0;top:0;width:100px;height:100px;background:rgb(220,20,20);z-index:2147483647';document.body.append(marker);});
 const settlePaint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const pixel=async()=>app.evaluate(({nativeImage},data)=>[...nativeImage.createFromBuffer(Buffer.from(data,'base64')).crop({x:10,y:10,width:1,height:1}).toBitmap()],(await call('screenshot')).content[0].data);
 await settlePaint();let bgra=await pixel();assert.ok(bgra[2]>180&&bgra[1]<60&&bgra[0]<60,`Expected red marker, got ${bgra}`);
 await app.evaluate(async({BrowserWindow})=>{const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html'));await new Promise(resolve=>{window.once('minimize',resolve);window.minimize();});});
 await page.evaluate(()=>{document.getElementById('native-capture-test').style.background='rgb(20,220,20)';});
 let unavailable=await client.callTool({name:'screenshot',arguments:{}});assert.equal(unavailable.isError,true);assert.match(unavailable.content[0].text,/Open and restore MuseBench/);assert.equal((await value('diagnostics')).minimized,true);
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html'));window.restore();window.hide();});
 unavailable=await client.callTool({name:'screenshot',arguments:{}});assert.equal(unavailable.isError,true);assert.match(unavailable.content[0].text,/Open and restore MuseBench/);assert.equal((await value('diagnostics')).visible,false);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).show());
 await page.waitForFunction(()=>document.visibilityState==='visible');await settlePaint();bgra=await pixel();assert.ok(bgra[1]>180&&bgra[2]<60&&bgra[0]<60,`Expected updated green marker, got ${bgra}`);
 await page.evaluate(()=>document.getElementById('native-capture-test').remove());
 checks.push('Native screenshots contain current visible pixels, reject hidden/minimized windows without restoring them, and recover after the user restores the window');
 await page.evaluate(()=>console.error('Native diagnostics validation marker'));const diagnostics=await value('diagnostics');assert.ok(diagnostics.responsive);assert.ok(diagnostics.events.some(event=>event.kind==='renderer-console-error'));assert.ok(!JSON.stringify(diagnostics).includes('validation marker'));assert.ok(diagnostics.operations.length<=20);assert.ok(diagnostics.operations.some(item=>item.phases.some(phase=>phase.phase==='committed')));await writeFile('artifacts/native-control/navigation-receipts.json',JSON.stringify(diagnostics.operations,null,2));checks.push('MCP returns independent screenshots and bounded phase receipts without request IDs or console contents');
 assert.equal((await client.callTool({name:'navigate',arguments:{target:'code',script:'alert(1)'}})).isError,true);
 await value('navigate',{target:'settings',section:'control'});await page.getByRole('button',{name:'Turn off',exact:true}).click();await page.getByText('Native connection is off',{exact:true}).waitFor();assert.equal((await client.callTool({name:'app_status',arguments:{}})).isError,true);checks.push('Turning off App control immediately revokes native access');
 await client.close();client=null;
 // app.close() quits Electron before destroying its windows and can conceal
 // cleanup that incorrectly accesses BrowserWindow.webContents after closure.
 await app.evaluate(({app})=>{process.on('uncaughtException',error=>{console.error('Shutdown regression:',error.stack);app.exit(1);});});
 const processExit=new Promise(resolve=>app.process().once('exit',code=>resolve(code)));
 await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).close(),50);});
 let exitTimer;const exitCode=await Promise.race([processExit,new Promise(resolve=>{exitTimer=setTimeout(()=>resolve('timed out'),7000);})]);clearTimeout(exitTimer);
 if(exitCode!=='timed out')app=null;
 assert.equal(exitCode,0,'Closing the app window must finish native cleanup and exit normally');checks.push('Closing the actual desktop window finishes cleanup and exits without a shutdown exception');
 preview=await createServer({configFile:'vite.preview.config.mjs',server:{host:'127.0.0.1',port:43208,strictPort:true}});await preview.listen();browser=await chromium.launch();const web=await browser.newPage({viewport:{width:1400,height:1000}});await web.goto('http://127.0.0.1:43208/preview.html');
 await web.getByRole('button',{name:'Profile menu',exact:true}).click();await web.getByRole('menuitem',{name:/^Settings/}).click();await web.getByRole('button',{name:'App control',exact:true}).click();await web.getByText('Preview only. Connect from the installed desktop app.').waitFor();await web.getByRole('button',{name:'Turn on',exact:true}).click();await web.getByText('Native connection is on',{exact:true}).waitFor();await web.screenshot({path:'artifacts/native-control/preview.png'});checks.push('Preview uses the shared App control panel with explicit simulation');
 const lifecycle=await verifyNativeMcpLifecycle();await writeFile('artifacts/native-control/lifecycle.json',JSON.stringify(lifecycle,null,2));if(lifecycle.status==='passed')checks.push(...lifecycle.checks);
 await writeFile('artifacts/native-control/report.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await client?.close();await app?.close();await browser?.close();await preview?.close();}
