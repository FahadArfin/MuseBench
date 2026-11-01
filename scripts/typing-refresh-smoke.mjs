import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';

await mkdir('artifacts/typing-refresh',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/typing-refresh/source-')),profile=path.join(output,'data'),project=path.join(output,'project');
await mkdir(project);await writeFile(path.join(project,'package.json'),'{"name":"typing-refresh-fixture","scripts":{}}');
const controller=await createController({dataDir:profile,runtimeFactory:()=>({snapshot:()=>({status:'unavailable',binary:null}),subscribe:()=>()=>{},disconnect:async()=>{}})});
await controller.dispatch({type:'openProject',path:project});await controller.dispatch({type:'newTask',request:'Offline typing fixture',mode:'manual'});await controller.close();
const app=await electron.launch({args:['.','--host-resolver-rules=MAP * ~NOTFOUND'],env:isolatedDesktopEnvironment(profile)});
const report={checks:[],errors:[]};
try{
 await app.firstWindow();let page;
 const deadline=Date.now()+15000;while(!page&&Date.now()<deadline){page=app.windows().find(value=>value.url().includes('/dist/index.html'));if(!page)await new Promise(resolve=>setTimeout(resolve,100));}
 assert(page,'main workspace window must open');page.on('pageerror',error=>report.errors.push(error.message));
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 await page.bringToFront();
 const input=page.getByRole('textbox',{name:'Message Muse',exact:true});await input.waitFor();
 // Slow only this fictional project's package read so the polling refresh
 // overlaps several keystrokes. No user files or provider APIs are involved.
 await app.evaluate((_electron,target)=>{
  const fs=process.getBuiltinModule('node:fs').promises,original=fs.open;
  globalThis.__typingRefreshReads=0;
  fs.open=async function(file,...args){if(String(file)===target){globalThis.__typingRefreshReads++;await new Promise(resolve=>setTimeout(resolve,350));}return original.call(this,file,...args);};
 },path.join(project,'package.json'));
 await input.fill('');await input.focus();
 const origin=await page.evaluate(()=>{
  const element=document.querySelector('textarea[aria-label="Message Muse"]');
  window.__typingRefresh={element,disabled:0,blurred:0,busy:0,updates:0};
  new MutationObserver(()=>{if(element.disabled)window.__typingRefresh.disabled++;}).observe(element,{attributes:true,attributeFilter:['disabled']});
  element.addEventListener('blur',()=>window.__typingRefresh.blurred++);
  window.musebench.onState(state=>{window.__typingRefresh.updates++;if(state.busy)window.__typingRefresh.busy++;});
  return performance.timeOrigin;
 });
 const text='Keep every character while the workspace checks local files in the background. '.repeat(4);
 await page.keyboard.type(text,{delay:32});
 report.poll=await page.evaluate(async()=>({updates:window.__typingRefresh.updates,hidden:document.hidden,taskId:(await window.musebench.getState()).task?.id}));
 report.slowReads=await app.evaluate(()=>globalThis.__typingRefreshReads);
 console.log(JSON.stringify({poll:report.poll,slowReads:report.slowReads}));
 assert(report.poll.updates>=1,'the real background poll must run during typing');
 assert(report.slowReads>=1,'the fixture must hold a real background file read across several keystrokes');
 assert.equal(await input.inputValue(),text);
 const observed=await page.evaluate(()=>({sameInput:window.__typingRefresh.element===document.querySelector('textarea[aria-label="Message Muse"]'),focused:document.activeElement===window.__typingRefresh.element,disabled:window.__typingRefresh.disabled,blurred:window.__typingRefresh.blurred,busy:window.__typingRefresh.busy,origin:performance.timeOrigin}));
 assert.deepEqual(observed,{sameInput:true,focused:true,disabled:0,blurred:0,busy:0,origin});
 assert.deepEqual(report.errors,[]);
 report.checks.push('Typing across the real five-second poll retains every character, focus, caret owner and textarea DOM node without a reload or global busy state');
 await page.screenshot({path:path.join(output,'typing.png')});report.status='passed';console.log('PASS '+report.checks[0]);
}catch(error){report.status='failed';report.error=String(error.stack??error);throw error;}
finally{await app.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);}
