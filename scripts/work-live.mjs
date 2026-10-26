import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
await mkdir('artifacts/work-live',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/work-live','run-'));
const projects=path.join(path.parse(process.cwd()).root,'MuseBenchWorkspaces',`work-live-${randomUUID()}`);
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:projects};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
let app,page;const report={output,projects,modelRequests:0,checks:[],errors:[],sandbox:[]};
const record=name=>{report.checks.push(name);console.log('PASS '+name);};
const work=()=>page.evaluate(()=>window.musebench.workState());
const ws=()=>page.getByRole('region',{name:'Work workspace',exact:true});
const until=async(fn,ms=240000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Muse Work request exceeded test timeout.');};
async function send(text){
 const before=(await work()).task.runs.length;
 await ws().getByRole('textbox',{name:'Work brief and message'}).fill(text);
 report.modelRequests++;await ws().getByRole('button',{name:'Send Work message'}).click();
 await until(async()=>{const s=await work();if(s.error)throw Error(s.error);return s.task.runs.length>before;});
 await until(async()=>{const s=await work();if(s.error)throw Error(s.error);if(!s.busy){assert.equal(s.task.runs.at(-1).status,'completed',s.runtime.reason||'Native Work run did not complete');return !!s.artifact;}return false;});
 const state=await work();assert.equal(state.artifactError,null,state.artifactError);
 const runtime=state.runtime;assert.equal(runtime.permissionVerified,true);assert.equal(runtime.liveVerified,true);assert.equal(runtime.transport,'exec');assert(runtime.permissionArguments.includes(':ask-me'));assert(!runtime.permissionArguments.some(arg=>/no-sandbox|disable-sandbox|dangerously/i.test(arg)));
 report.sandbox.push({permissionVerified:runtime.permissionVerified,liveVerified:runtime.liveVerified,transport:runtime.transport,permissionArguments:runtime.permissionArguments,sandboxReadiness:runtime.sandboxReadiness,cleanup:runtime.cleanup});
 return state;
}
try{
 app=await electron.launch({cwd:process.cwd(),args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>!!window.musebench?.work);
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.getByRole('navigation',{name:'Meta AI shortcuts'}).getByRole('button',{name:'Work',exact:true}).click();
 await page.evaluate(()=>window.musebench.work({type:'create',team:'analytics',kind:'dashboard',title:'Work live revenue fixture',brief:'Build a small revenue dashboard from my attached CSV.',runOptions:{reasoning:'medium',approval:'ask'}}));
 await page.getByRole('navigation',{name:'Saved work',exact:true}).getByRole('button',{name:/Work live revenue fixture/}).click();
 const source=path.join(output,'revenue.csv');await writeFile(source,'month,revenue\nJanuary,100\nFebruary,150\nMarch,200\n');await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
 await ws().getByRole('button',{name:'Attach sources',exact:true}).click();await until(async()=>(await work()).item.sources.length===1,15000);
 assert.equal((await work()).task.runs.length,0);record('Created an isolated Work draft and attached local CSV without a model call');
 const first=await send('Read the attached revenue.csv source and create the dashboard artifact. Title it Revenue fixture. Include one metric labeled Total revenue with value 450, one bar chart using the CSV month labels and revenue values, and a table with those exact three data rows. Include source and calculation notes. Use only the given data, no extra datasets or commands. Write work-artifact.json using the required schema.');
 assert.equal(first.artifact.title,'Revenue fixture');assert(first.artifact.metrics.some(metric=>metric.label==='Total revenue'&&metric.value.replace(/[^0-9]/g,'')==='450'));assert.deepEqual(first.artifact.charts[0].values,[100,150,200]);assert.equal(first.task.messages.findLast(message=>message.role==='user').text.startsWith('Read the attached'),true);
 await ws().locator('iframe').contentFrame().getByRole('heading',{name:'Revenue fixture',exact:true}).waitFor();await page.screenshot({path:path.join(output,'01-generated.png')});record('Real native Muse generated source-grounded dashboard data and the app rendered it with sandbox verification');
 const second=await send('Update the existing work-artifact.json only: change title to Revenue fixture revised, retain the metric, chart, table and source data, and add a section with heading Next steps and body Check the April revenue when it becomes available. Do not invent April values. Use native file read/write tools only. Do not run shell commands or post-write verification commands for this content-only update.');
 assert.equal(second.artifact.title,'Revenue fixture revised');assert.deepEqual(second.artifact.charts[0].values,[100,150,200]);assert(second.artifact.sections.some(section=>section.heading==='Next steps'));assert.equal(second.task.runs.length,2);
 await ws().locator('iframe').contentFrame().getByRole('heading',{name:'Revenue fixture revised',exact:true}).waitFor();await page.screenshot({path:path.join(output,'02-revised.png')});record('A real follow-up Muse request revised the same artifact and kept source values intact');
 assert.equal(report.errors.length,0,report.errors.join('\n'));report.status='passed';
}catch(error){report.status='failed';report.failure=error.message;console.error(error);try{await page?.screenshot({path:path.join(output,'failure.png')});}catch{}process.exitCode=1;}
finally{if(page)try{const state=await page.evaluate(()=>window.musebench.work({type:'stop'}));report.shutdown=state.runtime.cleanup;assert.notEqual(state.runtime.cleanup,'unconfirmed');}catch(error){report.shutdownError=error.message;process.exitCode=1;}await app?.close().catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report '+path.join(output,'report.json'));}
