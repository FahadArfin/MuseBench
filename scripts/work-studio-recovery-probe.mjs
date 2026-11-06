import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Runs the actual current source app with isolated storage. The only injected
// behavior is a bounded native IPC commit failure for this probe's one item.
// It does not touch an installed app/profile or replace the renderer bridge.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(path.join(root,'artifacts','work-studio'),{recursive:true});
const output=await mkdtemp(path.join(root,'artifacts','work-studio','recovery-'));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_EXECUTABLE'])delete env[key];
const report={startedAt:new Date().toISOString(),sourceApp:true,output,checks:[],rendererErrors:[],keyboard:[],displayEmulation:[],limitations:[
  'Commit failure is deliberately injected in the isolated Electron main-process handler; this is failure/recovery UI acceptance, not a physical disk-failure simulation.',
  '100%, 125%, 150% and 200% are Electron webContents page zoom factors on this host. They exercise responsive layout and hit testing, not physical Windows display DPI or monitor hardware.',
  'Keyboard checks prove observed focus movement; they do not establish screen-reader speech or physical OS IME behavior.'
]};
try{report.revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();}catch{}
report.sourceHashes=Object.fromEntries(await Promise.all(['scripts/work-studio-recovery-probe.mjs','electron/main.mjs','src/ui/WorkWorkspace.tsx','src/ui/work/WorkStudio.tsx','src/shared/work-studio-session.mjs','dist/index.html'].map(async file=>[file,await readFile(path.join(root,file)).then(bytes=>createHash('sha256').update(bytes).digest('hex')).catch(()=>null)])));
let app,page,itemId,secondItemId,injected=false,savedDocument;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const studio=()=>page.getByRole('region',{name:'Creative studio',exact:true});
const banner=()=>page.locator('.studio-retained-drafts');
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,80));}throw Error('Timed out: '+label);}
async function request(request){const result=await page.evaluate(request=>window.musebench.workStudio(request),request);if(result?.error)throw Error(typeof result.error==='string'?result.error:result.error.message||JSON.stringify(result.error));return result;}
async function read(id=itemId){return(await request({type:'read',itemId:id})).document;}
async function launch(){app=await electron.launch({cwd:root,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.rendererErrors.push(error.message.replace(/access=[A-Za-z0-9_-]+/g,'access=[redacted]')));await page.waitForFunction(()=>typeof window.musebench?.workStudio==='function',null,{timeout:60000});await page.getByRole('group',{name:'Choose workspace',exact:true}).waitFor();}
async function workHome(){await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.getByRole('group',{name:'Chat or Work',exact:true}).getByRole('button',{name:'Work',exact:true}).click();}
async function open(id){if(await studio().isVisible().catch(()=>false))await studio().getByRole('button',{name:'Back to Work home',exact:true}).click();await page.locator(`[data-focus-key="recent-${id}"]`).click();await studio().waitFor();await until(async()=>await page.evaluate(id=>window.musebench.workState().then(state=>state.activeId===id),id),'selected item identity');await studio().getByRole('button',{name:'Save project',exact:true}).waitFor();}
async function waitSaved(){await until(async()=>await studio().locator('.studio-save-state').innerText()==='Saved','saved toolbar state');return read();}
async function installCommitFailure(){await app.evaluate(({ipcMain},targetId)=>{
  const name='musebench:work-studio',original=ipcMain._invokeHandlers?.get(name);
  if(typeof original!=='function')throw Error('Native IPC interception unavailable; no renderer mock fallback permitted.');
  globalThis.__workRecoveryProbe={original,targetId,fail:true,rejections:0,closeBlocked:0};
  ipcMain.removeHandler(name);ipcMain.handle(name,(event,request,...args)=>{
    const probe=globalThis.__workRecoveryProbe;
    if(probe.fail&&request?.type==='commit'&&request.itemId===probe.targetId){probe.rejections++;return {error:{code:'PROBE_SAVE_FAILURE',message:'Synthetic native commit failure: recovery probe'}};}
    return probe.original(event,request,...args);
  });
},itemId);injected=true;}
async function restoreHandler(){if(!app||!injected)return;await app.evaluate(({ipcMain,dialog})=>{const probe=globalThis.__workRecoveryProbe;if(probe?.originalMessageBox)dialog.showMessageBox=probe.originalMessageBox;if(probe?.original){ipcMain.removeHandler('musebench:work-studio');ipcMain.handle('musebench:work-studio',probe.original);}delete globalThis.__workRecoveryProbe;});injected=false;}
async function activeFocus(){return page.evaluate(()=>{const e=document.activeElement;return {tag:e?.tagName,label:e?.getAttribute('aria-label')||e?.textContent?.trim().slice(0,80),visible:!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0};});}
try{
  await launch();await workHome();
  const created=await request({type:'create',kind:'design',title:'Recovery draft original'});itemId=created.itemId;assert(itemId);
  const second=await request({type:'create',kind:'design',title:'Recovery navigation target'});secondItemId=second.itemId;assert(secondItemId&&secondItemId!==itemId);
  await open(itemId);await waitSaved();const before=await read();assert.equal(before.data.artboards[0].nodes.length,0);
  await installCommitFailure();
  await studio().getByRole('button',{name:'Add text',exact:true}).click();const text='Retained unsaved \u65e5\u672c\u8a9e \u0627\u0644\u0639\u0631\u0628\u064a\u0629';await studio().getByLabel('Layer text',{exact:true}).fill(text);
  await until(async()=>await studio().locator('.studio-save-state').innerText()==='Save failed','visible save failure');
  assert((await studio().getByRole('alert').innerText()).includes('Synthetic native commit failure'));
  assert.deepEqual(await read(),before,'Native committed document stays intact after injected failure');
  report.injectedFailures=await app.evaluate(()=>globalThis.__workRecoveryProbe.rejections);assert(report.injectedFailures>0);
  pass('Actual editor commit failure leaves a dirty draft, visible Save failed state and unchanged last native revision');
  // Back deliberately flushes and remains in the editor when save fails.
  // The independent saved-item navigation is the real boundary that retains it.
  await page.getByRole('navigation',{name:'Saved work',exact:true}).getByRole('button',{name:/Recovery navigation target/}).click();
  await until(async()=>(await page.evaluate(()=>window.musebench.workState())).activeId===secondItemId,'sidebar selects other item');
  await until(async()=>await studio().getByRole('textbox',{name:'Project title',exact:true}).inputValue()==='Recovery navigation target','other item editor identity');
  await banner().getByRole('button',{name:'Reopen draft',exact:true}).waitFor();
  await studio().getByRole('button',{name:'Back to Work home',exact:true}).click();
  await banner().getByRole('button',{name:'Reopen draft',exact:true}).waitFor();await banner().getByRole('button',{name:'Retry save',exact:true}).waitFor();
  assert((await banner().innerText()).includes('Recovery draft original'));
  await page.screenshot({path:path.join(output,'retained-home.png')});
  const homeGuard=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});const allowed=window.dispatchEvent(event);return {allowed,prevented:event.defaultPrevented};});assert.deepEqual(homeGuard,{allowed:false,prevented:true});
  pass('Leaving failed editor exposes retained Reopen draft / Retry save banner and renderer beforeunload guard');
  await page.locator(`[data-focus-key="recent-${secondItemId}"]`).click();await studio().waitFor();
  assert((await banner().innerText()).includes('Recovery draft original'));
  assert.equal((await read(secondItemId)).data.artboards[0].nodes.length,0,'Dirty content never moves to navigation target');
  await banner().getByRole('button',{name:'Reopen draft',exact:true}).click();await studio().waitFor();
  await until(async()=>(await page.evaluate(()=>window.musebench.workState())).activeId===itemId,'reopened original draft');
  await studio().getByRole('button',{name:/^text layer Retained unsaved/}).waitFor();
  await studio().getByRole('button',{name:/^text layer Retained unsaved/}).click();assert.equal(await studio().getByLabel('Layer text',{exact:true}).inputValue(),text);
  pass('Navigation to another item and Reopen draft retain original text and item ownership');
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.on('will-prevent-unload',()=>{globalThis.__workRecoveryProbe.closeBlocked++;});win.close();});
  await until(async()=>await app.evaluate(()=>globalThis.__workRecoveryProbe.closeBlocked)>0,'native beforeunload blocks actual window close');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(win=>!win.isDestroyed()).length),1);
  assert.equal(await studio().getByLabel('Layer text',{exact:true}).inputValue(),text);
  pass('Actual owned BrowserWindow.close is prevented while retained dirty draft exists');
  await app.evaluate(({app,dialog})=>{const probe=globalThis.__workRecoveryProbe;probe.quitMessages=[];probe.originalMessageBox=dialog.showMessageBox;dialog.showMessageBox=async(...args)=>{const options=args.at(-1);probe.quitMessages.push({message:options?.message||'',detail:options?.detail||''});return {response:0,checkboxChecked:false};};app.quit();});
  await until(async()=>await app.evaluate(()=>globalThis.__workRecoveryProbe.quitMessages.length)>0,'direct Quit visibly reports unsaved work');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(win=>!win.isDestroyed()).length),1);
  assert.deepEqual(await read(),before,'Native document service stays usable after blocked direct Quit');
  assert.equal(await studio().getByLabel('Layer text',{exact:true}).inputValue(),text);
  report.blockedQuitMessages=await app.evaluate(({dialog})=>{const probe=globalThis.__workRecoveryProbe;dialog.showMessageBox=probe.originalMessageBox;delete probe.originalMessageBox;return probe.quitMessages;});
  assert(report.blockedQuitMessages.some(value=>/unsaved|draft|save/i.test(value.message+' '+value.detail)),'Quit blocker explains retained unsaved work');
  pass('Direct app.quit is blocked before services close, native reads stay usable and exact dirty draft remains');
  await app.evaluate(()=>{globalThis.__workRecoveryProbe.fail=false;});
  await studio().getByRole('button',{name:'Retry save',exact:true}).click();savedDocument=await waitSaved();
  assert.equal(savedDocument.data.artboards[0].nodes.find(node=>node.type==='text').text,text);assert(savedDocument.revision>before.revision);
  const cleanGuard=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});return {allowed:window.dispatchEvent(event),prevented:event.defaultPrevented};});assert.deepEqual(cleanGuard,{allowed:true,prevented:false});
  await studio().getByRole('button',{name:'Back to Work home',exact:true}).click();await until(async()=>await banner().count()===0,'retained banner clears after successful retry');
  await open(itemId);pass('Retry saves exact retained draft to original native item, clears retained banner and releases unload guard');
  await studio().getByRole('button',{name:'Back to Work home',exact:true}).focus();
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');report.keyboard.push(await activeFocus());}
  for(const label of ['Project title','Save project','Assets','Versions','Jobs','Export'])assert(report.keyboard.some(entry=>entry.label===label&&entry.visible),`Tab reaches ${label}`);
  await studio().getByRole('button',{name:/^text layer Retained unsaved/}).click();await studio().getByLabel('Layer x',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal((await activeFocus()).label,'Layer y');
  pass('Real Tab focus reaches title, save/resources controls and consecutive numeric layer properties');
  report.controlContrast=await page.evaluate(()=>{const rgb=value=>{const m=value.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]},lum=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),background=element=>{for(let current=element;current;current=current.parentElement){const value=getComputedStyle(current).backgroundColor;if(value!=='transparent'&&value!=='rgba(0, 0, 0, 0)')return value;}return 'rgb(255,255,255)';};return [['Add text',document.querySelector('.work-design-editor [role=toolbar] button')],['Artboard name',document.querySelector('.work-design-editor [aria-label=\"Artboard name\"]')],['Layer x',document.querySelector('.work-design-editor [aria-label=\"Layer x\"]')]].map(([name,element])=>{if(!element)throw Error('Missing contrast control '+name);const color=getComputedStyle(element).color,bg=background(element),a=lum(color),b=lum(bg);return {name,color,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});});for(const control of report.controlContrast)assert(control.ratio>=4.5,`${control.name} text/background contrast ${control.ratio.toFixed(2)} must be at least4.5`);await page.screenshot({path:path.join(output,'native-controls.png')});pass('Actual native design toolbar and property fields have measured text/background contrast of at least4.5');
  for(const factor of [1,1.25,1.5,2]){
    await app.evaluate(({BrowserWindow},factor)=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1440,1000);win.webContents.setZoomFactor(factor);},factor);
    await page.waitForFunction(factor=>Math.abs(devicePixelRatio-factor)<.01||innerWidth<1440/factor+50,factor);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const metrics=await page.evaluate(()=>({innerWidth,innerHeight,devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    assert.equal(metrics.overflow,false,`No page overflow at ${factor*100}% emulated zoom`);
    assert(await studio().getByRole('button',{name:'Back to Work home',exact:true}).isVisible());
    await page.screenshot({path:path.join(output,`zoom-${factor*100}.png`)});report.displayEmulation.push({factor,kind:'Electron page zoom, not physical OS DPI',...metrics});
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));pass('100%, 125%, 150% and 200% emulated page zoom preserve navigation and avoid page horizontal overflow');
  await restoreHandler();let closeTimer;await Promise.race([app.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Clean app did not exit within30seconds')),30000);})]).finally(()=>clearTimeout(closeTimer));app=null;pass('After successful save the owned app closes normally without bypassing unload protection');
  await launch();await workHome();await open(itemId);await waitSaved();assert.deepEqual(await read(),savedDocument);
  assert.equal((await page.evaluate(()=>window.musebench.workState())).task?.runs?.length??0,0);assert.equal(await banner().count(),0);
  await page.screenshot({path:path.join(output,'saved-after-restart.png')});pass('Exact recovered native document survives full isolated app restart without a Muse request');
  assert.deepEqual(report.rendererErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;try{await page?.screenshot({path:path.join(output,'failure.png')});}catch{}}
finally{
  await restoreHandler().catch(()=>{});
  // If an assertion fails while a deliberately unsavable draft exists, normal
  // app.close correctly hangs on its guard. Destroy only this probe's owned
  // windows during cleanup; the isolated failure report states the outcome.
  if(app){try{await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();});}catch{}await app.close().catch(()=>{});}
  report.completedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Work studio recovery report: '+path.join(output,'report.json'));
}
