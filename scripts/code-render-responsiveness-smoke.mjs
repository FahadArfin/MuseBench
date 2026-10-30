// Real shared Code renderer with an isolated in-memory bridge; no native/model calls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

function installFixture(){
 let bridge,state;
 const listeners=new Set(),copies=[],actions=[];
 const publish=()=>{for(const listener of listeners)listener(structuredClone(state));return structuredClone(state);};
 Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{copies.push(text);}});
 Object.defineProperty(window,'musebench',{configurable:true,get:()=>bridge,set:value=>{
  bridge={...value,getState:async()=>state?structuredClone(state):value.getState(),onState:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},copyText:async text=>{copies.push(text);},saveCodeDraft:async()=>{},dispatch:async action=>{
   if(!state)return value.dispatch(action);
   actions.push({chatId:state.task.id,...structuredClone(action)});
   if(action.type==='selectTask')state.task=state.tasks.find(task=>task.id===action.id);
   if(action.type==='forkTask'){
    const task=structuredClone(state.task),index=task.messages.findIndex(message=>message.id===action.messageId);
    task.id='render-fork';task.title='Render branch';task.messages=task.messages.slice(0,index+1);task.runs=[];state.tasks.push(task);state.task=task;
   }
   return publish();
  }};
  window.__codeRenderFixture={copies,actions,
   async seed(turns=30){
    state=await value.getState();const template=state.task;
    state.tasks=['a','b'].map(label=>{
     const task=structuredClone(template);task.id=`render-${label}`;task.title=`Render chat ${label.toUpperCase()}`;task.goal=undefined;task.changes=[];task.shellResults=[];task.executionReceipts=[];task.promptQueue=[];
     // Identical message/run IDs across chats exercise chat-scoped local UI state.
     task.messages=Array.from({length:turns*2},(_,index)=>({id:`render-message-${index}`,role:index%2?'assistant':'user',at:'2026-10-28T12:00:00.000Z',text:index%2?`### Answer ${label} ${index}\n\nHistorical response.\n\n\`\`\`js\nconst history = ${index};\n\`\`\``:`Request ${label} ${index}`}));
     task.request=task.messages[0].text;
     task.runs=[{id:'render-run',promptId:task.messages[0].id,prompt:task.request,runId:'native-render-run',ownedRunIds:[],status:'completed',startedAt:'2026-10-28T12:00:00.000Z',endedAt:'2026-10-28T12:00:01.000Z',activities:[{id:'render-tool',kind:'tool',tool:'read_file',title:'Read fixture source',status:'completed',detail:'Source read',output:`Private fixture output ${label}`}],truncated:false}];
     return task;
    });
    state.task=state.tasks[0];state.runtime={...state.runtime,status:'ready',foregroundActive:false,pending:undefined};return publish();
   },
   stream(){state.task.messages.at(-1).text='### Streamed answer\n\nUpdated tail text.\n\n```js\nconst streamed = true;\n```';return publish();},
   select(id){state.task=state.tasks.find(task=>task.id===id);return publish();},
   touch(){return publish();}
  };
 }});
}

