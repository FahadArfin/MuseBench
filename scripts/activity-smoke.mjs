import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';

// Isolated desktop fixture. Native event/ownership tests exercise the controller
// separately; these saved rows are not claims about live model execution.
const root=process.cwd(),variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/activity-ui',{recursive:true});
const fixture=await mkdtemp(path.join(root,'artifacts/activity-ui',`${variant}-`)),dataDir=path.join(fixture,'data'),projectDir=path.join(fixture,'project');
await mkdir(projectDir);await writeFile(path.join(projectDir,'README.md'),'# Shop\nOld heading\nKEEP THIS\nOld footer\n');await writeFile(path.join(projectDir,'package.json'),'{"name":"activity-fixture","scripts":{}}');
const controller=await createController({dataDir});
await controller.dispatch({type:'openProject',path:projectDir});
let seeded=await controller.dispatch({type:'newTask',request:'Improve the shop experience',mode:'muse'});await controller.close();
await writeFile(path.join(projectDir,'README.md'),'# Shop\nNew heading\nKEEP THIS\nNew footer\n');await writeFile(path.join(projectDir,'notes.txt'),'One useful line\n');
const startedAt=new Date(Date.now()-50000).toISOString(),endedAt=new Date().toISOString();
const actions=[{id:'read',kind:'tool',title:'Read file',tool:'tool.read_file',status:'completed',detail:'Read README.md',output:'# Shop\nOld heading'}, {id:'edit',kind:'tool',title:'Edit file',tool:'tool.edit_file',status:'completed',detail:'Updated README.md',output:'Updated heading and footer.'}];
const run={id:'prompt-1',promptId:'prompt-1',prompt:seeded.task.request,runId:'native-run-fixture',status:'completed',startedAt,endedAt,activities:actions};
seeded.task.runs=[run];seeded.task.messages=[{id:'prompt-1',role:'user',text:seeded.task.request,at:startedAt},{id:'reply-1',role:'assistant',text:'Updated the heading and footer, preserving the shared content. The changes are ready to inspect.',at:endedAt,turnId:run.id}];seeded.task.runtimeComplete=true;
const db=new DatabaseSync(path.join(dataDir,'musebench.sqlite'));db.prepare('UPDATE app SET json=? WHERE id=1').run(JSON.stringify(seeded));db.prepare('UPDATE tasks SET json=? WHERE id=?').run(JSON.stringify(seeded.task),seeded.task.id);db.close();
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:path.join(fixture,'projects')};for(const key of Object.keys(env)){if(key.toUpperCase()==='LOCALAPPDATA')env[key]=dataDir;if(key.toUpperCase()==='PATH')env[key]=env[key].split(';').filter(part=>!/muse/i.test(part)).join(';');}delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,fixture,modelRequests:0,checks:[],errors:[]};let app,page;
const record=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
const screenshot=async name=>page.screenshot({path:path.join(fixture,`${name}.png`)});
try{
 app=await electron.launch({cwd:root,args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>Boolean(window.musebench));await page.setViewportSize({width:1440,height:960});
 await page.getByRole('button',{name:'Toggle threads panel'}).waitFor();assert.equal(await page.getByRole('button',{name:'Toggle review panel'}).count(),0);assert.equal(await page.getByRole('navigation',{name:'Review stages'}).count(),0);
 assert.equal(await page.getByRole('complementary',{name:'Work threads',exact:true}).count(),0);
 assert.equal(await page.getByRole('complementary',{name:'File changes',exact:true}).isVisible(),false);record('Chat starts full width with both panels closed');
 const state=await page.evaluate(()=>window.musebench.getState());assert.equal(state.task.changes.length,2);assert.equal(state.task.changes.reduce((n,f)=>n+f.additions,0),3);assert.equal(state.task.changes.reduce((n,f)=>n+f.deletions,0),2);record('Real file snapshots report two files +3 -2 with unchanged middle lines excluded');
 await screenshot('conversation');
 await page.getByRole('button',{name:/Worked for/}).click();await page.getByText('Read file',{exact:true}).first().click();assert.match(await page.getByLabel('Read file output').first().innerText(),/# Shop/);record('Inline activity expands into the actual tool output');
 await page.getByRole('button',{name:'Toggle threads panel'}).click();await page.getByRole('tab',{name:/Tasks/}).waitFor();await screenshot('threads');
 await page.locator('.work-thread-row').first().click();await page.getByRole('button',{name:'Continue in chat'}).waitFor();assert.match(await page.locator('.work-thread-prompt').innerText(),/Improve the shop/);record('Threads lists saved requests and opens their activity details');
 await page.getByRole('button',{name:'All tasks'}).click();await page.getByRole('tab',{name:/Agents/}).click();assert.match(await page.locator('.work-threads-empty').innerText(),/No agents reported/);record('Agent view does not invent child agents');
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('complementary',{name:'Work threads',exact:true}).count(),0);record('Escape closes Threads');
 const card=page.getByRole('region',{name:'Edited 2 files',exact:true});await card.waitFor();
 assert.equal(await card.locator('.changed-file-row').count(),2);
 assert.equal(await card.locator('.changed-files-totals').getAttribute('aria-label'),'3 additions, 2 deletions');
 assert.equal(await card.getByRole('button',{name:/README.md/}).locator('.changed-file-counts').getAttribute('aria-label'),'2 additions, 2 deletions');
 assert.equal(await card.getByRole('button',{name:/notes.txt/}).locator('.changed-file-counts').getAttribute('aria-label'),'1 additions, 0 deletions');
 await screenshot('changed-files');
 await card.getByRole('button',{name:/README.md/}).click();const review=page.getByRole('complementary',{name:'File changes',exact:true});assert.equal(await review.isVisible(),true);await page.getByLabel('File diff for README.md').waitFor();
 const readme=review.getByRole('region',{name:'Changes in README.md',exact:true});
 assert.equal(await readme.locator('.code-line.context').filter({hasText:'KEEP THIS'}).count(),1);assert.equal(await readme.locator('.code-line.removed').count(),2);assert.equal(await readme.locator('.code-line.added').count(),2);
 assert.equal(await review.locator('.diff').count(),2);await review.getByLabel('File diff for notes.txt').waitFor();
 assert.equal(await review.getByRole('heading',{name:'Changed files',exact:true}).count(),0);assert.equal(await review.getByRole('button',{name:'Refresh',exact:true}).count(),0);
 await readme.getByRole('button',{name:'README.md',exact:true}).click();assert.equal(await readme.getByLabel('File diff for README.md').count(),0);await readme.getByRole('button',{name:'README.md',exact:true}).click();
 await assert.rejects(page.evaluate(()=>window.musebench.openProjectFile({taskId:'stale',path:'README.md'})),/active task/);
 record('Review stacks every changed file, collapses independently, and rejects stale editor requests');record('Inline edited-files card exposes exact per-file counts and opens the selected diff');await screenshot('selected-diff');
 await page.getByRole('button',{name:'Close details panel'}).click();await card.getByRole('button',{name:'View changes',exact:true}).focus();await page.keyboard.press('Enter');await review.waitFor();await page.getByRole('button',{name:'Close details panel'}).click();record('View changes opens file details using the keyboard');
 // The following extra rows are explicitly renderer fixtures, not real edits.
 const moreFiles=structuredClone(state);moreFiles.task.changes.push(...Array.from({length:3},(_,i)=>({path:`extra-${i}.txt`,status:'added',additions:1,deletions:0,before:'',after:'fixture\n'})));
 await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('MuseBench')).webContents.send('musebench:update',value),moreFiles);
 const moreCard=page.getByRole('region',{name:'Edited 5 files',exact:true});await moreCard.waitFor();assert.equal(await moreCard.locator('.changed-file-row').count(),3);
 await moreCard.getByRole('button',{name:'Show 2 more files',exact:true}).click();assert.equal(await moreCard.locator('.changed-file-row').count(),5);
 await moreCard.getByRole('button',{name:'Show fewer files',exact:true}).click();assert.equal(await moreCard.locator('.changed-file-row').count(),3);record('Long file lists expand and collapse without hiding the initial three files');
 await page.setViewportSize({width:430,height:860});const cardBounds=await moreCard.boundingBox();assert.ok(cardBounds.x>=0&&cardBounds.x+cardBounds.width<=431);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await screenshot('narrow-files');await page.setViewportSize({width:1440,height:960});
 // Simulate only renderer updates with labelled fixtures. Production controller
 // correlation/cancellation is verified in exec-controller.test.mjs.
 const live=structuredClone(state);live.busy=true;live.runtime.status='running';live.task.runs=[{...run,status:'working',endedAt:undefined,activities:[...actions,{id:'tests',kind:'tool',tool:'tool.powershell',title:'Run PowerShell',status:'working',detail:'Running project tests',output:''}]}];
 await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows().find(window=>window.getTitle().includes('MuseBench')).webContents.send('musebench:update',value),live);
 await page.getByRole('status').filter({hasText:'Running project tests'}).waitFor();assert.equal(await page.locator('.changed-files').count(),0);record('Streaming fixture updates the current action without reopening the activity group');
 await page.getByRole('button',{name:'Toggle threads panel'}).click();await screenshot('working-threads');assert.match(await page.locator('.work-thread-list').innerText(),/Working/);assert.match(await page.locator('.work-thread-list').innerText(),/Run PowerShell/);
 await page.setViewportSize({width:600,height:860});await screenshot('narrow-threads');const bounds=await page.locator('.work-threads').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=601);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);record('Threads remains within a narrow window without page overflow');
 await page.getByRole('button',{name:'Close Threads'}).click();await page.setViewportSize({width:1440,height:960});
 await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows().find(window=>window.getTitle().includes('MuseBench')).webContents.send('musebench:update',value),state);
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light';});await page.getByRole('button',{name:'Toggle threads panel'}).click();await screenshot('light-threads');record('Light appearance renders activity using the shared theme tokens');
 await page.getByRole('button',{name:'Close Threads'}).click();
 for(const [command,title] of [['/preview','Project preview'],['/checks','Project checks']]){
   await page.getByRole('textbox',{name:'Message Muse',exact:true}).fill(command);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Send message',exact:true}).click();
   await page.getByRole('complementary',{name:title,exact:true}).waitFor();assert.equal(await page.getByRole('navigation',{name:'Review stages'}).count(),0);assert.equal(await page.getByRole('button',{name:'Approve plan',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Continue to review',exact:true}).count(),0);await page.getByRole('button',{name:'Close details panel'}).click();
 }
 record('Preview and checks remain standalone tools without plan or review stages');
 await writeFile(path.join(fixture,'accessibility.txt'),await page.locator('body').ariaSnapshot());
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(error){report.errors.push(error.stack??String(error));throw error;}finally{if(app)await app.close();await writeFile(path.join(fixture,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${path.join(fixture,'report.json')}`);}
