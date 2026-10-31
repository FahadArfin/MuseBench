// Shared production account UI in browser and Electron. No provider requests.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,_electron as electron} from 'playwright';
const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/meta-settings',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/meta-settings',variant+'-'));
const fixture=`import React,{useState,useCallback} from 'react';import{createRoot}from'react-dom/client';import './src/ui/styles.css';import './src/ui/brand.css';import{PersonalWorkspace}from'./src/ui/PersonalMuse.tsx';
window.settingsFixture={commands:[]};window.musebench={personal:async()=>{}};
const base={destination:'chat',loading:false,origin:'https://www.meta.ai',error:null,canGoBack:false,canGoForward:false,visible:true,available:{bot:true,chat:true,ideas:true,goals:true},compact:true,notice:null,authenticating:false,authWindowOpen:false,library:{chats:{status:'idle',items:[]},ideas:{status:'idle',items:[]},goals:{status:'idle',items:[]},selectedId:null}};
function Fixture(){const[state,setState]=useState(base);window.settingsFixture.patch=patch=>setState(previous=>({...previous,...patch}));const command=useCallback(async request=>{window.settingsFixture.commands.push(request);if(request.type==='layout')setState(previous=>({...previous,visible:request.visible}));if(request.type==='dismissNotice')setState(previous=>({...previous,notice:null}));},[]);return <PersonalWorkspace active={true} obscured={false} destination='chat' state={state} command={command} onNavigationOpen={()=>{}} onSettings={()=>{}} collapsed={false} onToggleSidebar={()=>{}}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;
let server,app,browser,page;const report={variant,checks:[],errors:[],providerCalls:0};const pass=check=>{report.checks.push(check);console.log('PASS '+check);};
try{
 const result=await build({stdin:{contents:fixture,sourcefile:'meta-settings-fixture.tsx',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const js=result.outputFiles.find(file=>file.path.endsWith('.js')).text,css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
 const html=`<!doctype html><meta charset="utf-8"><style>${css}body{margin:0;background:#181818;color:#eee}#root{height:100vh;width:100vw}.personal-workspace{height:100%;width:100%}</style><div id="root"></div><script src="/fixture.js"></script>`;
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:['scripts/preview-parity-electron.mjs'],env});const created=app.waitForEvent('window');await app.evaluate(({BrowserWindow},url)=>{const window=new BrowserWindow({width:900,height:900,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void window.loadURL(url);},url);page=await created;}else{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:900,height:900}});}
 page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(6000);await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);
 const trigger=page.getByRole('button',{name:'Accounts and connections',exact:true}),dialog=page.getByRole('dialog',{name:'Accounts and connections',exact:true});
 for(const [name,expected] of [['Meta AI settings and plan',{type:'metaSettings',section:'general'}],['Meta AI apps',{type:'metaSettings',section:'apps'}],['Muse account',{type:'serviceAction',action:'settings'}],['Muse connections',{type:'serviceAction',action:'connections'}],['Connect WhatsApp',{type:'serviceAction',action:'whatsapp'}]]){
  await trigger.click();await dialog.waitFor();await dialog.getByText('Account preferences and Meta AI upgrades / separate from Muse Code billing',{exact:true}).waitFor();await dialog.getByRole('button',{name,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.settingsFixture.commands.filter(c=>!['layout','navigate'].includes(c.type)).at(-1)),expected);
 }
 pass('Meta AI settings and apps have separate bounded commands; Muse settings and connections remain distinct');
 await trigger.click();await dialog.screenshot({path:path.join(output,'accounts.png')});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.evaluate(()=>window.settingsFixture.patch({notice:'This provider requires sign-in in your browser. Return here and refresh afterward.',noticeCanOpenBrowser:true,noticeBrowserDestination:'chat'}));
 await page.getByRole('button',{name:'Open Meta AI in browser',exact:true}).click();assert.equal(await page.evaluate(()=>window.settingsFixture.commands.at(-1).type),'openNoticeExternal');
 await page.getByRole('button',{name:'Refresh page',exact:true}).click();assert.equal(await page.evaluate(()=>window.settingsFixture.commands.at(-1).type),'reload');
 await page.evaluate(()=>window.settingsFixture.patch({destination:'bot'}));await page.getByRole('button',{name:'Open Meta AI in browser',exact:true}).click();assert.equal(await page.evaluate(()=>window.settingsFixture.commands.at(-1).type),'openNoticeExternal');assert.equal(await page.getByRole('button',{name:'Refresh page',exact:true}).count(),0);
 await page.evaluate(()=>window.settingsFixture.patch({destination:'chat'}));
 pass('Blocked account flow offers source-specific browser action after switching service; refresh applies only to the matching service');
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(460,800));else await page.setViewportSize({width:460,height:800});
 for(const name of ['Open Meta AI in browser','Refresh page','Dismiss Meta AI notice']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=461,'Notice controls stay within a narrow workspace');}
 await page.screenshot({path:path.join(output,'narrow-notice.png')});await page.getByRole('button',{name:'Dismiss Meta AI notice'}).click();await trigger.click();const bounds=await dialog.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=461,'Account dialog fits narrow workspace');await dialog.screenshot({path:path.join(output,'narrow-accounts.png')});
 pass('Account dialog and actionable notice fit a narrow workspace');assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
