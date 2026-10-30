import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium,_electron as electron} from 'playwright';

const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/chat-navigation',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/chat-navigation',`${process.argv.includes('--baseline')?'before':'after'}-${variant}-`));
const fixture=`import React,{useLayoutEffect,useState}from'react';import{createRoot}from'react-dom/client';import{ChatSidebar}from'./src/ui/ChatSidebar.tsx';
const f=window.navigationFixture={calls:[],titleReads:0,durations:[],started:null};
const projects=Array.from({length:40},(_,i)=>({id:'p'+i,name:'Project '+i,root:'/fixture/project-'+i}));
const tasks=Array.from({length:1000},(_,i)=>{const t={id:'c'+i,projectId:'p'+Math.floor(i/25),mode:'manual',createdAt:'2026-10-29T00:00:00.000Z',updatedAt:new Date(Date.UTC(2026,9,29,0,0,i)).toISOString(),acceptedRevision:null,pinned:i===3,archived:false};Object.defineProperty(t,'title',{enumerable:true,get(){f.titleReads++;return 'Chat '+String(i).padStart(4,'0');}});return t;});
function Fixture(){const[draft,setDraft]=useState(''),[generation,setGeneration]=useState(0),[rows,setRows]=useState(tasks),[busy,setBusy]=useState(false),[active,setActive]=useState(true),[projectId,setProjectId]=useState('p0');
 f.clone=()=>setRows(previous=>previous.map(t=>({...t})));f.callbacks=()=>setGeneration(n=>n+1);f.busy=setBusy;f.active=setActive;f.rename=()=>setRows(previous=>previous.map(t=>t.id==='c0'?{...t,title:'Renamed chat'}:t));f.move=()=>{setRows(previous=>previous.map(t=>t.id==='c0'?{...t,projectId:'p1'}:t));setProjectId('p1');};
 useLayoutEffect(()=>{if(f.started!==null){f.durations.push(performance.now()-f.started);f.started=null;}},[draft]);
 const call=(kind,id)=>f.calls.push({kind,id,generation});
 return <main><aside className="sidebar-scroll"><ChatSidebar projects={projects} tasks={rows} selectedId="c0" projectId={projectId} overview={false} busy={busy} active={active} onProject={id=>call('project',id)} onChat={id=>call('chat',id)} onNew={id=>call('new',id)} onFolder={()=>call('folder')} onSearch={()=>call('search')} act={async action=>{f.calls.push({kind:'action',action,generation});return{};}}/></aside><section><label>Draft<textarea aria-label="Draft" value={draft} onChange={event=>{f.started=performance.now();setDraft(event.target.value);}}/></label><p>Isolated fixture: 1,000 saved chats, 40 projects. No provider or user profile.</p></section></main>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`;
let server,browser,app,page;
const report={variant,checks:[],errors:[],metrics:{},providerCalls:0};
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
try{
 const built=await build({stdin:{contents:fixture,sourcefile:'navigation-fixture.tsx',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const js=built.outputFiles.find(x=>x.path.endsWith('.js')).text,css=built.outputFiles.find(x=>x.path.endsWith('.css'))?.text??'';
 const html=`<!doctype html><meta charset="utf-8"><style>:root{--text:#eee;--muted:#aaa;--border:#444;--surface:#242424;--accent:#75b3ff}*{box-sizing:border-box}body{margin:0;background:#181818;color:#eee;font:14px system-ui}button,input,textarea{font:inherit;color:inherit;background:#242424;border:0}button:focus-visible,textarea:focus-visible{outline:2px solid #75b3ff}main{display:grid;grid-template-columns:280px 1fr;gap:24px;padding:16px}.sidebar-scroll{height:700px;overflow:auto}.sidebar-scroll button{cursor:pointer}textarea{display:block;width:90%;height:90px;margin-top:8px}button:disabled{opacity:.5}.modal-scrim{position:fixed;inset:0;display:grid;place-items:center;background:#0008}.modal{background:#222;padding:20px;width:min(700px,90vw)}${css}</style><div id="root"></div><script src="/fixture.js"></script>`;
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});const created=app.waitForEvent('window');await app.evaluate(({BrowserWindow},url)=>{const w=new BrowserWindow({width:1100,height:800,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void w.loadURL(url);},url);page=await created;}else{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1100,height:800}});}
 page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(10000);await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);
 const first=page.getByRole('button',{name:'Chat 0000',exact:true});await first.waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>{window.navigationFixture.titleReads=0;window.navigationFixture.durations=[];});
 await page.getByRole('textbox',{name:'Draft',exact:true}).pressSequentially('abcdefghij');
 report.metrics=await page.evaluate(()=>({titleReadsDuringTyping:window.navigationFixture.titleReads,draftCommitMs:window.navigationFixture.durations,chatCount:1000,projectCount:40}));
 assert.equal(report.metrics.titleReadsDuringTyping,0,'Unchanged sidebar rows must not render during draft typing');pass('Typing ten characters does not revisit any of the 1,000 unchanged sidebar titles');
 await page.evaluate(()=>window.navigationFixture.callbacks());await first.click();
 assert.deepEqual(await page.evaluate(()=>window.navigationFixture.calls.at(-1)),{kind:'chat',id:'c0',generation:1});pass('A skipped sidebar render still dispatches through the latest committed callback');
 await page.getByRole('button',{name:'Chat options for Chat 0000',exact:true}).click();
 const menu=page.getByRole('menu',{name:'Options for Chat 0000',exact:true});await menu.waitFor();
 await page.evaluate(()=>{window.savedNavigationAnchor=document.querySelector('.chat-row');window.savedNavigationFocus=document.activeElement;});const before=await menu.boundingBox();
 await page.evaluate(()=>window.navigationFixture.clone());
 assert.deepEqual(await menu.boundingBox(),before);assert.equal(await page.evaluate(()=>window.savedNavigationAnchor===document.querySelector('.chat-row')&&window.savedNavigationFocus===document.activeElement),true);pass('Equivalent cloned data preserves the open menu, focus and row anchor');
 await page.evaluate(()=>window.navigationFixture.rename());await page.getByRole('menu',{name:'Options for Renamed chat',exact:true}).waitFor();
 await page.evaluate(()=>window.navigationFixture.busy(true));await page.getByRole('menu').waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'Renamed chat',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.navigationFixture.busy(false));pass('Real title and busy-state changes remain visible and dismiss unsafe menu actions');
 await page.getByRole('button',{name:'Collapse Project 1',exact:true}).click();await page.evaluate(()=>window.navigationFixture.move());await page.getByRole('button',{name:'Collapse Project 1',exact:true}).waitFor();
 const moved=page.getByRole('region',{name:'Project 1 active chats',exact:true}).getByRole('button',{name:'Renamed chat',exact:true});await moved.focus();await moved.press('Alt+Shift+ArrowUp');
 const action=await page.evaluate(()=>window.navigationFixture.calls.at(-1));assert.equal(action.kind,'action');assert.equal(action.action.type,'moveSidebarItem');assert.equal(action.action.projectId,'p1');assert.equal(action.action.id,'c0');assert.equal(action.generation,1);pass('Moving the selected chat expands its current project and keyboard reorder keeps exact ownership');
 await page.getByRole('textbox',{name:'Draft',exact:true}).fill('Retained draft');assert.equal(await page.getByRole('textbox',{name:'Draft',exact:true}).inputValue(),'Retained draft');
 await page.screenshot({path:path.join(output,'sidebar.png')});assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
