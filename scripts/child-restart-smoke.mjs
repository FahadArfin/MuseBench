// Isolated shared-component fixture. No native host, personal profile or provider calls.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';

assert.ok(process.argv.slice(2).every(a=>a==='--desktop')&&process.argv.length<=3,'Only --desktop is supported.');
const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/child-restart-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/child-restart-ui',variant+'-'));
const report={variant,checks:[],errors:[],providerCalls:0,requests:[],cleanup:{}};let server,app,browser,page,windowOwner;
const started=performance.now();
async function bounded(label,promise,ms=10000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}}
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const fixtureSource=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {NativeChildrenPanel} from './src/ui/NativeChildrenPanel.tsx';import {createChildTracker} from './src/runtime/children.mjs';
const task={id:'fixture'},initial={simulation:true,sessionId:'fixture-session',permissionVerified:true,childControlsSupported:true,ownedTurnIds:['owned'],children:{items:[{itemId:'workflow',kind:'workflow',turnId:'owned',workflowRunId:'native-run',revision:1,status:'inProgress',label:'Fixture workflow',children:[{childId:'a',label:'Active child',attempt:1,status:'started'},{childId:'b',label:'Completed child',attempt:1,status:'terminal',terminal:'completed'}]}],truncated:false},childReceipts:[]};
const f=window.__restartFixture={commands:[],mode:'normal',reset:null,advance:null,patch:null};
function Fixture(){const [runtime,setRuntime]=useState(structuredClone(initial));
f.reset=()=>{f.commands=[];f.mode='normal';setRuntime(s=>({...structuredClone(initial),generation:(s.generation??0)+1}));};f.patch=patch=>setRuntime(s=>({...s,...patch}));
f.advance=()=>setRuntime(s=>({...s,childWorkPending:0,children:{...s.children,items:s.children.items.map(i=>({...i,revision:3,children:[...i.children,{childId:'a',label:'Active child',attempt:2,status:'started'}]}))}}));
const act=async action=>{const tracker=createChildTracker();runtime.children.items.forEach(i=>tracker.observe(i));const command=tracker.prepare(action);f.commands.push(command);
const receipt={commandId:'command-'+f.commands.length,sessionId:action.sessionId,itemId:action.itemId,revision:action.revision,childId:action.childId,attempt:action.attempt,action:action.action,status:'submitting',at:'2026-10-30T00:00:00Z'};
setRuntime(s=>({...s,childWorkPending:action.action==='retry'?1:0,childReceipts:[receipt]}));
if(f.mode==='pending')await new Promise(resolve=>f.finish=resolve);
setRuntime(s=>({...s,childReceipts:[{...receipt,status:f.mode==='unknown'?'unknown':'accepted'}]}));return {runtime};};
return <NativeChildrenPanel key={runtime.generation??0} task={task} runtime={runtime} busy={false} act={act}/>;}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
try{
 const built=await build({stdin:{contents:fixtureSource,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',jsx:'automatic',format:'iife',platform:'browser'});
 const assets=new Map(built.outputFiles.map(file=>[path.basename(file.path),file.text]));
 assets.set('index.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./fixture.css"><style>body{font:14px system-ui;margin:16px;--border:#bbb;--surface:#fff;--text:#222}button,select{font:inherit}</style></head><body><main id="root"></main><script src="./fixture.js"></script></body></html>');
 report.assets=Object.fromEntries([...assets].map(([file,text])=>[file,createHash('sha256').update(text).digest('hex')]));
 // Everything is already bundled. Serve only these three memory assets: no
 // filesystem fallback, dependency scan, watcher, transform or HMR lifetime.
 server=createServer((req,res)=>{
  const pathname=(req.url??'').split('?')[0],file=pathname.startsWith('/__restart__/')?pathname.slice('/__restart__/'.length):null;
  if(report.requests.length<64)report.requests.push({method:req.method,path:pathname.slice(0,200)});
  res.setHeader('Connection','close');res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'||!assets.has(file)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript');res.end(assets.get(file));
 });server.requestTimeout=5000;server.headersTimeout=5000;
 await bounded('Fixture listen',new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}));const url=`http://127.0.0.1:${server.address().port}/__restart__/index.html`;
 for(const unrelated of ['/package.json','/src/ui/NativeChildrenPanel.tsx','/artifacts/child-restart-ui/retained/index.html','/__restart__/unknown.js']){
  const response=await fetch(new URL(unrelated,url),{signal:AbortSignal.timeout(3000)});assert.equal(response.status,404,'The fixture must not serve unrelated workspace files');await response.arrayBuffer();
 }
 report.assetBoundary='passed';
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env,timeout:10000});
  app.context().on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));
  await bounded('Electron ready',app.evaluate(({app})=>app.whenReady()));
  // Hold the actual BrowserWindow until its own closed event; explicitly await
  // both navigation and Playwright attachment rather than discard loadURL.
  windowOwner=await bounded('Fixture window creation',app.evaluateHandle(({BrowserWindow})=>new BrowserWindow({width:1000,height:820,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}})));
  const created=app.firstWindow({timeout:10000});
  [page]=await bounded('Fixture window navigation',Promise.all([created,windowOwner.evaluate((window,url)=>window.loadURL(url),url)]));
 }else{browser=await chromium.launch({headless:true,timeout:10000});page=await browser.newPage({viewport:{width:1000,height:820}});page.on('pageerror',error=>report.errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());await page.goto(url,{timeout:10000});}
 report.windowObservedMs=Math.round(performance.now()-started);page.setDefaultTimeout(10000);
 const active=page.getByRole('combobox',{name:'Action for Active child',exact:true}),restart=page.getByRole('button',{name:'Restart attempt',exact:true});await active.waitFor();
 assert.deepEqual(await active.locator('option').allTextContents(),['Restart attempt','Skip attempt']);assert.equal(await page.getByRole('combobox',{name:'Action for Completed child'}).count(),0);pass('Active attempt offers Restart/Skip; terminal child has no action');
 await active.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Skip attempt',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>window.__restartFixture.commands[0].params.action),'skip');pass('Keyboard selects Skip and dispatches one exact action');
 await page.evaluate(()=>window.__restartFixture.reset());await restart.click();
 await page.waitForFunction(()=>window.__restartFixture.commands.length===1);assert.equal(await restart.isDisabled(),true);assert.equal(await active.isDisabled(),true);
 assert.match(await page.locator('section').innerText(),/Attempt 1/);assert.doesNotMatch(await page.locator('section').innerText(),/Attempt 2/);pass('Accepted restart stays blocked and shows attempt 1 until progression is observed');
 await page.evaluate(()=>window.__restartFixture.advance());await page.getByText('Active child · Attempt 2 · started',{exact:true}).waitFor();assert.equal(await active.isEnabled(),true);assert.equal(await page.getByText('Active child · Attempt 1 · started',{exact:true}).count(),0);pass('Observed attempt 2 replaces stale attempt 1 controls');
 await page.evaluate(()=>{window.__restartFixture.reset();window.__restartFixture.mode='pending';});await restart.click();assert.equal(await active.isDisabled(),true);assert.equal(await restart.isDisabled(),true);assert.equal(await page.evaluate(()=>window.__restartFixture.commands.length),1);
 await page.evaluate(()=>{window.__restartFixture.mode='unknown';window.__restartFixture.finish();});await page.getByText('Restart attempt · unknown',{exact:true}).waitFor({state:'attached'});assert.equal(await active.isDisabled(),true);await page.evaluate(()=>window.__restartFixture.advance());assert.equal(await active.isDisabled(),true);assert.equal(await page.evaluate(()=>window.__restartFixture.commands.length),1);pass('Pending and unknown commands block duplicate actions across attempt changes');
 await page.evaluate(()=>{window.__restartFixture.reset();window.__restartFixture.patch({children:{items:[{itemId:'workflow',kind:'workflow',revision:4,turnId:'owned',status:'completed',children:[{childId:'a',label:'Active child',attempt:1,status:'started'}]}],truncated:false}});});assert.equal(await page.getByRole('combobox').count(),0);pass('Terminal parent hides a stale active child control');
 await page.evaluate(()=>{window.__restartFixture.reset();window.__restartFixture.patch({ownedTurnIds:['later']});});assert.deepEqual(await active.locator('option').allTextContents(),['Skip attempt']);pass('Earlier request cannot restart work');
 await page.evaluate(()=>window.__restartFixture.reset());await page.setViewportSize({width:320,height:740});await active.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Skip attempt',exact:true}).evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'narrow-restart-controls.png')});pass('Narrow keyboard flow keeps both actions reachable without horizontal overflow');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png'),timeout:3000}).catch(()=>{});}
finally{
 const close=async(name,operation)=>{try{await bounded(name+' cleanup',operation());report.cleanup[name]='confirmed';}catch(error){report.cleanup[name]='unconfirmed';report.status='failed';report.errors.push(error.message);process.exitCode=1;}};
 if(windowOwner)await close('window',async()=>{await windowOwner.evaluate(window=>new Promise(resolve=>{if(window.isDestroyed()){resolve();return;}window.once('closed',resolve);window.close();}));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);await windowOwner.dispose();});
 if(app)await close('electron',()=>app.close());if(browser)await close('browser',()=>browser.close());
 if(server)await close('server',()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections();}));
 report.elapsedMs=Math.round(performance.now()-started);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));
}
