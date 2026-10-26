import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Opt-in existing-profile check, with a temporary unsent draft only when empty.
// No screenshots, message text,
// chat titles, auth URLs, draft text, credentials or account identifiers saved.
if (process.env.MUSEBENCH_VERIFY_SAVED_SESSION !== '1') throw Error('Explicit saved-session verification required. Close the normal app first.');
const source = process.env.MUSEBENCH_SAVED_SOURCE === '1';
const output = path.resolve('artifacts/native-chat-saved-session', source ? 'source' : 'packaged');
await mkdir(output, { recursive:true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.MUSEBENCH_DEV;
const report = { checkedAt:new Date().toISOString(), variant:source?'source':'packaged', modelRequests:0, accountChanges:0, checks:[] };
const app = await electron.launch({ ...(source ? {} : { executablePath:path.resolve('release/win-unpacked/MuseBench.exe') }), args:source?['.']:[], cwd:process.cwd(), env });
const page = await app.firstWindow();
let stage = 'Open signed-in Muse', initialCompact, testDraftView;
const testDraft = 'MuseBench appearance check (unsent).';
const state = () => page.evaluate(() => window.musebench.personalState());
const record = name => { report.checks.push(name); console.log(`PASS ${name}`); };
async function remote(script) {
  return app.evaluate(async ({ BrowserWindow }, script) => {
    const main = BrowserWindow.getAllWindows().find(win => !win.getParentWindow());
    const view = main.contentView.children.find(view => view.webContents && view.getVisible());
    if (!view || !view.webContents.getURL().startsWith('https://muse.ai/')) return null;
    return { id:view.webContents.id, value:await view.webContents.executeJavaScript(script) };
  }, script);
}
async function until(check) { const end=Date.now()+45000; while(Date.now()<end) { if(await check()) return; await new Promise(resolve=>setTimeout(resolve,150)); } throw Error('Timed out'); }
const metrics = `(()=>{
  const get=s=>document.querySelector(s), rect=e=>{const r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null}, style=e=>e?getComputedStyle(e):null;
  const editor=get('[data-hatch-composer-chrome] textarea,[data-hatch-composer-chrome] [contenteditable="true"]'),chrome=get('[data-hatch-composer-chrome]'),bubble=get('[data-message-role="assistant"] .hatch-chat-groupable-bubble'),status=get('[data-hatch-status-panel-card]');
  return {ready:!!editor&&!!chrome&&!!get('[data-hatch-chat-content]'),native:getComputedStyle(document.body).getPropertyValue('--mb-chat-size').trim(),composerRadius:style(chrome)?.borderRadius,inputMinHeight:style(editor)?.minHeight,assistantBackground:style(bubble)?.backgroundColor,documentTime:performance.timeOrigin,composer:rect(chrome),feed:rect(get('[data-hatch-vt-pane="chat-feed"]')),log:rect(get('[role="log"][data-hatch-chat-column]')),panel:rect(status),panelVisible:!!status&&style(status).display!=='none'&&status.getClientRects().length>0,controls:Array.from(chrome?.querySelectorAll('button')||[]).filter(e=>e.getClientRects().length).map(e=>({rect:rect(e),disabled:e.disabled})),bridge:typeof window.musebench,require:typeof require,process:typeof process};
})()`;
const readDraft = `(()=>{const e=document.querySelector('[data-hatch-composer-chrome] textarea,[data-hatch-composer-chrome] [contenteditable="true"]');return e?(e.tagName==='TEXTAREA'?e.value:e.textContent):null})()`;
try {
  await page.waitForFunction(()=>Boolean(window.musebench));
  await page.getByRole('button',{name:'Muse AI',exact:true}).click();
  await page.getByRole('navigation',{name:'Meta AI navigation',exact:true}).getByRole('button',{name:'Muse AI bot',exact:true}).click();
  await until(async()=>{const m=(await remote(metrics))?.value;return m?.ready&&m.composer?.width>100&&m.composer?.height>0&&m.feed?.width>100&&m.log?.width>100;});
  initialCompact=(await state()).compact;
  if(!initialCompact) await page.evaluate(()=>window.musebench.personal({type:'presentation',compact:true}));
  await until(async()=>(await remote(metrics))?.value.composerRadius==='16px');
  let current=await remote(metrics); const original=current;
  let draft=(await remote(readDraft)).value;
  if(draft==='') {
    stage='Check original composer input without sending';
    const focused=await remote(`(()=>{const e=document.querySelector('[data-hatch-composer-chrome] textarea');if(!e||e.value!=='')return false;e.focus();return true})()`);
    if(focused?.value) {
      testDraftView=current.id;
      await app.evaluate(({webContents},{id,text})=>{const wc=webContents.fromId(id);wc.focus();wc.insertText(text);},{id:testDraftView,text:testDraft});
      await until(async()=>(await remote(readDraft))?.value===testDraft);
      draft=testDraft;
      report.draftCheck='typed unsent temporary draft';
    }
  } else report.draftCheck='preserved existing draft';
  assert.equal(current.value.inputMinHeight,'52px');
  if(current.value.assistantBackground) assert.equal(current.value.assistantBackground,'rgba(0, 0, 0, 0)');
  report.geometry={composer:current.value.composer,feed:current.value.feed,log:current.value.log,panel:current.value.panel};
  record('Existing signed-in Muse session loads styled official messages and native composer');
  stage='Check original controls and status panel geometry';
  for(const button of current.value.controls) {
    const a=button.rect,b=current.value.composer;
    assert(a.x>=b.x-1&&a.right<=b.right+1&&a.y>=b.y-1&&a.bottom<=b.bottom+1);
  }
  if(current.value.panelVisible) assert(current.value.feed.right<=current.value.panel.x+1);
  record('Official composer controls remain inside the composer; chat reserves visible status-panel space');
  stage='Restore original presentation without navigation';
  await page.evaluate(()=>window.musebench.personal({type:'presentation',compact:false}));
  await until(async()=>(await remote(metrics))?.value.native==='');
  current=await remote(metrics);
  assert.equal(current.id,original.id); assert.equal(current.value.documentTime,original.value.documentTime);
  assert.equal((await remote(readDraft)).value,draft);
  await page.evaluate(()=>window.musebench.personal({type:'presentation',compact:true}));
  await until(async()=>(await remote(metrics))?.value.composerRadius==='16px');
  current=await remote(metrics);
  assert.equal(current.id,original.id); assert.equal(current.value.documentTime,original.value.documentTime);
  assert.equal((await remote(readDraft)).value,draft);
  record('Native and original layouts retain the same signed-in document and existing draft');
  stage='Verify sandbox and bridge isolation';
  const prefs=await app.evaluate(({webContents},id)=>{const p=webContents.fromId(id).getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,preload:!!p.preload,webSecurity:p.webSecurity};},current.id);
  assert.deepEqual(prefs,{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:false,webSecurity:true});
  assert.equal(current.value.bridge,'undefined');assert.equal(current.value.require,'undefined');assert.equal(current.value.process,'undefined');
  record('Remote Muse keeps its sandbox, context isolation and no local workspace bridge');
  report.status='passed';
} catch(error) { report.status='failed';report.failedStage=stage;process.exitCode=1;console.log(`FAIL ${stage}: ${String(error.message).split('\n')[0]}`); }
finally {
  if(testDraftView) {
    const cleaned=await app.evaluate(async({webContents},{id,text})=>{
      const wc=webContents.fromId(id);if(!wc||wc.isDestroyed())return false;
      const selected=await wc.executeJavaScript(`(()=>{const e=document.querySelector('[data-hatch-composer-chrome] textarea');if(!e||e.value!==${JSON.stringify(text)})return false;e.focus();e.select();return true})()`);
      if(!selected)return false;
      wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'Backspace'});wc.sendInputEvent({type:'keyUp',keyCode:'Backspace'});
      return wc.executeJavaScript(`document.querySelector('[data-hatch-composer-chrome] textarea')?.value === ''`);
    },{id:testDraftView,text:testDraft}).catch(()=>false);
    report.temporaryDraftCleared=cleaned;
    if(!cleaned){report.status='failed';report.failedStage='Clear only the temporary unsent draft';process.exitCode=1;}
  }
  if(initialCompact!==undefined) await page.evaluate(compact=>window.musebench.personal({type:'presentation',compact}),initialCompact).catch(()=>{});
  await app.close();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`Report: ${output}/report.json`);
}
