import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Opt-in live navigation only. No screenshots, titles, descriptions, credentials,
// account IDs or authentication URLs are written. Never launch/create a goal.
if(process.env.MUSEBENCH_VERIFY_SAVED_SESSION!=='1')throw Error('Explicit saved-session verification required. Close the normal app first.');
const source=process.env.MUSEBENCH_SAVED_SOURCE==='1';
const output=path.resolve('artifacts/native-collections-saved-session',source?'source':'packaged');await mkdir(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={checkedAt:new Date().toISOString(),variant:source?'source':'packaged',modelRequests:0,accountChanges:0,checks:[]};
const app=await electron.launch({...(!source?{executablePath:path.resolve('release/win-unpacked/MuseBench.exe')}:{ }),args:source?['.']:[],cwd:process.cwd(),env});const page=await app.firstWindow();
let stage='Load signed-in collections',initial;
const state=()=>page.evaluate(()=>window.musebench.personalState());
const command=value=>page.evaluate(value=>window.musebench.personal(value),value);
const record=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
async function remote(script){return app.evaluate(async({BrowserWindow},script)=>{const win=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow());const view=win.contentView.children.find(v=>v.webContents&&v.getVisible());if(!view||!view.webContents.getURL().startsWith('https://muse.ai/'))return null;return {id:view.webContents.id,value:await view.webContents.executeJavaScript(script)};},script);}
async function until(check){const end=Date.now()+45000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out');}
const metrics=`(()=>{const e=document.querySelector('[data-pel-click="idea_group_row_click"], [data-pel-click="goals_null_state_category_click"]');const row=e?.closest('[role="listitem"]')?.firstElementChild||e;const preview=document.querySelector('[data-slot="content-area-dialog-surface"]:has([data-pel-impression="idea_preview_dialog_impression"]),[data-slot="dialog-surface"]:has([data-slot="dialog-description"])');const bounds=node=>{const r=node?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null};return {native:getComputedStyle(document.body).getPropertyValue('--mb-collection-bg').trim(),time:performance.timeOrigin,row:bounds(row),radius:row?getComputedStyle(row).borderRadius:null,preview:bounds(preview),previewRadius:preview?getComputedStyle(preview).borderRadius:null,categoryCount:document.querySelectorAll('[data-pel-click="goals_null_state_category_click"]').length,width:innerWidth,page:document.documentElement.scrollWidth};})()`;
try{
  await page.waitForFunction(()=>Boolean(window.musebench));await page.getByRole('button',{name:'Muse AI',exact:true}).click();initial=await state();
  await command({type:'presentation',compact:true});await command({type:'navigate',destination:'ideas'});
  await until(async()=>{const s=await state(),m=(await remote(metrics))?.value;return s.library?.ideas?.status==='ready'&&m?.row?.width>100&&m.radius==='12px';});
  let current=await state();report.ideaCount=current.library.ideas.items.length;assert(report.ideaCount>0);
  let measure=await remote(metrics);assert(measure.value.native);assert(measure.value.page<=measure.value.width+1);report.ideasGeometry=measure.value.row;
  record('Existing signed-in Ideas load native rows from the live account');
  stage='Open real idea preview';const selected=current.library.ideas.items[0];await command({type:'selectItem',id:selected.id});
  await until(async()=>{const m=(await remote(metrics))?.value;return m?.preview?.width>100&&m.previewRadius==='16px';});
  const identity=await remote(metrics);const selectedId=(await state()).library.selectedId;assert.equal(selectedId,selected.id);
  record('Native sidebar opens the official idea preview with matching styling');
  stage='Retain preview and refresh metadata';await command({type:'refreshLibrary'});assert.equal((await state()).library.selectedId,selectedId);
  await command({type:'presentation',compact:false});await until(async()=>(await remote(metrics))?.value.native==='');
  await command({type:'presentation',compact:true});await until(async()=>(await remote(metrics))?.value.previewRadius==='16px');
  measure=await remote(metrics);assert.equal(measure.id,identity.id);assert.equal(measure.value.time,identity.value.time);assert.equal((await state()).library.selectedId,selectedId);
  await remote(`(()=>{const e=document.querySelector('[data-slot="content-area-dialog-surface"] button[aria-label="Close"]');if(!e)return false;e.click();return true})()`);
  record('Account refresh and original-layout toggling preserve the same idea document and selection');
  stage='Open live Goals';await command({type:'navigate',destination:'goals'});
  await until(async()=>{const s=await state(),m=(await remote(metrics))?.value;return s.library?.goals?.status==='ready'&&m?.categoryCount>0&&m.row?.width>100&&m.radius==='12px';});
  current=await state();report.goalCount=current.library.goals.items.length;measure=await remote(metrics);report.goalsGeometry=measure.value.row;assert(measure.value.page<=measure.value.width+1);
  record('Goals uses the same signed-in account and styles its live category controls');
  stage='Inspect goal setup without submission';await remote(`document.querySelector('[data-pel-click="goals_null_state_category_click"]').click()`);
  await until(async()=>{const m=(await remote(metrics))?.value;return m?.preview?.width>100&&m.previewRadius==='16px';});
  const goalDocument=await remote(metrics);await command({type:'navigate',destination:'ideas'});await command({type:'navigate',destination:'goals'});
  await until(async()=>(await remote(metrics))?.value.preview?.width>100);measure=await remote(metrics);assert.equal(measure.id,goalDocument.id);assert.equal(measure.value.time,goalDocument.value.time);
  assert.equal(await remote(`(()=>{const e=document.querySelector('[data-slot="dialog-surface"] [data-slot="dialog-close"]');if(!e)return false;e.click();return true})()`).then(r=>r?.value),true);
  record('Official goal setup keeps state across section switches and closes without creating a goal');
  stage='Verify isolation';const prefs=await app.evaluate(({webContents},id)=>{const p=webContents.fromId(id).getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,preload:!!p.preload,webSecurity:p.webSecurity};},measure.id);assert.deepEqual(prefs,{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:false,webSecurity:true});assert.equal((await remote(`typeof window.musebench==='undefined'&&typeof require==='undefined'&&typeof process==='undefined'`)).value,true);record('Saved session remains sandboxed without Node or local workspace access');report.status='passed';
}catch(error){report.status='failed';report.failedStage=stage;process.exitCode=1;console.log(`FAIL ${stage}: ${String(error.message).split('\n')[0]}`);}
finally{if(initial)await command({type:'presentation',compact:initial.compact}).catch(()=>{});await app.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${output}/report.json`);}
