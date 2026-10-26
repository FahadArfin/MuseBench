import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/composer',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/composer',variant+'-'));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};// Keep these offline UI checks from discovering the installed Muse runtime.
for (const key of Object.keys(env)) {
  if (key.toUpperCase() === 'PATH') env[key] = env[key].split(';').filter(folder => !/muse/i.test(folder)).join(';');
  if (key.toUpperCase() === 'LOCALAPPDATA') env[key] = env.MUSEBENCH_DATA_DIR;
}
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,modelRequests:0,microphoneCaptured:false,checks:[],errors:[]};let app,page;
const fixturePath=path.join(output,'synthetic-dictation.wav');
execFileSync(path.join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Speech; $speechFixture = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $speechFixture.SetOutputToWaveFile($env:MUSEBENCH_SYNTHETIC_WAV); $speechFixture.Speak("Please explain this project and add a test.") } finally { $speechFixture.Dispose() }'],{windowsHide:true,timeout:15000,env:{...process.env,MUSEBENCH_SYNTHETIC_WAV:fixturePath}});
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
async function launch(){app=await electron.launch({cwd:root,args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));await page.getByRole('button',{name:'Reasoning effort',exact:true}).waitFor();await page.setViewportSize({width:1440,height:900});}
const state=()=>page.evaluate(()=>window.musebench.getState());
const composer=()=>page.getByRole('textbox',{name:'Message Muse',exact:true});
async function until(test){const limit=Date.now()+15000;while(Date.now()<limit){if(await test())return;await new Promise(r=>setTimeout(r,60));}throw Error('Condition timed out');}
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function fixtureAudio(file){
 // Replace only the native helper's device argument with a synthetic WAV.
 // The real compiled recognizer, IPC and React input all execute unchanged.
 await app.evaluate(async(_electron,file)=>{
  const {ChildProcess}=process.getBuiltinModule('node:child_process');const original=ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn=function(options){if(String(options.file).endsWith('MuseBenchSpeech.exe')&&options.args.includes('--parent')){ChildProcess.prototype.spawn=original;options={...options,args:[options.args[0],'--wave',file]};}return original.call(this,options);};
 },file);
}
try{
 await launch();
 assert.equal((await state()).runtime.binary,null,'Offline test must not discover a real Muse binary');
 await composer().fill('Look into the parser.');
 await page.getByRole('button',{name:'Reasoning effort',exact:true}).click();
 await page.getByRole('combobox',{name:'Select reasoning effort'}).selectOption('xhigh');
 assert.match(await page.getByRole('button',{name:'Reasoning effort',exact:true}).innerText(),/Extra high/);
 await page.getByRole('button',{name:'Approval access',exact:true}).click();
 await shot('01-approval-menu');
 await page.getByRole('menuitemradio',{name:/Auto-review/}).click();
 await page.getByRole('button',{name:'Reasoning effort',exact:true}).click();await shot('02-reasoning-menu');await page.keyboard.press('Escape');
 assert.equal(await composer().inputValue(),'Look into the parser.');assert.equal((await state()).task,null);
 record('Codex-style composer exposes actual reasoning and sandboxed approval choices without submitting');
 await fixtureAudio(fixturePath);
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await until(async()=>/Please explain this project/i.test(await composer().inputValue()));
 await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();
 assert((await composer().inputValue()).startsWith('Look into the parser.'));
 assert.equal((await state()).task,null);
 await shot('03-transcribed-draft');
 record('Real Windows speech recognition transcribes synthetic audio into the existing editable draft without sending');
 await fixtureAudio(path.join(output,'missing-audio.wav'));
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.getByText(/Could not open the microphone/).waitFor();
 assert((await composer().inputValue()).startsWith('Look into the parser.'));
 await page.getByRole('button',{name:'Dismiss dictation notice'}).click();
 record('Speech errors keep the draft and show a recoverable microphone message');
 const projectRoot=path.join(output,'ParserProject');await mkdir(projectRoot);await writeFile(path.join(projectRoot,'package.json'),'{"name":"parser-project","scripts":{}}');
 await app.evaluate(({dialog},folder)=>{const original=dialog.showOpenDialog;dialog.showOpenDialog=async()=>{dialog.showOpenDialog=original;return{canceled:false,filePaths:[folder]};};},projectRoot);
 await page.getByRole('button',{name:'Add to chat',exact:true}).click();await page.getByRole('button',{name:'Choose project',exact:true}).click();
 await until(async()=>(await state()).activeProject?.root===projectRoot);
 await page.getByRole('button',{name:'Create task',exact:true}).click();
 await until(async()=>Boolean((await state()).task));const task=(await state()).task;
 assert.deepEqual(task.runOptions,{reasoning:'xhigh',approval:'auto'});assert.equal(task.planApproved,false);assert.equal(task.runtimeComplete,false);
 await until(async()=>!(await state()).busy && Boolean((await state()).error));
 assert(!(await page.getByRole('button',{name:'Send message',exact:true}).isDisabled()));
 assert.equal(await composer().inputValue(),task.request);
 assert.equal(await page.getByRole('button',{name:'Open plan',exact:true}).count(),0);
 record('Draft settings persist; missing Muse keeps the request retryable without a plan gate');
 await page.getByRole('button',{name:'Approval access',exact:true}).click();await page.getByRole('menuitemradio',{name:/No prompts/}).click();
 await until(async()=>(await state()).task.runOptions.approval==='never');
 await page.getByRole('button',{name:'New chat',exact:true}).click();
 assert.match(await page.getByRole('button',{name:'Approval access',exact:true}).innerText(),/Ask for approval/);
 await page.locator('.project-chats').getByRole('button',{name:task.title,exact:false}).click();
 await until(async()=>/No prompts/.test(await page.getByRole('button',{name:'Approval access',exact:true}).innerText()));
 assert.equal((await state()).task.runOptions.reasoning,'xhigh');
 record('Approval choices persist per chat and new chats begin with Ask for approval');
 await page.setViewportSize({width:390,height:844});await shot('04-composer-narrow');
 for(const name of ['Approval access','Reasoning effort','Add to chat']){
  await page.getByRole('button',{name,exact:true}).click();
  const box=await page.locator('.composer-popover').boundingBox();assert(box.x>=0&&box.x+box.width<=391);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('05-narrow-'+name.replaceAll(' ','-'));await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:1440,height:900});
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Light theme',exact:true}).click();await page.keyboard.press('Escape');await shot('06-light-composer');
 record('Composer and all popovers fit 390px and desktop layouts in light and dark themes');
 await app.close();app=null;await launch();
 await until(async()=>(await state()).task?.id===task.id);
 assert.deepEqual((await state()).task.runOptions,{reasoning:'xhigh',approval:'never'});
 assert.match(await page.getByRole('button',{name:'Approval access',exact:true}).innerText(),/No prompts/);
 assert.equal(report.errors.length,0);
 record('Restart restores reasoning and access choices with no renderer errors');
 report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;if(page&&!page.isClosed())await shot('failure').catch(()=>{});}
finally{if(app)await app.close();report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));}
