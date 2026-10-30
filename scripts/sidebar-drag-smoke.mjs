import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createController} from '../src/controller/index.mjs';
await mkdir('artifacts/sidebar-drag',{recursive:true});
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source',root=await mkdtemp(path.resolve('artifacts/sidebar-drag',variant+'-')),dataDir=path.join(root,'data');
const controller=await createController({dataDir});const projects=[],chats=[];
for(const name of ['Alpha','Beta']){const folder=path.join(root,name);await mkdir(folder);await writeFile(path.join(folder,'README.md'),name);let s=await controller.dispatch({type:'openProject',path:folder});projects.push(s.activeProject);for(const request of [name+' one',name+' two']){s=await controller.dispatch({type:'newTask',mode:'manual',request});chats.push(s.task);}}
await controller.close();
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:path.join(root,'projects')};delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const app=await electron.launch({args:process.env.MUSEBENCH_EXECUTABLE?[]:['.'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env});
async function desktopPage(){
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  const page=app.windows().find(candidate=>!candidate.isClosed()&&candidate.url().startsWith('file:')&&/\/dist\/index\.html(?:[?#]|$)/.test(candidate.url()));
  if(page)return page;
  await new Promise(resolve=>setTimeout(resolve,70));
 }
 throw Error('Local desktop renderer did not open');
}
const page=await desktopPage();page.setDefaultTimeout(10000);const report={variant,checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
const state=()=>page.evaluate(()=>window.musebench.getState());
async function showCode(){await page.getByRole('group',{name:'Choose workspace'}).waitFor({timeout:30000});await page.getByRole('button',{name:'Muse Code',exact:true}).click();}
async function until(fn){for(let i=0;i<70;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('Sidebar update timed out');}
async function drag(from,to){await from.dragTo(to);await until(async()=>!(await state()).busy);assert.equal((await state()).error,null);}
try{
 await page.setViewportSize({width:1280,height:960});
 await showCode();
 await page.locator('.project-row').first().waitFor();
 const side=page.locator('.sidebar'),alpha=side.getByRole('region',{name:'Alpha active chats',exact:true}),beta=side.getByRole('region',{name:'Beta active chats',exact:true}),pinned=side.getByRole('region',{name:'Pinned chats',exact:true}),recent=side.getByRole('region',{name:'Recents',exact:true});
 const projectButton=name=>side.locator('.project-row').getByRole('button',{name,exact:true});
 await drag(projectButton('Beta'),projectButton('Alpha'));
 await until(async()=>(await state()).sidebarOrder?.projects?.[0]===projects[1].id);
 assert.deepEqual(await side.locator('.project-row > button:nth-child(2)').allTextContents(),['Beta','Alpha']);pass('Dragging projects changes their order');
 await drag(alpha.getByRole('button',{name:'Alpha one',exact:true}),alpha.getByRole('button',{name:'Alpha two',exact:true}));
 await until(async()=>(await state()).sidebarOrder?.[`project:${projects[0].id}`]?.[0]===chats[0].id);
 assert.deepEqual(await alpha.locator('.chat-row').allTextContents(),['Alpha one','Alpha two']);pass('Chats can be reordered inside a project');
 await drag(alpha.getByRole('button',{name:'Alpha one',exact:true}),pinned.getByRole('button',{name:'Collapse Pinned chats',exact:true}));
 await pinned.getByRole('button',{name:'Alpha one',exact:true}).waitFor();
 await drag(beta.getByRole('button',{name:'Beta one',exact:true}),pinned.getByRole('button',{name:'Alpha one',exact:true}));
 await until(async()=>(await pinned.locator('.chat-row').allTextContents()).join(',')==='Beta one,Alpha one');pass('Dropping into an empty Pinned section pins chats; subsequent drops set their order');
 await drag(pinned.getByRole('button',{name:'Alpha one',exact:true}),recent.getByRole('button',{name:'Alpha two',exact:true}));
 await until(async()=>!(await state()).tasks.find(t=>t.id===chats[0].id).pinned);
 assert.equal(await pinned.getByRole('button',{name:'Alpha one',exact:true}).count(),0);pass('Moving a pinned chat to Recents unpins and positions it');
 await alpha.getByRole('button',{name:'Alpha one',exact:true}).focus();await page.keyboard.press('Alt+Shift+ArrowDown');
 await until(async()=>(await alpha.locator('.chat-row').allTextContents()).join(',')==='Alpha two,Alpha one');pass('Alt+Shift+arrow keys reorder focused chats');
 await drag(alpha.getByRole('button',{name:'Alpha one',exact:true}),projectButton('Beta'));
 await until(async()=>(await state()).tasks.find(t=>t.id===chats[0].id).projectId===projects[1].id);
 assert.equal(await alpha.getByRole('button',{name:'Alpha one',exact:true}).count(),0);await beta.getByRole('button',{name:'Alpha one',exact:true}).waitFor();pass('Dropping a chat on another project moves its association');
 await beta.getByRole('button',{name:'Alpha one',exact:true}).click();
 const composer=page.getByRole('textbox',{name:'Message Muse',exact:true});await composer.fill('Keep this draft while moving');
 await until(async()=>Object.values((await state()).drafts).some(d=>d.text==='Keep this draft while moving'));
 await drag(beta.getByRole('button',{name:'Alpha one',exact:true}),projectButton('Alpha'));
 await until(async()=>(await state()).activeProject.id===projects[0].id);
 assert.equal(await composer.inputValue(),'Keep this draft while moving');assert.equal((await state()).task.id,chats[0].id);pass('Moving the open chat keeps its draft and switches the active working project');
 const saved=(await state()).sidebarOrder;
 await page.reload();await showCode();await side.locator('.project-row').first().waitFor();assert.deepEqual((await state()).sidebarOrder,saved);assert.deepEqual(await side.locator('.project-row > button:nth-child(2)').allTextContents(),['Beta','Alpha']);pass('Saved order and membership survive renderer reload');
 await page.screenshot({path:path.join(root,'desktop.png')});
 await page.setViewportSize({width:430,height:820});await page.getByRole('button',{name:'Open navigation',exact:true}).first().click();await page.screenshot({path:path.join(root,'mobile.png')});
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(report.error);}
finally{await app.close();await writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(root);}
