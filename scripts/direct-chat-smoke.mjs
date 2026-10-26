import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';

const live=process.argv.includes('--live'),root=process.cwd();
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/direct-chat',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/direct-chat',`${variant}-${live?'live':'offline'}-`));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
if(!live)for(const key of Object.keys(env)){
  if(key.toUpperCase()==='PATH')env[key]=env[key].split(';').filter(folder=>!/muse/i.test(folder)).join(';');
  if(key.toUpperCase()==='LOCALAPPDATA')env[key]=env.MUSEBENCH_DATA_DIR;
}
const report={variant,live,modelRequests:0,checks:[],errors:[]};let app,page;
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
const state=()=>page.evaluate(()=>window.musebench.getState());
const input=()=>page.getByRole('textbox',{name:'Message Muse',exact:true});
async function until(predicate){const end=Date.now()+150000;while(Date.now()<end){const s=await state();if(predicate(s))return s;await new Promise(r=>setTimeout(r,100));}throw Error('Chat did not reach the expected state');}
async function send(text,button='Send message'){
  await input().fill(text);await page.getByRole('button',{name:button,exact:true}).click();
  const value=await until(s=>!s.busy&&(live?s.task?.runtimeComplete&&s.runtime.status==='completed':Boolean(s.error)));
  assert.equal(value.task.mode,'muse');assert.equal(value.task.planApproved,false);
  assert.equal(await page.getByRole('button',{name:'Toggle review panel',exact:true}).count(),0);
  if(live){
    assert.equal(value.error,null);assert.equal(value.runtime.permissionVerified,true);assert.equal(value.runtime.liveVerified,true);
    assert.equal(value.runtime.permissionProfile,':ask-me');assert.equal(value.runtime.cleanup,'confirmed');
    assert.equal(value.task.changes.length,0);assert.equal(await input().inputValue(),'');report.modelRequests++;
  }else{
    assert.equal(value.runtime.binary,null);assert.match(value.error,/native Muse|absolute path/i);
    assert.equal(await input().inputValue(),text);assert.equal(value.task.messages.filter(m=>m.role==='user').length,0);
    assert(!(await page.getByRole('button',{name:'Send message',exact:true}).isDisabled()));
  }
  return value;
}
try{
  app=await electron.launch({cwd:root,args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
  page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.getByRole('button',{name:'Try sample project',exact:true}).waitFor();await page.setViewportSize({width:1440,height:900});
  if(!live)assert.equal((await state()).runtime.binary,null);
  await page.getByRole('button',{name:'Try sample project',exact:true}).click();
  await until(s=>Boolean(s.task)&&!s.busy);const tutorial=(await state()).task;
  await page.getByRole('button',{name:'Reasoning effort',exact:true}).click();
  await page.getByRole('combobox',{name:'Select reasoning effort'}).selectOption('low');
  const first=await send(live?'Reply with exactly MUSEBENCH_DIRECT_CHAT_OK. Do not read or change files or run commands.':'talk to me');
  assert.notEqual(first.task.id,tutorial.id);assert.equal(first.task.projectId,tutorial.projectId);
  assert.equal(first.tasks.find(t=>t.id===tutorial.id).mode,'demo');
  assert.equal(first.task.runOptions.reasoning,'low');
  assert.equal(await page.getByRole('button',{name:'Open plan',exact:true}).count(),0);
  record(live?'One Send starts a real Muse chat from the sample, verifies its sandbox and receives a response without plan approval':'Typing in the sample creates a real Muse chat; missing CLI leaves the draft retryable without plan approval');
  if(live)assert(first.task.messages.some(m=>m.role==='assistant'&&m.text.includes('MUSEBENCH_DIRECT_CHAT_OK')));
  await page.screenshot({path:path.join(output,'01-direct-chat.png')});
  const second=await send(live?'Reply with exactly MUSEBENCH_FOLLOWUP_OK. Do not read or change files or run commands.':'talk to me');
  assert.equal(second.task.id,first.task.id);
  if(live)assert(second.task.messages.some(m=>m.role==='assistant'&&m.text.includes('MUSEBENCH_FOLLOWUP_OK')));
  record(live?'A follow-up receives a real response in the same chat without approving a plan':'Retrying an unavailable runtime preserves the same chat and does not duplicate the unsent message');
  if(!live){
    await page.getByRole('button',{name:'New chat',exact:true}).click();
    const fresh=await send('Explain this project','Create task');assert.notEqual(fresh.task.id,first.task.id);
    record('New chat submits its first prompt immediately and retains it when connection fails');
  }
  await page.getByRole('button',{name:'Add to chat',exact:true}).click();
  await page.getByRole('combobox',{name:'Conversation mode'}).selectOption('plan');await page.keyboard.press('Escape');
  await input().fill('An optional planning draft');
  assert(!(await page.getByRole('button',{name:'Send message',exact:true}).isDisabled()));
  assert.equal((await state()).task.planApproved,false);
  record('Plan mode is optional and its composer has no local approval prerequisite');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,'02-mobile.png')});
  const isolated=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>{const p=window.webContents.getLastWebPreferences();return p.sandbox&&p.contextIsolation&&!p.nodeIntegration&&p.webSecurity;}));
  assert(isolated);assert.equal(report.errors.length,0);record('The narrow composer fits; Electron isolation and sandbox stay enabled');
  report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{
  if(page&&!page.isClosed())await page.evaluate(()=>window.musebench.dispatch({type:'disconnectMuse'})).catch(()=>{});
  if(app)await app.close();report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));
}
