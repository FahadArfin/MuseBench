// Actual Electron file origin, shared composer/hook and service. The profile,
// drafts and speech helper are fictional and isolated from the installed app.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {_electron as electron} from 'playwright';

const root=fileURLToPath(new URL('..',import.meta.url)),output=path.resolve(process.argv[2]??path.join(root,'output/playwright/dictation-durability'));
const fixture=await mkdtemp(path.join(os.tmpdir(),'musebench-dictation-durability-')),profile=path.join(fixture,'profile');
await mkdir(profile);await mkdir(output,{recursive:true});
const renderer=`
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useCodeDraft} from './src/ui/useCodeDraft.ts';
import {ChatComposer} from './src/ui/ChatComposer.tsx';
function Fixture({drafts}){
 const [chat,setChat]=useState('a'),inputRef=useRef(null),draft=useCodeDraft(window.musebench,'fixture-project',chat,drafts,()=>{window.__draftFailures++;});
 const noop=()=>{};
 return <><button onClick={()=>setChat(chat==='a'?'b':'a')}>Switch chat</button><output aria-label='Current chat'>{chat}</output><ChatComposer active context={'fixture-project:'+chat} value={draft.message} onChange={draft.setMessage} inputRef={inputRef} onSubmit={noop} onChooseProject={noop} onStop={noop} onConnection={noop} onOptions={noop} options={{approval:'ask',reasoning:'high'}} taskMode='manual' onTaskMode={noop} messageMode='chat' onMessageMode={noop} showTask busy={false} running={false} canSend enterToSend={false} onContext={noop} onCommand={noop} onLoadSkills={noop} skills={[]} skillsStatus='' theme='dark' model='' images={[]} imageProjectId='fixture-project' onRemoveImage={noop} onAddImages={noop} uploadingImages={false} onRefreshModels={noop} onFullAccess={noop}/></>;
}
window.__draftFailures=0;window.musebench.getDrafts().then(drafts=>createRoot(document.getElementById('root')).render(<Fixture drafts={drafts}/>));
`;
await build({stdin:{contents:renderer,loader:'tsx',resolveDir:root},bundle:true,outfile:path.join(fixture,'bundle.js'),format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
await writeFile(path.join(fixture,'index.html'),'<!doctype html><html><head><link rel="stylesheet" href="bundle.css"><style>:root{--surface:#181818;--surface-hover:#242424;--muted:#aaa;--text:#fff;--border:#555}body{background:#181818;color:white;font:14px sans-serif}textarea{width:100%;box-sizing:border-box}form{max-width:700px}.composer-toolbar{display:flex}.composer-spacer{flex:1}</style></head><body><div id="root"></div><script src="bundle.js"></script></body></html>');
await writeFile(path.join(fixture,'preload.cjs'),`
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('musebench',{
 dictation:command=>ipcRenderer.invoke('fixture:dictation',command),
 onDictation:listener=>{const callback=(_event,state)=>listener(state);ipcRenderer.on('fixture:dictation-state',callback);return()=>ipcRenderer.removeListener('fixture:dictation-state',callback);},
 saveCodeDraft:input=>ipcRenderer.invoke('fixture:save-draft',input),getDrafts:()=>ipcRenderer.invoke('fixture:get-drafts'),copyText:text=>ipcRenderer.invoke('fixture:copy-length',text)
});
`);
const entry=path.join(fixture,'main.mjs');
await writeFile(entry,`
import {app,BrowserWindow,ipcMain,session} from 'electron';
import {EventEmitter} from 'node:events';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createDictation} from ${JSON.stringify(pathToFileURL(path.join(root,'electron/dictation.mjs')).href)};
app.setName('MuseBench Dictation Fixture');app.setPath('userData',${JSON.stringify(profile)});app.setPath('sessionData',${JSON.stringify(profile)});app.disableHardwareAcceleration();
let win,child;const counters={starts:0,saves:0,copies:0},draftFile=path.join(app.getPath('userData'),'fixture-drafts.json');
let drafts={};try{drafts=JSON.parse(readFileSync(draftFile,'utf8'));}catch{}
const dictation=createDictation({helperPath:'never-executed-speech-fixture',platform:'win32',probe:async()=>({available:true,language:'en-US'}),onState:state=>{if(win&&!win.isDestroyed())win.webContents.send('fixture:dictation-state',state);},spawnHelper:()=>{counters.starts++;child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={write(){queueMicrotask(()=>child.emit('close',0));}};child.kill=()=>{child.emit('close',1);return true;};return child;}});
ipcMain.handle('fixture:dictation',(_event,command)=>dictation.dispatch(command));
ipcMain.handle('fixture:get-drafts',()=>drafts);
ipcMain.handle('fixture:save-draft',(_event,input)=>{if(input.text.length>16000)throw Error('Fixture rejected oversized draft');drafts[input.projectId+':'+input.taskId]=input;counters.saves++;writeFileSync(draftFile,JSON.stringify(drafts));});
ipcMain.handle('fixture:copy-length',(_event,text)=>{counters.copies++;return text.length;});
app.on('window-all-closed',()=>{});
async function open(){win=new BrowserWindow({show:false,width:900,height:700,webPreferences:{preload:${JSON.stringify(path.join(fixture,'preload.cjs'))},contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});await win.loadFile(${JSON.stringify(path.join(fixture,'index.html'))});return true;}
app.whenReady().then(async()=>{session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')}));
globalThis.__dictationDurability={reopen:async()=>{if(win&&!win.isDestroyed())win.destroy();await dictation.stop(true);await open();return true;},emit:text=>{if(!child)throw Error('No fixture recording');child.stdout.emit('data',Buffer.from(JSON.stringify({kind:'text',text})+'\\n'));},snapshot:()=>({counters:{...counters},status:dictation.snapshot().status,draftLengths:Object.fromEntries(Object.entries(drafts).map(([key,value])=>[key,value.text.length]))})};
await open();});
`);
const report={checks:[],errors:[]};let app,page;
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const configure=async next=>{page=next;page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));await page.getByRole('textbox',{name:'Message Muse',exact:true}).waitFor();};
const launch=async()=>{app=await electron.launch({cwd:root,args:[entry,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});await configure(await app.firstWindow());await app.evaluate(({app},expected)=>{if(app.getPath('userData')!==expected||app.getPath('sessionData')!==expected)throw Error('Fixture profile was not isolated');},profile);};
// Hidden native windows do not produce animation frames. Their unthrottled task
// queue still delivers IPC and React work without showing a desktop window.
const settle=()=>page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,25)));
const input=()=>page.getByRole('textbox',{name:'Message Muse',exact:true}),recovery=()=>page.getByRole('textbox',{name:'Extra dictated text',exact:true});
try{
 await launch();await input().fill('x'.repeat(15994));await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Stop dictation"]')?.title==='Stop dictation');await settle();
 await app.evaluate(()=>globalThis.__dictationDurability.emit('hello retained desktop suffix'));await recovery().waitFor();await settle();
 assert.equal((await input().inputValue()).length,16000);assert.equal(await recovery().inputValue(),' retained desktop suffix');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();await settle();
 assert.equal(await page.getByRole('alert').count(),0);pass('The actual Electron file origin stores a bounded prompt and its full recovery suffix');
 const replacement=app.waitForEvent('window');await app.evaluate(()=>globalThis.__dictationDurability.reopen());await configure(await replacement);await settle();
 assert.equal((await input().inputValue()).length,16000);assert.equal(await recovery().inputValue(),' retained desktop suffix');
 await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();assert.equal(await recovery().count(),0);await page.getByRole('button',{name:'Switch chat',exact:true}).click();await settle();
 assert.equal(await recovery().inputValue(),' retained desktop suffix');pass('Destroying and reopening the native BrowserWindow preserves recovery and chat isolation');
 await app.close();app=null;await launch();await settle();
 assert.equal((await input().inputValue()).length,16000);assert.equal(await recovery().inputValue(),' retained desktop suffix');
 pass('A full Electron process restart restores the same prompt and suffix from the isolated persistent profile');
 await input().fill('Next:');await page.getByRole('button',{name:'Add extra speech to message',exact:true}).click();await settle();
 assert.equal(await input().inputValue(),'Next: retained desktop suffix');assert.equal(await recovery().count(),0);
 report.runtime=await app.evaluate(()=>globalThis.__dictationDurability.snapshot());assert.equal(await page.evaluate(()=>window.__draftFailures),0);
 await app.close();app=null;await launch();await settle();assert.equal(await recovery().count(),0);assert.equal(await input().inputValue(),'Next: retained desktop suffix');
 pass('Reinsertion commits the text once and does not resurrect a consumed suffix after restart');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await app?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');const resolved=path.resolve(fixture);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('musebench-dictation-durability-'))await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log('Report: '+path.join(output,'report.json'));}
