import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const output='artifacts/native-navigation';await mkdir(output,{recursive:true});
const fixture=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{useNativeControl}from'./src/ui/native-control-ui.ts';
let request,cancel;const f=window.navigationFixture={status:'idle',result:null,phases:[],start(input){f.status='pending';f.result=null;f.phases=[];request(input).then(result=>{f.result=result;f.status='completed';},()=>f.status='rejected');},cancel(id){cancel(id);}};
window.musebench={onNativeRequest(callback){request=callback;return()=>{};},onNativeCancel(callback){cancel=callback;return()=>{};},nativeNavigationPhase(value){f.phases.push(value.phase);}};
function Fixture(){const[route,setRoute]=useState({target:'code',section:'general',taskId:'a'}),[renders,setRenders]=useState(0);
useNativeControl(input=>({state:{target:input.target,section:input.section,taskId:'a'},selector:'.destination'}),true,route);
return <><button onClick={()=>setRenders(x=>x+1)}>Unrelated render {renders}</button><button onClick={()=>setRoute({target:'settings',section:'control',taskId:'a'})}>Wrong section</button><button onClick={()=>setRoute({target:'settings',section:'updates',taskId:'b'})}>Wrong chat</button><button onClick={()=>setRoute({target:'settings',section:'updates',taskId:'a'})}>Commit exact destination</button><main className="destination"><h1>{route.target} {route.section}</h1></main></>;}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
let browser,server;const report={checks:[],errors:[]};
const check=text=>report.checks.push(text);
try{
 const bundled=await build({stdin:{contents:fixture,sourcefile:'native-navigation-fixture.tsx',resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundled.outputFiles[0].text:'<!doctype html><div id="root"></div><script src="/fixture.js"></script>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch();const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Commit exact destination',exact:true}).waitFor();
 const start=async id=>{await page.evaluate(id=>window.navigationFixture.start({id,operation:'navigate',args:{target:'settings',section:'updates'},deadline:Date.now()+8000}),id);};
 const status=()=>page.evaluate(()=>window.navigationFixture.status);
 await start('first');await page.getByRole('button',{name:/Unrelated render/}).click();assert.equal(await status(),'pending');await page.getByRole('button',{name:'Wrong section',exact:true}).click();assert.equal(await status(),'pending');await page.getByRole('button',{name:'Wrong chat',exact:true}).click();assert.equal(await status(),'pending');await page.getByRole('button',{name:'Commit exact destination',exact:true}).click();await page.waitForFunction(()=>window.navigationFixture.status==='completed');
 assert.deepEqual(await page.evaluate(()=>window.navigationFixture.result.navigation),{committed:true,visualSettled:true});check('Unrelated renders, wrong section and wrong chat cannot acknowledge the exact requested destination');
 await page.evaluate(()=>{window.originalRaf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;});await start('already-selected');await page.waitForFunction(()=>window.navigationFixture.status==='completed',null,{polling:30});assert.deepEqual(await page.evaluate(()=>window.navigationFixture.phases),['committed','visual-settled']);await page.evaluate(()=>{window.requestAnimationFrame=window.originalRaf;});check('An already selected destination commits a fresh token while rAF is stalled');
 // A real Web Animation on the destination can outlive semantic commit.
 await page.evaluate(()=>{document.querySelector('.destination').animate([{opacity:.8},{opacity:1}],{duration:3000});});const began=performance.now();await start('long-transition');await page.waitForFunction(()=>window.navigationFixture.status==='completed');assert.deepEqual(await page.evaluate(()=>window.navigationFixture.result.navigation),{committed:true,visualSettled:false});report.visualBudgetElapsedMs=Math.round(performance.now()-began);assert.ok(report.visualBudgetElapsedMs<2000);check('A relevant visible transition has a bounded visually-unsettled result');
 await page.evaluate(()=>document.getAnimations().forEach(animation=>animation.cancel()));
 await page.evaluate(()=>document.querySelector('.destination').animate([{opacity:.8},{opacity:1}],{duration:3000}));await start('changed-after');await page.waitForFunction(()=>window.navigationFixture.phases.includes('committed'));await page.getByRole('button',{name:'Wrong section',exact:true}).click();await page.waitForFunction(()=>window.navigationFixture.status==='rejected');await page.evaluate(()=>document.getAnimations().forEach(animation=>animation.cancel()));check('A destination changed during visual observation cannot produce a snapshot for the wrong selection');
 await page.getByRole('button',{name:'Wrong section',exact:true}).click();await start('cancel-before');await page.evaluate(()=>window.navigationFixture.cancel('cancel-before'));await page.waitForFunction(()=>window.navigationFixture.status==='rejected');await page.getByRole('button',{name:'Commit exact destination',exact:true}).click();assert.equal(await status(),'rejected');
 await page.evaluate(()=>document.querySelector('.destination').animate([{opacity:.8},{opacity:1}],{duration:3000}));await start('cancel-after');await page.waitForFunction(()=>window.navigationFixture.phases.includes('committed'));await page.evaluate(()=>window.navigationFixture.cancel('cancel-after'));await page.waitForFunction(()=>window.navigationFixture.status==='rejected');check('Cancellation before and after commit never returns a later navigation result');
 assert.deepEqual(report.errors,[]);report.status='passed';console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
