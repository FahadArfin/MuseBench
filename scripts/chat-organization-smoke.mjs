import {_electron as electron,chromium} from 'playwright';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';

// Mutations use a fresh browser context or an isolated Electron profile. These
// scenarios catch actions applied to the selected chat instead of the menu
// target, missing confirmations, lost persistence, and inaccessible menus.
await mkdir('artifacts/chat-organization',{recursive:true});
const root=await mkdtemp(path.resolve('artifacts/chat-organization','menu-'));
const only=process.argv.includes('--preview-only')?'preview':process.argv.includes('--desktop-only')?'desktop':null;
const reports=[];

async function desktopPage(app){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    // Hidden provider lookups may reach Playwright before the local renderer.
    const page=app.windows().find(candidate=>!candidate.isClosed()&&candidate.url().startsWith('file:')&&/\/dist\/index\.html(?:[?#]|$)/.test(candidate.url()));
    if(page)return page;
    await new Promise(resolve=>setTimeout(resolve,70));
  }
  throw Error(`Local desktop renderer did not open; observed windows: ${JSON.stringify(app.windows().map(page=>page.url()))}`);
}

async function exercise(page,{variant,projectName,firstTitle,secondTitle,projectFile}){
  page.setDefaultTimeout(10000);
  const errors=[],report={variant,checks:[],errors};
  reports.push(report);
  const record=text=>{report.checks.push(text);console.log(`PASS ${variant}: ${text}`);};
  page.on('pageerror',error=>errors.push(error.message));
  const state=()=>page.evaluate(()=>window.musebench.getState());
  const folder=page.locator('.sidebar').getByRole('region',{name:`${projectName} active chats`,exact:true});
  const pinned=page.getByRole('region',{name:'Pinned chats',exact:true});
  const recents=page.getByRole('region',{name:'Recents',exact:true});
  const row=(region,title)=>region.getByRole('button',{name:title,exact:true});
  const openMenu=async(region,title)=>{
    await region.getByRole('button',{name:`Chat options for ${title}`,exact:true}).click();
    const menu=page.getByRole('menu',{name:`Options for ${title}`,exact:true});
    await menu.waitFor();
    return menu;
  };
  const waitTask=async(id,expected)=>page.waitForFunction(async({id,expected})=>{
    const task=(await window.musebench.getState()).tasks.find(item=>item.id===id);
    return task&&Object.entries(expected).every(([key,value])=>task[key]===value);
  },{id,expected});
  const screenshot=name=>page.screenshot({path:path.join(root,`${variant}-${name}.png`)});
  try{
    await page.setViewportSize({width:1200,height:900});
    await page.getByRole('group',{name:'Choose workspace'}).waitFor({timeout:30000});
    await page.getByRole('button',{name:'Muse Code',exact:true}).click();
    await row(folder,secondTitle).click();
    const baseline=await state(),first=baseline.tasks.find(task=>task.title===firstTitle).id,second=baseline.task.id;
    assert.notEqual(first,second);
    const baselineCount=baseline.tasks.length;
    let menu=await openMenu(folder,firstTitle);
    assert.equal(await menu.getByRole('menuitem',{name:'Edit details',exact:true}).count(),1,'Chat ellipsis must offer Edit details');
    assert.deepEqual((await menu.getByRole('menuitem').allTextContents()).map(text=>text.trim()),['Fork chat','New side chat','Pin','Edit details','Archive','Delete']);
    assert.equal(await menu.getByRole('separator').count(),2);
    await menu.getByRole('menuitem',{name:'Edit details',exact:true}).click();
    const edit=page.getByRole('dialog',{name:'Edit chat details',exact:true});
    const name=edit.getByRole('textbox',{name:'Chat name',exact:true});
    const save=edit.getByRole('button',{name:'Save changes',exact:true});
    await edit.waitFor();
    assert.equal(await name.inputValue(),firstTitle);
    assert.equal(await save.isDisabled(),true);
    await name.fill('A name that should not be saved');
    await edit.getByRole('button',{name:'Cancel',exact:true}).click();
    await edit.waitFor({state:'hidden'});
    assert.equal((await state()).tasks.find(task=>task.id===first).title,firstTitle);
    assert.equal((await state()).task.id,second);
    record('Ellipsis offers the requested actions; cancelling details preserves the target and selected chat');

    menu=await openMenu(folder,firstTitle);
    await menu.getByRole('menuitem',{name:'Edit details',exact:true}).click();
    await name.fill('   ');
    assert.equal(await save.isDisabled(),true,'Whitespace-only chat names cannot be saved');
    await name.fill('A'.repeat(101));
    assert.equal((await name.inputValue()).length,100,'Chat names use the persisted 100-character limit');
    await name.fill('  Renamed project chat  ');
    await screenshot('edit-details');
    await save.click();
    await edit.waitFor({state:'hidden'});
    const renamed='Renamed project chat';
    await waitTask(first,{title:renamed});
    assert.equal((await state()).task.id,second,'Renaming a nonselected chat must not navigate');
    assert.equal((await state()).task.title,secondTitle);
    await row(folder,renamed).waitFor();
    await row(recents,renamed).waitFor();
    record('Edit details validates names and renames the nonselected chat without changing the current conversation');

    menu=await openMenu(folder,renamed);
    await menu.getByRole('menuitem',{name:'Pin',exact:true}).click();
    await row(pinned,renamed).waitFor();
    assert.equal(await row(recents,renamed).count(),0);
    assert.equal(await row(folder,renamed).count(),1);
    assert.equal((await state()).tasks.length,baselineCount);
    menu=await openMenu(pinned,renamed);
    assert.deepEqual((await menu.getByRole('menuitem').allTextContents()).map(text=>text.trim()),['Fork chat','New side chat','Unpin','Edit details','Archive','Delete']);
    await screenshot('pinned-menu');
    assert.equal(await menu.isVisible(),true,'Opening and focusing a pinned menu must not scroll a disclosure and dismiss it');
    await menu.getByRole('menuitem',{name:'Unpin',exact:true}).click();
    await row(recents,renamed).waitFor();
    assert.equal(await row(pinned,renamed).count(),0);
    record('Pin and Unpin move the shortcut while preserving its project and single saved chat');

    await row(folder,renamed).focus();
    await page.keyboard.press('Shift+F10');
    menu=page.getByRole('menu',{name:`Options for ${renamed}`,exact:true});
    await menu.waitFor();
    assert.equal(await menu.getByRole('menuitem',{name:'Fork chat',exact:true}).evaluate(element=>element===document.activeElement),true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await menu.getByRole('menuitem',{name:'New side chat',exact:true}).evaluate(element=>element===document.activeElement),true);
    await page.keyboard.press('End');
    assert.equal(await menu.getByRole('menuitem',{name:'Delete',exact:true}).evaluate(element=>element===document.activeElement),true);
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(),0);
    assert.equal(await row(folder,renamed).evaluate(element=>element===document.activeElement),true);
    record('Keyboard context menu supports arrow navigation, Home/End, Escape and focus restoration');

    menu=await openMenu(folder,renamed);
    await menu.getByRole('menuitem',{name:'Archive',exact:true}).click();
    await row(folder,renamed).waitFor({state:'hidden'});
    await waitTask(first,{archived:true});
    assert.equal((await state()).task.id,second);
    await page.locator('.sidebar').getByRole('button',{name:projectName,exact:true}).click();
    const overview=page.getByRole('main',{name:'Project overview',exact:true});
    const tabs=overview.getByRole('group',{name:`${projectName} chat sections`,exact:true});
    await tabs.getByRole('button',{name:'Archived',exact:true}).click();
    const archived=overview.getByRole('region',{name:`${projectName} archived chats`,exact:true});
    menu=await openMenu(archived,renamed);
    assert.deepEqual((await menu.getByRole('menuitem').allTextContents()).map(text=>text.trim()),['Restore','Edit details','Delete']);
    await menu.getByRole('menuitem',{name:'Edit details',exact:true}).click();
    await name.fill('Renamed archived chat');
    await save.click();
    await edit.waitFor({state:'hidden'});
    await waitTask(first,{title:'Renamed archived chat',archived:true});
    menu=await openMenu(archived,'Renamed archived chat');
    await screenshot('archived-menu');
    await menu.getByRole('menuitem',{name:'Restore',exact:true}).click();
    await row(folder,'Renamed archived chat').waitFor();
    await waitTask(first,{archived:false});
    record('Archived chats can be renamed and restored through the project menu');

    await tabs.getByRole('button',{name:'Chats',exact:true}).click();
    const active=overview.getByRole('region',{name:`${projectName} active chats`,exact:true});
    menu=await openMenu(active,'Renamed archived chat');
    await menu.getByRole('menuitem',{name:'Delete',exact:true}).click();
    const deleting=page.getByRole('dialog',{name:'Delete chat permanently?',exact:true});
    await deleting.getByRole('button',{name:'Cancel',exact:true}).click();
    await deleting.waitFor({state:'hidden'});
    assert.equal((await state()).tasks.length,baselineCount);
    assert.equal((await state()).tasks.find(task=>task.id===first).archived,false);
    menu=await openMenu(active,'Renamed archived chat');
    await menu.getByRole('menuitem',{name:'Delete',exact:true}).click();
    await screenshot('delete-confirmation');
    await deleting.getByRole('button',{name:'Delete chat',exact:true}).click();
    await page.waitForFunction(async id=>!(await window.musebench.getState()).tasks.some(task=>task.id===id),first);
    assert.equal((await state()).tasks.length,baselineCount-1);
    assert.equal((await state()).task.id,second);
    if(projectFile)assert.equal(await readFile(projectFile,'utf8'),'Kept project file');
    record('Direct deletion requires confirmation, Cancel preserves history, and confirmation retains other chats and project files');

    menu=await openMenu(folder,secondTitle);
    await menu.getByRole('menuitem',{name:'Edit details',exact:true}).click();
    await name.fill('Saved remaining chat');
    await name.press('Enter');
    await edit.waitFor({state:'hidden'});
    await waitTask(second,{title:'Saved remaining chat'});
    assert.equal((await state()).task.title,'Saved remaining chat');
    menu=await openMenu(folder,'Saved remaining chat');
    await menu.getByRole('menuitem',{name:'Pin',exact:true}).click();
    await row(pinned,'Saved remaining chat').waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Muse Code',exact:true}).click();
    const survivingTitle=variant==='preview'?secondTitle:'Saved remaining chat';
    await row(folder,survivingTitle).waitFor();
    const reloaded=await state();
    if(variant==='preview'){
      assert.equal(reloaded.tasks.length,baselineCount);
      assert.equal(reloaded.tasks.find(task=>task.id===first).title,firstTitle);
      record('Preview reload resets sample data without retaining test mutations');
    }else{
      assert.equal(reloaded.tasks.length,baselineCount-1);
      assert.equal(reloaded.tasks.some(task=>task.id===first),false);
      assert.equal(reloaded.tasks.find(task=>task.id===second).title,'Saved remaining chat');
      assert.equal(reloaded.tasks.find(task=>task.id===second).pinned,true);
      await row(pinned,'Saved remaining chat').waitFor();
      assert.equal(await readFile(projectFile,'utf8'),'Kept project file');
      record('Desktop names, pins and deletion survive reload while project files remain intact');
    }
    await page.setViewportSize({width:430,height:820});
    await page.getByRole('button',{name:'Open navigation',exact:true}).first().click();
    menu=await openMenu(folder,survivingTitle);
    const bounds=await menu.boundingBox();
    assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=430&&bounds.y+bounds.height<=820);
    await screenshot('narrow-menu');
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(),0);
    assert.deepEqual(errors,[]);
    record('Menu fits a narrow window and dismisses without changing the selected chat');
    report.status='passed';
  }catch(error){
    report.status='failed';report.error=String(error.stack??error);
    await screenshot('failure').catch(()=>{});
    throw error;
  }
}

