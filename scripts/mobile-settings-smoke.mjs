import {createServer} from 'vite';
import {chromium,_electron as electron} from 'playwright';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';

const output=path.resolve('artifacts/mobile-settings');
await mkdir(output,{recursive:true});
const checks=[],exits=[];let phase='setup';
async function bounded(work,label,ms=12000){
 let timer;try{return await Promise.race([Promise.resolve(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' exceeded its deadline.')),ms);})]);}finally{clearTimeout(timer);}
}
function observeExit(child){
 if(child.exitCode!==null||child.signalCode)return Promise.resolve({code:child.exitCode,signal:child.signalCode});
 return new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
}
async function identifyFixture(app,profile){
 const identity=await bounded(app.evaluate(({app,dialog})=>{
  globalThis.__mobileSmokeDialogs=[];
  const original=dialog.showMessageBox;
  dialog.showMessageBox=function(...args){
   const options=args.find(value=>value&&typeof value==='object'&&typeof value.message==='string');
   if(options){const clean=(value,max)=>typeof value==='string'?value.slice(0,max):'';globalThis.__mobileSmokeDialogs.push({title:clean(options.title,200),message:clean(options.message,500),detail:clean(options.detail,2000)});globalThis.__mobileSmokeDialogs=globalThis.__mobileSmokeDialogs.slice(-5);}
   return original.apply(this,args);
  };
  return{pid:process.pid,parentPid:process.ppid,debugPort:process.debugPort,userData:app.getPath('userData')};
 }),'Fixture identity',3000);
 assert.equal(path.resolve(identity.userData).toLowerCase(),path.resolve(profile).toLowerCase(),'The smoke must own only its temporary profile.');
 assert.ok(identity.pid===app.process().pid||identity.parentPid===app.process().pid,'The Electron process must belong to this smoke.');
 return identity;
}
async function inspectOwnedFixture(identity,expression){
 // Playwright closes its main debugger connection as soon as app.quit() is
 // requested. A blocked quit therefore needs a separate bounded connection
 // to the same owned fixture for diagnostics and failed-fixture retirement.
 const targets=await bounded(fetch(`http://127.0.0.1:${identity.debugPort}/json/list`).then(response=>response.json()),'Fixture inspector discovery',2000);
 const target=targets.find(value=>value.type==='node');if(!target)throw Error('The owned fixture inspector is unavailable.');
 const ws=new WebSocket(target.webSocketDebuggerUrl);
 try{return await bounded(new Promise((resolve,reject)=>{
  ws.addEventListener('open',()=>{
   const source=`(()=>{const electron=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');const actual=electron.app.getPath('userData');if(process.pid!==${identity.pid}||process.ppid!==${identity.parentPid}||actual!==${JSON.stringify(identity.userData)})throw Error('The fixture identity no longer matches.');${expression}})()`;
   ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:source,returnByValue:true}}));
  });
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id===1){if(message.result?.exceptionDetails)reject(Error('The owned fixture inspector rejected the query.'));else resolve(message.result?.result?.value);}});
  ws.addEventListener('error',()=>reject(Error('The owned fixture inspector disconnected.')));
  ws.addEventListener('close',()=>reject(Error('The owned fixture inspector closed.')));
 }),'Owned fixture inspector query',2000);}finally{ws.close();}
}
async function closeDesktop(app,identity,exited){
 try{
  const [,exit]=await bounded(Promise.all([app.close(),exited]),'Desktop fixture close');
  assert.equal(exit.code,0,'The desktop fixture must exit normally; forced or failed cleanup is not a passing smoke.');
  assert.equal(exit.signal,null,'The desktop fixture must not be terminated by a signal.');
  return{pid:identity.pid,...exit};
 }catch(error){
  const diagnostic={status:'failed',phase,error:error.message,fixture:identity,retirement:'not needed'};
  if(app.process().exitCode===null&&!app.process().signalCode){
   try{diagnostic.observed=await inspectOwnedFixture(identity,"return{dialogs:globalThis.__mobileSmokeDialogs??[],windows:electron.BrowserWindow.getAllWindows().map(window=>({id:window.id,enabled:window.isEnabled(),visible:window.isVisible(),loading:window.webContents.isLoading()}))};");}catch{diagnostic.observationError='The fixture did not provide bounded shutdown diagnostics.';}
   diagnostic.retirement='unconfirmed';
   try{await inspectOwnedFixture(identity,'electron.app.exit(1);');}catch{/* A deliberate exit may close the debugger before its reply. */}
   try{diagnostic.retiredExit=await bounded(exited,'Failed fixture retirement',3000);diagnostic.retirement='forced failed-fixture exit';}catch{diagnostic.retirement='unconfirmed; the captured fixture PID still requires cleanup';}
  }else diagnostic.observedExit={code:app.process().exitCode,signal:app.process().signalCode};
  await writeFile(path.join(output,'shutdown-failure.json'),JSON.stringify(diagnostic,null,2));
  throw error;
 }
}

