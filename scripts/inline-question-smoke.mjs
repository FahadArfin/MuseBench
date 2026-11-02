// Production App + preload/publisher in an isolated Electron profile. The
// fixture replaces Code state/actions only: no Muse host or paid request.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {_electron as electron} from 'playwright';
import {createController} from '../src/controller/index.mjs';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';
await mkdir('artifacts/inline-questions',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/inline-questions/desktop-')),profile=path.join(output,'profile'),project=path.join(output,'project');await mkdir(project);await writeFile(path.join(project,'README.md'),'# Offline question fixture');
const controller=await createController({dataDir:profile});await controller.dispatch({type:'openProject',path:project});await controller.dispatch({type:'newTask',request:'Build a notification menu',mode:'manual'});await controller.close();
const prompt={kind:'input',sessionId:'fixture-session',turnId:'fixture-turn',userInputId:'fixture-question',revision:3,questions:[{id:'tray',header:'Tray icon',question:'Should the MuseBench tray icon always be available while the app is open, with background mode as a separate setting?',selection:{mode:'single'},options:[{label:'Yes—always show the tray icon while open',description:'Keep notification shortcuts available.'},{label:'Only show it when background mode is enabled'}]}]};
let app,page;const report={checks:[],errors:[],providerCalls:0};const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
try{
 app=await electron.launch({args:['.','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],env:isolatedDesktopEnvironment(profile),timeout:30000});page=await waitForDesktopRenderer(app);page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(e.message));await page.getByRole('button',{name:'Muse Code',exact:true}).click();const composer=page.getByRole('textbox',{name:'Message Muse',exact:true});await composer.fill('Keep this main-chat draft');
 const actual=await page.evaluate(()=>window.musebench.getState());
 await app.evaluate(async({app,ipcMain,BrowserWindow},{state,prompt})=>{
  const require=process.getBuiltinModule('node:module').createRequire(app.getAppPath()+'/package.json'),{createRendererStatePublisher}=require('./electron/renderer-state-publisher.mjs');
  const contents=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/dist/index.html')).webContents,send=contents.send.bind(contents),event={sender:contents,senderFrame:contents.mainFrame};
  const prior=await ipcMain._invokeHandlers.get('musebench:state')(event);
  state.task.mode='muse';state.runtime={...state.runtime,transport:'msp',sessionId:prompt.sessionId,status:'blocked',questionsSupported:true,pending:prompt,pendingRequests:[prompt],inputResponse:null,inputResponses:[]};
  const f=globalThis.inlineQuestion={state,actions:[],release:null,contents};contents.send=(channel,...args)=>{if(channel!=='musebench:update')send(channel,...args);};
  const publisher=f.publisher=createRendererStatePublisher({readState:()=>structuredClone(f.state),send:value=>send('musebench:update',value)});
  for(const name of ['musebench:state','musebench:state-attach','musebench:action'])ipcMain.removeHandler(name);
  for(const name of ['musebench:state-ack','musebench:state-detach'])ipcMain.removeAllListeners(name);
  ipcMain.handle('musebench:state',()=>publisher.read());ipcMain.handle('musebench:state-attach',()=>publisher.attach());
  ipcMain.on('musebench:state-ack',(event,value)=>{if(event.sender===contents)publisher.ack(value);});ipcMain.on('musebench:state-detach',event=>{if(event.sender===contents)publisher.detach();});
  ipcMain.handle('musebench:action',async(_event,action)=>{
   f.actions.push(action);if(action.type!=='answerInput')throw Error('No provider work in question fixture');
   if(action.operation==='engage')return new Promise(resolve=>{f.release=()=>resolve({snapshot:publisher.read(),result:structuredClone(f.state)});});
   f.state.runtime.inputResponse={userInputId:prompt.userInputId,status:'accepted'};publisher.publish(f.state);return{snapshot:publisher.read(),result:structuredClone(f.state)};
  });
  while(publisher.diagnostics.generation<prior.generation)publisher.detach();publisher.attach();
 },{state:actual,prompt});
 const card=page.getByRole('region',{name:'Muse question',exact:true}),answer=page.getByRole('textbox',{name:'Write an answer: Tray icon',exact:true});await card.waitFor();
 assert.equal(await page.getByRole('dialog').count(),0);const bounds=await page.locator('.composer-region').evaluate(el=>({hasQuestion:!!el.querySelector('.native-question'),questionBottom:el.querySelector('.native-question').getBoundingClientRect().bottom,composerTop:el.querySelector('.chat-composer').getBoundingClientRect().top}));assert.equal(bounds.hasQuestion,true);assert.ok(bounds.questionBottom<=bounds.composerTop);assert.equal(await card.locator('input:checked').count(),0);pass('A native request appears above the actual Code composer without opening a dialog or preselecting an answer');
 await answer.fill('Keep the icon open, but let me control background mode.');await answer.press('End');await answer.press('!');assert.equal(await answer.inputValue(),'Keep the icon open, but let me control background mode.!');assert.equal(await answer.evaluate(el=>el===document.activeElement),true);assert.equal(await answer.isDisabled(),false);await app.evaluate(()=>{if(!globalThis.inlineQuestion.release)throw Error('Engage was not observed');globalThis.inlineQuestion.release();});
 await page.keyboard.press('Control+,');await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await answer.inputValue(),'Keep the icon open, but let me control background mode.!');assert.equal(await composer.inputValue(),'Keep this main-chat draft');pass('Engagement does not interrupt typing; opening Settings preserves both answer and main-chat drafts');
 await page.screenshot({path:path.join(output,'question-wide.png')});await page.getByRole('button',{name:'Send answers',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.question-send')?.disabled);const actions=await app.evaluate(()=>globalThis.inlineQuestion.actions);assert.deepEqual(actions.filter(a=>a.operation==='answer'),[{type:'answerInput',taskId:actual.task.id,sessionId:prompt.sessionId,userInputId:prompt.userInputId,turnId:prompt.turnId,revision:3,operation:'answer',answers:[{questionId:'tray',freeText:'Keep the icon open, but let me control background mode.!'}]}]);assert.equal(await composer.inputValue(),'Keep this main-chat draft');pass('Custom answers use the bound native action exactly once and leave the normal prompt draft untouched');
 await app.evaluate(()=>{const f=globalThis.inlineQuestion;f.state.runtime.pending=null;f.state.runtime.pendingRequests=[];f.publisher.publish(f.state);});await card.waitFor({state:'detached'});pass('The question card disappears after the native pending request settles');
 await app.evaluate((_electron,prompt)=>{const f=globalThis.inlineQuestion;f.state.runtime.pending={...prompt,revision:4};f.state.runtime.pendingRequests=[f.state.runtime.pending];f.state.runtime.inputResponse=null;f.publisher.publish(f.state);},prompt);await card.waitFor();assert.equal(await answer.inputValue(),'');
 await answer.fill('First request answer');await page.getByRole('button',{name:'Collapse question',exact:true}).click();
 await app.evaluate((_electron,prompt)=>{const f=globalThis.inlineQuestion;f.state.runtime.pendingRequests.push({...prompt,userInputId:'second-question',questions:[{...prompt.questions[0],id:'placement',header:'Placement',question:'Where should the tray icon appear?'}]});f.publisher.publish(f.state);},prompt);
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Add to chat',exact:true}).click();await page.getByRole('button',{name:'Muse connection',exact:true}).click();await page.getByRole('dialog',{name:'Your Muse connection',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Pending requests',exact:true}).selectOption({label:'Question 2'});await page.getByRole('button',{name:'Answer in chat',exact:true}).click();
  await page.getByRole('textbox',{name:'Write an answer: Placement',exact:true}).waitFor();await page.waitForFunction(()=>document.activeElement?.closest('.native-question')?.textContent.includes('Where should the tray icon appear?'));
  if(i===0)await page.getByRole('button',{name:'Collapse question',exact:true}).click();
 }
 await page.getByRole('combobox',{name:'Pending questions',exact:true}).selectOption({label:'1. Tray icon'});await page.getByRole('button',{name:'Expand question',exact:true}).click();assert.equal(await answer.inputValue(),'First request answer');pass('Answer in chat selects, expands and focuses the chosen native request without losing other answers');
 await answer.focus();await app.evaluate(()=>{const f=globalThis.inlineQuestion;f.state.runtime.pendingRequests[1].revision++;f.publisher.publish(f.state);});await page.waitForTimeout(100);assert.equal(await page.getByRole('combobox',{name:'Pending questions',exact:true}).inputValue(),JSON.stringify([prompt.sessionId,prompt.userInputId,4]));assert.equal(await answer.evaluate(el=>el===document.activeElement),true);assert.equal(await answer.inputValue(),'First request answer');pass('A later revision cannot replay an old reveal or interrupt typing in another question');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'question-narrow.png')});pass('A revised question starts fresh and fits the narrow Code workspace');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(e);process.exitCode=1;}
finally{await app?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);}