try{
  if(only!=='desktop'){
    const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-chat-menu-test',server:{host:'127.0.0.1',port:0,strictPort:false}});
    let browser;
    try{
      await server.listen();
      browser=await chromium.launch({headless:true});
      const page=await browser.newPage();
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        return url.hostname==='127.0.0.1'?route.continue():route.abort();
      });
      await page.goto(`${server.resolvedUrls.local[0]}preview.html`,{timeout:60000});
      await exercise(page,{variant:'preview',projectName:'MuseBench sample',firstTitle:'Build a clearer project overview',secondTitle:'Polish the chat composer'});
    }finally{await browser?.close();await server.close();}
  }
  if(only!=='preview'){
    const dataDir=path.join(root,'data'),project=path.join(root,'Example project');
    await mkdir(project);
    const projectFile=path.join(project,'README.md');
    await writeFile(projectFile,'Kept project file');
    const controller=await createController({dataDir});
    try{
      await controller.dispatch({type:'openProject',path:project});
      await controller.dispatch({type:'newTask',request:'First chat',mode:'manual'});
      await controller.dispatch({type:'newTask',request:'Second chat',mode:'manual'});
    }finally{await controller.close();}
    const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:path.join(root,'projects')};
    delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
    const app=await electron.launch({args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
    try{await exercise(await desktopPage(app),{variant:process.env.MUSEBENCH_EXECUTABLE?'packaged':'source',projectName:'Example project',firstTitle:'First chat',secondTitle:'Second chat',projectFile});}
    finally{await app.close();}
  }
}finally{
  await writeFile(path.join(root,'report.json'),JSON.stringify({reports},null,2));
  console.log(root);
}
