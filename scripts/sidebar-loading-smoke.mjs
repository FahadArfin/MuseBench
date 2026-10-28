import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Fictional official-host HTML and an isolated profile. No credentials or
// normal account data are opened; external DNS is disabled for this process.
const root=process.cwd(),variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir('artifacts/sidebar-loading',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/sidebar-loading',`${variant}-`));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,content:'fictional offline fixture',modelRequests:0,checks:[],errors:[]};
let app,page;
const record=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
async function until(check,label,timeout=16000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,75));}throw Error(`Timed out: ${label}`);}
const state=()=>page.evaluate(()=>window.musebench.personalState());
try{
  app=await electron.launch({cwd:root,args:[...(process.env.MUSEBENCH_EXECUTABLE?[]:['.']),'--host-rules=MAP * ~NOTFOUND'],...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env,timeout:30000});
  await until(()=>{page=app.windows().find(candidate=>/\/dist\/index\.html(?:[?#]|$)/.test(candidate.url()));return Boolean(page);},'local main window');
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.waitForFunction(()=>Boolean(window.musebench));
  await app.evaluate(async({session})=>{
    globalThis.__sidebarFixturePhase='signed-out';
    await session.fromPartition('persist:musebench-personal-muse').protocol.handle('https',request=>{
      const url=new URL(request.url);
      if(!['muse.ai','www.meta.ai','meta.ai'].includes(url.hostname))return new Response('Offline',{status:451});
      if(url.hostname!=='muse.ai')return new Response('<h1>Fictional Meta chat</h1>',{headers:{'content-type':'text/html'}});
      const section=url.pathname==='/ideas'?'ideas':url.pathname==='/goals'?'goals':'chats';
      const body=globalThis.__sidebarFixturePhase==='signed-out'?'<h1>Sign in to Muse</h1><button>Continue with Facebook</button>':`<nav data-hatch-dock></nav><div data-hatch-avatar-host><span data-hatch-avatar-accessory="status-pill" aria-label="jarvis"></span></div>${section==='chats'?'<main><h1>Main conversation</h1><textarea aria-label="Muse message"></textarea></main>':`<main><header><h1>${section==='ideas'?'Ideas':'Goals'}</h1></header><section><button ${section==='ideas'?'data-pel-click="idea_group_row_click"':''}><h3>${section==='ideas'?'Plan a calm workspace':'Finish my first project'}</h3></button></section></main>`}`;
      return new Response(`<!doctype html><html><body>${body}</body></html>`,{headers:{'content-type':'text/html'}});
    });
  });
  await page.locator('.muse-agent-shortcut').click();
  for(const label of ['Ideas','Goals'])await page.getByRole('button',{name:`Expand ${label}`,exact:true}).click();
  await until(async()=>{const current=await state();return ['chats','ideas','goals'].every(section=>current.library[section].status==='signed-out');},'signed-out groups');
  for(const label of ['Ideas','Goals']){
    const group=page.getByRole('group',{name:label,exact:true});
    assert.match(await group.innerText(),/Sign in to Muse/);
    assert.equal(await group.getByRole('button',{name:'Open Muse',exact:true}).count(),1);
    assert.equal(await group.locator('.personal-collection-loading').count(),0);
    assert.doesNotMatch(await group.innerText(),/Loading/);
  }
  await page.screenshot({path:path.join(output,'signed-out.png')});
  record('Signed-out Ideas and Goals show an actionable sign-in state with no false loading spinner');
  await app.evaluate(({webContents})=>{
    globalThis.__sidebarFixturePhase='ready-without-side-chats';
    webContents.getAllWebContents().find(contents=>contents.getURL()==='https://muse.ai/')?.reload();
  });
  await until(async()=>{const current=await state();return current.agentProfile?.name==='jarvis'&&['ideas','goals'].every(section=>current.library[section].status==='ready'&&current.library[section].items.length===1);},'collections independent of side-chat switcher');
  assert.equal((await state()).library.chats.items.length,0);
  assert.notEqual((await state()).library.chats.status,'signed-out');
  assert.doesNotMatch(await page.getByRole('group',{name:'Chat',exact:true}).innerText(),/Sign in to Muse/,'a verified signed-in root must clear the previous sign-in requirement');
  await page.getByRole('group',{name:'Ideas',exact:true}).getByRole('button',{name:'Plan a calm workspace',exact:true}).waitFor();
  await page.getByRole('group',{name:'Goals',exact:true}).getByRole('button',{name:'Finish my first project',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'ready-independent-collections.png')});
  record('Agent name, Ideas and Goals recover after sign-in even when the provider has no Side chats menu');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;console.error(error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{if(app)await app.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${path.join(output,'report.json')}`);}
