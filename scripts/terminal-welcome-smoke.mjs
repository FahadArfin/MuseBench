import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {_electron as electron} from 'playwright';

const variant='desktop';
await mkdir('artifacts/terminal-welcome',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/terminal-welcome',`${variant}-`));
const fixture=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{TerminalWelcome}from'./src/ui/TerminalWelcome.tsx';
function Fixture(){const[serial,setSerial]=useState(0),[active,setActive]=useState(true);return <main className="new-chat-content"><TerminalWelcome key={serial} active={active}/><button onClick={()=>setSerial(n=>n+1)}>New chat</button><button onClick={()=>setActive(v=>!v)}>Toggle workspace</button></main>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;
let server,app,page;
const report={variant,checks:[],errors:[],metrics:{},providerCalls:0};
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
try{
 const built=await build({stdin:{contents:fixture,sourcefile:'terminal-welcome-fixture.tsx',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const js=built.outputFiles.find(x=>x.path.endsWith('.js')).text,css=built.outputFiles.find(x=>x.path.endsWith('.css'))?.text??'';
 const html=`<!doctype html><meta charset="utf-8"><style>:root{--text:#eee;--muted:#aaa;--border:#444;--surface:#242424;--accent:#75b3ff}*{box-sizing:border-box}body{margin:0;background:#181818;color:#eee;font:14px system-ui}button,input,textarea{font:inherit;color:inherit;background:#242424;border:0}button:focus-visible,textarea:focus-visible{outline:2px solid #75b3ff}main{padding:100px 20px;text-align:center}h1{font-size:29px;font-weight:500}.new-chat-content h1.typed-welcome{color:#75b3ff}button{margin:30px 6px;padding:8px}.sidebar-scroll{height:700px;overflow:auto}.sidebar-scroll button{cursor:pointer}textarea{display:block;width:90%;height:90px;margin-top:8px}button:disabled{opacity:.5}.modal-scrim{position:fixed;inset:0;display:grid;place-items:center;background:#0008}.modal{background:#222;padding:20px;width:min(700px,90vw)}${css}</style><div id="root"></div><script src="/fixture.js"></script>`;
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});const created=app.waitForEvent('window');await app.evaluate(({BrowserWindow},url)=>{const w=new BrowserWindow({width:1100,height:800,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void w.loadURL(url);},url);page=await created;
 page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(10000);await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);
 const heading=page.getByRole('heading',{name:'What would you like to build?',exact:true});await heading.waitFor();
 const reveal=page.locator('.terminal-reveal');assert.equal(await reveal.textContent(),'>_');
 assert.equal(await page.locator('.terminal-cursor').evaluate(el=>getComputedStyle(el).animationName),'muse-terminal-cursor');
 await page.waitForFunction(()=>{const text=document.querySelector('.terminal-reveal')?.textContent??'';return text.length>3&&text.length<30;});
 await page.screenshot({path:path.join(output,'typing.png')});
 await page.waitForFunction(()=>document.querySelector('.terminal-reveal')?.textContent==='> What would you like to Build?_');
 pass('One terminal line starts with a blinking >_, types progressively, and finishes the requested heading');
 await page.getByRole('button',{name:'New chat',exact:true}).click();assert.equal(await reveal.textContent(),'>_');
 await page.getByRole('button',{name:'Toggle workspace',exact:true}).click();
 await page.getByRole('button',{name:'Toggle workspace',exact:true}).click();assert.equal(await reveal.textContent(),'>_');
 pass('Opening another new chat or returning to the workspace restarts the animation');
 await page.evaluate(()=>document.documentElement.dataset.reducedMotion='true');
 await page.waitForFunction(()=>document.querySelector('.terminal-reveal')?.textContent==='> What would you like to Build?_');
 assert.equal(await page.locator('.terminal-cursor').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.getByRole('button',{name:'New chat',exact:true}).click();assert.equal(await reveal.textContent(),'> What would you like to Build?_');
 pass('Reduced motion immediately shows the complete heading and disables cursor blinking');
 await page.screenshot({path:path.join(output,'finished.png')});assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();if(server)await new Promise(resolve=>server.close(resolve));}
