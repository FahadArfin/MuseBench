// Counts real App/article executions through a fixture-only source transform.
// This is source-renderer work evidence, independent of packaged IPC acceptance.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const prompt='Inspect this fixture carefully.';
function installFixture(){
 let bridge,state;const listeners=new Set(),actions=[],saves=[],rows=[];let appRenders=0;
 window.__transcriptWork={record:id=>rows.push(id),app:()=>appRenders++,reset(){rows.length=0;appRenders=0;},read:()=>({appRenders,rowRenders:rows.length,rows:[...rows]})};
 const publish=()=>{for(const listener of listeners)listener(structuredClone(state));return structuredClone(state);};
 Object.defineProperty(window,'musebench',{configurable:true,get:()=>bridge,set:value=>{
  bridge={...value,getState:async()=>state?structuredClone(state):value.getState(),onState:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},saveCodeDraft:async draft=>{saves.push(structuredClone(draft));},dispatch:async action=>{
   if(!state)return value.dispatch(action);actions.push(structuredClone(action));
   if(action.type==='selectTask')state.task=state.tasks.find(task=>task.id===action.id);
   return publish();
  }};
  window.transcriptFixture={actions,saves,async seed(){
   state=await value.getState();state.tasks=['a','b'].map(label=>{
    const task={...structuredClone(state.task),id:'transcript-'+label,title:'Transcript '+label,mode:'manual',request:'Fixture transcript',requestOrigin:'history',goal:undefined,changes:[],shellResults:[],executionReceipts:[],promptQueue:[]};
    task.messages=Array.from({length:150},(_,i)=>({id:'message-'+i,role:i%2?'assistant':'user',at:'2026-10-30T12:00:00.000Z',text:i%2?`### Answer ${label} ${i}\n\nHistorical response ${i}.\n\n\`\`\`js\nconst history = ${i};\n\`\`\``:`Request ${label} ${i}`}));
    task.runs=[{id:'fixture-run',promptId:'message-0',prompt:task.messages[0].text,runId:'fixture-native',ownedRunIds:[],status:'completed',startedAt:'2026-10-30T12:00:00Z',endedAt:'2026-10-30T12:00:01Z',activities:[{id:'tool',kind:'tool',tool:'read_file',title:'Read fixture',status:'completed',output:'Fixture output'}],truncated:false}];return task;
   });state.task=state.tasks[0];state.runtime={...state.runtime,status:'ready',foregroundActive:false,pending:undefined};return publish();
  },stream(){state.task.messages.at(-1).text+='\n\nUpdated streamed tail.';state.task.runs[0].activities[0].output='Updated fixture output';return publish();}};
 }});
}
const baseline=process.argv.includes('--baseline');
const refIndex=process.argv.indexOf('--source-ref'),sourceRef=refIndex<0?null:process.argv[refIndex+1];
if(refIndex>=0&&!/^\w[\w./-]*$/.test(sourceRef??''))throw Error('--source-ref requires an explicit Git revision');
await mkdir('artifacts/transcript-render',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/transcript-render',baseline?'baseline-':'final-'));
const source=sourceRef?execFileSync('git',['show',`${sourceRef}:src/ui/App.tsx`],{encoding:'utf8'}):await readFile('src/ui/App.tsx','utf8');
const report={variant:'instrumented-source-preview',phase:baseline?'baseline':'final',sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),appSourceRef:sourceRef,appSha256:createHash('sha256').update(source).digest('hex'),fixture:{messageCount:150,prompt,viewport:{width:1440,height:960},input:'one character per committed input; two animation frames between inputs'},checks:[],errors:[],metrics:{}};
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
let server,browser,page;
try{
 const marker=">{item.role === 'user' ?";
 assert.equal(source.split(marker).length-1,1,'Count exactly the production message article body');
 const isApp=id=>id.replaceAll('\\','/').endsWith('/src/ui/App.tsx');
 server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-transcript-render',plugins:[{name:'fixture-transcript-work',enforce:'pre',load(id){if(isApp(id))return source;},transform(code,id){if(!isApp(id))return;return code.replace('export default function App() {','export default function App() { (globalThis as any).__transcriptWork?.app();').replace(marker,">{((globalThis as any).__transcriptWork?.record(item.id),null)}{item.role === 'user' ?");}}],server:{host:'127.0.0.1',port:0,strictPort:true,open:false}});
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:report.fixture.viewport});page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await page.addInitScript(installFixture);await page.goto(origin+'/preview.html');await page.getByRole('button',{name:'Muse Code',exact:true}).click();await page.evaluate(()=>window.transcriptFixture.seed());await page.waitForFunction(()=>document.querySelectorAll('[data-transcript-anchor^="message-"]').length===150);assert.equal(await page.locator('.conversation-transcript article.message').count(),150);await page.waitForTimeout(300);
 const input=page.getByRole('textbox',{name:'Message Muse',exact:true});
 // One production input per character, with a committed render before proceeding.
 report.metrics.typing=await page.evaluate(async text=>{
  const field=document.querySelector('textarea[aria-label="Message Muse"]'),samples=[];window.__transcriptWork.reset();
  for(let i=1;i<=text.length;i++){const start=performance.now();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,text.slice(0,i));field.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));samples.push(performance.now()-start);}
  return {...window.__transcriptWork.read(),inputToTwoFramesMs:samples};
 },prompt);
 assert.equal(await input.inputValue(),prompt);assert.ok(report.metrics.typing.appRenders>=prompt.length);assert.equal(await page.evaluate(()=>window.transcriptFixture.saves.at(-1).text),prompt);pass('All fixed typing inputs commit and persist the complete unsent draft');
 if(!baseline)assert.equal(report.metrics.typing.rowRenders,0,'Unchanged transcript articles must avoid composer-only work');
 await page.evaluate(()=>{window.__transcriptWork.reset();window.transcriptFixture.stream();});await page.getByText('Updated streamed tail.',{exact:true}).waitFor();report.metrics.stream=await page.evaluate(()=>window.__transcriptWork.read());assert.ok(report.metrics.stream.rows.includes('message-149'));assert.equal(await input.inputValue(),prompt);pass('Changed tail renders and current draft survives a cloned streaming snapshot');
 const activity=page.locator('.run-activity').first();await activity.getByRole('button',{name:/Worked for/}).click();await activity.locator('.work-activity-item summary').click();await activity.getByText('Updated fixture output',{exact:true}).waitFor();pass('Tool activity receives the current snapshot outside the message boundary');
 const first=page.locator('[data-transcript-anchor="message-1"]');await input.fill('Fresh edited draft');await first.getByRole('button',{name:'Quote response',exact:true}).click();assert.match(await input.inputValue(),/^Fresh edited draft\n\n/);assert.match(await input.inputValue(),/> Answer a 1/);pass('Quote after editing appends through the current draft handler');
 await input.fill('');await first.getByRole('button',{name:'Quote response',exact:true}).click();assert.doesNotMatch(await input.inputValue(),/Fresh edited draft/);pass('Quote after clearing cannot recover a stale draft closure');
 await page.evaluate(()=>window.musebench.dispatch({type:'selectTask',id:'transcript-b'}));await page.getByRole('heading',{name:'Answer b 1',exact:true}).waitFor();await input.fill('Owner B');await first.getByRole('button',{name:'Quote response',exact:true}).click();assert.match(await input.inputValue(),/^Owner B\n\n/);assert.match(await input.inputValue(),/> Answer b 1/);pass('Same message IDs in another chat use the new owner and current quote callback');
 report.metrics.boundary={actions:await page.evaluate(()=>window.transcriptFixture.actions),draftSaves:await page.evaluate(()=>window.transcriptFixture.saves.length)};report.metrics.boundary.providerAdmissionActions=report.metrics.boundary.actions.filter(a=>['sendMessage','queueMessage','sendQueued','resumeQueue','connectMuse','steerMessage','compactSession','answerInput','childControl'].includes(a.type)).length;assert.equal(report.metrics.boundary.providerAdmissionActions,0);assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await browser?.close();await server?.close();}
