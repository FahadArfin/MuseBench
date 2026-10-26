import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// All service HTML and content are fictional; no real account or model traffic.
const root=process.cwd(),html=await readFile('scripts/fixtures/personal-native-collections.html','utf8');
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/native-collections',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/native-collections',`${variant}-`));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={checkedAt:new Date().toISOString(),variant,content:'fictional offline fixture',modelRequests:0,checks:[],errors:[],captures:[]};
let app,page,stage='Launch',shot=0;
const appearance={theme:'dark',textSize:'medium',font:'system',reducedMotion:false};
const record=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
async function until(check,label){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,60));}throw Error(`Timed out: ${label}`);}
const command=value=>page.evaluate(value=>window.musebench.personal(value),value);
async function visible(){let view;await until(async()=>view=await app.evaluate(({BrowserWindow})=>{const v=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).contentView.children.find(v=>v.webContents&&v.getVisible());return v?{id:v.webContents.id,url:v.webContents.getURL()}:null;}),'visible view');return view;}
const evaluate=(id,script)=>app.evaluate(({webContents},{id,script})=>webContents.fromId(id).executeJavaScript(script),{id,script});
const click=(id,selector)=>evaluate(id,`document.querySelector(${JSON.stringify(selector)}).click()`);
async function navigate(destination){await command({type:'navigate',destination});const view=await visible();await until(()=>evaluate(view.id,'Boolean(window.__collectionFixture)'),'fixture loaded');return view;}
async function capture(id,name){await evaluate(id,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const bytes=await app.evaluate(async({webContents},id)=>(await webContents.fromId(id).capturePage()).toPNG().toString('base64'),id);const file=path.join(output,`${++shot}-${name}.png`);await writeFile(file,Buffer.from(bytes,'base64'));report.captures.push(file);}
async function geometry(id){return evaluate(id,`(()=>{const card=document.querySelector('[data-pel-click="idea_group_row_click"],.goal-card'),column=document.querySelector('.collection-column'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,bottom:r.bottom}},s=getComputedStyle(card);return {viewport:innerWidth,page:document.documentElement.scrollWidth,column:rect(column),card:rect(card),font:s.fontFamily,size:getComputedStyle(card.querySelector('h3')).fontSize,background:getComputedStyle(document.body).backgroundColor,radius:getComputedStyle(card.closest('.idea-row')||card).borderRadius,native:getComputedStyle(document.body).getPropertyValue('--mb-collection-bg').trim()};})()`);}
async function unchanged(id,identity){const value=await evaluate(id,'({documentId:window.__collectionFixture.documentId,started:window.__collectionFixture.started,created:window.__collectionFixture.created,deleted:window.__collectionFixture.deleted,approved:window.__collectionFixture.approved})');assert.deepEqual(value,{documentId:identity,started:0,created:0,deleted:0,approved:0});}
async function resize(width,height){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).setContentSize(...size),[width,height]);await page.waitForFunction(size=>innerWidth===size[0]&&innerHeight===size[1],[width,height]);}
try{
  app=await electron.launch({cwd:root,args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
  page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>Boolean(window.musebench));await resize(1440,900);
  await app.evaluate(async({session},html)=>{for(const name of ['persist:musebench-personal-muse','persist:musebench-personal-chat'])await session.fromPartition(name).protocol.handle('https',request=>['muse.ai','auth.muse.ai','www.meta.ai','meta.ai'].includes(new URL(request.url).hostname)?new Response(html,{headers:{'content-type':'text/html'}}):new Response('Offline',{status:451}));},html);
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  let ideas=await navigate('ideas');const ideaIdentity=await evaluate(ideas.id,'window.__collectionFixture.documentId');
  stage='Native Ideas collection';await until(async()=>(await geometry(ideas.id)).native==='#181818','native collection presentation');
  let g=await geometry(ideas.id);assert.equal(g.radius,'12px');assert.equal(g.background,'rgb(24, 24, 24)');assert.match(g.font,/Segoe UI/);assert(g.column.width<=900);assert(g.page<=g.viewport+1);await capture(ideas.id,'ideas-dark');record('Ideas groups and rows use native typography, surfaces and contained layout');

  stage='Idea preview and reversible presentation';await click(ideas.id,'[data-pel-click="idea_group_row_click"]');
  await until(()=>evaluate(ideas.id,'Boolean(document.querySelector("[role=dialog]"))'),'idea preview');
  const previewTitle=await evaluate(ideas.id,'document.querySelector("[role=dialog] h2").textContent');
  assert.equal(await evaluate(ideas.id,'getComputedStyle(document.querySelector("[data-slot=content-area-dialog-surface]")).borderRadius'),'16px');
  await capture(ideas.id,'idea-preview-dark');
  await command({type:'presentation',compact:false});await until(async()=>(await geometry(ideas.id)).native==='','original layout');
  assert.equal(await evaluate(ideas.id,'getComputedStyle(document.querySelector("[data-slot=content-area-dialog-surface]")).borderRadius'),'32px');
  await command({type:'appearance',appearance:{...appearance,theme:'light',font:'mono',textSize:'large',reducedMotion:true}});assert.equal((await geometry(ideas.id)).native,'');
  await command({type:'presentation',compact:true});await until(async()=>(await geometry(ideas.id)).native==='#faf9f7','light native layout');
  assert.equal(await evaluate(ideas.id,'document.querySelector("[role=dialog] h2").textContent'),previewTitle);await unchanged(ideas.id,ideaIdentity);
  const readable=await evaluate(ideas.id,`(()=>{const p=getComputedStyle(document.querySelector('[data-pel-impression="idea_preview_dialog_impression"] p'));return {font:p.fontFamily,size:p.fontSize,duration:parseFloat(getComputedStyle(document.querySelector('.fixture-motion')).animationDuration)}})()`);assert.match(readable.font,/Consolas/);assert.equal(readable.size,'16px');assert(readable.duration<0.01);
  await capture(ideas.id,'idea-preview-light');await click(ideas.id,'[aria-label="Close"]');record('Idea previews retain original controls and state across theme, font, motion and full-layout changes');

  stage='Synced Ideas metadata';await evaluate(ideas.id,'window.__collectionFixture.updateCollection()');await command({type:'refreshLibrary'});
  await until(()=>page.getByRole('group',{name:'Ideas',exact:true}).getByRole('button',{name:'Workspace idea updated',exact:true}).count(),'updated idea sidebar');
  assert.equal(await page.getByRole('group',{name:'Ideas',exact:true}).getByRole('button',{name:'A newly synced idea',exact:true}).count(),1);assert.equal((await geometry(ideas.id)).radius,'12px');await capture(ideas.id,'ideas-light-updated');record('Service-rendered idea updates and new rows reach the native sidebar without a local collection copy');

  stage='Goals collection and updates';const goals=await navigate('goals'),goalIdentity=await evaluate(goals.id,'window.__collectionFixture.documentId');await until(async()=>(await geometry(goals.id)).native==='#faf9f7','Goals styling');
  assert.equal((await geometry(goals.id)).radius,'12px');assert.equal(await evaluate(goals.id,'document.querySelectorAll("[data-pel-click=goals_null_state_category_click]").length'),3);assert.equal(await evaluate(goals.id,'document.querySelectorAll(".goal-card:disabled").length'),1);
  await evaluate(goals.id,'window.__collectionFixture.updateCollection()');await command({type:'refreshLibrary'});await until(()=>page.getByRole('group',{name:'Goals',exact:true}).getByRole('button',{name:'First version ready for review',exact:true}).count(),'updated goal sidebar');
  assert.equal(await evaluate(goals.id,'document.querySelector(".goal-card [role=status]").textContent'),'Completed');await capture(goals.id,'goals-light');record('Goal categories, populated cards and status updates keep their service state and update native rows');

  stage='Goal setup retention';await click(goals.id,'[data-pel-click="goals_null_state_category_click"]');await navigate('ideas');await navigate('goals');
  assert.equal(await evaluate(goals.id,'document.querySelector("[role=dialog] h2").textContent'),'Create a new goal');assert.equal(await evaluate(goals.id,'getComputedStyle(document.querySelector("[data-slot=dialog-surface]")).borderRadius'),'16px');
  await command({type:'appearance',appearance});await capture(goals.id,'goal-setup-dark');await unchanged(goals.id,goalIdentity);await click(goals.id,'[aria-label="Close"]');record('Goal setup remains open when switching sections and does not start or approve a goal');

  stage='Narrow layout and menus';await resize(390,844);ideas=await navigate('ideas');await until(async()=>(await geometry(ideas.id)).viewport<410,'narrow viewport');g=await geometry(ideas.id);assert(g.page<=g.viewport+1);assert(g.card.x>=0&&g.card.right<=g.viewport+1);await click(ideas.id,'[data-pel-click="idea_menu_click"]');
  const menu=await evaluate(ideas.id,`(()=>{const e=document.querySelector('[role=menu]'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,right:r.right,width:r.width,viewport:innerWidth,color:s.color,background:s.backgroundColor}})()`);assert(menu.width>0&&menu.x>=0&&menu.right<=menu.viewport+1);assert.notEqual(menu.color,menu.background);await click(ideas.id,'[role=menuitem]:last-child');
  await capture(ideas.id,'ideas-narrow');await navigate('goals');await click(goals.id,'[data-pel-click="goals_null_state_category_click"]');
  const bounds=await evaluate(goals.id,`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight}})()`);assert(bounds.x>=0&&bounds.right<=bounds.w+1&&bounds.bottom<=bounds.h+1);await capture(goals.id,'goal-setup-narrow');await unchanged(ideas.id,ideaIdentity);await unchanged(goals.id,goalIdentity);record('Narrow collections, option menus and setup dialogs remain reachable without horizontal overflow');

  stage='Hydration and origin guards';await click(goals.id,'[aria-label="Close"]');await evaluate(goals.id,'window.__collectionFixture.unrecognize()');assert.equal((await geometry(goals.id)).native,'');await evaluate(goals.id,'document.querySelector(".scroller").parentElement.setAttribute("data-hatch-full-page-shell","")');assert.equal((await geometry(goals.id)).native,'#181818');
  await app.evaluate(({webContents},id)=>webContents.fromId(id).loadURL('https://auth.muse.ai/fixture-login'),goals.id);await until(()=>evaluate(goals.id,'Boolean(window.__collectionFixture)'),'auth fixture');assert.equal((await geometry(goals.id)).native,'');
  const meta=await navigate('chat');assert.equal((await geometry(meta.id)).native,'');record('Late recognized markup receives styles; unknown and authentication layouts and regular Meta AI remain original');

  stage='Browser isolation';const isolation=await app.evaluate(({webContents},id)=>{const p=webContents.fromId(id).getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,preload:!!p.preload};},meta.id);assert.deepEqual(isolation,{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:false});assert.equal(await evaluate(meta.id,'typeof window.musebench'), 'undefined');assert.deepEqual(report.errors,[]);record('Remote collections retain the sandbox and no workspace bridge; no creation, deletion or approval was invoked');report.status='passed';
}catch(error){report.status='failed';report.failedStage=stage;report.error=error.message;process.exitCode=1;console.log(`FAIL ${stage}: ${error.message}`);}
finally{await app?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${output}/report.json`);}
