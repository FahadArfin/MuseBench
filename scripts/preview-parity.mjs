import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const output=path.resolve('artifacts/preview-parity');await mkdir(output,{recursive:true});
const offline=`window.fetch=async(input)=>{if(String(input).includes('/__musebench_snapshots/manifest.json'))return new Response(JSON.stringify({version:1,pages:{}}),{status:200,headers:{'Content-Type':'application/json'}});throw Error('Network unavailable in parity fixtures');};`;
const fixture=offline+(await build({stdin:{contents:"import {createPreviewBridge} from './src/preview/bridge.ts';window.musebench=createPreviewBridge();",resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-parity',server:{host:'127.0.0.1',port:4322,strictPort:true},plugins:[{name:'production-renderer-fixture',configureServer(server){server.middlewares.use('/__desktop__',async(req,res)=>{const file=(req.url??'').split('?')[0];try{
 if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
 let bytes=await readFile(path.join(process.cwd(),'dist',file));
 if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);
 }catch{res.statusCode=404;res.end();}});}}]});await server.listen();
// Headless Chromium hides scrollbars by default; desktop reserves their width.
const browser=await chromium.launch({ignoreDefaultArgs:['--hide-scrollbars']});let app;
const errors=[],report={checks:[],errors,status:'running'};
try{
 const browserPage=await browser.newPage({viewport:{width:1440,height:960},timezoneId:Intl.DateTimeFormat().resolvedOptions().timeZone});
 const env={...process.env,MUSEBENCH_PARITY_DATA:await mkdtemp(path.join(output,'profile-'))};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:['scripts/preview-parity-electron.mjs','--disable-features=CalculateNativeWinOcclusion','--disable-renderer-backgrounding','--disable-background-timer-throttling'],env});
 // A normally hidden Windows window may stall at an entrance's first frame.
 // Use the motion suite's deterministic compositor; native windows have separate tests.
 await app.evaluate(async({BrowserWindow})=>{const window=new BrowserWindow({width:1440,height:960,useContentSize:true,show:false,backgroundColor:'#181818',...(process.platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:{height:42,color:'#181818',symbolColor:'#eeeeee'}}:{}),webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});window.webContents.setFrameRate(60);void window.loadURL('http://127.0.0.1:4322/__desktop__/index.html');});
 console.log('Electron fixture window created');
 const desktopPage={evaluate:async(fn,arg)=>app.evaluate(async({BrowserWindow},{code,arg})=>BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`(${code})(${JSON.stringify(arg)})`,true),{code:fn.toString(),arg}),waitForTimeout:ms=>new Promise(resolve=>setTimeout(resolve,ms)),screenshot:async({path:file})=>{const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(file,Buffer.from(png,'base64'));}};
 await browserPage.addInitScript({content:offline});browserPage.setDefaultTimeout(15000);browserPage.setDefaultNavigationTimeout(60000);browserPage.on('pageerror',error=>errors.push(error.message));
 console.log('Loading browser preview');await browserPage.goto('http://127.0.0.1:4322/preview.html',{waitUntil:'domcontentloaded'});console.log('Browser preview loaded');
 await browserPage.getByRole('button',{name:'Profile menu',exact:true}).waitFor();
 for(let i=0;i<100;i++){if(await desktopPage.evaluate(()=>!!document.querySelector('button[aria-label="Profile menu"]')))break;await desktopPage.waitForTimeout(100);}
 // Reproduce staggered native-details animation starts on a slow hidden renderer.
 if(process.argv.includes('--slow-details'))await desktopPage.evaluate(()=>{const style=document.createElement('style');style.textContent='.app details::details-content{transition-duration:900ms!important;transition-delay:180ms!important}';document.head.append(style);});
 const measure=page=>page.evaluate(()=>[...document.querySelectorAll('#root button,#root input,#root textarea,#root h1,#root h2,#root .topbar,#root .sidebar,#root [role="dialog"]')].filter(element=>!element.closest('.personal-browser-slot')&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0).map(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return {tag:element.tagName,label:element.getAttribute('aria-label')||element.textContent?.trim(),class:element.className,box:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10),font:s.font,color:s.color,background:s.backgroundColor,border:s.borderRadius};}));
 async function compare(name){
  const zones=await Promise.all([browserPage,desktopPage].map(page=>page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone)));
  assert.equal(zones[0],zones[1],'Parity fixtures must use the same host time zone');report.timezone=zones[0];
  // Windows can clamp hidden native windows to the runner's physical display.
  // Compare the same real content viewport, including narrow-window scenes.
  const [width,height]=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getContentSize());
  await browserPage.setViewportSize({width,height});
  report.viewports??={};report.viewports[name]={width,height};
  // Compare actual bundled font metrics, not an early fallback-font frame.
  await Promise.all([browserPage,desktopPage].map(page=>page.evaluate(()=>document.fonts.ready.then(()=>undefined))));
  // Wait for layout/motion, not requests to external services.
  await Promise.all([browserPage,desktopPage].map(page=>page.waitForTimeout(250)));
  for(const page of [browserPage,desktopPage]){
   const placement=await page.evaluate(()=>{
    const toggle=[...document.querySelectorAll('[aria-label="Chat or Work"]')].find(e=>e.getBoundingClientRect().width>0);
    if(!toggle)return null;
    const workspace=toggle.closest('.workspace'),header=workspace.querySelector('.topbar');
    const t=toggle.getBoundingClientRect(),w=workspace.getBoundingClientRect(),h=header.getBoundingClientRect();
    return {centerOffset:Math.abs(t.x+t.width/2-w.x-w.width/2),belowHeader:t.y-h.bottom};
   });
   if(placement){assert.ok(placement.centerOffset<=1,`${name}: mode switch must remain centered`);assert.ok(placement.belowHeader>=24,`${name}: mode switch needs space below the title bar`);}
  }
  // Native hidden windows and Chromium can start transitions on different frames.
  // Measure settled UI, including the finite brand typing and sidebar accordion.
  const settled=await Promise.all([browserPage,desktopPage].map(page=>page.evaluate(async()=>{
   document.body.getBoundingClientRect();
   const animations=document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity);
   // Chromium does not expose ::details-content transitions in getAnimations().
   // Include their computed duration/delay rather than sampling a closing frame.
   const ms=value=>parseFloat(value)*(value.trim().endsWith('ms')?1:1000);
   const nativeWait=Math.max(0,...[...document.querySelectorAll('.app details')].filter(el=>el.getBoundingClientRect().width>0).flatMap(el=>{
    const style=getComputedStyle(el,'::details-content'),durations=style.transitionDuration.split(',').map(ms),delays=style.transitionDelay.split(',').map(ms);
    return durations.map((duration,index)=>Math.max(0,duration+delays[index%delays.length]));
   }).filter(Number.isFinite));
   if(nativeWait>3000)throw Error('Native disclosure transition exceeds the parity settling budget');
   await Promise.all([new Promise(resolve=>setTimeout(resolve,nativeWait)),Promise.race([Promise.allSettled(animations.map(a=>a.finished)),new Promise(resolve=>setTimeout(resolve,3000))])]);
   const unsettled=document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity&&a.playState==='running');
   if(unsettled.length)throw Error('Finite renderer motion did not settle before geometry capture');
   return {scriptedAnimations:animations.length,nativeDetailsWaitMs:nativeWait};
  })));
  report.motionSettling??={};report.motionSettling[name]=settled;
  const [a,b]=await Promise.all([measure(browserPage),measure(desktopPage)]);
  const differences=[];if(a.length!==b.length)differences.push(`Element count ${a.length} / ${b.length}`);
  for(let i=0;i<Math.min(a.length,b.length);i++){const {box:abox,...aa}=a[i],{box:bbox,...bb}=b[i];if(JSON.stringify(aa)!==JSON.stringify(bb)||abox.some((n,j)=>Math.abs(n-bbox[j])>1))differences.push({index:i,browser:a[i],electron:b[i]});}
  await writeFile(path.join(output,`${name}.json`),JSON.stringify({browser:a,electron:b,differences},null,2));
  await browserPage.screenshot({path:path.join(output,`${name}-browser.png`)});await desktopPage.screenshot({path:path.join(output,`${name}-electron.png`)});
  assert.deepEqual(differences,[],`${name}: browser and production Electron renderer differ`);report.checks.push(name);console.log(`PASS ${name}: ${a.length} shared controls match structure, styles and geometry (1px tolerance)`);
 }
 async function click(selector,label){for(const page of [browserPage,desktopPage]){let clicked=false;for(let tries=0;tries<60&&!clicked;tries++){clicked=await page.evaluate(({selector,label})=>{const element=[...document.querySelectorAll(selector)].find(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&!e.disabled&&(e.getAttribute('aria-label')||e.textContent?.trim())===label);if(!element)return false;element.click();return true;},{selector,label});if(!clicked)await new Promise(r=>setTimeout(r,75));}assert.ok(clicked,`Missing enabled control ${selector} ${label}`);}}

 async function escape(){for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));}
 await compare('default-muse-ai');
 await click('button','Profile menu');await click('button','Usage');await click('button','Analytics');await compare('usage-analytics-week');await click('button','30d');await compare('usage-analytics-month');await escape();

 await click('button','Muse Code');
 await compare('code-chat');
 await click('button','Approval access');await compare('composer-access-menu');await click('[role="menuitemcheckbox"]','Full access');await click('button','Approval access');await compare('composer-full-access');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.fullAccess),true);
 await click('[role="menuitemcheckbox"]','Full access');await compare('composer-sandbox-restored');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.fullAccess),false);
 await click('button','Add to chat');await click('button','Workspace tools');await compare('workspace-tools');await click('summary','Input and result contract');await compare('workspace-tool-contract');
 await click('summary','Input and result contract');await compare('workspace-tool-contract-collapsed');
 await desktopPage.evaluate(()=>{const style=document.createElement('style');style.id='parity-details-delay';style.textContent='.app details::details-content{transition-duration:900ms!important;transition-delay:180ms!important}';document.head.append(style);});
 await click('summary','Input and result contract');await compare('workspace-tool-contract-delayed');
 await desktopPage.evaluate(()=>document.getElementById('parity-details-delay').remove());
 await click('button','Open Code navigation');await compare('semantic-navigation');await click('button','Find symbol');await compare('semantic-navigation-results');for(const page of [browserPage,desktopPage])assert.ok(await page.evaluate(()=>document.querySelector('[aria-label="Code navigation results"]')?.textContent.includes('src/ProjectOverview.tsx:1:17')));await click('button','Close dialog');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})));await compare('history-search');await click('button','History');await compare('history-source');await click('button','Add excerpt to draft');await compare('history-draft');await escape();
 await click('button','Add to chat');await click('button','Skills');await compare('skills-picker');await click('button','Close skills');
 await click('button','Add to chat');await click('button','Worktrees');await compare('worktrees-dialog');await click('button','Close worktrees');
 await click('button','Add to chat');await click('button','Files & project context');await click('[role="tab"]','What Muse receives');await compare('context-receipt');await click('[role="tab"]','Lessons');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{for(const [label,value]of [['Lesson title','Use existing tests'],['Project lesson','Run the existing project tests before delivery.']]){const input=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}});
 await click('button','Propose lesson');await compare('lesson-proposed');await click('button','Accept lesson');await compare('lesson-accepted');await click('button','Revoke lesson');await compare('lesson-revoked');await click('button','Close dialog');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'/checkpoints');input.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('[role="option"][title^="/checkpoints"]')?.click());await click('button','Sample accepted revision');await compare('checkpoint-restore');await click('button','Close dialog');
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await window.musebench.dispatch({type:'sendMessage',text:'Simulated interactive run'});});await compare('interactive-running');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Use the corrected requirement');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Steer current turn');await compare('interactive-steered');
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'disconnectMuse'});await window.musebench.dispatch({type:'connectMuse',transport:'exec',fullAccess:false});});
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});});
 await click('button','Add to chat');await click('button','Session');await compare('compaction-ready');await click('button','Compact context');await compare('compaction-result');await compare('native-children');await click('button','Read activity');await compare('native-child-activity');await click('button','Hide activity');await compare('native-child-activity-collapsed');for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Child message"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Review the updated keyboard controls');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Follow-up task');await compare('native-child-admission');await click('button','Retry attempt');await compare('workflow-child-admission');await click('button','Close session');await compare('child-only-running');await click('button','Session controls');await compare('child-controls-while-running');await click('button','Close session');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Wait until the child report finishes');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Queue message');await compare('child-only-queue');
 for(const page of [browserPage,desktopPage]){const queued=await page.evaluate(async()=>(await window.musebench.getState()).task.promptQueue.some(p=>p.text==='Wait until the child report finishes'));assert.equal(queued,true,'Child-only Enter must queue instead of steering the completed foreground turn');}
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'disconnectMuse'});await window.musebench.dispatch({type:'connectMuse',transport:'exec',fullAccess:false});});
 await click('button','Add to chat');await click('button','Session');await compare('session-dialog');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Reviewer question"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Review keyboard interaction');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Start independent review');await compare('reviewer-chat');await click('button','Add to chat');await click('button','Session');await compare('reviewer-contract');await click('button','Add findings to parent draft');await compare('review-parent-draft');

 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'/checks');input.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('[role="option"][title^="/checks"]')?.click());await compare('validation-profile');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const checkbox=document.querySelector('.validation-profile input[type="checkbox"]');if(!checkbox)throw Error('Missing validation profile');checkbox.click();});await click('button','Save profile');await click('button','Run profile');await compare('validation-passed');await click('button','Captured output');await compare('output-captures');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('.output-captures button')?.click());await compare('output-head');await click('button','Tail');await compare('output-tail');await click('button','Close dialog');await click('button','Close details panel');
 await click('button','Edit goal');await compare('goal-budgets');await click('button','Start bounded continuation');await compare('goal-preview-stopped');await click('button','Close dialog');
 await click('button','View changes');await compare('file-changes');
 await click('summary','Choose editor for src/ProjectOverview.tsx');await compare('file-editor-menu');
 await click('button','Close details panel');
 for(const text of ['Polish the toolbar','Check keyboard navigation','Review the mobile layout']){for(const page of [browserPage,desktopPage])await page.evaluate(text=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));},text);await click('button','Queue message');}
 await compare('prompt-queue');
 for(let index=0;index<3;index++)await click('button','Remove queued prompt 1');

 await click('button','Reasoning effort');await compare('reasoning-picker');await click('button','Load installed models');await compare('native-model-catalog');await escape();
 await click('button','Add to chat');await click('button','Workflows');await compare('workflow-library');await click('button','Edit');await compare('workflow-editor');
 for(const page of [browserPage,desktopPage]){for(const character of 'test,lint'){await page.evaluate(character=>{const input=document.querySelector('input[aria-label="Phase 1 required checks"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,input.value+character);input.dispatchEvent(new Event('input',{bubbles:true}));},character);await page.waitForTimeout(20);}assert.equal(await page.evaluate(()=>document.querySelector('input[aria-label="Phase 1 required checks"]').value),'test, lint');}await compare('workflow-required-checks');await click('button','Close dialog');
 await click('button','Project overview');await compare('project-overview');
 await click('button','Reasoning effort');await compare('project-reasoning-picker');await escape();
 await click('button','Add project');await compare('create-project');await escape();
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:',',ctrlKey:true,bubbles:true})));await compare('settings');await escape();
 await click('button','Customize');await compare('customize');await click('button','Installed');await click('summary','Skill tools');await click('button','Project instructions');await compare('project-instruction-inspector');await click('button','Project trust review');await click('button','Review project instructions');await compare('project-instruction-review');await click('button','Hooks');await compare('project-hooks');await click('button','Add hook');await compare('project-hook-editor');await click('summary','Reusable presets');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{for(const [label,value]of [['Hook 1 name','format-check'],['Hook 1 command','Write-Output reviewed'],['Hook preset name','Formatting checks']]){const input=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}});
 await click('button','Save draft as new preset');await compare('hook-preset-saved');
 for(const page of [browserPage,desktopPage]){const saved=await page.evaluate(async()=>{const s=(await window.musebench.customize({type:'refresh'})).state;return{hooks:s.hooks.items.length,presets:s.hookPresets.items.length};});assert.deepEqual(saved,{hooks:0,presets:1});await page.evaluate(()=>{const select=document.querySelector('[aria-label="Saved hook preset"]');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
 await click('button','Load into draft');await compare('hook-preset-review-required');for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save reviewed hooks')?.disabled),true);await escape();
 await click('button','Muse AI');await compare('muse-shell');
 await click('nav[aria-label="Meta AI navigation"] button','Chat');await compare('meta-shell');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(430,820));await browserPage.setViewportSize({width:430,height:820});await compare('meta-toggle-narrow');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,960));await browserPage.setViewportSize({width:1440,height:960});

 await click('button','Scheduled');await compare('scheduled-sidebar');
 await click('[aria-label="Chat or Work"] button','Work');await compare('work-home');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(430,820));await browserPage.setViewportSize({width:430,height:820});await compare('work-toggle-narrow');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,960));await browserPage.setViewportSize({width:1440,height:960});

 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('nav[aria-label="Saved work"] button')?.click());await compare('work-editor');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('All sites'))?.click());await compare('sites-home');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('Studio notes')&&e.getBoundingClientRect().width)?.click());await compare('site-editor');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('All spaces'))?.click());await compare('spaces-home');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent?.includes('Design studio')&&e.getBoundingClientRect().width)?.click());await compare('space-editor');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(430,820));await browserPage.setViewportSize({width:430,height:820});await compare('narrow-layout');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,960));await browserPage.setViewportSize({width:1440,height:960});
 await click('button','Muse Code');await click('button','New chat');await click('button','Approval access');await click('[role="menuitemcheckbox"]','Full access');await compare('new-chat-full-access');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Check the selected access');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Create task');await compare('new-chat-full-access-applied');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.fullAccess),true);
 await click('button','New chat');await click('button','Approval access');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(()=>document.querySelector('[role="menuitemcheckbox"][aria-label="Full access"]').getAttribute('aria-checked')),'false');
 await escape();
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Use sandboxed access for this chat');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Create task');await compare('new-chat-sandbox-default');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.fullAccess),false,'A new sandboxed chat must not inherit the prior connection Full access');
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'connectMuse',transport:'msp',fullAccess:true});await window.musebench.dispatch({type:'sendMessage',text:'/preview-question'});});
 await click('button','Muse has a question. Answer to continue.');await compare('native-question');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const input=document.querySelector('textarea[aria-label="Write an answer: Approach"]');input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep the existing keyboard behavior.');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('button','Send answers');await compare('native-question-answered');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.inputResponse.outcome),'answered');
 await click('button','Close dialog');
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'sendMessage',text:'/preview-question'});});await click('button','Muse has a question. Answer to continue.');await click('button','Decline to answer');await compare('native-question-declined');
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'sendMessage',text:'/preview-questions'});});await compare('native-concurrent-questions');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>{const select=document.querySelector('select[aria-label="Pending requests"]');select.value='input:preview-question-two';select.dispatchEvent(new Event('change',{bubbles:true}));});await compare('native-second-question');await click('button','Decline to answer');await compare('native-question-still-pending');for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.pendingRequests.length),1);await click('button','Decline to answer');

 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.getState()).runtime.inputResponse.outcome),'cancelled');

 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.dispatch({type:'disconnectMuse'});await window.musebench.dispatch({type:'connectMuse',transport:'msp',fullAccess:true,workspaceTools:true});});
 await compare('native-restored-session');
 for(const page of [browserPage,desktopPage]){assert.equal(await page.evaluate(()=>document.querySelector('.runtime-details')?.textContent.includes('Restored')),true);assert.equal(await page.evaluate(()=>document.querySelector('.runtime-access input[type="checkbox"]')?.checked),true);}
 await click('button','Disconnect');await compare('semantic-tools-connection-option');
 await click('button','Close dialog');
 for(const page of [browserPage,desktopPage])await page.evaluate(async()=>{await window.musebench.appUpdate('check');});
 await compare('update-available-toolbar');
 await click('button','Download update');
 for(const page of [browserPage,desktopPage])for(let n=0;n<40;n++){if(await page.evaluate(async()=>(await window.musebench.appUpdate('status')).status==='downloaded'))break;await page.waitForTimeout(100);}
 await compare('update-download-ready');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(async()=>(await window.musebench.appUpdate('status')).status),'downloaded');
 await click('button','Restart to update');await compare('update-preview-restart');
 for(const page of [browserPage,desktopPage])assert.match(await page.evaluate(async()=>(await window.musebench.appUpdate('status')).error),/Preview only/);
 await click('button','Close dialog');
 await click('button','Profile menu');for(const page of [browserPage,desktopPage])await page.evaluate(()=>[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent?.startsWith('Settings'))?.click());await click('button','Updates');await compare('settings-app-updates');
 await browserPage.goto('http://127.0.0.1:4322/preview.html?setup=1');
 await app.evaluate(async({BrowserWindow})=>BrowserWindow.getAllWindows()[0].loadURL('http://127.0.0.1:4322/__desktop__/index.html?setup=1'));
 await browserPage.getByRole('button',{name:'Profile menu',exact:true}).waitFor();
 await compare('direct-chat-startup');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(()=>document.querySelectorAll('.onboarding').length),0);
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('.muse-agent-shortcut').click());
 await compare('muse-main-and-side-chats');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>[...document.querySelectorAll('.personal-item-row')].find(e=>e.textContent==='Plan a thoughtful week').click());
 await compare('muse-selected-side-chat');
 for(const page of [browserPage,desktopPage]){
  assert.equal(await page.evaluate(()=>document.querySelector('.personal-item-row[aria-current="page"]')?.textContent),'Plan a thoughtful week');
  await page.evaluate(()=>document.querySelector('.personal-collection-title[aria-label="Chat"]').click());
  assert.equal(await page.evaluate(async()=>(await window.musebench.personalState()).library.selectedId),'sample-chat');
 }
 await compare('muse-chat-list-collapsed');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('.personal-collection-title[aria-label="Chat"]').click());
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.querySelector('.muse-agent-shortcut').click());
 await compare('muse-return-to-main');
 for(const page of [browserPage,desktopPage])assert.equal(await page.evaluate(()=>document.querySelector('.personal-item-row[aria-current="page"]')?.textContent),'Main conversation');
 assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);console.error(report.failure);process.exitCode=1;}
finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}await browser.close();await server.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
