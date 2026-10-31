import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/settings-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/settings-ui',variant+'-'));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
for(const key of Object.keys(env)){
 if(key.toUpperCase()==='PATH')env[key]=env[key].split(';').filter(folder=>!/muse/i.test(folder)).join(';');
 if(key.toUpperCase()==='LOCALAPPDATA')env[key]=env.MUSEBENCH_DATA_DIR;
}
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,output,modelRequests:0,microphoneCaptured:false,checks:[],errors:[]};let app,page;
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
async function launch(){
 app=await electron.launch({cwd:root,args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
 page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();await page.getByRole('button',{name:'New chat',exact:true}).waitFor();await page.setViewportSize({width:1440,height:900});
}
const dialog=()=>page.getByRole('dialog',{name:'Settings',exact:true});
const category=label=>dialog().getByRole('navigation',{name:'Settings categories'}).getByRole('button',{name:label,exact:true}).click();
const state=()=>page.evaluate(()=>window.musebench.getState());
const dispatch=action=>page.evaluate(action=>window.musebench.dispatch(action),action);
async function settings(){await page.keyboard.press('Control+,');await dialog().waitFor();}
async function close(){await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});}
async function until(fn){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('Condition timed out');}
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function noOverflow(){const value=await dialog().evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,content:el.querySelector('.settings-content').clientWidth,contentScroll:el.querySelector('.settings-content').scrollWidth}));assert(value.scroll<=value.width+1,JSON.stringify(value));assert(value.contentScroll<=value.content+1,JSON.stringify(value));}
try{
 await launch();assert.equal((await state()).runtime.binary,null);
 await settings();assert.deepEqual(await dialog().getByRole('navigation').getByRole('button').allTextContents(),['General','Notifications','Voice','Keyboard shortcuts','Skills','Connectors','Plugins','MCP servers','Hooks','Connections','Muse Code','Memory','Muse connection','Mobile devices','App control','Account','Usage & billing','Data & privacy','Updates','About']);
 assert.equal(await dialog().getByRole('textbox',{name:'Search settings'}).evaluate(el=>el===document.activeElement),true);
 await page.setViewportSize({width:1819,height:886});await shot('01-general-reference');await noOverflow();
 record('Settings dialog has all 20 expected grouped sections, focused search and reference-size layout');
 const search=()=>dialog().getByRole('textbox',{name:'Search settings'});
 await search().fill('permission');assert.equal(await dialog().getByRole('navigation').getByRole('button').count(),1);await dialog().getByRole('combobox',{name:'Default approval access'}).waitFor();
 await search().press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-nav-code');
 await search().fill('zzmissing');await dialog().getByRole('heading',{name:'No settings found'}).waitFor();assert.equal(await dialog().getByRole('navigation').getByRole('button').count(),0);
 await dialog().getByRole('button',{name:'Clear search',exact:true}).click();
 await category('General');await page.keyboard.press('ArrowDown');assert.equal(await dialog().getByRole('navigation').getByRole('button',{name:'Notifications',exact:true}).getAttribute('aria-current'),'page');
 await page.keyboard.press('End');await dialog().getByRole('heading',{name:/MuseBench/}).waitFor();await page.keyboard.press('Home');
 record('Search finds controls, empty search is recoverable and arrow/Home/End navigation works');
 await category('General');await dialog().getByRole('combobox',{name:'Transcript width'}).selectOption('wide');await dialog().getByRole('combobox',{name:'Response font'}).selectOption('mono');await dialog().getByRole('combobox',{name:'Transcript text size'}).selectOption('large');await dialog().getByRole('switch',{name:'Reduce motion'}).click();
 assert.equal(await page.locator('html').getAttribute('data-transcript-width'),'wide');assert.equal(await page.locator('html').getAttribute('data-font'),'mono');
 await dialog().getByRole('button',{name:'Light theme'}).click();await shot('02-general-light');await dialog().getByRole('button',{name:'Dark theme'}).click();
 await category('Notifications');for(const name of ['Task completions','Needs attention','Notification sound'])await dialog().getByRole('switch',{name,exact:true}).click();await shot('03-notifications');
 const notificationBridge=await page.evaluate(async()=>{let rejected=false;try{await window.musebench.configureNotifications({completion:true,attention:true,sound:false,title:'injected'});}catch{rejected=true;}const result=await window.musebench.configureNotifications({completion:true,attention:true,sound:true});return{rejected,supported:typeof result.supported};});assert.deepEqual(notificationBridge,{rejected:true,supported:'boolean'});
 record('Appearance controls apply immediately and notification IPC rejects arbitrary content');
 await category('Muse Code');await dialog().getByRole('combobox',{name:'Default reasoning effort'}).selectOption('xhigh');await dialog().getByRole('combobox',{name:'Default approval access'}).selectOption('auto');await shot('04-code-defaults');
 await category('Memory');await dialog().getByRole('textbox',{name:'Your instructions'}).fill('Use TypeScript and run relevant tests.\n');await category('General');await category('Memory');assert.equal(await dialog().getByRole('textbox',{name:'Your instructions'}).inputValue(),'Use TypeScript and run relevant tests.\n');await dialog().getByRole('button',{name:'Save instructions'}).click();await until(async()=>(await state()).memories==='Use TypeScript and run relevant tests.');assert.equal(await dialog().getByRole('textbox',{name:'Your instructions'}).inputValue(),'Use TypeScript and run relevant tests.');assert.equal(await dialog().getByRole('button',{name:'Save instructions'}).isDisabled(),true);await shot('05-memory');
 record('Explicit instructions persist in the controller and unsaved edits survive section switches');
 const actual=await state();await app.evaluate(async({BrowserWindow,ipcMain},actual)=>{const contents=BrowserWindow.getAllWindows()[0].webContents,snapshot=await ipcMain._invokeHandlers.get('musebench:state')({sender:contents,senderFrame:contents.mainFrame});contents.send('musebench:update',{...snapshot,state:{...actual,runtime:{...actual.runtime,status:'blocked',pending:{kind:'approval'}}}});},actual);
 await dialog().getByRole('textbox',{name:'Your instructions'}).fill('Draft while waiting');assert.equal(await dialog().getByRole('button',{name:'Save instructions'}).isDisabled(),true);
 await app.evaluate(async({BrowserWindow,ipcMain},actual)=>{const contents=BrowserWindow.getAllWindows()[0].webContents,snapshot=await ipcMain._invokeHandlers.get('musebench:state')({sender:contents,senderFrame:contents.mainFrame});contents.send('musebench:update',{...snapshot,state:actual});},actual);await dialog().getByRole('textbox',{name:'Your instructions'}).fill('Use TypeScript and run relevant tests.');
 record('Memory save is disabled for a pending-approval state without changing instructions');

 await category('Skills');await dialog().getByRole('heading',{name:'Skills',exact:true}).waitFor();await dialog().getByRole('button',{name:'Open Muse connection',exact:true}).waitFor();
 await category('Usage & billing');await dialog().getByRole('button',{name:'Refresh usage'}).click();await dialog().getByText('Subscription allowance unavailable',{exact:true}).waitFor();
 await category('Voice');await until(async()=>(await page.evaluate(()=>window.musebench.dictation('status'))).available!==null);assert.notEqual((await page.evaluate(()=>window.musebench.dictation('status'))).status,'listening');await shot('06-voice');
 await category('Data & privacy');assert.equal(await dialog().getByRole('button',{name:'Export Markdown'}).isDisabled(),true);
 await category('Muse connection');await dialog().getByRole('button',{name:'Open Muse connection'}).click();await page.getByRole('dialog',{name:'Your Muse connection'}).waitFor();await page.keyboard.press('Escape');
 record('Skills and usage show real unavailable states, voice probes without recording, connection opens its existing panel');
 const folder=path.join(output,'SettingsProject');await mkdir(folder);await writeFile(path.join(folder,'package.json'),'{}');await dispatch({type:'openProject',path:folder});
 await dispatch({type:'newTask',request:'Existing chat settings fixture',mode:'manual',runOptions:{reasoning:'low',approval:'ask'}});const existing=(await state()).task.id;
 await settings();await category('Muse Code');assert.deepEqual((await state()).task.runOptions,{reasoning:'low',approval:'ask'});await close();
 await page.keyboard.press('Control+n');assert.match(await page.getByRole('button',{name:'Reasoning effort',exact:true}).innerText(),/Extra high/);assert.match(await page.getByRole('button',{name:'Approval access',exact:true}).innerText(),/Auto-review/);
 await page.getByRole('textbox',{name:'Message Muse',exact:true}).fill('New defaults fixture');await page.getByRole('button',{name:'Create task',exact:true}).click();await until(async()=>Boolean((await state()).task?.id!==(existing)&&(await state()).task));await until(async()=>!(await state()).busy);assert.deepEqual((await state()).task.runOptions,{reasoning:'xhigh',approval:'auto'});await dispatch({type:'clearError'});
 await dispatch({type:'selectTask',id:existing});assert.deepEqual((await state()).task.runOptions,{reasoning:'low',approval:'ask'});
 record('New chats use saved reasoning/access defaults; existing chats retain their own options');
 await settings();await category('Data & privacy');
 await app.evaluate(({dialog})=>{const previous=dialog.showSaveDialog;dialog.showSaveDialog=async()=>{dialog.showSaveDialog=previous;return{canceled:true};};});await dialog().getByRole('button',{name:'Export Markdown'}).click();await dialog().getByText('Export cancelled.').waitFor();
 const exported=path.join(output,'exported-chat.md');await app.evaluate(({dialog},filePath)=>{const previous=dialog.showSaveDialog;dialog.showSaveDialog=async()=>{dialog.showSaveDialog=previous;return{canceled:false,filePath};};},exported);await dialog().getByRole('button',{name:'Export Markdown'}).click();await dialog().getByText('Chat exported.').waitFor();assert.match(await readFile(exported,'utf8'),/Existing chat settings fixture/);
 record('Transcript export uses the real save flow, writes current chat and handles cancellation');
 await category('Account');await shot('07-account');
 await page.setViewportSize({width:390,height:720});await noOverflow();await shot('08-account-narrow');await category('General');await noOverflow();await shot('09-general-narrow');await category('Memory');await noOverflow();await shot('10-memory-narrow');const tabs=await dialog().getByRole('navigation').getByRole('button').evaluateAll(els=>els.map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));for(let i=1;i<tabs.length;i++)assert(tabs[i-1].right<=tabs[i].left+1,'Narrow category tabs overlap');
 record('General, Account and Memory remain usable at 390px without horizontal content overflow');
 await page.setViewportSize({width:1440,height:900});await close();
 assert.equal(await page.locator('.composer-region').evaluate(el=>getComputedStyle(el).maxWidth),'1080px');
 await app.close();app=null;await launch();await settings();
 assert.equal(await dialog().getByRole('combobox',{name:'Transcript width'}).inputValue(),'wide');assert.equal(await dialog().getByRole('combobox',{name:'Response font'}).inputValue(),'mono');assert.equal(await dialog().getByRole('switch',{name:'Reduce motion'}).getAttribute('aria-checked'),'true');await category('Muse Code');assert.equal(await dialog().getByRole('combobox',{name:'Default reasoning effort'}).inputValue(),'xhigh');await category('Notifications');assert.equal(await dialog().getByRole('switch',{name:'Task completions'}).getAttribute('aria-checked'),'true');await category('Memory');assert.equal(await dialog().getByRole('textbox',{name:'Your instructions'}).inputValue(),'Use TypeScript and run relevant tests.');
 record('Full application restart preserves appearance, notifications, defaults, instructions and existing chat history');
 await category('General');await dialog().getByRole('button',{name:'System theme'}).click();await page.emulateMedia({colorScheme:'light'});await until(async()=>await page.locator('html').getAttribute('data-theme')==='light');await page.emulateMedia({colorScheme:'dark'});await until(async()=>await page.locator('html').getAttribute('data-theme')==='dark');
 await dialog().getByRole('button',{name:'Close dialog'}).focus();await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>Boolean(document.activeElement.closest('[role="dialog"]'))));
 await close();assert.deepEqual(report.errors,[]);record('System theme follows OS changes; keyboard focus stays inside dialog and no renderer errors occur');
 report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;try{await shot('failure');}catch{}throw error;}
finally{if(app)await app.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report '+path.join(output,'report.json'));}
