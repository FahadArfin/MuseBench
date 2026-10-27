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
 if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}else res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);
 }catch{res.statusCode=404;res.end();}});}}]});await server.listen();
// Headless Chromium hides scrollbars by default; desktop reserves their width.
const browser=await chromium.launch({ignoreDefaultArgs:['--hide-scrollbars']});let app;
const errors=[],report={checks:[],errors,status:'running'};
try{
 const browserPage=await browser.newPage({viewport:{width:1440,height:960},timezoneId:'America/New_York'});
 const env={...process.env,MUSEBENCH_PARITY_DATA:await mkdtemp(path.join(output,'profile-'))};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});
 await app.evaluate(async({BrowserWindow})=>{const window=new BrowserWindow({width:1440,height:960,useContentSize:true,show:false,backgroundColor:'#181818',...(process.platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:{height:42,color:'#181818',symbolColor:'#eeeeee'}}:{}),webPreferences:{backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void window.loadURL('http://127.0.0.1:4322/__desktop__/index.html');});
 console.log('Electron fixture window created');
 const desktopPage={evaluate:async(fn,arg)=>app.evaluate(async({BrowserWindow},{code,arg})=>BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`(${code})(${JSON.stringify(arg)})`,true),{code:fn.toString(),arg}),waitForTimeout:ms=>new Promise(resolve=>setTimeout(resolve,ms)),screenshot:async({path:file})=>{const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(file,Buffer.from(png,'base64'));}};
 await browserPage.addInitScript({content:offline});browserPage.setDefaultTimeout(15000);browserPage.setDefaultNavigationTimeout(60000);browserPage.on('pageerror',error=>errors.push(error.message));
 console.log('Loading browser preview');await browserPage.goto('http://127.0.0.1:4322/preview.html',{waitUntil:'domcontentloaded'});console.log('Browser preview loaded');
 await browserPage.getByRole('button',{name:'Profile menu',exact:true}).waitFor();
 for(let i=0;i<100;i++){if(await desktopPage.evaluate(()=>!!document.querySelector('button[aria-label="Profile menu"]')))break;await desktopPage.waitForTimeout(100);}
 const measure=page=>page.evaluate(()=>[...document.querySelectorAll('#root button,#root input,#root textarea,#root h1,#root h2,#root .topbar,#root .sidebar,#root [role="dialog"]')].filter(element=>!element.closest('.personal-browser-slot')&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0).map(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return {tag:element.tagName,label:element.getAttribute('aria-label')||element.textContent?.trim(),class:element.className,box:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10),font:s.font,color:s.color,background:s.backgroundColor,border:s.borderRadius};}));
 async function compare(name){
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
  const [a,b]=await Promise.all([measure(browserPage),measure(desktopPage)]);
  const differences=[];if(a.length!==b.length)differences.push(`Element count ${a.length} / ${b.length}`);
  for(let i=0;i<Math.min(a.length,b.length);i++){const {box:abox,...aa}=a[i],{box:bbox,...bb}=b[i];if(JSON.stringify(aa)!==JSON.stringify(bb)||abox.some((n,j)=>Math.abs(n-bbox[j])>1))differences.push({index:i,browser:a[i],electron:b[i]});}
  await writeFile(path.join(output,`${name}.json`),JSON.stringify({browser:a,electron:b,differences},null,2));
  await browserPage.screenshot({path:path.join(output,`${name}-browser.png`)});await desktopPage.screenshot({path:path.join(output,`${name}-electron.png`)});
  assert.deepEqual(differences,[],`${name}: browser and production Electron renderer differ`);report.checks.push(name);console.log(`PASS ${name}: ${a.length} shared controls match structure, styles and geometry (1px tolerance)`);
 }
 async function click(selector,label){for(const page of [browserPage,desktopPage])await page.evaluate(({selector,label})=>{const elements=[...document.querySelectorAll(selector)].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);const element=elements.find(e=>(e.getAttribute('aria-label')||e.textContent?.trim())===label);if(!element)throw Error(`Missing visible control ${selector} ${label}`);element.click();},{selector,label});}
 async function escape(){for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));}
 await compare('code-chat');
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})));await compare('history-search');await click('button','History');await compare('history-source');await click('button','Add excerpt to draft');await compare('history-draft');await escape();
 await click('button','Add to chat');await click('button','Skills');await compare('skills-picker');await click('button','Close skills');
 await click('button','Add to chat');await click('button','Worktrees');await compare('worktrees-dialog');await click('button','Close worktrees');
 await click('button','Add to chat');await click('button','Session');await compare('session-dialog');await click('button','Close session');
 await click('button','View changes');await compare('file-changes');
 await click('summary','Choose editor for src/ProjectOverview.tsx');await compare('file-editor-menu');
 await click('button','Close details panel');
 for(const text of ['Polish the toolbar','Check keyboard navigation','Review the mobile layout']){for(const page of [browserPage,desktopPage])await page.evaluate(text=>{const input=document.querySelector('textarea[aria-label="Message Muse"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));},text);await click('button','Queue message');}
 await compare('prompt-queue');
 for(let index=0;index<3;index++)await click('button','Remove queued prompt 1');

 await click('button','Reasoning effort');await compare('reasoning-picker');await click('button','Load installed models');await compare('native-model-catalog');await escape();
 await click('button','Add to chat');await click('button','Workflows');await compare('workflow-library');await click('button','Edit');await compare('workflow-editor');await click('button','Close dialog');
 await click('button','Project overview');await compare('project-overview');
 await click('button','Reasoning effort');await compare('project-reasoning-picker');await escape();
 await click('button','Add project');await compare('create-project');await escape();
 for(const page of [browserPage,desktopPage])await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:',',ctrlKey:true,bubbles:true})));await compare('settings');await escape();
 await click('button','Customize');await compare('customize');await click('summary','Project skills and rules');await click('button','Review project instructions');await compare('project-instruction-review');await click('button','Hooks');await compare('project-hooks');await click('button','Add hook');await compare('project-hook-editor');await escape();
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
 assert.deepEqual(errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);console.error(report.failure);process.exitCode=1;}
finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}await browser.close();await server.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