try{
 for(const variant of ['preview','desktop']){
  let server,browser,app,page,profile,identity,exited,bodyFailure;
  try{
   phase=variant+':startup';
   if(variant==='preview'){
    server=await createServer({configFile:'vite.preview.config.mjs',server:{host:'127.0.0.1',port:43197,strictPort:true}});await server.listen();
    browser=await chromium.launch();page=await browser.newPage({viewport:{width:1400,height:1000}});await page.goto('http://127.0.0.1:43197/preview.html');
   }else{
    profile=await mkdtemp(path.join(output,'profile-'));
    app=await electron.launch({args:['.','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],env:isolatedDesktopEnvironment(profile)});
    exited=observeExit(app.process());identity=await identifyFixture(app,profile);
    await app.firstWindow();const deadline=Date.now()+30000;
    while(!page&&Date.now()<deadline){page=app.windows().find(item=>item.url().includes('/dist/index.html'));if(!page)await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(page,'Desktop shell opened');
   }
   phase=variant+':settings';
   await page.getByRole('button',{name:'Profile menu',exact:true}).click();
   await page.getByRole('menuitem',{name:/^Settings/}).click();
   await page.getByRole('button',{name:'Mobile devices',exact:true}).click();
   await page.getByText('Desktop connection is off',{exact:true}).waitFor();
   phase=variant+':enable';await page.getByRole('button',{name:'Turn on',exact:true}).click();
   await page.getByText('Desktop connection is on',{exact:true}).waitFor();
   if(variant==='desktop')await page.getByLabel('Desktop address',{exact:true}).selectOption('127.0.0.1');
   phase=variant+':pair';await page.getByRole('button',{name:'Pair a device',exact:true}).click();
   await page.getByRole('button',{name:'Copy pairing link',exact:true}).waitFor();
   if(variant==='desktop')await page.getByAltText('Scan to pair this desktop').waitFor();
   await page.screenshot({path:path.join(output,variant+'.png')});
   phase=variant+':disable';await page.getByRole('button',{name:'Turn off',exact:true}).click();
   await page.getByText('Desktop connection is off',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Copy pairing link',exact:true}).count(),0);
  }catch(error){bodyFailure=error;}
  finally{
   phase=variant+':cleanup';
   const results=await Promise.allSettled([
    app?(identity?closeDesktop(app,identity,exited):bounded(app.close(),'Uninitialized desktop fixture close')):Promise.resolve(),
    browser?bounded(browser.close(),'Preview browser close'):Promise.resolve(),
    server?bounded(server.close(),'Preview server close'):Promise.resolve(),
   ]);
   const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
   if(bodyFailure)failures.unshift(bodyFailure);
   if(failures.length)throw new AggregateError(failures,'Mobile Settings fixture failed.');
   if(app)exits.push(results[0].value);
  }
  checks.push(`${variant}: shared Settings panel, explicit enable, pairing, disable invalidates code`);
 }
 const report={status:'passed',checks,desktopExits:exits};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){
 const report={status:'failed',checks,phase,error:error.message,...(error.errors?{errors:error.errors.map(item=>item.message)}:{}),desktopExits:exits};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));throw error;
}
