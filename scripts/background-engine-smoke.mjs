import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {_electron as electron} from 'playwright';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';

await mkdir('artifacts/background-engine',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/background-engine/desktop-'));
const profile=path.join(output,'profile');
const env=isolatedDesktopEnvironment(profile);
let app,page;const report={checks:[],providerCalls:0,errors:[]};
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
const shell=async()=>{const deadline=Date.now()+10000;while(Date.now()<deadline){const found=app.windows().find(p=>p.url().includes('/dist/index.html'));if(found){found.setDefaultTimeout(8000);await found.waitForFunction(()=>!!window.musebench);return found;}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('MuseBench shell did not open.');};
const launch=async()=>{const executablePath=process.env.MUSEBENCH_EXECUTABLE;app=await electron.launch({...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:['.']),'--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],env});app.process().stderr.on('data',chunk=>{const text=chunk.toString();if(/Uncaught|UnhandledPromiseRejection|Shutdown regression/.test(text))report.errors.push(text);});page=await shell();};
try{
 await launch();
 assert.equal(await page.evaluate(()=>typeof window.musebench.backgroundEngine),'function');
 assert.equal((await page.evaluate(()=>window.musebench.backgroundEngine({type:'status'}))).enabled,false);
 const project=path.join(output,'sample-project');await mkdir(project);await writeFile(path.join(project,'README.md'),'# Background lifecycle fixture\n');
 const seeded=await page.evaluate(async project=>{await window.musebench.dispatch({type:'openProject',path:project});return window.musebench.dispatch({type:'newTask',request:'Saved background chat',mode:'muse'});},project);assert.equal(seeded.error,null);assert.ok(seeded.task.id);
 await page.evaluate(()=>window.musebench.mobileDevice({type:'start'}));const pairing=await page.evaluate(()=>window.musebench.mobileDevice({type:'pair',address:'127.0.0.1'}));
 const payload=JSON.parse(Buffer.from(new URL(pairing.pairing.link).searchParams.get('data'),'base64url'));
 const cert=await app.evaluate(({safeStorage},bytes)=>JSON.parse(safeStorage.decryptString(Buffer.from(bytes,'base64'))).cert,(await readFile(path.join(profile,'mobile-devices.bin'))).toString('base64'));
 const mobileRequest=(route,token,body)=>new Promise((resolve,reject)=>{const req=https.request(payload.url+route,{ca:cert,servername:'localhost',method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{if(res.statusCode!==200)reject(Error('Fixture companion request failed'));else resolve(JSON.parse(text));});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 const paired=await mobileRequest('/v1/pair',payload.secret,{name:'Lifecycle fixture'});
 await page.evaluate(()=>window.musebench.nativeControl({type:'enable'}));
 const native=JSON.parse(await readFile(path.join(profile,'native-control/connection.json'),'utf8'));
 const call=async(name,args={})=>{const response=await fetch(`http://127.0.0.1:${native.port}/call`,{method:'POST',headers:{authorization:`Bearer ${native.token}`,'content-type':'application/json'},body:JSON.stringify({name,arguments:args})});const value=await response.json();if(!response.ok)throw Error(value.error);return JSON.parse(value.content[0].text);};
 await call('navigate',{target:'settings',section:'general'});
 const toggle=page.getByRole('switch',{name:'Keep running when the window closes'});assert.equal(await toggle.getAttribute('aria-checked'),'false');await toggle.click();await page.waitForFunction(async()=> (await window.musebench.backgroundEngine({type:'status'})).enabled);
 const before=await call('app_status');const pid=app.process().pid;pass('Desktop setting defaults off and explicitly enables the tray without provider work');
 // No provider navigation: hold the account window on its initial blank page.
 await app.evaluate(({BrowserWindow,dialog})=>{const load=BrowserWindow.prototype.loadURL;BrowserWindow.prototype.loadURL=function(url,...args){if(this.getTitle()==='Sign in to Muse'){BrowserWindow.prototype.loadURL=load;return Promise.resolve();}return load.call(this,url,...args);};globalThis.blockedSignIn=[];globalThis.restoreSignInDialog=()=>{dialog.showMessageBox=original;};const original=dialog.showMessageBox;dialog.showMessageBox=async(_window,options)=>{globalThis.blockedSignIn.push(options);return{response:0};};});
 await page.evaluate(()=>window.musebench.onboarding({type:'loginPersonal'}));
 assert.equal((await page.evaluate(()=>window.musebench.personalState())).authenticating,true);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).close());
 await page.waitForFunction(()=>!!window.musebench);
 await app.evaluate(({app})=>app.quit());
 const authGuard=await app.evaluate(({BrowserWindow})=>({windows:BrowserWindow.getAllWindows().length,closed:BrowserWindow.getAllWindows().some(w=>w.isDestroyed())}));
 assert.equal(authGuard.windows,2);assert.equal(authGuard.closed,false);
 await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Sign in to Muse').close();globalThis.restoreSignInDialog();});
 assert.equal((await page.evaluate(()=>window.musebench.personalState())).authenticating,false);
 pass('After the sign-in command settles, close and quit preserve the account window until it is dismissed');
 for(let i=0;i<3;i++){
  const closed=page.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).close();});await closed;
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);
  const state=await call('app_status');assert.equal(state.engine.windowOpen,false);assert.deepEqual(state.chats,before.chats);assert.equal(app.process().pid,pid);
  assert.equal((await mobileRequest('/v1/state',paired.token)).chats[0].id,seeded.task.id);assert.equal((await call('read_chat',{taskId:seeded.task.id})).total,2);
  assert.equal((await call('diagnostics')).responsive,null);await assert.rejects(call('inspect_ui'),/Open MuseBench/);
  if(i===0){
   // Hold attachWindow after navigation, before its loading promise completes.
   await app.evaluate(({app,BrowserWindow})=>{const load=BrowserWindow.prototype.loadURL;BrowserWindow.prototype.loadURL=function(url,...args){if(!url.includes('/dist/index.html'))return load.call(this,url,...args);BrowserWindow.prototype.loadURL=load;return load.call(this,url,...args).then(()=>new Promise(resolve=>{globalThis.releaseShellLoad=resolve;}));};app.emit('second-instance');app.emit('activate');});
   page=await shell();await page.waitForLoadState('load');
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).close());
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
   const deferredClose=page.waitForEvent('close');await app.evaluate(()=>globalThis.releaseShellLoad());await deferredClose;
   assert.equal((await call('app_status')).engine.windowOpen,false);
   pass('A close requested during replacement-window loading is deferred, then completes without duplicate windows');
  }
  await app.evaluate(({app})=>{app.emit('second-instance');app.emit('second-instance');app.emit('activate');});page=await shell();await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/dist/index.html')).length),1);
  assert.equal((await page.evaluate(()=>window.musebench.backgroundEngine({type:'status'}))).enabled,true);
  assert.equal((await call('app_status')).engine.windowOpen,true);
 }
 pass('Three actual UI disposals preserve the same engine, authenticated native/mobile access and saved chat, with one window on concurrent reopen');
 await call('navigate',{target:'settings',section:'general'});await page.screenshot({path:path.join(output,'settings.png')});
 await app.close();app=null;await launch();
 assert.equal((await page.evaluate(()=>window.musebench.backgroundEngine({type:'status'}))).enabled,true);pass('A new process restores background preference with a visible window');
 await page.evaluate(()=>window.musebench.backgroundEngine({type:'set',enabled:false}));
 await page.waitForFunction(async()=>!(await window.musebench.appUpdate('status')).blockers.length,{},{timeout:20000});
 const exited=new Promise(resolve=>app.process().once('exit',resolve));await app.evaluate(({app,BrowserWindow,dialog})=>{globalThis.backgroundTrace=[];dialog.showMessageBox=async(_window,options)=>{globalThis.backgroundTrace.push({name:'quit-blocked',detail:options?.detail});return{response:0};};for(const name of ['before-quit','will-quit','window-all-closed'])app.on(name,event=>globalThis.backgroundTrace.push({name,prevented:!!event?.defaultPrevented}));const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html'));w.on('close',event=>globalThis.backgroundTrace.push({name:'window-close',prevented:event.defaultPrevented}));w.on('closed',()=>globalThis.backgroundTrace.push({name:'window-closed'}));setTimeout(()=>w.close(),50);});
 let timer;const exit=await Promise.race([exited,new Promise(resolve=>timer=setTimeout(()=>resolve('timeout'),10000))]);clearTimeout(timer);
 if(exit==='timeout')report.shutdown=await app.evaluate(({BrowserWindow})=>({trace:globalThis.backgroundTrace,windows:BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),visible:w.isVisible()}))}));
 assert.equal(exit,0);app=null;pass('Turning off background mode restores normal window-close shutdown');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;report.pages=app?.windows().map(p=>p.url());console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close().catch(()=>{});}
