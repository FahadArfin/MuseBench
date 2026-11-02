// Real Windows helper -> Electron policy/normalizer -> authenticated stdio MCP,
// with approvals made through the shared UI. No model, installed profile or
// user application receives input. Only our disposable WinForms app is opened.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {_electron as electron} from 'playwright';

if(process.platform!=='win32')throw Error('Desktop Assist smoke requires Windows.');
await import('./build-windows-desktop.mjs');
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'muse-desktop-roundtrip-'));
const output=await mkdtemp(await mkdir(path.resolve('artifacts/desktop-assist/'),{recursive:true}).then(()=>path.resolve('artifacts/desktop-assist/fixture-')));
const exe=path.join(temp,'Fixture.exe'),report={checks:[],providerCalls:0,userAppInput:false};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async predicate=>{const deadline=Date.now()+20000;while(!await predicate()){assert(Date.now()<deadline,'Desktop fixture timed out.');await wait(30);}};
let fixture,app,mcp;
try{
 execFileSync(path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe',`/out:${exe}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',path.join(root,'native/desktop-test-fixture.cs')],{windowsHide:true});
 fixture=spawn(exe,[],{windowsHide:false,stdio:['pipe','pipe','pipe']});let fixtureText='';fixture.stdout.on('data',chunk=>fixtureText+=chunk);await until(()=>fixtureText.includes('ready'));
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{DesktopAssistBanner,DesktopAssistSettings}from'./src/ui/DesktopAssist.tsx';import './src/ui/styles.css';import './src/ui/preferences.css';createRoot(document.getElementById('root')).render(<><DesktopAssistBanner taskId="fixture-chat"/><DesktopAssistSettings taskId="fixture-chat"/></>);`,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'fixture.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 await writeFile(path.join(temp,'fixture.js'),bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);
 const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
 await writeFile(path.join(temp,'fixture.html'),`<!doctype html><meta charset="utf-8"><style>${css}html,body{height:auto;overflow:auto}body{padding:24px}</style><div id="root"></div><script src="fixture.js"></script>`);
 await writeFile(path.join(temp,'preload.cjs'),`const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('musebench',{desktopAssist:command=>ipcRenderer.invoke('fixture:desktop',command),onDesktopAssist:listener=>{const receive=(_e,value)=>listener(value);ipcRenderer.on('fixture:state',receive);return()=>ipcRenderer.removeListener('fixture:state',receive);}});`);
 const modules=['electron/desktop-assist.mjs','electron/desktop-helper.mjs','electron/desktop-mcp-config.mjs','electron/normalize-visual.mjs'].map(file=>pathToFileURL(path.join(root,file)).href);
 const entry=path.join(temp,'main.cjs');
 await writeFile(entry,`const{app,BrowserWindow,ipcMain,nativeImage}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'profile'))});app.whenReady().then(async()=>{const[{createDesktopAssist},{createDesktopHelper},{createDesktopMcpConfig},{createVisualNormalizer}]=await Promise.all(${JSON.stringify(modules)}.map(url=>import(url)));const window=new BrowserWindow({width:820,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:${JSON.stringify(path.join(temp,'preload.cjs'))}}});const state={task:{id:'fixture-chat',mode:'muse'},activeProject:{root:${JSON.stringify(temp)}},runtime:{status:'running',permissionVerified:true}};const visuals=[];const service=await createDesktopAssist({dataDir:${JSON.stringify(path.join(temp,'data'))},getState:()=>state,helper:createDesktopHelper({helperPath:${JSON.stringify(path.join(root,'native/bin/MuseBenchDesktop.exe'))},timeoutMs:10000}),normalizeImage:createVisualNormalizer(nativeImage),beginVisual:()=>value=>visuals.push(value),onState:value=>window.webContents.send('fixture:state',value)});const lease=await createDesktopMcpConfig({getDesktop:()=>service})(${JSON.stringify(temp)},{taskId:'fixture-chat'});globalThis.fixture={service,lease,visuals,state};ipcMain.handle('fixture:desktop',(_e,command)=>service.command(command));await window.loadFile(${JSON.stringify(path.join(temp,'fixture.html'))});});`);
 app=await electron.launch({cwd:root,args:[entry],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
 const page=await app.firstWindow();await page.getByRole('switch',{name:'Enable Desktop Assist'}).waitFor();
 const config=await app.evaluate(()=>globalThis.fixture.lease.config);
 mcp=spawn(process.execPath,[path.join(root,'src/runtime/desktop-mcp.mjs')],{cwd:root,env:{...process.env,...config.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
 let pending='',nextId=0;const responses=new Map();mcp.stdout.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line)responses.set(JSON.parse(line).id,JSON.parse(line));}});
 const request=async(method,params)=>{const id=++nextId;mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');await until(()=>responses.has(id));const reply=responses.get(id);responses.delete(id);assert(!reply.error,JSON.stringify(reply.error));return reply.result;};
 const tool=async(name,args={})=>{const result=await request('tools/call',{name:'desktop_'+name,arguments:args});assert(!result.isError,result.content?.[0]?.text);return{...JSON.parse(result.content[0].text).untrustedDesktopData,content:result.content};};
 await request('initialize',{protocolVersion:'2025-11-25'});
 const {apps}=await tool('apps'),target=apps.find(a=>a.name==='Fixture');assert(target);assert.equal(target.allowed,false);
 const windowsResult=tool('windows',{appId:target.id});
 await page.getByRole('button',{name:'Allow once',exact:true}).first().waitFor();
 assert.equal(await app.evaluate(()=>globalThis.fixture.service.snapshot().active),null);
 await page.getByRole('button',{name:'Allow once',exact:true}).first().click();
 const {windows}=await windowsResult;assert(windows.length);const windowId=windows[0].id;
 report.checks.push('Native app inventory waits for a real shared-UI app approval before returning window content');
 const observed=await tool('inspect',{windowId});assert(observed.elements.some(e=>e.name==='Fixture text'));assert(observed.elements.some(e=>e.protected));assert(!observed.elements.some(e=>'value'in e));
 const capture=await tool('capture',{windowId});assert.equal(capture.content[1].type,'image');assert.equal(capture.content[1].mimeType,'image/png');assert.equal(Buffer.from(capture.content[1].data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(await app.evaluate(()=>globalThis.fixture.visuals.length),1);report.checks.push('Real UIA and normalized native PNG round-trip through stdio MCP; screenshot is sent to the visual-recording hook');
 await page.screenshot({path:path.join(output,'approved-app.png')});
 await page.getByRole('button',{name:'Stop immediately',exact:true}).first().click();
 const stopped=await request('tools/call',{name:'desktop_inspect',arguments:{windowId}});assert.equal(stopped.isError,true);assert.match(stopped.content[0].text,/stopped/i);
 await page.getByRole('button',{name:'Resume Desktop Assist',exact:true}).first().click();
 const waiting=tool('windows',{appId:target.id});await page.getByRole('button',{name:'Always allow',exact:true}).first().waitFor();await page.getByRole('button',{name:'Always allow',exact:true}).first().click();await waiting;
 await page.getByRole('button',{name:'Revoke Fixture',exact:true}).click();assert.equal(await app.evaluate(()=>globalThis.fixture.service.snapshot().allowedApps.length),0);
 report.checks.push('Stop blocks actual tool access; Resume requires fresh approval; Always allow can be revoked through Settings');
 await app.evaluate(async()=>{await globalThis.fixture.lease.close();await globalThis.fixture.service.close();});
 report.status='passed';console.log(JSON.stringify(report,null,2));
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{
 if(mcp){mcp.stdin.end();mcp.kill();}
 if(app){await app.evaluate(async()=>{await globalThis.fixture?.lease?.close();await globalThis.fixture?.service?.close();}).catch(()=>{});await app.close();}
 if(fixture&&fixture.exitCode===null){fixture.stdin.write('close\n');await Promise.race([new Promise(r=>fixture.once('exit',r)),wait(1500)]);if(fixture.exitCode===null)fixture.kill();}
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await rm(temp,{recursive:true,force:true});
}
