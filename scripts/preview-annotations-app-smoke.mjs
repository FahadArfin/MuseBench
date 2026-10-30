// Real production shell, preload, IPC, controller and local tutorial server.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {_electron as electron} from 'playwright';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
await mkdir('artifacts/preview-annotations',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/preview-annotations','app-'));
const report={checks:[],errors:[],providerCalls:0};let app,page;
const waitState=async predicate=>{const until=Date.now()+20000;while(Date.now()<until){const value=await page.evaluate(()=>window.musebench.getState());if(predicate(value))return value;await new Promise(r=>setTimeout(r,75));}throw Error('Controller state did not settle');};
try{
 const executable=process.env.MUSEBENCH_EXECUTABLE;
 app=await electron.launch({...(executable?{executablePath:executable}:{}),args:[...(executable?[]:['.']),'--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1'],env:isolatedDesktopEnvironment(path.join(output,'profile')),timeout:30000});
 const deadline=Date.now()+20000;while(!page&&Date.now()<deadline){page=app.windows().find(w=>/\/dist\/index\.html/.test(w.url().replaceAll('\\','/')));if(!page)await new Promise(r=>setTimeout(r,100));}
 assert(page,'Production shell must open');page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();await page.getByRole('button',{name:'Try sample project',exact:true}).click();
 const initial=await waitState(state=>!state.busy&&state.task?.mode==='demo');assert.equal(initial.task.mode,'demo');
 const composer=page.getByRole('textbox',{name:'Message Muse',exact:true});await composer.fill('/preview');await page.getByRole('option',{name:/^Preview Open the local project preview/}).click();
 await page.getByRole('button',{name:'Start preview',exact:true}).click();await waitState(state=>state.preview.status==='running');
 const iframe=page.locator('iframe[title="Project preview"]');await page.frameLocator('iframe[title="Project preview"]').locator('h1').waitFor();
 await page.getByRole('button',{name:'Comment on preview',exact:true}).click();const frameBounds=await iframe.boundingBox(),target=await page.frameLocator('iframe[title="Project preview"]').locator('h1').boundingBox();
 await page.getByRole('button',{name:'Select preview element'}).click({position:{x:Math.max(1,target.x-frameBounds.x+4),y:Math.max(1,target.y-frameBounds.y+4)}});
 await page.getByRole('textbox',{name:'Preview comment'}).fill('Give this heading a little more breathing room.');
 await page.screenshot({path:path.join(output,'selected.png')});
 await page.getByRole('button',{name:'Add to draft',exact:true}).click();
 const after=await waitState(state=>state.drafts[initial.task.projectId+':'+initial.task.id]?.text.includes('breathing room'));assert.match(await composer.inputValue(),/untrusted page content[\s\S]*breathing room/);assert.equal(after.task.id,initial.task.id);assert.equal(after.task.messages.length,initial.task.messages.length);assert.equal(after.runtime.liveVerified,false);assert.match(after.drafts[after.task.projectId+':'+after.task.id].text,/breathing room/);
 report.checks.push('Actual tutorial server element becomes an unsent durable draft through production shell/preload/IPC/controller; no provider request');
 const before=(await composer.inputValue());await page.getByRole('button',{name:'Comment on preview',exact:true}).click();await page.getByRole('button',{name:'Select preview element'}).click({position:{x:30,y:30}});await page.getByRole('textbox',{name:'Preview comment'}).fill('Do not stage after reload');
 const frame=page.frames().find(f=>f.url()===after.preview.url);assert(frame);await frame.evaluate(()=>location.reload());await page.getByRole('region',{name:'Selected preview element'}).waitFor({state:'hidden'});assert.equal(await composer.inputValue(),before);report.checks.push('Same-URL reload invalidates actual desktop selection without changing the draft');
 await page.getByRole('button',{name:'Cancel preview comment'}).click();await page.getByRole('button',{name:'Stop preview',exact:true}).click();
 assert.deepEqual(report.errors,[]);report.status='passed';console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();}
