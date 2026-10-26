import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','MUSEBENCH_DEV','MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR'])delete env[key];
const packaged=process.env.MUSEBENCH_META_PACKAGED==='1',variant=packaged?'packaged':'source';
const app=await electron.launch({...packaged?{executablePath:'release/win-unpacked/MuseBench.exe',args:[]}:{args:['.']},env}),report={variant,checks:[]};
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.locator('.personal-navigation .muse-agent-shortcut').click();
 let state;
 for(let i=0;i<100;i++){state=await page.evaluate(()=>window.musebench.personalState());if(state.agentProfile?.name&&state.agentProfile?.avatar&&await page.locator('.personal-sidebar-controls .muse-agent-avatar').count())break;await page.waitForTimeout(200);}
 assert.equal(state.agentProfile?.name,'jarvis');assert.match(state.agentProfile.avatar,/^data:image\/png;base64,/);pass('Signed-in agent profile supplies its custom name and actual mascot image');
 const agent=page.locator('.personal-sidebar-controls .muse-agent-shortcut');await agent.waitFor();assert.equal(await agent.innerText(),'jarvis');assert.equal(await agent.getAttribute('aria-label'),'jarvis');
 assert.equal(await page.getByRole('button',{name:'New Muse chat',exact:true}).count(),0);assert.equal(await page.locator('.personal-navigation .muse-agent-shortcut').count(),1);pass('One named agent shortcut sits at the top without a New Muse chat row');
 await page.waitForFunction(()=>{const img=document.querySelector('.muse-agent-avatar');return img?.complete&&img.naturalWidth===64;});pass('Agent avatar renders from bounded local image data');
 await agent.click();assert.equal((await page.evaluate(()=>window.musebench.personalState())).destination,'bot');
 await page.locator('.personal-navigation').getByRole('button',{name:'Chat',exact:true}).click();await page.locator('.personal-sidebar-controls .muse-agent-shortcut').waitFor();assert.equal(await page.locator('.personal-sidebar-controls .muse-agent-shortcut').innerText(),'jarvis');await page.locator('.personal-sidebar-controls .muse-agent-shortcut').click();await agent.waitFor();pass('Meta AI service switch retains the same agent identity and opens Muse');
 await mkdir('artifacts/muse-agent',{recursive:true});await page.locator('.personal-sidebar').screenshot({path:`artifacts/muse-agent/${variant}-sidebar.png`});report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(report.error);process.exitCode=1;}
finally{await app.close();await mkdir('artifacts/muse-agent',{recursive:true});await writeFile(`artifacts/muse-agent/live-${variant}.json`,JSON.stringify(report,null,2));}
