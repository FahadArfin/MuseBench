// Actual source app, isolated local profile and manual task. No provider/model requests.
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createController} from '../src/controller/index.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';
import {createFilePreviewFixtures} from './file-preview-fixtures.mjs';
await mkdir('artifacts/file-viewer-app',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/file-viewer-app/fixture-')),dataDir=path.join(output,'profile'),project=path.join(output,'Project');await mkdir(project);
for(const [name,bytes]of await createFilePreviewFixtures())await writeFile(path.join(project,name),bytes);
const controller=await createController({dataDir});await controller.dispatch({type:'openProject',path:project});const state=await controller.dispatch({type:'newTask',mode:'manual',request:'Review these documents'});await controller.close();
const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite')),saved=JSON.parse(db.prepare('SELECT json FROM app').get().json);saved.task.messages=[{id:'user',role:'user',text:'Review these documents',at:new Date().toISOString()},{id:'answer',role:'assistant',text:'Here is the [document preview](fixture.md).',at:new Date().toISOString()}];db.prepare('UPDATE app SET json=?').run(JSON.stringify(saved));db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(saved.task),state.task.id);db.close();
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
let app,page;const report={checks:[],errors:[],modelRequests:0};const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
try{
 app=await electron.launch({args:['.'],env});page=await waitForDesktopRenderer(app);page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.setViewportSize({width:1450,height:1000});await page.getByRole('button',{name:'Muse Code',exact:true}).click();await page.getByRole('button',{name:'document preview',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'Chat session tools'});await panel.locator('iframe[title^="File preview:"]').waitFor();await panel.frameLocator('iframe').getByRole('heading',{name:'Markdown fixture'}).waitFor();pass('Local assistant file link opens the real Files viewer beside the chat');
 assert((await panel.boundingBox()).width>=600,'Document panel should have usable width beside chat');await page.screenshot({path:path.join(output,'files-split.png')});await panel.getByRole('button',{name:'Expand file viewer'}).click();await page.screenshot({path:path.join(output,'files-expanded.png')});await panel.getByRole('button',{name:'Restore file viewer'}).click();
 await panel.getByRole('button',{name:'Browse files'}).click();await panel.getByRole('button',{name:'fixture.pptx',exact:true}).click();await panel.frameLocator('iframe').getByText('Slide fixture 1').first().waitFor();pass('Session file browsing opens PowerPoint in the production app');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'files-narrow.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);pass('Files panel stays within a narrow app viewport');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();}
