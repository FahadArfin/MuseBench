import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium,_electron as electron} from 'playwright';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';

const desktop=process.argv.includes('--desktop'),variant=desktop?(process.env.MUSEBENCH_EXECUTABLE?'packaged':'desktop'):'preview';
await mkdir('artifacts/renderer-state',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/renderer-state',variant+'-'));
let app,browser,server,page;
const report={variant,checks:[],errors:[],timings:{}};
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
const dispatch=action=>page.evaluate(action=>window.musebench.dispatch(action),action);
const read=()=>page.evaluate(()=>window.musebench.getState());
try{
 if(desktop){
  const profile=path.join(output,'profile'),executablePath=process.env.MUSEBENCH_EXECUTABLE;
  app=await electron.launch({...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:['.']),'--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],env:isolatedDesktopEnvironment(profile)});
  page=await waitForDesktopRenderer(app);
  const project=path.join(output,'sample-project');await mkdir(project);await writeFile(path.join(project,'README.md'),'# Offline renderer fixture\n');
  await dispatch({type:'openProject',path:project});await dispatch({type:'newTask',request:'Renderer first saved chat',mode:'manual'});
 }else{
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-renderer-state',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch();page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/preview.html`);
 }
 page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 const first=(await read()).task;const second=(await dispatch({type:'newTask',request:'Renderer newer saved chat',mode:'manual'})).task;await dispatch({type:'selectTask',id:first.id});
 await page.waitForFunction(title=>document.querySelector('.breadcrumbs strong')?.textContent===title,first.title);
 // Delay a captured command result while the public bridge navigates elsewhere.
 if(desktop)await app.evaluate(({ipcMain})=>{
  const original=ipcMain._invokeHandlers.get('musebench:action');globalThis.rendererOriginalAction=original;
  ipcMain.removeHandler('musebench:action');ipcMain.handle('musebench:action',async(event,action)=>{
   if(action.type!=='forkTask')return original(event,action);
   const reply=await original(event,{type:'refresh'});reply.result.error='Renderer fixture exact late command error';
   return new Promise(resolve=>{globalThis.releaseRendererCommand=()=>resolve(reply);});
  });
 });
 else await page.evaluate(()=>{
  const bridge=window.musebench,original=bridge.dispatch;window.rendererOriginalAction=original;
  bridge.dispatch=async action=>{if(action.type!=='forkTask')return original(action);const result=await bridge.getState();result.error='Renderer fixture exact late command error';return new Promise(resolve=>{window.releaseRendererCommand=()=>resolve(result);});};
 });
 await page.getByRole('button',{name:'Current chat options',exact:true}).click();await page.getByRole('menuitem',{name:'Fork chat',exact:true}).click();
 if(desktop)await app.evaluate(async()=>{while(!globalThis.releaseRendererCommand)await new Promise(resolve=>setTimeout(resolve,10));});else await page.waitForFunction(()=>!!window.releaseRendererCommand);
 await dispatch({type:'selectTask',id:second.id});await page.waitForFunction(title=>document.querySelector('.breadcrumbs strong')?.textContent===title,second.title);
 if(desktop)await app.evaluate(({ipcMain})=>{globalThis.releaseRendererCommand();ipcMain.removeHandler('musebench:action');ipcMain.handle('musebench:action',globalThis.rendererOriginalAction);});else await page.evaluate(()=>{window.releaseRendererCommand();window.musebench.dispatch=window.rendererOriginalAction;});
 await page.getByText('Renderer fixture exact late command error',{exact:true}).waitFor();assert.equal((await read()).task.id,second.id);assert.equal(await page.locator('.breadcrumbs strong').first().textContent(),second.title);
 pass('Late command error remains visible while the newer canonical chat stays selected');
 await page.getByRole('button',{name:'Dismiss error',exact:true}).click();
 if(desktop)await app.evaluate(({ipcMain})=>{
  const original=ipcMain._invokeHandlers.get('musebench:action');globalThis.rendererOriginalAction=original;globalThis.releaseRendererCommand=null;
  ipcMain.removeHandler('musebench:action');ipcMain.handle('musebench:action',async(event,action)=>{if(action.type!=='forkTask')return original(event,action);const reply=await original(event,{type:'refresh'});return new Promise(resolve=>{globalThis.releaseRendererCommand=()=>resolve(reply);});});
 });else await page.evaluate(()=>{
  const bridge=window.musebench,original=bridge.dispatch;window.rendererOriginalAction=original;window.releaseRendererCommand=null;
  bridge.dispatch=async action=>{if(action.type!=='forkTask')return original(action);const result=await bridge.getState();return new Promise(resolve=>{window.releaseRendererCommand=()=>resolve(result);});};
 });
 await page.getByRole('button',{name:'Current chat options',exact:true}).click();await page.getByRole('menuitem',{name:'Fork chat',exact:true}).click();
 if(desktop)await app.evaluate(async()=>{while(!globalThis.releaseRendererCommand)await new Promise(resolve=>setTimeout(resolve,10));});else await page.waitForFunction(()=>!!window.releaseRendererCommand);
 await page.keyboard.press('Control+,');await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
 if(desktop)await app.evaluate(({ipcMain})=>{globalThis.releaseRendererCommand();ipcMain.removeHandler('musebench:action');ipcMain.handle('musebench:action',globalThis.rendererOriginalAction);});else await page.evaluate(()=>{window.releaseRendererCommand();window.musebench.dispatch=window.rendererOriginalAction;});
 await page.waitForFunction(()=>document.querySelector('.current-chat-options')?.disabled===false);
 assert.equal(await page.getByRole('dialog',{name:'Settings',exact:true}).count(),1,'A late successful command must not close a newer Settings navigation');
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 pass('Late successful command preserves a newer shell destination for the same canonical chat');
 if(desktop){
  // Only this bounded presentation fixture owns the Code IPC stream. It uses
  // the shipped publisher/preload and public API; it does not claim native work.
  const actual=await read();await app.evaluate(async({app,ipcMain,BrowserWindow},state)=>{
   const require=process.getBuiltinModule('node:module').createRequire(app.getAppPath()+'/package.json');
   const {createRendererStatePublisher}=require('./electron/renderer-state-publisher.mjs');
   const {trustedSender}=require('./electron/security.mjs');
   const contents=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).webContents,url=contents.getURL(),send=contents.send.bind(contents);
   const prior=await ipcMain._invokeHandlers.get('musebench:state')({sender:contents,senderFrame:contents.mainFrame});
   const channels=['musebench:state','musebench:action','musebench:state-attach'];
   const fixture=globalThis.rendererFixture={state,contents,send,hold:true,acks:[],sent:[],observerCount:0,handlers:channels.map(name=>[name,ipcMain._invokeHandlers.get(name)]),listeners:['musebench:state-ack','musebench:state-detach'].map(name=>[name,ipcMain.listeners(name)])};
   for(const [name]of fixture.listeners)ipcMain.removeAllListeners(name);
   contents.send=(channel,...args)=>{if(channel!=='musebench:update')send(channel,...args);};
   const publisher=fixture.publisher=createRendererStatePublisher({readState:()=>structuredClone(fixture.state),send:value=>{fixture.sent.push({generation:value.generation,revision:value.revision});send('musebench:update',value);}});
   const source=fixture.source=new (process.getBuiltinModule('node:events').EventEmitter)();
   source.on('state',value=>publisher.publish(value));source.on('state',()=>{fixture.observerCount++;});
   for(const channel of channels)ipcMain.removeHandler(channel);
   ipcMain.handle('musebench:state',()=>publisher.read());ipcMain.handle('musebench:state-attach',()=>publisher.attach());
   ipcMain.handle('musebench:action',()=>({snapshot:publisher.read(),result:structuredClone(fixture.state)}));
   ipcMain.on('musebench:state-ack',(event,value)=>{if(!trustedSender(event,contents,url))return;if(fixture.hold)fixture.acks.push(value);else publisher.ack(value);});
   ipcMain.on('musebench:state-detach',event=>{if(trustedSender(event,contents,url))publisher.detach();});
   while(publisher.diagnostics.generation<prior.generation)publisher.detach();
   publisher.attach();
  },actual);
  const began=performance.now();report.burst=await app.evaluate(()=>{
   const f=globalThis.rendererFixture;for(let i=1;i<=10000;i++){
    f.state={...f.state,task:{...f.state.task,title:'Renderer burst '+i,runtimeComplete:i===10000},runtime:{...f.state.runtime,status:i===10000?'blocked':'working',pending:i===10000?{kind:'approval',id:'fixture-newest-approval'}:null}};
    f.source.emit('state',structuredClone(f.state));
   }return{...f.publisher.diagnostics,observerCount:f.observerCount,sentCount:f.sent.length};
  });report.timings.burstMs=Math.round(performance.now()-began);
  assert.equal(report.burst.inFlight,1);assert.equal(report.burst.pending,1);assert.equal(report.burst.maxInFlight,1);assert.equal(report.burst.maxPending,1);assert.equal(report.burst.sentCount,1);assert.equal(report.burst.observerCount,10000);
  await page.waitForTimeout(2100);
  const timedOut=await app.evaluate(()=>({...globalThis.rendererFixture.publisher.diagnostics,sentCount:globalThis.rendererFixture.sent.length}));assert.equal(timedOut.suspended,true);assert.equal(timedOut.sentCount,1);report.suspension=timedOut;
  await app.evaluate(({ipcMain})=>{
   const f=globalThis.rendererFixture,held=f.sent[0];
   ipcMain.emit('musebench:state-ack',{sender:f.contents,senderFrame:{url:f.contents.getURL()}},held);
   ipcMain.emit('musebench:state-ack',{sender:f.contents,senderFrame:f.contents.mainFrame},{...held,revision:held.revision+1});
  });assert.equal((await app.evaluate(()=>globalThis.rendererFixture.sent.length)),1);
  report.recovery=await app.evaluate(({ipcMain})=>{const f=globalThis.rendererFixture;if(!f.acks.length)throw Error('Actual renderer consumption acknowledgement missing');f.hold=false;ipcMain.emit('musebench:state-ack',{sender:f.contents,senderFrame:f.contents.mainFrame},f.acks[0]);return f.publisher.diagnostics;});
  await page.waitForFunction(()=>document.querySelector('.breadcrumbs strong')?.textContent==='Renderer burst 10000');
  const terminal=await read();assert.equal(terminal.task.runtimeComplete,true);assert.equal(terminal.runtime.pending.id,'fixture-newest-approval');
  pass('10,000 real Electron publications hold one push/one latest pending; timeout does not resend and trusted matching recovery preserves final approval/terminal facts');
  // New invoke before held old push: actual public consumer must discard and ack.
  await app.evaluate(()=>{const f=globalThis.rendererFixture;f.publisher.detach();f.hold=true;f.publisher.attach();f.state={...f.state,task:{...f.state.task,title:'Renderer newest canonical read'}};});
  assert.equal((await read()).task.title,'Renderer newest canonical read');
  await app.evaluate(()=>{const f=globalThis.rendererFixture;f.hold=false;f.send('musebench:update',{version:1,...f.sent.at(-1),state:{...f.state,task:{...f.state.task,title:'Renderer stale push'}}});});
  await page.waitForFunction(()=>document.querySelector('.breadcrumbs strong')?.textContent==='Renderer newest canonical read');
  assert.equal((await app.evaluate(()=>globalThis.rendererFixture.publisher.diagnostics.inFlight)),0);
  pass('A newer canonical read supersedes an older in-flight push while that discarded push still releases its slot');
  await app.evaluate(({ipcMain})=>{
   const f=globalThis.rendererFixture;f.publisher.close();f.contents.send=f.send;
   for(const [name,handler]of f.handlers){ipcMain.removeHandler(name);ipcMain.handle(name,handler);}
   for(const [name,listeners]of f.listeners){ipcMain.removeAllListeners(name);for(const listener of listeners)ipcMain.on(name,listener);}
  });
  const reloadStarted=performance.now();await page.reload();await page.waitForFunction(()=>!!window.musebench);assert.equal((await read()).task.id,second.id);report.timings.reloadMs=Math.round(performance.now()-reloadStarted);
  await page.getByRole('button',{name:'Muse Code',exact:true}).click();await page.waitForFunction(title=>document.querySelector('.breadcrumbs strong')?.textContent===title,second.title);
  await page.evaluate(()=>window.musebench.backgroundEngine({type:'set',enabled:true}));const pid=app.process().pid;
  const closed=page.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html'));setTimeout(()=>w.close(),50);});await closed;
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);
  await app.evaluate(({app})=>app.emit('second-instance'));page=await waitForDesktopRenderer(app);assert.equal(app.process().pid,pid);assert.equal((await read()).task.id,second.id);
  await page.getByRole('button',{name:'Muse Code',exact:true}).click();await page.waitForFunction(title=>document.querySelector('.breadcrumbs strong')?.textContent===title,second.title);
  pass('Reload and actual background close/reopen restore fresh canonical state in the same engine');
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Report: '+output);await app?.close();await browser?.close();await server?.close();}
