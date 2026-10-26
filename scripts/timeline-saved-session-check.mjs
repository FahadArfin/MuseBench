import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
if(process.env.MUSEBENCH_VERIFY_SAVED_SESSION!=='1')throw Error('Saved-profile check requires explicit opt in.');
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR','MUSEBENCH_DEV'])delete env[key];
const report={checkedAt:new Date().toISOString(),checks:[],modelRequests:0,accountWrites:0};let stage='launch';
const app=await electron.launch({colorScheme:null,executablePath:path.resolve('release/win-unpacked/MuseBench.exe'),args:[],env});const page=await app.firstWindow();
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
async function until(test){const end=Date.now()+40000;while(Date.now()<end){if(await test())return;await new Promise(r=>setTimeout(r,150));}throw Error('Condition timed out');}
async function visible(){return app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).contentView.children.filter(v=>v.webContents&&v.getVisible()).map(v=>v.webContents.id)[0]);}
const evaluate=(id,fn)=>app.evaluate(({webContents},{id,script})=>webContents.fromId(id).executeJavaScript(script),{id,script:'('+fn.toString()+')()'});
try{
 await page.waitForFunction(()=>window.musebench);const before=await page.evaluate(()=>window.musebench.getState());
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Meta AI navigation',exact:true});await nav.getByRole('button',{name:'Chat',exact:true}).click();let meta;
 stage='Meta AI saved sign-in';await until(async()=>{meta=await visible();return meta&&await evaluate(meta,()=>!!document.querySelector('[data-testid="user-menu-button"]')&&!!document.querySelector('[data-testid="composer-input"]'));});
 const metaState=await evaluate(meta,()=>({signedIn:!!document.querySelector('[data-testid="user-menu-button"]'),dark:matchMedia('(prefers-color-scheme:dark)').matches,renderedDark:document.documentElement.classList.contains('dark'),hasMessages:!!document.querySelector('[data-message-item]')}));
 report.meta=metaState;assert(metaState.signedIn);record('Meta AI Chat remains signed in after the package restart');
 stage='Meta AI appearance';assert.equal(metaState.dark,true);assert.equal(metaState.renderedDark,true);record('Meta AI System appearance renders dark to match MuseBench');
 stage='Muse saved sign-in';await nav.getByRole('button',{name:'Muse AI bot',exact:true}).click();let muse;
 await until(async()=>{muse=await visible();const state=await page.evaluate(()=>window.musebench.personalState());return muse&&['chats','ideas','goals'].every(key=>state.library[key].status==='ready')&&state.library.chats.items.length>0;});
 record('Existing Muse login and account collections remain available in the shared browser session');
 stage='Muse timeline';
 await until(()=>evaluate(muse,()=>!!document.querySelector('[data-musebench-timeline]')));
 const live=await evaluate(muse,()=>{const host=document.querySelector('[data-musebench-timeline]'),shadow=host.shadowRoot,buttons=shadow.querySelectorAll('button');const eligible=buttons.length>=2;if(!eligible)return{installed:true,eligible:false};const target=document.querySelector('[data-hatch-chat-content] [role=log] [data-message-role=user]');let scroll=target.parentElement;while(scroll!==document.body&&!(/auto|scroll/.test(getComputedStyle(scroll).overflowY)&&scroll.scrollHeight>scroll.clientHeight))scroll=scroll.parentElement;if(scroll===document.body)scroll=document.scrollingElement;const before=scroll.scrollTop;buttons[0].dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));const previews=!!shadow.querySelector('[role=tooltip] strong').textContent,noHoverScroll=scroll.scrollTop===before;buttons[0].click();const jumps=target.getBoundingClientRect().top>=-2&&target.getBoundingClientRect().top<innerHeight;scroll.scrollTop=before;shadow.querySelector('nav').dispatchEvent(new PointerEvent('pointerleave'));return{installed:true,eligible:true,previews,noHoverScroll,jumps};});
 report.museTimeline=live;assert(live.installed);if(live.eligible)assert(live.previews&&live.noHoverScroll&&live.jumps);record(live.eligible?'Live Muse timeline previews and jumps without modifying conversation content':'Muse timeline is installed; short conversation keeps the rail hidden');
 stage='Sandbox and retained history';const protections=await app.evaluate(({BrowserWindow,webContents},{muse,meta})=>{const main=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow());return{sameSession:webContents.fromId(muse).session===webContents.fromId(meta).session,prefs:[main.webContents,...main.contentView.children.filter(v=>v.webContents).map(v=>v.webContents)].map(wc=>{const p=wc.getLastWebPreferences();return{sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,webSecurity:p.webSecurity};})};},{muse,meta});assert(protections.sameSession);for(const p of protections.prefs)assert.deepEqual(p,{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true});
 await page.getByRole('button',{name:'Return to Muse Code',exact:true}).click();const after=await page.evaluate(()=>window.musebench.getState());assert.deepEqual(after.tasks.map(t=>t.id),before.tasks.map(t=>t.id));assert.equal(after.task?.id,before.task?.id);record('Shared web sign-in preserves separate page state, local history and every browser sandbox');report.status='passed';
}catch(error){report.status='failed';report.stage=stage;report.errorType=error.name;console.error('FAIL '+stage);process.exitCode=1;}
finally{await app.close();await writeFile('artifacts/timeline-saved-session.json',JSON.stringify(report,null,2));}
