// Shared production question component, isolated profiles and injected actions.
// No Muse process, provider connection or model request is created.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,_electron as electron} from 'playwright';

const desktop=process.argv.includes('--desktop'),variant=desktop?'desktop':'preview';
await mkdir('artifacts/native-question-ui',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/native-question-ui',variant+'-'));
const report={variant,checks:[],errors:[],providerCalls:0};
let server,app,browser,page;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const questionText='Choose **the accent** for `Button`.\n\n- Keep accessible contrast\n- See [Meta documentation](https://dev.meta.ai/docs/muse-code).\n\n![Remote image](https://example.invalid/tracker.png)\n<script>window.__unsafe=true</script>\n[Unsafe](javascript:alert(1))';
const fixtureSource=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{NativeQuestion}from'./src/ui/NativeQuestion.tsx';
const original={kind:'input',sessionId:'question-session',turnId:'question-turn',userInputId:'question-input',revision:7,
questions:[{id:'color',header:'Color',question:${JSON.stringify(questionText)},selection:{mode:'single'},options:[{label:'**Blue**',description:'Use the [official guide](https://dev.meta.ai/docs/muse-code).'}, {label:'Green',description:'A calmer accent.'}]},
{id:'checks',header:'Checks',question:'Choose checks for the change.',selection:{mode:'multiple',minSelections:1,maxSelections:2},options:[{label:'Build'},{label:'Tests'},{label:'Review'}]}]};
window.questionFixture={actions:[],links:[],mode:'hold',resolve:null};window.musebench={openExternal:async url=>{window.questionFixture.links.push(url)}};
function Fixture(){const [revision,setRevision]=useState(7);window.questionFixture.reset=()=>{setRevision(v=>v+1);window.questionFixture.actions=[];window.questionFixture.mode='hold'};return <NativeQuestion runtime={{pending:{...original,revision},status:'running'}} taskId='question-task' busy={false} act={async action=>{window.questionFixture.actions.push(action);if(action.operation==='engage')return {};if(window.questionFixture.mode==='reject')return {error:'Answer rejected; try a different answer.'};if(window.questionFixture.mode==='throw')throw Error('Connection dropped');return new Promise(resolve=>{window.questionFixture.resolve=resolve});}}/>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
try{
 const bundled=await build({stdin:{contents:fixtureSource,sourcefile:'native-question-fixture.tsx',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundled.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>:root{--surface:#212121;--border:#414141;--muted:#aaa;--text:#eee;--accent:#438cff}body{margin:0;padding:24px;background:#181818;color:#eee;font:14px system-ui}main{max-width:720px;margin:auto}button{font:inherit;color:inherit;background:#303030;border:1px solid #555;border-radius:8px;padding:9px 14px}.modal-actions{display:flex;gap:10px}a{color:#438cff}${css}</style></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>`;
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 if(desktop){const env={...process.env,MUSEBENCH_PARITY_DATA:path.join(output,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['scripts/preview-parity-electron.mjs',...(process.platform==='linux'&&process.env.CI?['--no-sandbox']:[])],env});const created=app.waitForEvent('window');
  await app.evaluate(({BrowserWindow},url)=>{const window=new BrowserWindow({width:900,height:1100,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});void window.loadURL(url);},url);page=await created;
 }else{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:900,height:1100}});}
 page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(6000);
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(url);
 await page.getByRole('heading',{name:'Muse has a question'}).waitFor();
 assert.equal(await page.locator('.native-question strong').first().innerText(),'the accent');
 assert.equal(await page.locator('.native-question code').first().innerText(),'Button');
 assert.equal(await page.locator('.native-question li').count(),2);assert.equal(await page.locator('.native-question img,.native-question script').count(),0);
 assert.equal(await page.evaluate(()=>window.__unsafe),undefined);assert.equal(await page.locator('a[href^="javascript:"]').count(),0);pass('Markdown is readable and untrusted HTML/images/script URLs never execute');
 await page.getByRole('link',{name:'official guide',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.questionFixture.links),['https://dev.meta.ai/docs/muse-code']);assert.equal(await page.locator('input:checked').count(),0);pass('Links open their full allowed destination without choosing an answer');
 const custom=page.getByRole('button',{name:'Write my own answer: Color'});await custom.click();const input=page.getByRole('textbox',{name:'Write an answer: Color'});await input.fill('Custom shade');
 await page.getByRole('checkbox',{name:'Build',exact:true}).check();await input.focus();await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'Custom shade\n');assert.equal(await page.evaluate(()=>window.questionFixture.actions.filter(a=>a.operation==='answer').length),0);pass('Plain Enter edits a custom answer without sending');
 await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,bubbles:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});assert.equal(await page.evaluate(()=>window.questionFixture.actions.filter(a=>a.operation==='answer').length),0);pass('IME composition cannot submit an unfinished answer');
 await page.evaluate(()=>{const card=document.querySelector('.native-question');for(let i=0;i<2;i++)card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));document.querySelector('.modal-actions button:last-child').click();document.querySelector('.modal-actions button:first-child').click();});
 await page.waitForFunction(()=>window.questionFixture.actions.some(a=>a.operation==='answer'));
 const sent=await page.evaluate(()=>window.questionFixture.actions.filter(a=>a.operation==='answer'));assert.equal(sent.length,1);assert.equal(sent[0].revision,7);assert.equal(sent[0].sessionId,'question-session');assert.equal(sent[0].turnId,'question-turn');assert.equal(sent[0].userInputId,'question-input');assert.deepEqual(sent[0].answers,[{questionId:'color',freeText:'Custom shade\n'},{questionId:'checks',selectedLabels:['Build']}]);assert.equal(await page.getByRole('button',{name:'Send answers'}).isDisabled(),true);pass('Keyboard sends the exact bound answer once and immediately locks repeated submission');
 await page.evaluate(()=>{window.questionFixture.resolve({});window.questionFixture.reset();});await custom.waitFor();await page.getByRole('radio',{name:/Blue/}).check();await page.getByRole('checkbox',{name:'Tests',exact:true}).check();await page.evaluate(()=>window.questionFixture.mode='reject');await page.getByRole('button',{name:'Send answers'}).click();await page.getByRole('alert').filter({hasText:'Answer rejected'}).waitFor();assert.equal(await page.getByRole('button',{name:'Send answers'}).isDisabled(),false);assert.equal((await page.evaluate(()=>window.questionFixture.actions.filter(a=>a.operation==='answer')))[0].answers[0].selectedLabel,'**Blue**');pass('A revision resets the form; original Markdown labels are submitted unchanged and explicit rejection unlocks');
 await custom.click();await input.fill('');await page.getByRole('button',{name:'Send answers'}).click();assert.equal(await page.evaluate(()=>window.questionFixture.actions.filter(a=>a.operation==='answer').length),1);pass('Blank custom answers are validated before dispatch');
 await input.fill('Fresh answer');await page.evaluate(()=>window.questionFixture.mode='throw');await page.getByRole('button',{name:'Send answers'}).click();await page.getByRole('alert').filter({hasText:/confirm/}).waitFor();assert.equal(await page.getByRole('button',{name:'Send answers'}).isDisabled(),true);pass('Unknown transport outcomes cannot be resent automatically');
 await page.evaluate(()=>window.questionFixture.reset());await custom.click();await input.fill('Keyboard and pointer can both edit this answer.');await page.screenshot({path:path.join(output,'question.png')});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,'narrow-question.png')});pass('Question cards fit a narrow viewport');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(output,'report.json'));await app?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
