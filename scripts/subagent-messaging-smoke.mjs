// Isolated shared-renderer fixtures; no native model or provider calls.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';

const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/subagent-messaging',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/subagent-messaging',variant+'-'));
const report={variant,checks:[],errors:[],providerCalls:0};let server,app,browser,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const settle=()=>page.evaluate(async()=>{document.body.getBoundingClientRect();await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));});
const fixtureSource=`import {createPreviewBridge} from './src/preview/bridge.ts';import {createChildTracker} from './src/runtime/children.mjs';
const bridge=createPreviewBridge(),baseGet=bridge.getState.bind(bridge),originalDispatch=bridge.dispatch.bind(bridge),listeners=new Set();let state;
const f=window.__subagents={mode:'normal',commands:[],reads:0};
const publish=()=>listeners.forEach(fn=>fn(structuredClone(state)));
bridge.getState=async()=>structuredClone(state??=await baseGet());bridge.onState=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
f.patch=patch=>{state.runtime={...state.runtime,...patch};publish();};
f.setup=()=>{state.runtime={...state.runtime,simulation:true,status:'running',permissionVerified:true,sessionId:'agent-session',transport:'msp',childControlsSupported:true,ownedTurnIds:['owned'],childReceipts:[],children:{items:[{itemId:'a',kind:'subagent',subagentId:'native-a',childSessionId:'session-a',turnId:'owned',revision:2,status:'inProgress',controlStatus:'running',label:'Review browser annotations',objective:'Inspect annotation targets'},{itemId:'b',kind:'subagent',subagentId:'native-b',childSessionId:'session-b',turnId:'owned',revision:5,status:'completed',controlStatus:'resultReady',label:'Annotation data',durationMs:62000,result:{summary:'All changes verified.'}},{itemId:'workflow',kind:'workflow',revision:1,status:'inProgress',label:'Native workflow',children:[]}],truncated:false}};state.task.childControlReceipts=[];publish();};
bridge.dispatch=async action=>{
 if(action.type==='refresh')return structuredClone(state);
 if(action.type==='inspectChild'){f.reads++;if(f.mode==='slowRead'){state.runtime.childInspections=state.runtime.childInspections.map(i=>i.itemId===action.itemId?{...i,status:'loading',data:undefined}:i);publish();await new Promise(resolve=>f.finishRead=resolve);}const item=state.runtime.children.items.find(i=>i.itemId===action.itemId);state.runtime.childInspections=[{itemId:item.itemId,revision:item.revision,sessionId:action.sessionId,childSessionId:item.childSessionId,status:'ready',readAt:new Date().toISOString(),data:{session:{status:item.status,modelId:'Muse Spark 1.3'},history:{available:true,items:[{itemId:'msg',kind:'agentMessage',status:'completed',text:'Checking field guard flow',shortened:false}],omittedItems:0,shortened:false}}}];publish();return structuredClone(state);}
 if(action.type==='childControl'){
  if(action.taskId!==state.task.id||action.sessionId!==state.runtime.sessionId)throw Error('Wrong owner');const tracker=createChildTracker();state.runtime.children.items.forEach(item=>tracker.observe(item));tracker.prepare(action);f.commands.push(action);
  if(f.mode==='pending')await new Promise(resolve=>f.finish=resolve);
  if(f.mode==='throw')throw Error('Connection changed');
  const receipt={...action,commandId:'command-'+f.commands.length,at:new Date().toISOString(),status:f.mode==='unknown'?'unknown':'accepted'};
  if(f.mode==='stale')receipt.revision--;
  state.runtime.childReceipts=[...state.runtime.childReceipts,receipt];state.task.childControlReceipts=[...state.task.childControlReceipts,receipt];publish();return structuredClone(state);
 }
 state=await originalDispatch(action);publish();return structuredClone(state);
};
window.musebench=bridge;window.fetch=async input=>{if(String(input).includes('/__musebench_snapshots/manifest.json'))return new Response(JSON.stringify({version:1,pages:{}}));throw Error('Offline subagent fixture');};`;
try{
 const fixture=(await build({stdin:{contents:fixtureSource,resolveDir:process.cwd()},bundle:true,write:false,loader:{'.md':'text'},format:'iife',platform:'browser'})).outputFiles[0].text;
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-subagent-messaging',server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'subagent-messaging-production-fixture',configureServer(server){server.middlewares.use('/__child__',async(req,res)=>{
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

 const panel=()=>page.getByRole('complementary',{name:'Sub-Agents panel',exact:true});
 const input=()=>panel().getByRole('textbox',{name:'Message this agent',exact:true});
 const openA=()=>panel().getByRole('button',{name:/Review browser annotations Working/}).click();
 const back=()=>panel().getByRole('button',{name:'All subagents',exact:true}).click();
 await page.evaluate(()=>window.__subagents.setup());
 await page.getByRole('button',{name:'Toggle Sub-Agents panel'}).click();await page.screenshot({path:path.join(output,'agent-list.png')});
 await openA();await input().waitFor();await panel().getByText('Checking field guard flow',{exact:true}).waitFor();
 assert.match(await panel().innerText(),/Inspect annotation targets/);pass('Active and completed native agents open their own objective and readable activity');
 await page.screenshot({path:path.join(output,'active-agent.png')});
 const firstReads=await page.evaluate(()=>{window.__subagents.mode='slowRead';return window.__subagents.reads;});await page.waitForFunction(n=>window.__subagents.reads>n,firstReads,{timeout:6500});
 assert.equal(await panel().getByText('Checking field guard flow',{exact:true}).isVisible(),true);assert.equal(await panel().getByRole('button',{name:'Refresh child activity'}).isDisabled(),true);
 await page.waitForTimeout(4200);assert.equal(await page.evaluate(()=>window.__subagents.reads),firstReads+1);
 await page.evaluate(()=>{window.__subagents.mode='normal';window.__subagents.finishRead();});await page.waitForFunction(()=>{const button=document.querySelector('[aria-label="Refresh child activity"]');return button&&!button.disabled;});
 pass('Slow background refresh keeps the last activity visible and never overlaps reads');
 await input().fill('Preserve existing keyboard behavior');await back();await panel().getByRole('button',{name:/Annotation data All changes verified/}).click();
 assert.match(await panel().innerText(),/Completed · 1m 2s/);await input().fill('Review one more case');await back();await openA();assert.equal(await input().inputValue(),'Preserve existing keyboard behavior');
 await page.getByRole('button',{name:'Close Sub-Agents',exact:true}).click();await page.getByRole('button',{name:'Toggle Sub-Agents panel'}).click();await openA();assert.equal(await input().inputValue(),'Preserve existing keyboard behavior');pass('Per-agent drafts survive selection, back navigation and closing the panel');
 await input().press('Shift+Enter');assert.match(await input().inputValue(),/\n/);await input().fill('Use an accessible button');
 await page.evaluate(()=>window.__subagents.mode='pending');await input().press('Enter');await page.waitForFunction(()=>window.__subagents.commands.length===1);assert.equal(await input().isDisabled(),true);assert.equal(await panel().getByRole('button',{name:'Send message to agent'}).isDisabled(),true);
 await page.evaluate(()=>{window.__subagents.mode='normal';window.__subagents.finish();});await page.waitForFunction(()=>document.querySelector('#subagent-message-input')?.value==='');
 const command=await page.evaluate(()=>window.__subagents.commands[0]);assert.equal(command.action,'sendMessage');assert.equal(command.itemId,'a');assert.equal(command.revision,2);assert.equal(command.body,'Use an accessible button');assert.match(await panel().innerText(),/Accepted by Muse/);pass('Enter targets the exact active child once; Shift+Enter inserts a line; only confirmed admission clears text');
 await input().fill('Keep this if unconfirmed');await page.evaluate(()=>window.__subagents.mode='stale');await input().press('Enter');await panel().getByRole('alert').waitFor();assert.equal(await input().inputValue(),'Keep this if unconfirmed');pass('A stale acknowledgement cannot clear or claim delivery for a new message');
 await page.evaluate(()=>window.__subagents.mode='unknown');await panel().getByRole('button',{name:'Send message to agent'}).click();await page.waitForFunction(()=>window.__subagents.commands.length===3);assert.equal(await input().inputValue(),'Keep this if unconfirmed');assert.equal(await input().isDisabled(),true);assert.match(await panel().innerText(),/pending or uncertain/);pass('Unknown delivery retains the draft and blocks automatic or duplicate resend');
 await back();await panel().getByRole('button',{name:/Annotation data All changes verified/}).click();assert.equal(await input().inputValue(),'Review one more case');await page.evaluate(()=>window.__subagents.mode='normal');await panel().getByRole('button',{name:'Send follow-up to agent'}).click();await page.waitForFunction(()=>window.__subagents.commands.length===4);assert.equal(await page.evaluate(()=>window.__subagents.commands.at(-1).action),'followupTask');pass('Completed native agents accept a separately labelled follow-up, not a parent-chat message');
 await page.getByRole('button',{name:'Close Sub-Agents',exact:true}).click();await page.getByRole('button',{name:'Toggle session tools'}).click();
 const tools=page.getByRole('complementary',{name:'Chat session tools'});await tools.getByRole('button',{name:/^Subagents/}).click();assert.match(await tools.innerText(),/1 working · 1 done/);assert.equal(await tools.getByRole('button',{name:/Native workflow/}).count(),0);await tools.getByRole('button',{name:/Annotation data Done/}).click();await panel().getByRole('heading',{name:'Annotation data',exact:true}).waitFor();pass('Session tools show working/done totals and open the selected subagent directly');
 await page.evaluate(()=>{const f=window.__subagents;f.patch({children:{items:[{itemId:'old',kind:'subagent',subagentId:'old-native',turnId:'earlier',revision:1,status:'completed',controlStatus:'resultReady',label:'Earlier agent'},{itemId:'workflow-agent',kind:'subagent',subagentId:'workflow-child',turnId:'owned',revision:1,status:'completed',controlStatus:'resultReady',workflowRunId:'workflow',label:'Workflow agent'}],truncated:false}});});
 await panel().getByRole('button',{name:/Earlier agent Completed/}).click();assert.equal(await input().isDisabled(),true);assert.match(await panel().innerText(),/earlier request/);await back();await panel().getByRole('button',{name:/Workflow agent Completed/}).click();assert.equal(await input().isDisabled(),true);assert.match(await panel().innerText(),/workflow owns/);pass('Earlier-request and workflow ownership restrictions remain intact');
 await page.screenshot({path:path.join(output,'agent-detail.png')});await page.setViewportSize({width:520,height:820});await settle();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'agent-narrow.png')});pass('Agent detail remains readable in a narrow window');
 await page.evaluate(()=>window.__subagents.patch({childControlsSupported:false,permissionVerified:false,sessionId:null,transport:'exec',children:{items:[],truncated:false}}));
 await panel().getByText('This connection does not expose native subagents or direct messaging.',{exact:false}).waitFor();assert.equal(await panel().getByRole('textbox',{name:'Message this agent'}).count(),0);pass('Unsupported connections expose no pretend messaging or automatic permission changes');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));await app?.close();await browser?.close();await server?.close();}
