// Shared production renderer, with isolated preview data and no model requests.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';
const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/session-mcp-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/session-mcp-ui',variant+'-'));
const report={variant,checks:[],errors:[],modelRequests:0};let app,browser,server,page;
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
const settle=()=>page.evaluate(async()=>{document.body.getBoundingClientRect();await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));});
const fixtureSource=`import {createPreviewBridge} from './src/preview/bridge.ts';
const bridge=createPreviewBridge(),read=bridge.readMcpServers.bind(bridge);window.__mcpFixture={mode:'normal',reads:0};
bridge.readMcpServers=async input=>{const f=window.__mcpFixture;f.reads++;if(f.mode==='pending')await new Promise(resolve=>f.finish=resolve);if(f.mode==='failure')throw Error('Private diagnostic must not leak');const result=await read(input);if(f.mode==='unknown'){result.servers=[{name:'<script>unsafe()</script>',source:'unknown',transport:'unknown',oauth:'unknown'}];result.omitted=50;}return result;};
window.musebench=bridge;window.fetch=async input=>{if(String(input).includes('/__musebench_snapshots/manifest.json'))return new Response(JSON.stringify({version:1,pages:{}}));throw Error('Offline fixture');};`;
try{
 const fixture=(await build({stdin:{contents:fixtureSource,resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-session-mcp',server:{host:'127.0.0.1',port:0},plugins:[{name:'session-mcp-fixture',configureServer(vite){vite.middlewares.use('/__mcp__',async(req,res)=>{
  const file=(req.url??'').split('?')[0];try{
   if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
   if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
   let bytes=await readFile(path.join(process.cwd(),'dist',file));if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);
  }catch{res.statusCode=404;res.end();}
 });}}]});await server.listen();const url=server.resolvedUrls.local[0]+'__mcp__/index.html';
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});const created=app.waitForEvent('window');await app.evaluate(({BrowserWindow},url)=>{const w=new BrowserWindow({width:1200,height:980,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.webContents.setFrameRate(60);void w.loadURL(url);},url);page=await created;}
 else{browser=await chromium.launch();page=await browser.newPage({viewport:{width:1200,height:980}});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);}
 page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));await page.getByRole('button',{name:'Muse Code',exact:true}).click();await settle();
 await page.evaluate(()=>window.musebench.dispatch({type:'connectMuse',transport:'msp',fullAccess:true}));await page.getByRole('button',{name:'Add to chat',exact:true}).click();await page.getByRole('button',{name:'Session',exact:true}).click();await settle();
 const toggle=page.getByRole('button',{name:'Session MCP servers',exact:true});await toggle.waitFor();assert.equal(await page.evaluate(()=>window.__mcpFixture.reads),0);
 await toggle.click();const panel=page.locator('.session-mcp-inventory');await panel.getByText('musebench_workspace',{exact:true}).waitFor();assert.match(await panel.innerText(),/Signed out/);assert.match(await panel.innerText(),/Preview sample/);pass('Collapsed inventory reads only on demand and reports configuration/auth facts');
 await toggle.click();await settle();await toggle.click();await settle();assert.equal(await page.evaluate(()=>window.__mcpFixture.reads),1);pass('Reopening reuses the snapshot without automatic refresh');
 await page.evaluate(()=>window.__mcpFixture.mode='unknown');await page.getByRole('button',{name:'Refresh MCP inventory'}).click();await panel.getByText('<script>unsafe()</script>',{exact:true}).waitFor();assert.match(await panel.innerText(),/Unknown/);assert.match(await panel.innerText(),/50 more/);assert.equal(await page.evaluate(()=>window.unsafe),undefined);pass('Unknown and omitted native rows remain explicit and text is escaped');
 await page.evaluate(()=>{window.savedMcpRow=document.querySelector('.session-mcp-list li');window.__mcpFixture.mode='failure';});await page.getByRole('button',{name:'Refresh MCP inventory'}).click();await panel.getByRole('alert').waitFor();assert.equal(await panel.locator('li').count(),1);assert.match(await panel.innerText(),/Last successful snapshot/);assert.equal(await page.evaluate(()=>window.savedMcpRow===document.querySelector('.session-mcp-list li')),true);assert.ok(!(await panel.innerText()).includes('Private diagnostic'));pass('Failed refresh preserves stable rows with an explicit last-snapshot label and no native error leak');
 await page.evaluate(()=>window.__mcpFixture.mode='pending');await page.getByRole('button',{name:'Refresh MCP inventory'}).click();await panel.getByRole('status').waitFor();assert.equal(await page.getByRole('button',{name:'Refresh MCP inventory'}).isEnabled(),false);await toggle.click();await settle();assert.equal(await panel.locator('.motion-disclosure').evaluate(el=>el.inert),true);await page.evaluate(()=>{window.__mcpFixture.mode='normal';window.__mcpFixture.finish();});await toggle.click();await panel.getByText('musebench_workspace',{exact:true}).waitFor();pass('Pending reads cannot duplicate or prevent collapsing');
 await page.setViewportSize({width:520,height:820});await settle();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'narrow.png')});pass('Narrow layout remains usable');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;console.error(error.message);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();await browser?.close();await server?.close();}
