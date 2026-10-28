import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {packagePaths} from './package-paths.mjs';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
await mkdir('artifacts/portable-desktop',{recursive:true});
const data=await mkdtemp(path.resolve('artifacts/portable-desktop','profile-'));
const env=isolatedDesktopEnvironment(data);
const errors=[],report={platform:process.platform,arch:process.arch,checks:[],errors};let app;
try{
 app=await electron.launch({executablePath:packagePaths().executable,args:['--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost',...(process.env.CI&&process.platform==='linux'?['--no-sandbox']:[])],env,timeout:60000});
 const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
 await page.waitForFunction(()=>!!window.musebench,{},{timeout:30000});
 const state=await page.evaluate(()=>window.musebench.getState());assert.ok(Array.isArray(state.projects));
 assert.equal(state.runtime.liveVerified,false);report.checks.push('Fresh profile starts with the real preload/controller; no model verification is invented');
 const info=await app.evaluate(({app})=>({version:app.getVersion(),arch:process.arch,platform:process.platform}));
 const expected=JSON.parse(await readFile('package.json','utf8'));assert.equal(info.version,expected.version);assert.equal(info.arch,process.arch);assert.equal(info.platform,process.platform);report.checks.push('Packaged version and native CPU architecture match the build');
 await page.getByRole('button',{name:'Muse Code',exact:true}).click();
 await page.getByRole('heading',{name:'What would you like to build?'}).waitFor();report.checks.push('Fresh Code workspace opens');
 await page.screenshot({path:'artifacts/portable-desktop/code.png'});
 assert.deepEqual(errors,[]);report.status='passed';
 console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{await writeFile('artifacts/portable-desktop/report.json',JSON.stringify(report,null,2));await app?.close();}
