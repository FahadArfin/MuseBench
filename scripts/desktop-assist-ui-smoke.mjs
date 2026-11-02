import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

await mkdir('artifacts/desktop-assist-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/desktop-assist-ui/fixture-'));
const report={checks:[],errors:[],nativeInput:false,providerCalls:0};
let server,browser,page;
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
 await assert.doesNotReject(access('src/ui/DesktopAssist.tsx'),'Shared Desktop Assist UI must exist');
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import{DesktopAssistBanner,DesktopAssistSettings}from'./src/ui/DesktopAssist.tsx';import './src/ui/styles.css';import './src/ui/preferences.css';
 const base={supported:true,available:true,enabled:true,stopped:false,active:null,pending:null,allowedApps:[]};let state={...base},listeners=new Set(),statusResolvers=[],commandResolvers=[],holdStatus=false,holdCommand=false,fail=false;window.calls=[];
 window.fixture={emit(value){state={...state,...value};for(const cb of listeners)cb(state);},reset(value={}){state={...base,...value};},holdStatus(value){holdStatus=value;},resolveStatus(value){for(const resolve of statusResolvers.splice(0))resolve({...base,...value});},holdCommand(value){holdCommand=value;},resolveCommands(){for(const resolve of commandResolvers.splice(0))resolve(state);},fail(value){fail=value;},listeners(){return listeners.size;}};
 function apply(command){if(command.type==='set')state={...state,enabled:command.enabled};if(command.type==='decide'){if(command.decision==='always'&&state.pending)state={...state,allowedApps:[{id:state.pending.appId,name:state.pending.appName,path:'C:/Fixture.exe'}]};state={...state,pending:null};}if(command.type==='revoke')state={...state,allowedApps:state.allowedApps.filter(app=>app.id!==command.appId)};if(command.type==='stop')state={...state,stopped:true,active:null,pending:null};if(command.type==='resume')state={...state,stopped:false};for(const cb of listeners)cb(state);return state;}
 const api={desktopAssist(command){if(command.type==='status')return holdStatus?new Promise(resolve=>statusResolvers.push(resolve)):Promise.resolve(state);window.calls.push(command);if(fail)return Promise.reject(new Error('Fixture request failed'));if(holdCommand&&command.type!=='stop')return new Promise(resolve=>commandResolvers.push(()=>resolve(apply(command))));return Promise.resolve(apply(command));},onDesktopAssist(cb){listeners.add(cb);return()=>listeners.delete(cb);}};
 const root=createRoot(document.getElementById('root'));window.mount=(supported=true)=>{window.musebench=supported?api:undefined;root.render(<><div data-testid="owner"><DesktopAssistBanner taskId="chat-owner"/></div><div data-testid="other"><DesktopAssistBanner taskId="chat-other"/></div><main><DesktopAssistSettings taskId="chat-owner"/></main></>);};window.unmount=()=>root.render(null);window.mount(new URLSearchParams(location.search).get('api')!=='none');`;
 const built=await build({stdin:{contents:source,loader:'tsx',sourcefile:'desktop-assist-fixture.tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'fixture.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const js=built.outputFiles.find(file=>file.path.endsWith('.js')).text,css=built.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
 server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:`<!doctype html><meta charset="utf-8"><style>${css}html,body,#root{height:auto;min-height:100%;overflow:auto}body{padding:24px}main{max-width:680px;margin:24px auto}</style><div id="root"></div><script src="/fixture.js"></script>`);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:820,height:900}});page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url+'?api=none');
 await page.getByText('Desktop Assist is available in the Windows desktop app.').waitFor();assert(await page.getByRole('switch',{name:'Enable Desktop Assist'}).isDisabled());assert.equal(await page.getByRole('button',{name:'Allow once',exact:true}).count(),0);
 record('Browser preview is truthfully unavailable and cannot enable desktop access');
 await page.goto(url);
 const owner=page.getByTestId('owner'),other=page.getByTestId('other'),settings=page.locator('main');
 const emit=value=>page.evaluate(value=>window.fixture.emit(value),value);
 const pending=(id='request-1',taskId='chat-owner')=>({id,taskId,appId:'fixture-app',appName:'Fixture Notes',reason:'Read the selected note and update its heading.',expiresAt:Date.now()+60000});
 await emit({pending:pending()});await owner.getByRole('button',{name:'Allow once',exact:true}).waitFor();assert.equal(await other.getByRole('button',{name:'Allow once',exact:true}).count(),0);assert.equal(await settings.getByText('Requested by another chat.').count(),0);
 await owner.getByRole('button',{name:'Allow once',exact:true}).focus();await page.keyboard.press('Enter');await owner.getByRole('button',{name:'Allow once',exact:true}).waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{type:'decide',id:'request-1',decision:'allow'});
 await emit({pending:pending('request-2')});await owner.getByRole('button',{name:'Always allow',exact:true}).click();await settings.getByRole('button',{name:'Revoke Fixture Notes'}).waitFor();await settings.getByRole('button',{name:'Revoke Fixture Notes'}).click();await settings.getByText('No apps are always allowed.').waitFor();
 await emit({pending:pending('request-3')});await owner.getByRole('button',{name:'Deny',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{type:'decide',id:'request-3',decision:'deny'});
 record('Only the owner chat displays approval; keyboard decisions and saved app revocation reach the bounded API');
 await emit({active:{taskId:'chat-owner',appId:'fixture-app',appName:'Fixture Notes',windowId:'fixture-window',since:new Date().toISOString()}});await owner.getByText('Controlling Fixture Notes').waitFor();assert.equal(await other.getByRole('button',{name:'Stop immediately',exact:true}).count(),0);await owner.getByRole('button',{name:'Stop immediately',exact:true}).click();await owner.getByRole('button',{name:'Resume Desktop Assist',exact:true}).click();await owner.getByRole('button',{name:'Resume Desktop Assist',exact:true}).waitFor({state:'hidden'});
 record('Active control has an immediate Stop and remains stopped until explicit Resume');
 await emit({pending:pending('request-other','chat-elsewhere')});await settings.getByText('Requested by another chat.').waitFor();assert.equal(await owner.getByRole('button',{name:'Allow once',exact:true}).count(),0);await settings.getByRole('button',{name:'Deny',exact:true}).click();
 await emit({pending:{...pending('expired'),expiresAt:Date.now()+80}});await owner.getByText('Request expired. Muse must ask again.').waitFor();assert.equal(await owner.getByRole('button',{name:'Allow once',exact:true}).count(),0);
 record('Settings expose another chat’s request; expired requests cannot grant access');
 await emit({pending:null});await page.evaluate(()=>window.fixture.fail(true));await settings.getByRole('switch',{name:'Enable Desktop Assist'}).click();await settings.getByRole('alert').filter({hasText:'Fixture request failed'}).waitFor();await emit({active:null});await settings.getByRole('alert').filter({hasText:'Fixture request failed'}).waitFor();await page.evaluate(()=>window.fixture.fail(false));await settings.getByRole('switch',{name:'Enable Desktop Assist'}).click();await settings.getByRole('alert').waitFor({state:'hidden'});assert.equal(await settings.getByRole('switch').getAttribute('aria-checked'),'false');await settings.getByRole('switch').click();
 record('Command failures persist across status events and recover after a successful explicit retry');
 await emit({pending:pending('request-held')});await page.evaluate(()=>window.fixture.holdCommand(true));await owner.getByRole('button',{name:'Allow once',exact:true}).dblclick();assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.id==='request-held'))).length,1);await owner.getByRole('button',{name:'Stop immediately',exact:true}).click();await owner.getByRole('button',{name:'Resume Desktop Assist',exact:true}).waitFor();await page.evaluate(()=>{window.fixture.resolveCommands();window.fixture.holdCommand(false);});await owner.getByRole('button',{name:'Resume Desktop Assist',exact:true}).click();
 record('Rapid approval clicks dispatch once and Stop stays available during a pending command');
 await page.evaluate(()=>{window.unmount();});await page.waitForFunction(()=>window.fixture.listeners()===0);await page.evaluate(()=>{window.fixture.reset();window.fixture.holdStatus(true);window.mount();});await page.waitForFunction(()=>window.fixture.listeners()===3);await emit({pending:pending('newer-event')});await owner.getByRole('button',{name:'Allow once',exact:true}).waitFor();await page.evaluate(()=>window.fixture.resolveStatus({}));await owner.getByRole('button',{name:'Allow once',exact:true}).waitFor();
 record('Subscription events win over stale initial status, and unmount removes subscriptions');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'approval-narrow.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(output,'approval-light.png')});assert.deepEqual(report.errors,[]);record('Approval and settings fit 390px and render in both themes without renderer errors');
 report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;try{await page?.screenshot({path:path.join(output,'failure.png')});}catch{}console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
