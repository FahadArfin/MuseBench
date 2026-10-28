import {createServer} from 'vite';
import {chromium,_electron as electron} from 'playwright';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
await mkdir('artifacts/mobile-settings',{recursive:true});const checks=[];
for(const variant of ['preview','desktop']){
 let server,browser,app,page;
 try{
  if(variant==='preview'){
   server=await createServer({configFile:'vite.preview.config.mjs',server:{host:'127.0.0.1',port:43197,strictPort:true}});await server.listen();
   browser=await chromium.launch();page=await browser.newPage({viewport:{width:1400,height:1000}});await page.goto('http://127.0.0.1:43197/preview.html');
  }else{
   const profile=await mkdtemp(path.resolve('artifacts/mobile-settings','profile-'));
   app=await electron.launch({args:['.','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],env:isolatedDesktopEnvironment(profile)});
   await app.firstWindow();let deadline=Date.now()+30000;
   while(!page&&Date.now()<deadline){page=app.windows().find(p=>p.url().includes('/dist/index.html'));if(!page)await new Promise(r=>setTimeout(r,100));}
   assert.ok(page,'Desktop shell opened');
  }
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();
  await page.getByRole('menuitem',{name:/^Settings/}).click();
  await page.getByRole('button',{name:'Mobile devices',exact:true}).click();
  await page.getByText('Desktop connection is off',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Turn on',exact:true}).click();
  await page.getByText('Desktop connection is on',{exact:true}).waitFor();
  if(variant==='desktop')await page.getByLabel('Desktop address',{exact:true}).selectOption('127.0.0.1');
  await page.getByRole('button',{name:'Pair a device',exact:true}).click();
  await page.getByRole('button',{name:'Copy pairing link',exact:true}).waitFor();
  if(variant==='desktop')await page.getByAltText('Scan to pair this desktop').waitFor();
  await page.screenshot({path:`artifacts/mobile-settings/${variant}.png`});
  await page.getByRole('button',{name:'Turn off',exact:true}).click();
  await page.getByText('Desktop connection is off',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Copy pairing link',exact:true}).count(),0);
  checks.push(`${variant}: shared Settings panel, explicit enable, pairing, disable invalidates code`);
 }finally{await app?.close();await browser?.close();await server?.close();}
}
await writeFile('artifacts/mobile-settings/report.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks}));
