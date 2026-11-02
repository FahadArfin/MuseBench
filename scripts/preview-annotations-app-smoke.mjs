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
 const composer=page.getByRole('textbox',{name:'Message Muse',exact:true});await composer.fill('Keep my existing request.\n/preview');await page.getByRole('option',{name:/^Preview Open the local project preview/}).click();
 await page.getByRole('button',{name:'Start preview',exact:true}).click();await waitState(state=>state.preview.status==='running');
 await page.setViewportSize({width:1000,height:900});
 const iframe=page.locator('iframe[title="Project preview"]');await page.frameLocator('iframe[title="Project preview"]').locator('h1').waitFor();
 const key=initial.task.projectId+':'+initial.task.id;
 // Staged annotation data must preserve the user's existing prompt text.
 const before='Keep my existing request.';
 const selectElement=async selector=>{const element=page.frameLocator('iframe[title="Project preview"]').locator(selector).first();await element.scrollIntoViewIfNeeded();const frameBounds=await iframe.boundingBox(),target=await element.boundingBox();assert(target,'The fixture element must be visible');const overlayBounds=await page.getByRole('button',{name:'Select preview element',exact:true}).boundingBox();assert.equal(Math.round(frameBounds.height),Math.round(overlayBounds.height),'Annotation overlay and iframe viewport heights must match');assert.equal(Math.round(frameBounds.width),Math.round(overlayBounds.width),'Annotation overlay and iframe viewport widths must match');await page.getByRole('button',{name:'Select preview element',exact:true}).click({position:{x:Math.min(frameBounds.width-1,Math.max(1,target.x-frameBounds.x+4)),y:Math.min(frameBounds.height-1,Math.max(1,target.y-frameBounds.y+4))}});await page.getByRole('textbox',{name:'Preview comment',exact:true}).waitFor();};
 await page.getByRole('button',{name:'Comment on preview',exact:true}).click();await selectElement('h1');
 await page.getByRole('textbox',{name:'Preview comment'}).fill('Give this heading a little more breathing room.');
 await page.getByRole('button',{name:'Save comment',exact:true}).click();await page.getByRole('button',{name:'Edit annotation 1',exact:true}).waitFor();
 let staged=await page.evaluate(()=>window.musebench.getState());assert.equal(staged.drafts[key]?.annotations?.length??0,0);assert.equal(staged.task.messages.length,initial.task.messages.length);
 await selectElement('p');await page.getByRole('textbox',{name:'Preview comment'}).fill('Make this supporting text easier to read.');await page.locator('.preview-style-controls summary').click();await page.getByRole('textbox',{name:'Requested font size',exact:true}).fill('18px');await page.getByRole('button',{name:'Save comment',exact:true}).click();await page.getByRole('button',{name:'Edit annotation 2',exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'selected.png')});await page.getByRole('button',{name:'Attach 2 comments',exact:true}).click();
 const after=await waitState(state=>state.drafts[key]?.annotations?.length===2),annotations=after.drafts[key].annotations;
 assert.equal(after.task.id,initial.task.id);assert.equal(after.task.messages.length,initial.task.messages.length);assert.equal(after.runtime.liveVerified,false);assert.equal(after.drafts[key].text,before);assert.match(annotations[0].note,/breathing room/);assert.equal(annotations[0].target.tag,'h1');assert.match(annotations[1].note,/supporting text/);assert.equal(annotations[1].target.tag,'p');assert.deepEqual(annotations[1].styleChanges,{fontSize:'18px'});
 report.checks.push('Two production tutorial elements become a typed durable annotation bundle through shell/preload/IPC/controller, preserving prompt text with no immediate send');
 await page.getByRole('button',{name:'Close details panel',exact:true}).click();const chip=page.getByRole('button',{name:'Annotations (2)',exact:true});await chip.waitFor();await chip.click();const details=page.getByRole('region',{name:'Browser annotations',exact:true});await details.getByText('Give this heading a little more breathing room.',{exact:true}).waitFor();await details.getByText('Make this supporting text easier to read.',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'attached.png')});await composer.click();
 await composer.fill(before+'\n/preview');await page.getByRole('option',{name:/^Preview Open the local project preview/}).click();await page.getByRole('button',{name:'Comment on preview',exact:true}).waitFor();
 const draftBundle=async()=>{const state=await waitState(state=>state.drafts[key]?.text===before);assert.deepEqual(state.drafts[key].annotations,annotations);return state.drafts[key];};await draftBundle();report.checks.push('Compact Annotations (2) chip exposes both notes and reopening preview preserves the exact typed bundle');
 await page.getByRole('button',{name:'Comment on preview',exact:true}).click();await selectElement('h1');await page.getByRole('textbox',{name:'Preview comment'}).fill('Do not stage after reload');
 const frame=page.frames().find(f=>f.url()===after.preview.url);assert(frame);await frame.evaluate(()=>location.reload());await page.getByRole('region',{name:'Selected preview element'}).waitFor({state:'hidden'});await draftBundle();report.checks.push('Same-URL reload invalidates actual desktop selection without changing the prompt or attached annotations');
 await page.getByRole('button',{name:'Cancel preview comment'}).click();await page.getByRole('button',{name:'Stop preview',exact:true}).click();
 assert.deepEqual(report.errors,[]);report.status='passed';console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+output);await app?.close();}
