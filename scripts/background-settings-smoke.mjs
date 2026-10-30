import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
await mkdir('artifacts/background-engine',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/background-engine/preview-'));
let server,browser;const report={checks:[],providerCalls:0,errors:[]};
try{
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import{BackgroundSettings}from'./src/ui/BackgroundSettings.tsx';import{createPreviewBridge}from'./src/preview/bridge.ts';import './src/ui/styles.css';import './src/ui/preferences.css';window.musebench=createPreviewBridge();createRoot(document.getElementById('root')).render(<BackgroundSettings/>);`;
 const built=await build({stdin:{contents:source,loader:'tsx',sourcefile:'background-settings.tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'fixture.js',format:'iife',loader:{'.md':'text'},define:{'process.env.NODE_ENV':'"production"'}});
 const js=built.outputFiles.find(file=>file.path.endsWith('.js')).text,css=built.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
 server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:`<!doctype html><meta charset="utf-8"><style>${css}body{margin:0;padding:24px;background:#181818;color:white}</style><div id="root"></div><script src="/fixture.js"></script>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:620,height:400}});page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const toggle=page.getByRole('switch',{name:'Keep running when the window closes'});await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'false');await toggle.click();await page.waitForFunction(async()=> (await window.musebench.backgroundEngine({type:'status'})).enabled);assert.equal(await toggle.getAttribute('aria-checked'),'true');
 await page.getByText('Preview only. Background activity runs in the installed desktop app.').waitFor();await page.setViewportSize({width:390,height:500});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'settings-narrow.png')});await toggle.click();assert.equal((await page.evaluate(()=>window.musebench.backgroundEngine({type:'status'}))).enabled,false);
 report.checks.push('Shared setting toggles in preview, is visibly simulated and fits a narrow window');assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