const out=path.resolve(process.argv[2]??'artifacts/code-render-responsiveness'),checks={},errors=[],timings={};
await mkdir(out,{recursive:true});
const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-renderer-performance',server:{host:'127.0.0.1',port:0,strictPort:true,open:false}});
let browser;
try{
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(10000);
 page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/__musebench_snapshots/manifest.json')return route.fulfill({json:{version:1,pages:{}}});
  return url.origin===origin?route.continue():route.abort();
 });
 await page.addInitScript(installFixture);await page.goto(origin+'/preview.html',{waitUntil:'networkidle',timeout:60000});
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 await page.evaluate(()=>window.__codeRenderFixture.seed());
 await page.waitForFunction(()=>document.querySelectorAll('.assistant-message').length===30);
 const history=page.locator('.assistant-message').first(),activity=page.locator('.run-activity').first();
 checks.collapsedDetailsAbsent=await activity.locator('.work-activity-item').count()===0;
 await activity.getByRole('button',{name:/Worked for/}).click();
 await activity.locator('.work-activity-item summary').click();
 await activity.getByText('Private fixture output a',{exact:true}).waitFor();checks.expandedOutputAccessible=true;
 await activity.getByRole('button',{name:/Worked for/}).click();
 checks.closingDetailsInert=await activity.locator('.motion-disclosure').evaluate(element=>element.inert);
 // Keep output only for the short exit transition; it must still be released.
 await activity.locator('.work-activity-item').waitFor({state:'detached',timeout:1000});
 checks.closedDetailsReleased=await activity.locator('.work-activity-item').count()===0;

 await history.getByRole('button',{name:'Copy code',exact:true}).click();
 checks.codeCopyCorrect=await page.evaluate(()=>window.__codeRenderFixture.copies.at(-1)==='const history = 1;\n');
 await page.evaluate(()=>{window.__oldCode=document.querySelector('.assistant-message .markdown-code');});
 timings.draftMs=await page.evaluate(async()=>{
  const input=document.querySelector('textarea[aria-label="Message Muse"]'),start=performance.now();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Preserve draft while streaming');input.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return performance.now()-start;
 });
 checks.historyNodeAfterDraft=await page.evaluate(()=>window.__oldCode===document.querySelector('.assistant-message .markdown-code'));
 checks.codeCopyStateAfterDraft=await history.getByRole('button',{name:'Copied',exact:true}).count()===1;
 await page.evaluate(()=>window.__codeRenderFixture.stream());
 await page.getByText('Updated tail text.',{exact:true}).waitFor();
 checks.historyNodeAfterStream=await page.evaluate(()=>window.__oldCode===document.querySelector('.assistant-message .markdown-code'));
 checks.streamedMarkdownCorrect=(await page.locator('.assistant-message').last().locator('pre').innerText()).trim()==='const streamed = true;';
 const tail=page.locator('.assistant-message').last();await tail.getByRole('button',{name:'Copy message',exact:true}).click();
 checks.streamedResponseCopyCorrect=await page.evaluate(()=>window.__codeRenderFixture.copies.at(-1).includes('const streamed = true;'));
 checks.draftRetained=await page.getByRole('textbox',{name:'Message Muse',exact:true}).inputValue()==='Preserve draft while streaming';
 await history.getByRole('button',{name:'Response feedback',exact:true}).click();await history.getByRole('menuitemradio',{name:'Helpful',exact:true}).click();
 await page.evaluate(()=>window.__codeRenderFixture.touch());
 checks.feedbackSurvivesSnapshot=await history.getByRole('button',{name:'Response feedback',exact:true}).getAttribute('title')==='Helpful · Saved on this device';
 await history.getByRole('button',{name:'Fork from here',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.assistant-message').length===1);
 checks.branchUsesCurrentMessage=await page.evaluate(()=>window.__codeRenderFixture.actions.some(action=>action.type==='forkTask'&&action.taskId==='render-a'&&action.messageId==='render-message-1'));

 await page.evaluate(()=>window.__codeRenderFixture.select('render-a'));
 await page.waitForFunction(()=>document.querySelectorAll('.assistant-message').length===30);
 await activity.getByRole('button',{name:/Worked for/}).click();
 await page.evaluate(()=>window.__codeRenderFixture.select('render-b'));
 await page.getByRole('heading',{name:'Answer b 1',exact:true}).waitFor();
 checks.otherChatFeedbackIsolated=await history.getByRole('button',{name:'Response feedback',exact:true}).getAttribute('title')==='Response feedback';
 checks.otherChatDetailsCollapsed=await activity.getByRole('button',{name:/Worked for/}).getAttribute('aria-expanded')==='false';
 await history.getByRole('button',{name:'Copy message',exact:true}).click();
 checks.otherChatResponseCopyCorrect=await page.evaluate(()=>window.__codeRenderFixture.copies.at(-1).startsWith('### Answer b 1'));
 await history.getByRole('button',{name:'Fork from here',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.assistant-message').length===1);
 checks.otherChatBranchCorrect=await page.evaluate(()=>window.__codeRenderFixture.actions.some(action=>action.type==='forkTask'&&action.taskId==='render-b'&&action.messageId==='render-message-1'));
 await page.screenshot({path:path.join(out,'verified.png')});
 console.log(JSON.stringify({checks,timings,errors},null,2));
 assert.deepEqual(errors,[]);
 assert.deepEqual(Object.entries(checks).filter(([,passed])=>!passed),[],'Code rendering behavior regressed');
}finally{
 await writeFile(path.join(out,'report.json'),JSON.stringify({checks,timings,errors},null,2));
 await browser?.close();await server.close();
}
