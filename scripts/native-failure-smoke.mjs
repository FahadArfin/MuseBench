// Shared production renderer with an isolated saved failure. No model/provider calls.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';

const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/native-failure-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/native-failure-ui',variant+'-'));
const report={variant,checks:[],errors:[],providerCalls:0};let server,app,browser,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const settle=()=>page.evaluate(async()=>{document.body.getBoundingClientRect();await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));});
const fixtureSource=`import {createPreviewBridge} from './src/preview/bridge.ts';
import {diagnosticText} from './reference/patchlight/adapter/diagnostics.mjs';
const base=createPreviewBridge();let ready;
const state=()=>ready??=base.dispatch({type:'newTask',request:'Check the project tools',mode:'muse'}).then(value=>{
 const saved=sessionStorage.getItem('native-failure-fixture');if(saved)return JSON.parse(saved);
 const startedAt='2026-10-29T12:00:00Z',endedAt='2026-10-29T12:00:01Z';
 const reason=diagnosticText('invalid run configuration: Required MCP server \\u0060musebench_workspace\\u0060 failed during startup: the configured command is unavailable. <script>window.__unsafe=true</script> token=fixture-secret-value');
 value.task.messages=[{id:'failure-prompt',role:'user',text:value.task.request,at:startedAt}];
 value.task.runs=[{id:'failure-prompt',promptId:'failure-prompt',prompt:value.task.request,runId:'failure-fixture',status:'failed',startedAt,endedAt,reason,activities:[]}];
 value.task.runtimeComplete=false;value.runtime={...value.runtime,status:'failed',outcome:'failed',reason,foregroundBusy:false,childrenBusy:false,cleanup:'confirmed',queuePaused:true};
 sessionStorage.setItem('native-failure-fixture',JSON.stringify(value));return value;
});
window.musebench={...base,getState:async()=>structuredClone(await state()),onState:()=>()=>{},dispatch:async action=>{
 if(!['refresh','saveDraft'].includes(action?.type))throw Error('Unexpected action in offline failure fixture');return structuredClone(await state());
}};
window.fetch=async input=>{if(String(input).includes('/__musebench_snapshots/manifest.json'))return new Response(JSON.stringify({version:1,pages:{}}));throw Error('Offline failure fixture');};`;
try{
 const fixture=(await build({stdin:{contents:fixtureSource,resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-native-failure',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'native-failure-production-fixture',configureServer(server){server.middlewares.use('/__failure__',async(req,res)=>{
  const file=(req.url??'').split('?')[0];try{
   if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
   if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
   let bytes=await readFile(path.join(process.cwd(),'dist',file));if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);
  }catch{res.statusCode=404;res.end();}
 });}}]});await server.listen();const url=server.resolvedUrls.local[0]+'__failure__/index.html';
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['scripts/preview-parity-electron.mjs','--disable-features=CalculateNativeWinOcclusion','--disable-renderer-backgrounding','--disable-background-timer-throttling'],env});const created=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow},url)=>{const window=new BrowserWindow({width:1200,height:980,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});window.webContents.setFrameRate(60);void window.loadURL(url);},url);page=await created;
 }else{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1200,height:980}});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);}
 page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(error.message));
 const inspect=async()=>{
  await page.getByRole('button',{name:'Muse Code',exact:true}).click();await settle();
  const activity=page.getByRole('region',{name:'Request activity',exact:true});
  await activity.getByRole('button',{name:/Failed after/}).click();await settle();
  const reason=activity.locator('.work-run-reason');await reason.waitFor();
  assert.match(await reason.innerText(),/Required MCP server.*configured command is unavailable/);
  assert.match(await reason.innerText(),/<script>window.__unsafe=true<\/script>/);
  assert.equal(await reason.locator('script').count(),0);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);
  assert.doesNotMatch(await reason.innerText(),/fixture-secret-value/);assert.match(await reason.innerText(),/\[redacted\]/);
  assert.equal(await activity.locator('.run-current-action').count(),0);assert.equal(await activity.locator('.work-status-working').count(),0);
 };
 await inspect();pass('Failure is visible as plain text with credentials removed and no active spinner');
 await page.screenshot({path:path.join(output,'failure-reason.png')});
 await page.reload();await inspect();pass('Reload renders the saved explanation in the same conversation');
 await page.getByRole('button',{name:'View in Sub-Agents',exact:true}).click();await settle();
 const panel=page.getByRole('complementary',{name:'Sub-Agents panel',exact:true});
 assert.match(await panel.locator('.work-run-reason').innerText(),/configured command is unavailable/);pass('Sub-Agents activity uses the same failure explanation');
 await page.keyboard.press('Escape');await page.setViewportSize({width:520,height:820});await settle();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const reason=page.getByRole('region',{name:'Request activity',exact:true}).locator('.work-run-reason');
 assert.equal(await reason.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 await page.screenshot({path:path.join(output,'narrow-failure-reason.png')});pass('Narrow layout wraps the explanation without horizontal overflow');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));await app?.close();await browser?.close();await server?.close();}
