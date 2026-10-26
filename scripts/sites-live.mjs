import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
await mkdir('artifacts/sites-live',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/sites-live','run-'));
const projects=path.join(path.parse(process.cwd()).root,'MuseBenchWorkspaces',`sites-live-${randomUUID()}`);
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:projects};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
let app,page;const report={output,projects,modelRequests:0,checks:[],errors:[],sandbox:[],hosting:'No hosting account or public deployment'};
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
const state=()=>page.evaluate(()=>window.musebench.sitesState());
const ws=()=>page.getByRole('region',{name:'Sites workspace',exact:true});
const until=async(fn,ms=240000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Muse Sites request exceeded test timeout.');};
async function send(text){
 const before=(await state()).generation.task?.runs.length??0;
 await ws().getByRole('textbox',{name:'Message Muse about your site',exact:true}).fill(text);report.modelRequests++;
 await ws().getByRole('button',{name:'Send site message',exact:true}).click();
 await until(async()=>{const s=await state();if(s.error||s.generation.error)throw Error(s.error||s.generation.error);return(s.generation.task?.runs.length??0)>before;});
 await until(async()=>{const s=await state();if(s.error||s.generation.error)throw Error(s.error||s.generation.error);if(!s.busy&&!s.generation.busy){assert.equal(s.generation.task.runs.at(-1).status,'completed',s.generation.runtime.reason||'Native Sites run did not complete');return true;}return false;});
 const s=await state(),runtime=s.generation.runtime;
 assert.equal(runtime.permissionVerified,true);assert.equal(runtime.liveVerified,true);assert.equal(runtime.transport,'exec');assert(runtime.permissionArguments.includes(':ask-me'));assert(!runtime.permissionArguments.some(arg=>/no-sandbox|disable-sandbox|dangerously/i.test(arg)));
 report.sandbox.push({permissionVerified:runtime.permissionVerified,liveVerified:runtime.liveVerified,transport:runtime.transport,permissionArguments:runtime.permissionArguments,sandboxReadiness:runtime.sandboxReadiness,cleanup:runtime.cleanup});return s;
}
try{
 app=await electron.launch({cwd:process.cwd(),args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>!!window.musebench?.sites);
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.getByRole('navigation',{name:'Meta AI shortcuts'}).getByRole('button',{name:'Work',exact:true}).click();await page.getByRole('button',{name:/^All sites/}).first().click();
 await page.evaluate(()=>window.musebench.sites({type:'create',title:'Orbit live test',description:'A local Muse generation test.',template:'blank'}));
 await page.getByRole('navigation',{name:'Saved sites',exact:true}).getByRole('button',{name:/Orbit live test/}).click();
 assert.equal((await state()).generation.task,null);record('New Sites draft starts without a model call');
 const first=await send('Read public/index.html and replace it with a complete self-contained HTML page. Use exact h1 Orbit live test, a short sentence about an independent design studio, and a button labeled Show details. Clicking the button reveals the exact text Built with MuseBench. Use inline CSS and JavaScript, responsive layout and a forest-green accent. Use native file tools only. Do not run shell, install, build or verification commands.');
 const frame=ws().locator('iframe').contentFrame();await frame.getByRole('heading',{name:'Orbit live test',exact:true}).waitFor();await frame.getByRole('button',{name:'Show details',exact:true}).click();await frame.getByText('Built with MuseBench',{exact:true}).waitFor();assert.equal(first.site.source,'muse');await page.screenshot({path:path.join(output,'01-generated.png')});record('Real Muse created a working interactive static site using the native sandbox');
 const second=await send('Read public/index.html and change only its h1 text to Orbit studio revised. Retain the Show details button and its Built with MuseBench revealed text. Keep the current responsive design. Use native file tools only, without shell or post-write verification commands.');
 await frame.getByRole('heading',{name:'Orbit studio revised',exact:true}).waitFor();await frame.getByRole('button',{name:'Show details',exact:true}).click();await frame.getByText('Built with MuseBench',{exact:true}).waitFor();assert.equal(second.generation.task.runs.length,2);assert.notEqual(second.site.draftHash,first.site.draftHash);record('Follow-up prompt edits the same site and preserves its interactive behavior');
 const saved=await page.evaluate(()=>window.musebench.sites({type:'saveVersion',label:'Verified live generation'}));assert.equal(saved.versions.length,1);assert.equal(saved.site.status,'draft');assert.equal(saved.hosting.connected,false);await page.screenshot({path:path.join(output,'02-revised.png')});record('Generated output saves as an immutable local version without public deployment');
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);try{await page?.screenshot({path:path.join(output,'failure.png')});}catch{}process.exitCode=1;}
finally{if(page)try{const s=await page.evaluate(()=>window.musebench.sites({type:'stop'}));report.shutdown=s.generation?.runtime?.cleanup;assert.notEqual(report.shutdown,'unconfirmed');}catch(error){report.shutdownError=error.message;process.exitCode=1;}await app?.close().catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report '+path.join(output,'report.json'));}
