import {_electron as electron} from 'playwright';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Existing-profile navigation only: no shared-content writes, provider requests,
// cookie reads, account identifiers, or chat contents in the report.
const env={...process.env};
for(const key of ['MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR','MUSEBENCH_DEV','ELECTRON_RUN_AS_NODE'])delete env[key];
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/MuseBench.exe'),args:[],env});
const report={checkedAt:new Date().toISOString(),profile:'existing default profile',modelRequests:0,errors:[]};
try{
 const page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));
 await page.waitForFunction(()=>Boolean(window.musebench?.spacesState));
 const before=await page.evaluate(async()=>{const code=await window.musebench.getState();const work=await window.musebench.workState();return {projectId:code.activeProject?.id,taskId:code.task?.id,projects:code.projects.length,workItems:work.items.length};});
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();
 await page.getByRole('navigation',{name:'Meta AI shortcuts'}).getByRole('button',{name:'Work',exact:true}).click();
 await page.getByRole('button',{name:/^All spaces/}).click();
 await page.getByRole('heading',{name:'Keep the work together.',exact:true}).waitFor();
 const after=await page.evaluate(async()=>{const code=await window.musebench.getState();const work=await window.musebench.workState();return {projectId:code.activeProject?.id,taskId:code.task?.id,projects:code.projects.length,workItems:work.items.length};});
 assert.deepEqual(after,before);assert.equal(report.errors.length,0);
 report.projectCount=after.projects;report.privateWorkCount=after.workItems;report.privateSelectionPreserved=true;report.status='passed';
}catch(error){report.status='failed';report.errors.push(error.message);process.exitCode=1;}
finally{await app.close();await writeFile('artifacts/spaces-profile-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
