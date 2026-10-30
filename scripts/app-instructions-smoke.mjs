import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium,_electron as electron} from 'playwright';
import {createController} from '../src/controller/index.mjs';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';

const desktop=process.argv.includes('--desktop'),executablePath=desktop?process.env.MUSEBENCH_EXECUTABLE:undefined,variant=desktop?(executablePath?'installed':'desktop'):'preview';
await mkdir('artifacts/app-instructions',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/app-instructions',variant+'-'));
const report={variant,executablePath:executablePath??null,status:'running',checks:[],errors:[],modelRequests:0};let server,browser,app,page;
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
const expected=(personal,project)=>({version:1,scope:'app-settings',personal,project});
try{
 if(desktop){
  const profile=path.join(output,'profile'),project=path.join(output,'project');await mkdir(project);await writeFile(path.join(project,'AGENTS.md'),'Repository instruction fixture remains independent');
  const controller=await createController({dataDir:profile});try{await controller.dispatch({type:'openProject',path:project});await controller.dispatch({type:'newTask',mode:'manual',request:'Instruction snapshot fixture'});}finally{await controller.close();}
  app=await electron.launch({...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:['.']),'--host-resolver-rules=MAP * ~NOTFOUND'],env:isolatedDesktopEnvironment(profile)});page=await waitForDesktopRenderer(app);assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
 }else{
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-app-instructions',server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch();page=await browser.newPage({viewport:{width:1200,height:960}});await page.goto(server.resolvedUrls.local[0]+'preview.html');
 }
 page.setDefaultTimeout(8000);page.on('pageerror',error=>report.errors.push(error.message));await page.getByRole('group',{name:'Choose workspace'}).getByRole('button',{name:'Muse Code',exact:true}).click();
 const baseline=await page.evaluate(async()=>{const s=await window.musebench.getState();return{messages:s.task?.messages.length??0,executions:s.task?.executionReceipts?.length??0};});
 const personal='Personal current 😀 <strong>literal</strong>',project='Project current: preserve interfaces';
 const memory=async text=>{await page.keyboard.press('Control+,');const settings=page.getByRole('dialog',{name:'Settings',exact:true});await settings.getByRole('button',{name:'Memory',exact:true}).click();assert.match(await settings.innerText(),/next request explicitly replaces earlier personal settings with an empty scope/);await settings.getByLabel('Your instructions',{exact:true}).fill(text);await settings.getByRole('button',{name:'Save instructions',exact:true}).click();await settings.getByRole('status').filter({hasText:'Instructions saved'}).waitFor();await page.keyboard.press('Escape');};
 await memory(personal);pass('Memory saves current personal settings locally and explains explicit replacement on the next request');
 const open=async()=>{await page.getByRole('button',{name:'Add to chat',exact:true}).click();await page.getByRole('button',{name:'Files & project context',exact:true}).click();return page.getByRole('dialog',{name:'Project context',exact:true});};
 let context=await open();await context.getByRole('tab',{name:'Instructions',exact:true}).click();assert.match(await context.innerText(),/empty scope.*next request/i);await context.getByRole('textbox',{name:'Project instructions',exact:true}).fill(project);await context.getByRole('button',{name:'Save instructions',exact:true}).click();
 const inspect=async(personalState,projectState)=>{await context.getByRole('tab',{name:'What Muse receives',exact:true}).click();const receipt=context.getByRole('region',{name:'Prepared request receipt',exact:true});await receipt.getByText('App instruction snapshot',{exact:true}).waitFor();await receipt.getByText(new RegExp(`Personal: ${personalState}.*Project: ${projectState}`)).waitFor();const result=await page.evaluate(async()=>{const s=await window.musebench.getState();return window.musebench.inspectCodeContext({projectId:s.activeProject.id,taskId:s.task?.id??null,text:'',files:[]});});assert.deepEqual(result.receipt.instructionSnapshot,expected(personalState,projectState));assert.equal(await context.locator('.context-inspection > pre').textContent(),result.prompt);assert.match(result.prompt,/replaces earlier instances of these same app-saved/);return result;};
 let info=await inspect('included','included');assert.ok(info.prompt.includes(personal));assert.ok(info.prompt.includes(project));assert.equal(await context.locator('.context-inspection > pre strong').count(),0);pass('Shared context UI shows complete two-scope receipt and exact literal current text');
 await context.getByRole('tab',{name:'Instructions',exact:true}).click();await context.getByRole('textbox',{name:'Project instructions',exact:true}).fill('');await context.getByRole('button',{name:'Save instructions',exact:true}).click();info=await inspect('included','empty');assert.doesNotMatch(info.prompt,/Project current:/);assert.match(info.prompt,/Empty: no current app-saved project instructions/);await page.keyboard.press('Escape');
 await memory('');context=await open();info=await inspect('empty','empty');assert.doesNotMatch(info.prompt,/Personal current|Project current:/);assert.match(info.prompt,/Empty: no current app-saved personal instructions/);pass('Clearing each setting produces an explicit empty scope without retaining its previous app text');
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:520,height:820});const receipt=context.getByRole('region',{name:'Prepared request receipt',exact:true});await receipt.scrollIntoViewIfNeeded();assert.equal(await receipt.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await receipt.screenshot({path:path.join(output,'instruction-receipt-narrow.png')});pass('Receipt fits a narrow viewport with reduced motion');
 const after=await page.evaluate(async()=>{const s=await window.musebench.getState();return{messages:s.task?.messages.length??0,executions:s.task?.executionReceipts?.length??0};});assert.deepEqual(after,baseline);assert.deepEqual(report.errors,[]);pass('Settings saves and context inspection add no chat message or execution receipt; no model request is initiated');report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;throw error;}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await app?.close();await browser?.close();await server?.close();console.log('Report: '+output);}
