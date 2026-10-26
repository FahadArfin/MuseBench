import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/chat-find',{recursive:true});
const root=await mkdtemp(path.resolve('artifacts/chat-find',variant+'-')),dataDir=path.join(root,'data'),project=path.join(root,'Search fixture');await mkdir(project);await writeFile(path.join(project,'README.md'),'Search test');
const controller=await createController({dataDir});await controller.dispatch({type:'openProject',path:project});await controller.dispatch({type:'newTask',request:'Unrelated chat history',mode:'manual'});await controller.dispatch({type:'newTask',request:'İ Needle then NEEDLE and a literal [square].',mode:'manual'});await controller.close();
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:path.join(root,'projects')};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const app=await electron.launch({args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});const page=await app.firstWindow();page.setDefaultTimeout(12000);
const report={variant,checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
try{
 await page.setViewportSize({width:1440,height:950});await page.getByRole('textbox',{name:'Message Muse',exact:true}).fill('Preserve this draft');await page.keyboard.press('Control+f');const input=page.getByRole('textbox',{name:'Search this chat',exact:true});await input.waitFor();assert(await input.evaluate(el=>el===document.activeElement));await input.fill('needle');await page.getByRole('status').filter({hasText:'1 of 2'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[...CSS.highlights.get('chat-find')].map(r=>r.toString())),['Needle','NEEDLE']);await input.press('Enter');await page.getByRole('status').filter({hasText:'2 of 2'}).waitFor();await input.press('Shift+Enter');await page.getByRole('status').filter({hasText:'1 of 2'}).waitFor();
 pass('Ctrl+F focuses the pill; literal case-insensitive matches retain Unicode offsets and Enter/Shift+Enter navigate');
 await input.fill('[square]');await page.getByRole('status').filter({hasText:'1 of 1'}).waitFor();await input.fill('Unrelated');await page.getByText('No matches in this chat',{exact:true}).waitFor();await input.fill('needle');await input.press('Escape');assert.equal(await page.locator('.chat-find-popover').count(),0);assert.equal(await page.evaluate(()=>CSS.highlights.size),0);assert.equal(await page.getByRole('textbox',{name:'Message Muse',exact:true}).inputValue(),'Preserve this draft');
 pass('Search stays within the current chat, supports punctuation, and Escape clears highlights without changing drafts');
 await page.keyboard.press('Control+k');await page.getByRole('textbox',{name:'Search projects and chats',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Search this chat',exact:true}).click();await page.getByRole('button',{name:'Search on the web',exact:true}).click();const web=page.getByRole('textbox',{name:'Search the web',exact:true});await web.fill('test & query');
 await app.evaluate(({shell})=>{globalThis.__searchUrls=[];shell.openExternal=async url=>{globalThis.__searchUrls.push(url);};});assert.deepEqual(await app.evaluate(()=>globalThis.__searchUrls),[]);await web.press('Enter');await page.waitForTimeout(150);assert.deepEqual(await app.evaluate(()=>globalThis.__searchUrls),['https://www.google.com/search?q=test%20%26%20query']);
 pass('Ctrl+K still opens the library; web mode sends only the entered query on submit through the desktop external-link handler');
 await page.getByRole('button',{name:'Search in chat',exact:true}).click();await input.fill('needle');await page.getByRole('status').filter({hasText:'1 of 2'}).waitFor();await page.screenshot({path:path.join(root,'desktop.png')});await page.setViewportSize({width:430,height:820});const box=await page.locator('.chat-find-popover').boundingBox();assert(box.x>=0&&box.x+box.width<=430);assert(await input.isVisible());await page.screenshot({path:path.join(root,'mobile.png')});
 await page.setViewportSize({width:1440,height:950});await page.locator('.sidebar .chat-row').filter({hasText:'Unrelated chat history'}).first().click();await page.locator('.user-message').getByText('Unrelated chat history',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');assert.equal(await page.evaluate(()=>CSS.highlights.size),0);
 pass('Pill fits mobile and changing chats resets the search');assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=String(e.stack??e);await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});throw e;}finally{await app.close();await writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(root);}
