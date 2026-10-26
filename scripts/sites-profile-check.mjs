import {_electron as electron} from 'playwright';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
// Existing-profile navigation only; never read browser cookies, credential
// values, message bodies, or hosting account details for validation evidence.
const env={...process.env};for(const key of ['MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR','MUSEBENCH_DEV','ELECTRON_RUN_AS_NODE'])delete env[key];
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/MuseBench.exe'),args:[],env});
const report={checkedAt:new Date().toISOString(),profile:'existing default profile',modelRequests:0,errors:[]};
try{
 const page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>!!window.musebench?.sitesState);
 const snapshot=()=>page.evaluate(async()=>{const c=await window.musebench.getState(),w=await window.musebench.workState(),s=await window.musebench.spacesState();return{projectId:c.activeProject?.id,taskId:c.task?.id,projects:c.projects.length,workItems:w.items.length,spaces:s.spaces?.length};});
 const before=await snapshot();await page.getByRole('button',{name:'Muse AI',exact:true}).click();await page.getByRole('navigation',{name:'Meta AI shortcuts'}).getByRole('button',{name:'Work',exact:true}).click();await page.getByRole('button',{name:/^All sites/}).first().click();await page.getByRole('region',{name:'Sites workspace',exact:true}).getByRole('heading',{name:'Your next idea belongs online.',exact:true}).waitFor();
 const after=await snapshot();assert.deepEqual(after,before);const sites=await page.evaluate(()=>window.musebench.sitesState());assert.equal(sites.error,null);assert.equal(report.errors.length,0);report.projectCount=after.projects;report.privateWorkCount=after.workItems;report.siteCount=sites.items.length;report.privateSelectionPreserved=true;report.status='passed';
}catch(error){report.status='failed';report.errors.push(error.message);process.exitCode=1;}
finally{await app.close();await writeFile('artifacts/sites-profile-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
