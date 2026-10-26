import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR'])delete env[key];
const packaged=process.env.MUSEBENCH_META_PACKAGED==='1';
const app=await electron.launch({...packaged?{executablePath:'release/win-unpacked/MuseBench.exe',args:[]}:{args:['.']},env});
const report={variant:packaged?'packaged':'source',checks:[]};
async function inspect(code){return app.evaluate(async({BrowserWindow},code)=>{const window=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()),view=window.contentView.children.find(v=>v.webContents&&v.getVisible());if(!view||!['https://meta.ai','https://www.meta.ai'].includes(new URL(view.webContents.getURL()||'about:blank').origin))return null;return view.webContents.executeJavaScript(code);},code);}
async function until(fn){for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Search dismissal timed out');}
const open=()=>inspect(`!!document.querySelector('[role="dialog"] input[placeholder="Search chats"]')`);
async function clickRemote(selector){await app.evaluate(async({BrowserWindow},selector)=>{const w=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()),view=w.contentView.children.find(v=>v.webContents&&v.getVisible());const point=selector?await view.webContents.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`):{x:8,y:8};if(!point)throw Error('Missing search control');view.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});view.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});},selector);}
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();const nav=page.getByRole('navigation',{name:'Meta AI navigation',exact:true});
 const search=async()=>{await nav.getByRole('button',{name:'Search',exact:true}).click();await until(open);};
 for(const [name,route] of [['Media','/create'],['Artifacts','/artifacts'],['Scheduled','/scheduled'],['Vibes','/vibes'],['New chat','/']]){
  await search();await nav.getByRole('button',{name,exact:true}).click();await until(async()=>await inspect(`location.pathname.replace(/\\/$/,'')===${JSON.stringify(route.replace(/\/$/,''))}&&!document.querySelector('[role="dialog"] input[placeholder="Search chats"]')`));assert.equal((await page.evaluate(()=>window.musebench.personalState())).notice,null);pass('Search closes before '+name+' opens');
 }
 await search();await clickRemote('[role="dialog"] input[placeholder="Search chats"]');await page.waitForTimeout(150);assert.equal(await open(),true);pass('Clicking inside Search keeps it open');
 await clickRemote('[role="dialog"]:has(input[placeholder="Search chats"]) button[aria-label="Close"]');await until(async()=>!(await open()));pass('The actual close button dismisses Search');
 await search();await clickRemote(null);await until(async()=>!(await open()));pass('Clicking the website backdrop dismisses Search');
 await search();await page.locator('.personal-sidebar').click({position:{x:220,y:650}});await until(async()=>!(await open()));pass('Clicking empty native sidebar space dismisses Search');
 await search();await nav.locator('.muse-agent-shortcut').click();await page.locator('.personal-navigation').getByRole('button',{name:'Chat',exact:true}).click();await until(async()=>await inspect(`!document.querySelector('[role="dialog"] input[placeholder="Search chats"]')`));pass('Switching services and returning does not restore stale Search');
 report.status='passed';
}catch(error){console.log('failureState',await inspect(`({path:location.pathname,search:!!document.querySelector('[role="dialog"] input[placeholder="Search chats"]')})`));report.status='failed';report.error=String(error.stack??error);console.error(report.error);process.exitCode=1;}
finally{await app.close();await mkdir('artifacts/meta-search',{recursive:true});await writeFile(`artifacts/meta-search/live-${report.variant}.json`,JSON.stringify(report,null,2));}
