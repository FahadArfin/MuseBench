import {_electron as electron} from 'playwright';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
// Read-only UI metadata from the existing profile. Never reads cookies, account
// identifiers, chat contents, credentials, or sends a message to either service.
const env={...process.env};for(const key of ['MUSEBENCH_DATA_DIR','MUSEBENCH_PROJECTS_DIR','MUSEBENCH_DEV','ELECTRON_RUN_AS_NODE'])delete env[key];
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/MuseBench.exe'),args:[],env});
const report={checkedAt:new Date().toISOString(),profile:'existing default profile',modelRequests:0,services:{},errors:[]};
try{
 const page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>!!window.musebench?.workState);const before=await page.evaluate(()=>window.musebench.getState());
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();
 report.services={authentication:'Not re-tested; existing provider storage retained.'};
 await page.getByRole('navigation',{name:'Meta AI shortcuts'}).getByRole('button',{name:'Work',exact:true}).click();await page.getByRole('heading',{name:'What would you like to make?'}).waitFor();
 const personal=await page.evaluate(()=>window.musebench.personalState());assert.equal(personal.visible,false);
 const after=await page.evaluate(()=>window.musebench.getState());assert.equal(before.task?.id,after.task?.id);assert.equal(before.activeProject?.id,after.activeProject?.id);
 report.projectCount=after.projects.length;report.codeSelectionPreserved=true;report.personalViewsHiddenInWork=true;
 assert.equal(report.errors.length,0);report.status='passed';
}catch(error){report.status='failed';report.errors.push(error.message);process.exitCode=1;}finally{await app.close();await writeFile('artifacts/work-profile-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
