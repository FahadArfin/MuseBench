// Isolated shared-renderer fixtures; no native model or provider calls.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';

const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/child-inspection-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/child-inspection-ui',variant+'-'));
const report={variant,checks:[],errors:[],providerCalls:0};let server,app,browser,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const settle=()=>page.evaluate(async()=>{document.body.getBoundingClientRect();await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));});
const fixtureSource=`import {createPreviewBridge} from './src/preview/bridge.ts';
const bridge=createPreviewBridge(),dispatch=bridge.dispatch.bind(bridge),listeners=new Set();let suppress=false;
const publish=state=>listeners.forEach(fn=>fn(state));bridge.onState(state=>{if(!suppress)publish(state);});bridge.onState=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
window.__childFixture={mode:'normal',reads:0};
bridge.dispatch=async action=>{
 if(action.type!=='inspectChild')return dispatch(action);
 const f=window.__childFixture;f.reads++;suppress=true;const state=await dispatch(action);suppress=false;const entry=state.runtime.childInspections[0];
 if(f.mode==='pending'){const loading=structuredClone(state);loading.runtime.childInspections=[{...entry,status:'loading',data:undefined}];publish(loading);await new Promise(resolve=>f.finish=resolve);}
 if(f.mode==='failed'){state.error='Fixture read failed';delete entry.data;entry.status='error';entry.error='Could not read this child activity. Refresh to try again.';}
 if(f.mode==='many'){
  entry.data.history={mode:'inline',available:true,totalItems:50,omittedItems:2,shortened:true,items:Array.from({length:48},(_,i)=>({itemId:'activity-'+i,kind:i===47?'futureActivity':'agentMessage',status:'completed',text:i===47?'<script>window.__unsafe=true</script>':'Activity '+i,shortened:false}))};delete entry.data.worktree;entry.revision=1;
 }
 if(f.mode==='unavailable')entry.data.history={mode:'none',available:false,items:[],shortened:false,reason:'Muse did not return activity (tooLarge).'};
 const current=await bridge.getState();if(current.task?.id!==state.task?.id)return current;publish(state);return state;
};window.musebench=bridge;
window.fetch=async input=>{if(String(input).includes('/__musebench_snapshots/manifest.json'))return new Response(JSON.stringify({version:1,pages:{}}));throw Error('Offline child fixture');};`;
try{
 const fixture=(await build({stdin:{contents:fixtureSource,resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-child-inspection',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'child-inspection-production-fixture',configureServer(server){server.middlewares.use('/__child__',async(req,res)=>{
  const file=(req.url??'').split('?')[0];try{
   if(file==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
   if(file!=='/index.html'&&!/^\/assets\/[a-zA-Z0-9._-]+$/.test(file)){res.statusCode=404;res.end();return;}
   let bytes=await readFile(path.join(process.cwd(),'dist',file));if(file==='/index.html'){bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="./fixture.js"></script>'));res.setHeader('Content-Type','text/html');}else res.setHeader('Content-Type',file.endsWith('.woff2')?'font/woff2':file.endsWith('.css')?'text/css':'text/javascript');res.end(bytes);
  }catch{res.statusCode=404;res.end();}
 });}}]});await server.listen();const url=server.resolvedUrls.local[0]+'__child__/index.html';
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['scripts/preview-parity-electron.mjs','--disable-features=CalculateNativeWinOcclusion','--disable-renderer-backgrounding','--disable-background-timer-throttling'],env});const created=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow},url)=>{const window=new BrowserWindow({width:1200,height:980,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});window.webContents.setFrameRate(60);void window.loadURL(url);},url);page=await created;
 }else{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1200,height:980}});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);}
 page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(error.message));await page.getByRole('button',{name:'Muse Code',exact:true}).click();await settle();
 await page.evaluate(()=>window.musebench.dispatch({type:'connectMuse',transport:'msp',fullAccess:true}));
 await page.getByRole('button',{name:'Add to chat',exact:true}).click();await page.getByRole('button',{name:'Session',exact:true}).click();await settle();
 await page.getByRole('button',{name:'Read activity',exact:true}).click();await settle();
 const activity=page.getByRole('region',{name:'Native child agents',exact:true}).locator('.child-activity');assert.match(await activity.innerText(),/Focus returns to the disclosure button/);assert.match(await activity.innerText(),/C:\/MuseBench\/worktrees\/accessibility/);assert.match(await activity.innerText(),/Token totals not reported/);pass('Shared UI reads messages, tool output and reported worktree; missing tokens stay unknown');
 const before=await activity.locator('.motion-disclosure').evaluate(el=>el.getBoundingClientRect().height);
 const frames=await page.getByRole('button',{name:'Hide activity',exact:true}).evaluate(button=>new Promise(resolve=>{const el=document.getElementById(button.getAttribute('aria-controls')),frames=[],start=performance.now();el.querySelector('button').focus();button.click();const frame=()=>{frames.push({height:el.getBoundingClientRect().height,inert:el.inert});if(performance.now()-start<420)requestAnimationFrame(frame);else resolve({frames,focused:document.activeElement===button});};requestAnimationFrame(frame);}));
 assert(frames.frames.some(f=>f.height>1&&f.height<before-1));assert(frames.frames.every(f=>f.inert));assert(frames.focused);pass('Collapse animates layout, returns keyboard focus and makes hidden controls inert');
 await page.getByRole('button',{name:'Show activity',exact:true}).click();await settle();assert.equal(await page.evaluate(()=>window.__childFixture.reads),1);pass('Reopening reuses the snapshot without another native read');
 await page.evaluate(()=>window.__childFixture.mode='many');await page.getByRole('button',{name:'Refresh child activity'}).click();await settle();
 assert.equal(await activity.locator('.child-activity-list li').count(),25);await page.getByRole('button',{name:/Show earlier activity/}).click();assert.equal(await activity.locator('.child-activity-list li').count(),48);
 assert.match(await activity.innerText(),/child changed since this read/);assert.match(await activity.innerText(),/earlier or unsupported items/);assert.match(await activity.innerText(),/Worktree details not reported/);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);assert.match(await activity.innerText(),/<script>/);pass('Large/unknown activity stays bounded, plain text and explicitly partial');
 await page.evaluate(()=>window.__childFixture.mode='failed');await page.getByRole('button',{name:'Refresh child activity'}).click();await activity.getByRole('alert').waitFor();assert.equal(await activity.locator('.child-activity-list').count(),0);pass('Failed refresh removes stale content and offers retry');
 await page.evaluate(()=>window.__childFixture.mode='unavailable');await page.getByRole('button',{name:'Refresh child activity'}).click();assert.match(await activity.innerText(),/did not return activity/);assert.equal(await activity.locator('.child-activity-list').count(),0);pass('Unavailable native history is not presented as an empty successful transcript');
 await page.evaluate(()=>window.__childFixture.mode='pending');await page.getByRole('button',{name:'Refresh child activity'}).click();await activity.getByRole('status').waitFor();assert.equal(await page.getByRole('combobox',{name:'Action for Review keyboard navigation',exact:true}).isEnabled(),true,'Read must not lock child controls');assert.equal(await page.locator('button.new-chat').isEnabled(),true,'Read must not lock navigation');assert.equal(await page.getByRole('button',{name:'Refresh child activity'}).isEnabled(),false);await page.getByRole('button',{name:'Hide activity',exact:true}).click();await page.evaluate(()=>{window.__childFixture.mode='normal';window.__childFixture.finish();});await page.getByRole('button',{name:'Show activity',exact:true}).click();await settle();pass('An in-flight read can be collapsed and cannot be duplicated');
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Hide activity',exact:true}).click();assert.equal(await activity.locator('.motion-disclosure').evaluate(el=>el.getBoundingClientRect().height),0);await page.getByRole('button',{name:'Show activity',exact:true}).click();await settle();pass('Reduced motion settles immediately');
 await page.setViewportSize({width:520,height:820});await settle();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'narrow-child-activity.png')});pass('Narrow view remains readable without horizontal overflow');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));await app?.close();await browser?.close();await server?.close();}
