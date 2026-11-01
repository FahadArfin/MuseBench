import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';
await mkdir('artifacts/source-diff',{recursive:true});const output=await mkdtemp(path.resolve('artifacts/source-diff/desktop-')),base=await mkdtemp(path.join(tmpdir(),'muse-source-diff-')),project=path.join(base,'project');await mkdir(project);
await writeFile(path.join(project,'package.json'),JSON.stringify({name:'large-repo-fixture',scripts:{}}));
const before='// captured file\n'+'a'.repeat(200000);await writeFile(path.join(project,'large.txt'),before);await writeFile(path.join(project,'catalog.json'),JSON.stringify({data:'x'.repeat(10*1024*1024)}));
let app,page;const report={modelRequests:0,checks:[],errors:[]};
try{
 app=await electron.launch({args:['.'],env:isolatedDesktopEnvironment(path.join(base,'profile'))});page=await waitForDesktopRenderer(app);page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 const initial=await page.evaluate(async project=>{let state=await window.musebench.dispatch({type:'openProject',path:project});if(state.error)throw Error(state.error);state=await window.musebench.dispatch({type:'newTask',mode:'manual',request:'Review a large repository'});if(state.error)throw Error(state.error);return{taskId:state.task.id,projectId:state.activeProject.id};},project);
 await page.getByRole('button',{name:'Review a large repository',exact:true}).first().click();
 await writeFile(path.join(project,'large.txt'),before+'\nchanged line');
 const changed=await page.evaluate(()=>window.musebench.dispatch({type:'refresh'}));assert.equal(changed.error,null);const file=changed.task.changes.find(file=>file.path==='large.txt');assert.equal(file.omitted,true);assert.equal(file.before,'');report.checks.push('Real preload/controller captures >8 MiB source and sends deferred text descriptors');
 // Request the same on-demand API used by the shared Diff component.
 const loaded=await page.evaluate(input=>window.musebench.inspectSourceDiff(input),{taskId:initial.taskId,path:file.path,revision:changed.task.revision,beforeHash:file.beforeHash,afterHash:file.afterHash});assert.equal(loaded.before,before);assert.equal(loaded.after,before+'\nchanged line');report.checks.push('Real Electron IPC returns the exact selected historical and current content');
 await page.getByRole('button',{name:'View changes',exact:true}).click();
 await page.getByRole('button',{name:'Load comparison',exact:true}).click();
 await page.getByLabel('File diff for large.txt',{exact:true}).waitFor();
 assert.match(await page.getByLabel('File diff for large.txt',{exact:true}).innerText(),/changed line/);
 await page.screenshot({path:path.join(output,'loaded-comparison.png')});report.checks.push('Shared desktop review UI loads a deferred comparison on demand');assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}finally{await app?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log('Report: '+output);await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
