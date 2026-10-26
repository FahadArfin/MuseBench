import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';

await mkdir('artifacts/window-chrome',{recursive:true});
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
const output=await mkdtemp(path.resolve('artifacts/window-chrome',variant+'-'));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,checks:[],errors:[]};let app,page;
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
const mode=name=>page.getByRole('group',{name:'Choose workspace',exact:true}).getByRole('button',{name,exact:true});
async function geometry(drawer=false){
 const result=await page.evaluate(()=>{
  const header=[...document.querySelectorAll('.topbar')].find(el=>el.checkVisibility());
  const sidebar=[...document.querySelectorAll('.sidebar-heading')].find(el=>el.checkVisibility());
  const bounds=el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const controls=[...header.querySelectorAll('button')].filter(el=>el.checkVisibility()).map(el=>({label:el.getAttribute('aria-label'),...bounds(el),drag:getComputedStyle(el).webkitAppRegion}));
  const area=navigator.windowControlsOverlay?.getTitlebarAreaRect();
  return{header:bounds(header),sidebar:sidebar&&bounds(sidebar),controls,area:area&&{x:area.x,y:area.y,width:area.width,height:area.height},overlay:navigator.windowControlsOverlay?.visible,drag:getComputedStyle(header).webkitAppRegion,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 assert.equal(result.header.height,42);assert.equal(result.header.y,0);assert(result.overlay);assert.equal(result.drag,'drag');assert(!result.overflow);
 if(result.sidebar){assert.equal(result.sidebar.height,42);assert.equal(result.sidebar.y,drawer?42:0);}
 for(const control of result.controls){assert.equal(control.drag,'no-drag');assert(control.right<=result.area.width+1,`${control.label} overlaps native caption buttons`);assert(control.x>=0,`${control.label} is offscreen`);}
 return result;
}
async function resize(width,height){
 await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);
 await page.waitForFunction(size=>innerWidth===size[0]&&innerHeight===size[1],[width,height]);
}
async function nativeCapture(file){
 const png=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{
  const win=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='MuseBench');
  const source=(await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:2000,height:1200}})).find(s=>s.id===win.getMediaSourceId());
  return source?.thumbnail.toPNG().toString('base64');
 });
 if(png)await writeFile(path.join(output,file),Buffer.from(png,'base64'));
}
try{
 app=await electron.launch({cwd:process.cwd(),args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
 page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
 await mode('Muse Code').waitFor();
 const security=await app.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return{sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,webSecurity:p.webSecurity};});
 assert.deepEqual(security,{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true});
 await page.getByRole('button',{name:'Try sample project',exact:true}).click();
 await page.getByRole('button',{name:'Project overview',exact:true}).click();
 await resize(1837,900);
 report.desktop=await geometry();
 await page.screenshot({path:path.join(output,'project.png')});await page.screenshot({path:path.join(output,'project-top.png'),clip:{x:0,y:0,width:1837,height:455}});await resize(1400,850);await nativeCapture('native-project.png');
 pass('Sidebar and workspace share a 42px header with native caption space and sandbox protections');
 const rejected=await page.evaluate(async()=>{try{await window.musebench.setWindowTheme('arbitrary');return false;}catch{return true;}});assert(rejected);
 await page.keyboard.press('Control+b');await geometry();await page.keyboard.press('Control+b');await geometry();
 await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];await new Promise(resolve=>{w.once('maximize',resolve);w.maximize();});});
 await geometry();
 await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];await new Promise(resolve=>{w.once('unmaximize',resolve);w.unmaximize();});});
 await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];await new Promise(resolve=>{w.once('minimize',resolve);w.minimize();});await new Promise(resolve=>{w.once('restore',resolve);w.restore();});});
 pass('Native maximize, restore and minimize work; collapsed navigation retains the caption safe area');
 await mode('Muse AI').click();await geometry();
 await page.getByRole('group',{name:'Chat or Work',exact:true}).getByRole('button',{name:'Work',exact:true}).click();await geometry();await page.screenshot({path:path.join(output,'work.png')});
 await page.keyboard.press('Control+,');await page.screenshot({path:path.join(output,'settings.png')});await page.getByRole('dialog',{name:'Settings',exact:true}).getByRole('button',{name:'Light theme',exact:true}).click();await page.keyboard.press('Escape');await geometry();await nativeCapture('native-light.png');
 pass('Muse AI and Work use the same chrome; settings can switch the native titlebar theme');
 await resize(390,760);await geometry();await page.getByRole('button',{name:'Open navigation',exact:true}).click();report.mobile=await geometry(true);await page.screenshot({path:path.join(output,'mobile.png')});
 await mode('Muse Code').click();await geometry();await page.getByRole('button',{name:'Open navigation',exact:true}).click();await geometry(true);
 await page.locator('.project-chats').getByRole('button',{name:'Add a caffeine-free tea filter',exact:true}).click();await geometry();await page.screenshot({path:path.join(output,'mobile-code.png')});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await mode('Muse AI').click();
 for(const name of ['All sites','All spaces']){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.personal-sidebar').getByRole('button',{name,exact:true}).click();await geometry();}
 await page.keyboard.press('Control+,');await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();const close=await page.getByRole('dialog',{name:'Settings',exact:true}).locator('.modal-heading button').boundingBox();assert(close.y>=42,'Settings close must not be underneath the native caption controls');await page.keyboard.press('Escape');
 pass('The narrow-window drawer and settings stay below the Windows controls; Code, AI, Work, Sites and Spaces fit');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await app?.close().catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);}
