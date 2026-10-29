import {createServer} from 'vite';
import {chromium,_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';

const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/billing-ui',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/billing-ui',variant+'-'));
const report={variant,checks:[],errors:[],screenshots:[],paymentsAttempted:false,providerCalls:false};
let app,browser,server,page;
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
async function shot(name){const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),12000);})]);}finally{clearTimeout(timer);}}
async function localShell(){
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){const candidate=app.windows().find(p=>!p.isClosed()&&p.url().startsWith('file:')&&/\/dist\/index\.html(?:[?#]|$)/.test(p.url()));if(candidate)return candidate;await new Promise(resolve=>setTimeout(resolve,70));}
 throw Error('The local desktop renderer did not open.');
}
async function setResetWindows(windows){if(desktop)await app.evaluate((_electron,windows)=>{globalThis.__billingFixture.windows=windows;},windows);else await page.evaluate(windows=>{window.__resetFixture.windows=windows;},windows);}
async function usageReads(){return desktop?app.evaluate(()=>globalThis.__billingFixture.usageReads):page.evaluate(()=>window.__resetFixture.usageReads);}
try{
 if(desktop){
  const dataDir=path.join(output,'data');await mkdir(dataDir);const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
  app=await electron.launch({cwd:process.cwd(),args:['.','--host-resolver-rules=MAP * ~NOTFOUND'],env});page=await localShell();
  report.rendererURL=page.url();page.on('pageerror',e=>report.errors.push(e.message));
  await page.waitForFunction(()=>Boolean(window.musebench));
  await app.evaluate(({session})=>session.fromPartition('persist:musebench-billing').protocol.handle('https',()=>new Response('<!doctype html><title>Checkout fixture</title><h1>Isolated Meta checkout fixture</h1>',{headers:{'content-type':'text/html'}})));
  for(const [destination,url] of [['subscriptions','https://accountscenter.meta.com/'],['apiBilling','https://dev.meta.ai/billing/']]){
   assert.equal((await bounded(page.evaluate(destination=>window.musebench.codeBilling({type:'checkout',destination}),destination),'Checkout IPC')).opened,true);
   // Playwright does not emit a Page event for this separate Electron session.
   // Inspect only our local fixture through its actual BrowserWindow owner.
   const checkout=await bounded(app.evaluate(async({BrowserWindow},url)=>{
    const view=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);if(!view)throw Error('Checkout window missing');
    return{url:view.webContents.getURL(),...await view.webContents.executeJavaScript('({heading:document.querySelector("h1")?.textContent,node:typeof window.require,bridge:typeof window.musebench})')};
   },url),'Checkout fixture read');
   assert.deepEqual(checkout,{url,heading:'Isolated Meta checkout fixture',node:'undefined',bridge:'undefined'});
   await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).close(),url);
  }
  pass('Real desktop IPC opens isolated subscription and API checkout windows at fixed Meta URLs using local fixtures');
  await app.evaluate(({ipcMain,session})=>{
   for(const s of [session.defaultSession,session.fromPartition('persist:musebench-personal-muse'),session.fromPartition('persist:musebench-billing')])s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
   const state={mode:'account',source:'account',status:'ready',hasApiKey:false,billingAccountId:null,busy:false};
   const fixture=globalThis.__billingFixture={state,checkouts:[],failNextCheckout:false,sender:null,usageReads:0,windows:[{label:'Weekly',remainingPercent:9,resetsAt:new Date(Date.now()+86400000).toISOString()}]};
   const emit=event=>event.sender.send('musebench:billing-update');
   ipcMain.removeHandler('musebench:code-billing');ipcMain.handle('musebench:code-billing',(event,c)=>{
    fixture.sender=event.sender;
    if(c.type==='checkout'){fixture.checkouts.push({destination:c.destination,external:!!c.external});if(fixture.failNextCheckout){fixture.failNextCheckout=false;throw Error('Fixture checkout could not open.');}return{opened:false,simulation:true};}
    if(c.type==='saveApiKey'){if(c.key.length<10)throw Error('Enter a valid API key.');state.mode=state.source='api';state.hasApiKey=true;state.billingAccountId=null;}
    if(c.type==='select'){if(c.source==='api'&&!state.hasApiKey)throw Error('Add a Meta API key first.');state.mode=state.source=c.source;}
    if(c.type==='linkBilling')state.billingAccountId=c.accountId;
    if(c.type!=='status')emit(event);return{state:{...state}};
   });
   ipcMain.removeHandler('musebench:command-info');ipcMain.handle('musebench:command-info',(_event,type)=>{if(type!=='usage')return{status:'ready'};fixture.usageReads++;return{status:'ready',usage:{windows:state.source==='account'?fixture.windows:[],billingSource:state.source,billingMatched:state.billingAccountId==='fixture-team',billing:{accountId:'fixture-team',spent:18.25,freeCredits:125,currency:'USD',period:'This month',source:'Isolated fixture'}}};});
   ipcMain.removeHandler('musebench:onboarding');ipcMain.handle('musebench:onboarding',()=>({code:{status:'ready'},personal:{status:'ready'}}));
  });
 }else{
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-billing-test',server:{port:4326,host:'127.0.0.1',strictPort:true}});await server.listen();
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:4326/preview.html');
 }
 if(!desktop)await page.evaluate(()=>{const original=window.musebench.commandInfo;const fixture=window.__resetFixture={windows:null,usageReads:0};window.musebench.commandInfo=async type=>{const r=await original(type);if(type==='usage'){fixture.usageReads++;if(fixture.windows)r.usage.windows=fixture.windows;}return r;};});
 page.setDefaultTimeout(15000);if(!desktop)page.on('pageerror',e=>report.errors.push(e.message));
 await page.getByRole('button',{name:'Profile menu',exact:true}).click();await page.getByRole('menuitem',{name:'Usage',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Usage & billing',exact:true});await dialog.getByRole('radio',{name:/Muse Code account/}).waitFor();
 await dialog.getByText('9% left',{exact:true}).waitFor();pass('Subscription allowance visible in the shared Overview');await shot('overview');
 const resets=dialog.getByRole('region',{name:'Subscription resets',exact:true});
 await resets.getByText('Automatic resets',{exact:true}).waitFor();await resets.getByText('Banked resets',{exact:true}).waitFor();
 assert.equal(await resets.getByRole('button',{name:/^(Claim|Use) reset$/}).count(),0);await resets.getByText('Not available',{exact:true}).waitFor();
 await page.clock.install();const resetNow=await page.evaluate(()=>Date.now());
 const resetWindows=[{label:'Current window',remainingPercent:0,resetsAt:new Date(resetNow+120000).toISOString()},{label:'Weekly',remainingPercent:9,resetsAt:new Date(resetNow+86400000).toISOString()}];
 await setResetWindows(resetWindows);await resets.getByRole('button',{name:'Refresh usage',exact:true}).click();await dialog.getByText('0% left',{exact:true}).waitFor();
 const beforeDeadline=await usageReads();await page.clock.fastForward(121100);
 await resets.getByText('Awaiting Meta update',{exact:true}).waitFor();assert.equal(await usageReads(),beforeDeadline+1);assert.equal(await dialog.getByRole('progressbar',{name:'Current window remaining',exact:true}).getAttribute('value'),'0');
 const afterDeadline=await usageReads();await page.clock.fastForward(15000);assert.equal(await usageReads(),afterDeadline);
 pass('Scheduled reset triggers one read; stale Meta observation keeps the real bar and does not spin');await shot('resets-awaiting');
 await setResetWindows([{...resetWindows[0],remainingPercent:100,resetsAt:new Date(resetNow+18000000).toISOString()},resetWindows[1]]);
 await resets.getByRole('button',{name:'Refresh usage',exact:true}).click();await dialog.getByText('100% left',{exact:true}).waitFor();pass('Only a new provider observation refills the usage bar');
 await setResetWindows([]);await resets.getByRole('button',{name:'Refresh usage',exact:true}).click();await resets.getByText('Meta has not reported subscription reset times yet.').waitFor();
 assert.equal(await resets.locator('time').count(),0);pass('Unavailable allowance never becomes a zero reset balance or an invented date');
 await setResetWindows([{...resetWindows[0],remainingPercent:64,resetsAt:new Date(resetNow+18000000).toISOString()},resetWindows[1]]);
 await resets.getByRole('button',{name:'Refresh usage',exact:true}).click();await dialog.getByText('9% left',{exact:true}).waitFor();await shot('resets');
 if(desktop){
  const states=await page.evaluate(async()=>({work:await window.musebench.workState(),sites:await window.musebench.sitesState()}));
  for(const name of ['work','sites'])for(const busy of [true,false]){
   await app.evaluate((_electron,{name,state,busy})=>{const f=globalThis.__billingFixture;f.state.busy=busy;f.sender.send('musebench:'+name+'-update',{...state,busy});},{name,state:states[name],busy});
   await page.waitForFunction(expected=>document.querySelector('.billing-source-options button').disabled===expected,busy);
  }
  pass('Billing controls unlock when Work and Sites finish without refocus');
 }
 await resets.getByRole('button',{name:'View subscription plans',exact:true}).click();assert.equal(await dialog.getByRole('radio').count(),4);
 const beforePlans=await usageReads();await page.clock.fastForward(300001);assert.equal(await usageReads(),beforePlans);pass('Leaving Overview cancels its reset polling');
 await dialog.getByRole('radio',{name:/Power Usage/}).click();assert.equal(await dialog.getByRole('radio',{name:/Power Usage/}).getAttribute('aria-checked'),'true');
 await dialog.getByRole('button',{name:/Continue to Meta checkout/}).click();await dialog.getByText('Preview only. No checkout or purchase was started.').waitFor();await shot('plans');pass('Four plans, selected plan, subscription checkout and explicit simulated outcome');
 if(desktop)await app.evaluate(()=>{globalThis.__billingFixture.failNextCheckout=true;});
 await dialog.getByRole('button',{name:/Open API payments/}).click();
 if(desktop)await dialog.getByText(/Fixture checkout could not open/).waitFor();
 await dialog.getByRole('button',{name:'Open in browser',exact:true}).click();
 if(desktop)assert.deepEqual(await app.evaluate(()=>globalThis.__billingFixture.checkouts),[{destination:'subscriptions',external:false},{destination:'apiBilling',external:false},{destination:'apiBilling',external:true}]);
 pass('API payments and browser fallback dispatch independently from subscription selection');
 await dialog.getByRole('tab',{name:'Overview',exact:true}).click();await dialog.getByRole('radio',{name:/API billing/}).click();
 const field=dialog.getByLabel('Meta API key',{exact:true});await field.fill('fixture-not-a-real-api-key');assert.equal(await field.getAttribute('type'),'password');
 await dialog.getByRole('button',{name:'Save & use API',exact:true}).click();await dialog.getByText('API billing is selected. Subscription allowance is separate.').waitFor();assert.equal(await field.count(),0);
 await resets.getByText('API billing uses pay-as-you-go credits. Subscription resets do not apply.').waitFor();assert.equal(await resets.locator('time').count(),0);pass('API selection hides subscription reset countdowns');
 assert.ok(!(await page.evaluate(()=>window.musebench.codeBilling({type:'status'})).then(JSON.stringify)).includes('fixture-not-a-real-api-key'));pass('API key input clears and never returns through billing state');
 await dialog.getByRole('button',{name:'This is my API billing account',exact:true}).click();await dialog.getByText('Billing account linked to this API key’s usage display.').waitFor();await shot('api-overview');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Profile menu',exact:true}).click();await page.getByText(/API · \$125\.00 free credits/).waitFor();pass('Compact usage switches to the confirmed API billing account');
 await page.getByRole('menuitem',{name:'Usage',exact:true}).click();await dialog.getByRole('radio',{name:/Muse Code account/}).click();await dialog.getByText('9% left',{exact:true}).waitFor();pass('Account selection restores subscription allowance');
 await dialog.getByRole('tab',{name:'Analytics',exact:true}).click();await dialog.getByRole('heading',{name:'Activity history',exact:true}).waitFor();pass('Analytics remains reachable');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error);if(app)report.observedWindows=app.windows().filter(p=>!p.isClosed()).map(p=>p.url().split(/[?#]/)[0]);if(page)await shot('failure').catch(()=>{});throw error;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await app?.close();await browser?.close();await server?.close();console.log('Report '+path.join(output,'report.json'));}
