// Shared renderer only, in isolated profiles. Never contacts Muse or spends usage.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';
import {checkMotionRefinements} from './motion-refinement-checks.mjs';

const desktop=process.argv.includes('--desktop'),audit=process.argv.includes('--audit');
const variant=desktop?'desktop':'preview';
await mkdir('artifacts/motion',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/motion',`${audit?'before-':''}${variant}-`));
const report={variant,checks:[],errors:[],screenshots:[],samples:{},providerCalls:0};
let server,browser,app,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
const settle=()=>page.evaluate(async()=>{
 document.body.getBoundingClientRect();
 await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));
});
async function disclosureFrames(button){
 return button.evaluate(button=>new Promise(resolve=>{
  const content=document.getElementById(button.getAttribute('aria-controls'));
  const frames=[],start=performance.now();
  const sample=()=>{frames.push({t:performance.now()-start,height:content.getBoundingClientRect().height,inert:content.inert,hidden:content.getAttribute('aria-hidden')});if(performance.now()-start<450)requestAnimationFrame(sample);else resolve(frames);};
  button.click();requestAnimationFrame(sample);
 }));
}
async function entrance(button,selector){
 return button.evaluate((button,selector)=>new Promise(resolve=>{
  button.click();requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const element=document.querySelector(selector);
   resolve(element?{opacity:Number(getComputedStyle(element).opacity),animations:element.getAnimations().filter(a=>a.playState==='running').length}:null);
  }));
 }),selector);
}
try{
 const offline=`window.fetch=async(input)=>{if(String(input).includes('/__musebench_snapshots/manifest.json'))return new Response(JSON.stringify({version:1,pages:{}}));throw Error('Offline motion fixture');};`;
 const fixture=offline+(await build({stdin:{contents:"import {createPreviewBridge} from './src/preview/bridge.ts';window.musebench=createPreviewBridge();",resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-motion',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'motion-production-fixture',configureServer(server){server.middlewares.use('/__motion__',async(req,res)=>{
  const file=(req.url??'').split('?')[0];
  try{
   if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
   if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
   let bytes=await readFile(path.join(process.cwd(),'dist',file));
   if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}
   else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');
   res.end(bytes);
  }catch{res.statusCode=404;res.end();}
 });}}]});await server.listen();
 const origin=server.resolvedUrls.local[0];
 if(desktop){
  const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['scripts/preview-parity-electron.mjs','--disable-features=CalculateNativeWinOcclusion','--disable-renderer-backgrounding','--disable-background-timer-throttling'],env});
  const created=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow},url)=>{const window=new BrowserWindow({width:1440,height:960,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});window.webContents.setFrameRate(60);void window.loadURL(url);},origin+'__motion__/index.html');
  page=await created;
 }else{
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'no-preference',...(!audit?{recordVideo:{dir:output,size:{width:1440,height:960}}}:{})});
  await page.addInitScript({content:offline});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(origin+'preview.html');
 }
 page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.getByRole('button',{name:'Profile menu',exact:true}).waitFor();await settle();
 const muse=page.getByRole('button',{name:'Expand Muse',exact:true});if(await muse.count())await muse.click();await settle();
 await shot('muse-sidebar');
 const collapseChat=page.getByRole('button',{name:'Collapse Chat',exact:true});
 const maximum=await collapseChat.evaluate(button=>document.getElementById(button.getAttribute('aria-controls')).getBoundingClientRect().height);
 report.samples.collapse=await disclosureFrames(collapseChat);
 const intermediate=report.samples.collapse.some(f=>f.height>1&&f.height<maximum-1);
 if(!audit)assert(intermediate,'Chat collapse must interpolate through visible intermediate heights');
 else report.baseline={chatInterpolates:intermediate};
 if(!audit)pass('Sidebar collapse interpolates real layout rather than snapping');
 if(!audit){
  const expand=page.getByRole('button',{name:'Expand Chat',exact:true});
  report.samples.expand=await disclosureFrames(expand);
  assert(report.samples.expand.some(f=>f.height>1&&f.height<maximum-1));
  const focus=await page.getByRole('button',{name:'Collapse Chat',exact:true}).evaluate(button=>new Promise(resolve=>{
   const content=document.getElementById(button.getAttribute('aria-controls'));content.querySelector('button').focus();button.click();
   requestAnimationFrame(()=>resolve({trigger:document.activeElement===button,inert:content.inert,aria:content.getAttribute('aria-hidden')}));
  }));assert.deepEqual(focus,{trigger:true,inert:true,aria:'true'});
  pass('Collapsing focused content returns focus immediately and makes descendants inert');
  const reversal=await page.getByRole('button',{name:'Expand Chat',exact:true}).evaluate(button=>new Promise(resolve=>{
   const content=document.getElementById(button.getAttribute('aria-controls'));let n=0;
   const toggle=()=>{button.click();if(++n<5)setTimeout(toggle,45);else setTimeout(()=>resolve({expanded:button.getAttribute('aria-expanded'),height:content.getBoundingClientRect().height,inert:content.inert,animations:content.getAnimations().length}),400);};toggle();
  }));assert.equal(reversal.expanded,'true');assert.equal(reversal.inert,false);assert.equal(reversal.animations,0);assert(Math.abs(reversal.height-maximum)<1);
  pass('Five rapid reversals settle at the correct height with no queued transitions');
 }
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();await settle();await shot('code-chat');
 if(!audit)await checkMotionRefinements({page,pass,report,shot});
 if(!audit){
  for(const name of ['Pinned chats','Recents','MuseBench sample']){
   const trigger=page.getByRole('button',{name:`Collapse ${name}`,exact:true});
   const before=await trigger.evaluate(button=>document.getElementById(button.getAttribute('aria-controls')).getBoundingClientRect().height);
   const frames=await disclosureFrames(trigger);
   if(name!=='Pinned chats')assert(frames.some(f=>f.height>1&&f.height<before-1),'Nonempty Code groups interpolate between their endpoints');
   assert(frames.at(-1).height<1);
   if(name==='MuseBench sample')assert.equal(await page.locator('.project-chats .sidebar-chat').count(),0,'Closed projects release hidden chat DOM after the transition');
   await page.getByRole('button',{name:`Expand ${name}`,exact:true}).click();await settle();
   if(name==='MuseBench sample'){
    const reversed=await page.getByRole('button',{name:`Collapse ${name}`,exact:true}).evaluate(button=>new Promise(resolve=>{
     const content=document.getElementById(button.getAttribute('aria-controls'));let n=0;
     const toggle=()=>{button.click();if(++n<6)setTimeout(toggle,45);else setTimeout(()=>resolve({expanded:button.getAttribute('aria-expanded'),height:content.getBoundingClientRect().height,rows:content.querySelectorAll('.sidebar-chat').length,inert:content.inert,animations:content.getAnimations().length}),450);};toggle();
    }));assert.equal(reversed.expanded,'true');assert.equal(reversed.inert,false);assert.equal(reversed.animations,0);assert(reversed.rows>0);assert(Math.abs(reversed.height-before)<1);
   }
  }
  pass('Code projects, pinned and recent groups use reversible disclosure motion');
  const composer=page.getByRole('textbox',{name:'Message Muse',exact:true});await composer.fill('Motion draft stays here');
  await composer.evaluate(element=>window.__motionComposer=element);
  const other=page.locator('.project-chats').getByRole('button',{name:'Polish the chat composer',exact:true});
  report.samples.chatFade=await entrance(other,'.workspace:not([hidden])');assert(report.samples.chatFade.animations>0);await settle();
  await page.locator('.project-chats').getByRole('button',{name:'Build a clearer project overview',exact:true}).click();await settle();
  assert.equal(await composer.inputValue(),'Motion draft stays here');assert(await composer.evaluate(element=>element===window.__motionComposer));
  pass('Chat navigation fades without remounting the composer or losing its draft');
  await page.evaluate(()=>{window.__motionAnimations=[];const original=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.matches('.workspace'))window.__motionAnimations.push(this.className);return original.apply(this,args);};});
  await composer.fill('Only simulated streaming');await page.getByRole('button',{name:'Send message',exact:true}).click();await settle();
  assert.deepEqual(await page.evaluate(()=>window.__motionAnimations),[]);pass('Same-chat message updates do not replay workspace navigation animation');
  await page.getByRole('button',{name:'Project overview',exact:true}).click();await settle();
  await composer.fill('Only simulated composer transition');
  await page.getByRole('button',{name:'Create task',exact:true}).evaluate(button=>button.click());
  await page.waitForFunction(()=>document.querySelector('.composer-shell')?.getAnimations().some(a=>a.effect.getTiming().duration===420));
  await page.emulateMedia({reducedMotion:'reduce'});
  const flip=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({count:document.querySelector('.composer-shell').getAnimations().length,transform:getComputedStyle(document.querySelector('.composer-shell')).transform})))));
  assert.deepEqual(flip,{count:0,transform:'none'},'OS preference changes must cancel the in-flight composer FLIP');
  await page.emulateMedia({reducedMotion:'no-preference'});await settle();
  pass('An OS preference change interrupts the existing composer move immediately');
 }
 report.samples.menu=await entrance(page.getByRole('button',{name:'Profile menu',exact:true}),'.profile-popover');if(!audit)assert(report.samples.menu.animations>0);await settle();await shot('profile-menu');
 report.samples.dialog=await entrance(page.getByRole('menuitem',{name:/^Settings/}),'.settings-modal');if(!audit)assert(report.samples.dialog.animations>0);await settle();await shot('settings');
 if(!audit){
  report.samples.settings=await entrance(page.getByRole('button',{name:'Notifications',exact:true}),'.settings-content');assert(report.samples.settings.animations>0);
  for(const label of ['General','Notifications','General','Notifications'])await page.getByRole('button',{name:label,exact:true}).evaluate(button=>button.click());
  assert(await page.locator('.settings-content').evaluate(element=>element.getAnimations().filter(a=>a.playState==='running').length<=1));await settle();
  pass('Menus, dialogs and settings enter gently; rapid tab switches retain at most one fade');
  await page.getByRole('button',{name:'General',exact:true}).click();await settle();
  await page.getByRole('switch',{name:'Reduce motion',exact:true}).click();
  const reduced=await entrance(page.getByRole('button',{name:'Notifications',exact:true}),'.settings-content');assert.equal(reduced.animations,0);assert.equal(reduced.opacity,1);
  await page.getByRole('button',{name:'General',exact:true}).click();await page.getByRole('switch',{name:'Reduce motion',exact:true}).click();await settle();
  // Change the app preference during an actual in-flight navigation fade.
  await page.getByRole('button',{name:'Notifications',exact:true}).evaluate(button=>{button.click();requestAnimationFrame(()=>document.documentElement.dataset.reducedMotion='true');});
  await page.waitForFunction(()=>document.querySelector('.settings-content').getAnimations().length===0);
  assert.equal(await page.locator('.settings-content').evaluate(element=>getComputedStyle(element).opacity),'1');
  await page.evaluate(()=>document.documentElement.dataset.reducedMotion='false');
  pass('App reduced motion suppresses entrances and cancels an in-flight scripted fade');
  await page.getByRole('button',{name:'General',exact:true}).click();await page.getByRole('button',{name:'Light theme',exact:true}).click();await settle();await shot('light-settings');
  await page.getByRole('button',{name:'Dark theme',exact:true}).click();await settle();
 }
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:'Customize',exact:true}).click();await settle();await shot('customize');
 if(!audit){
  report.samples.catalog=await entrance(page.getByRole('tab',{name:'Plugins',exact:true}),'#customize-content');assert(report.samples.catalog.animations>0);await settle();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  // Reopen billing from the actual menu and exercise the tab identity fade.
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();await page.getByRole('menuitem',{name:'Usage',exact:true}).click();await settle();
  const billing=await entrance(page.getByRole('tab',{name:'Analytics',exact:true}),'.modal [role="tabpanel"]');assert(billing.animations>0);await settle();await shot('billing-analytics');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();await settle();
  const native=page.locator('.personal-browser-slot');
  assert.equal(await native.evaluate(element=>getComputedStyle(element).transform),'none');
  const work=await entrance(page.getByRole('button',{name:'Work',exact:true}),'.work-workspace:not([hidden])');assert(work.animations>0);await settle();await shot('work-home');
  const sites=await entrance(page.getByRole('button',{name:'All sites',exact:true}),'.sites-workspace:not([hidden])');assert(sites.animations>0);await settle();
  const spaces=await entrance(page.getByRole('button',{name:'All spaces',exact:true}),'.spaces-workspace');assert(spaces.animations>0);await settle();await shot('spaces-home');
  await page.getByRole('button',{name:'Chat',exact:true}).click();await settle();
  pass('Billing, Work, Sites and Spaces share navigation fades; native browser hosts stay untransformed');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();await settle();
  if(await page.getByRole('button',{name:'Expand Muse',exact:true}).count())await page.getByRole('button',{name:'Expand Muse',exact:true}).click();
  const frames=await disclosureFrames(page.getByRole('button',{name:'Collapse Chat',exact:true}));assert(frames.every(f=>f.height===0));
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  await page.getByRole('button',{name:'Expand Chat',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Main conversation',exact:true}).isVisible(),true);
  pass('OS reduced motion settles disclosures instantly and removes delayed/infinite CSS motion');
  await page.emulateMedia({reducedMotion:'no-preference',colorScheme:'light'});
  await page.setViewportSize({width:520,height:820});
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await settle();await shot('narrow-navigation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  pass('Narrow navigation remains usable without horizontal overflow');
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;if(page)await shot('failure').catch(()=>{});process.exitCode=1;console.error(error);}
finally{if(!desktop&&page?.video())report.video=await page.video().path();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));await app?.close();await browser?.close();await server?.close();}
