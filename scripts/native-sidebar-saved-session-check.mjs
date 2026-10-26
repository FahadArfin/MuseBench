import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (process.env.MUSEBENCH_VERIFY_SAVED_SESSION !== '1') throw Error('Explicit saved-session verification required. Close the normal app first.');
const source = process.env.MUSEBENCH_SAVED_SOURCE === '1';
const output = path.resolve('artifacts/native-sidebar-saved-session',source?'source':'packaged');
await mkdir(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={checkedAt:new Date().toISOString(),variant:source?'source':'packaged',modelRequests:0,accountChanges:0,checks:[]};
const app=await electron.launch({...(!source?{executablePath:path.resolve('release/win-unpacked/MuseBench.exe')}:{ }),args:source?['.']:[],cwd:process.cwd(),env});
const page=await app.firstWindow();
let stage='Open personal workspace';
const state=()=>page.evaluate(()=>window.musebench.personalState());
const record=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
async function remoteBoolean(expression,arg) {
  return app.evaluate(async({BrowserWindow},{expression,arg})=>{
    const main=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow());
    const view=main.contentView.children.find(v=>v.webContents&&v.getVisible());
    if(!view||!view.webContents.getURL().startsWith('https://muse.ai/'))return false;
    return view.webContents.executeJavaScript(`(${expression})(${JSON.stringify(arg)})`);
  },{expression,arg});
}
async function until(check){const deadline=Date.now()+35000;while(Date.now()<deadline){if(await check())return;const current=await state();if(current.error||current.notice)throw Error('Service reported an error or fallback');await new Promise(r=>setTimeout(r,150));}throw Error('Verification timed out');}
try{
  await page.waitForFunction(()=>Boolean(window.musebench));
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  stage='Load real native collection metadata';
// No titles, message bodies, credentials, QR codes, screenshots or auth URLs are
// written to this report. Item names stay only in memory while comparing UI.
  await until(async()=>{const current=await state();return ['chats','ideas','goals'].every(key=>current.library?.[key]?.status==='ready');});
  let current=await state();
  report.counts=Object.fromEntries(['chats','ideas','goals'].map(key=>[key,current.library[key].items.length]));
  assert(current.library.chats.items.length>=1);assert(current.library.ideas.items.length>0);
  record('Signed-in Muse chats, ideas and goals populate native collection groups');
  const main=current.library.chats.items.find(item=>item.title==='Main conversation');
  const idea=current.library.ideas.items[0];
  stage='Filter titles locally';
  const before=current.destination;
  await page.getByRole('textbox',{name:'Filter Muse sidebar',exact:true}).fill(idea.title);
  assert.equal((await state()).destination,before);
  assert.equal(await page.getByRole('group',{name:'Ideas',exact:true}).getByRole('button',{name:idea.title,exact:true}).count(),1);
  await page.getByRole('button',{name:'Clear Muse filter',exact:true}).click();
  record('Local title search filters the native sidebar without navigating Muse');
  stage='Open real idea preview';
  await page.getByRole('group',{name:'Ideas',exact:true}).getByRole('button',{name:idea.title,exact:true}).click();
  await until(()=>remoteBoolean(`title=>Array.from(document.querySelectorAll('[data-pel-impression="idea_preview_dialog_impression"] h2')).some(e=>e.textContent.trim()===title)`,idea.title));
  await new Promise(r=>setTimeout(r,2200));
  assert.equal((await state()).library.selectedId,idea.id);
  record('Selecting a real idea opens its official preview and retains native selection after refresh');
  stage='Reopen a closed idea preview';
  assert.equal(await remoteBoolean(`()=>{const close=document.querySelector('[data-slot="content-area-dialog-surface"] button[aria-label="Close"]');if(!close)return false;close.click();return true;}`),true);
  await until(async()=>(await state()).library.selectedId===null);
  await page.getByRole('group',{name:'Ideas',exact:true}).getByRole('button',{name:idea.title,exact:true}).click();
  await until(()=>remoteBoolean(`title=>Array.from(document.querySelectorAll('[data-pel-impression="idea_preview_dialog_impression"] h2')).some(e=>e.getClientRects().length>0&&e.textContent.trim()===title)`,idea.title));
  assert.equal((await state()).library.selectedId,idea.id);
  record('Closing a real idea preview clears its selection and clicking the same row reopens it');
  stage='Open main conversation';
  await page.getByRole('group',{name:'Muse chats',exact:true}).getByRole('button',{name:main.title,exact:true}).click();
  await until(()=>remoteBoolean(`()=>location.pathname==='/'`));
  assert.equal((await state()).library.selectedId,main.id);
  record('Main conversation opens directly from its native chat row');
  stage='Open an unsent Muse draft';
  await page.getByRole('button',{name:'New Muse chat',exact:true}).click();
  await until(()=>remoteBoolean(`()=>location.pathname==='/thread/new'&&Boolean(document.querySelector('[contenteditable="true"],textarea'))`));
  record('New Muse chat opens the official empty draft without sending a message');
  await page.getByRole('group',{name:'Muse chats',exact:true}).getByRole('button',{name:main.title,exact:true}).click();
  await until(()=>remoteBoolean(`()=>location.pathname==='/'`));
  stage='Verify goal collection';
  await page.getByRole('navigation',{name:'Meta AI navigation',exact:true}).getByRole('button',{name:'Goals',exact:true}).click();
  await until(()=>remoteBoolean(`()=>location.pathname==='/goals'&&Boolean(document.querySelector('#hatch-goals-create'))`));
  if(report.counts.goals===0) assert.equal(await page.getByRole('group',{name:'Goals',exact:true}).getByText('No goals to show yet.',{exact:true}).count(),1);
  record('Goals collection and native empty state match the signed-in account');
  assert.equal(await remoteBoolean(`()=>typeof window.musebench==='undefined'&&typeof require==='undefined'&&typeof process==='undefined'`),true);
  record('Remote Muse retains no local workspace bridge or Node access');
  report.status='passed';
}catch{
  report.status='failed';report.failedStage=stage;process.exitCode=1;
  const current=await state().catch(()=>null);
  if(current)report.diagnostics={destination:current.destination,loading:current.loading,fallback:Boolean(current.notice),error:Boolean(current.error),groups:Object.fromEntries(['chats','ideas','goals'].map(key=>[key,{status:current.library?.[key]?.status,count:current.library?.[key]?.items.length}]))};
  console.log(`FAIL ${stage}`);
}finally{await app.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${output}/report.json`);}
