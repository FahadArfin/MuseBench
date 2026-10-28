import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Exercise the real account reader, lifecycle, IPC and renderer with fictional
// accounts in a fresh app profile. Chromium DNS is disabled before launch, then
// provider HTTP(S) requests are fulfilled locally; no real session is accessed.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const variant=process.env.MUSEBENCH_EXECUTABLE?'packaged':'source';
await mkdir(path.join(root,'artifacts/profile-account-desktop'),{recursive:true});
const output=await mkdtemp(path.join(root,'artifacts/profile-account-desktop',`${variant}-`));
const dataDir=path.join(output,'data'),projectsDir=path.join(output,'projects');
await mkdir(dataDir);await mkdir(projectsDir);
const env={...process.env,MUSEBENCH_DATA_DIR:dataDir,MUSEBENCH_PROJECTS_DIR:projectsDir};
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;
const report={variant,dataDir,checks:[],errors:[],modelRequests:0};
const alice={handle:'alice_rivera',name:'Alice Rivera'},bob={handle:'bob_rivera',name:'Bob Rivera'};
let app,page,chatId;
const pass=message=>{report.checks.push(message);console.log(`PASS ${message}`);};
async function until(check,label,timeout=20000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,70));}
  throw Error(`Timed out: ${label}`);
}
const state=()=>page.evaluate(()=>window.musebench.personalState());
const remote=script=>app.evaluate(({webContents},{id,script})=>webContents.fromId(id).executeJavaScript(script),{id:chatId,script});
async function navigate(url){
  await app.evaluate(async({webContents},{id,url})=>{
    try{await webContents.fromId(id).loadURL(url);}catch(error){if(error.code!=='ERR_ABORTED'&&error.errno!==-3)throw error;}
  },{id:chatId,url});
  await until(()=>app.evaluate(async({webContents},{id,url})=>{
    const contents=webContents.fromId(id);
    return contents.getURL()===url&&!contents.isLoadingMainFrame()&&await contents.executeJavaScript(`document.title==='Offline profile account fixture'`);
  },{id:chatId,url}),`fixture navigation settles at ${url}`);
}
const setAccount=account=>app.evaluate((_electron,account)=>{globalThis.__profileAccountFixture.account=account;},account);
const openProfile=async()=>{
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();
  await page.getByRole('menuitem',{name:/View profile for/}).click();
  await page.getByRole('main',{name:'User profile'}).waitFor();
};
const sidebarName=name=>page.locator('.sidebar:not([hidden]) .profile-label strong').getByText(name,{exact:true}).waitFor();
async function login(account){
  await setAccount(null);await navigate('https://auth.meta.com/login');
  await until(async()=>!(await state()).profile,'authentication clears prior profile');
  await setAccount(account);await navigate('https://www.meta.ai/');
}

try{
  const args=[...(process.env.MUSEBENCH_EXECUTABLE?[]:['.']),'--host-resolver-rules=MAP * ~NOTFOUND'];
  app=await electron.launch({cwd:root,args,...(process.env.MUSEBENCH_EXECUTABLE?{executablePath:process.env.MUSEBENCH_EXECUTABLE}:{}),env,timeout:30000});
  await app.evaluate(async({app,BrowserWindow,session},expectedDataDir)=>{
    if(app.getPath('userData')!==expectedDataDir)throw Error('Smoke must use its isolated app profile.');
    globalThis.__profileAccountFixture={account:null,requests:[],windows:[]};
    const fixture=globalThis.__profileAccountFixture;
    app.on('browser-window-created',(_event,window)=>{
      if(!window.getParentWindow())return;
      const preferences=window.webContents.getLastWebPreferences();
      const row={id:window.webContents.id,visible:window.isVisible(),everShown:false,closed:false,urls:[],sameSession:window.webContents.session===session.fromPartition('persist:musebench-personal-muse'),preferences:{nodeIntegration:preferences.nodeIntegration,contextIsolation:preferences.contextIsolation,sandbox:preferences.sandbox,webSecurity:preferences.webSecurity,webviewTag:preferences.webviewTag,preload:preferences.preload??null}};
      fixture.windows.push(row);
      window.on('show',()=>{row.everShown=true;});window.on('closed',()=>{row.closed=true;});
      window.webContents.on('did-navigate',(_event,url)=>{row.urls.push(url);});
    });
    const render=(account,url)=>{
      const own=url.pathname===`/@${account?.handle}`;
      const identity=account?`<nav data-slot="sidebar" aria-label="Sidebar"><div data-testid="user-menu-button" data-slot="dropdown-menu-trigger"><span>${account.handle}</span></div></nav>`:'<button>Log in</button>';
      const content=own?`<main><section><div><div><h2>${account.handle}</h2></div><span>${account.name}</span></div><button>Edit profile</button></section></main>`:'<main><h1>Offline account fixture</h1><textarea aria-label="Website draft"></textarea></main>';
      return `<!doctype html><html><head><meta charset="utf-8"><title>Offline profile account fixture</title><style>body{font:16px system-ui;background:#181818;color:#eee}main{padding:24px}textarea{width:400px;height:100px}nav{display:block}</style></head><body>${identity}${content}</body></html>`;
    };
    for(const partition of ['persist:musebench-personal-muse','persist:musebench-personal-chat']){
      const provider=session.fromPartition(partition);
      for(const scheme of ['https','http'])await provider.protocol.handle(scheme,async request=>{
        const url=new URL(request.url);fixture.requests.push({partition,origin:url.origin,path:url.pathname,method:request.method});
        if(request.method!=='GET'||!['www.meta.ai','meta.ai','auth.meta.com','muse.ai'].includes(url.hostname))return new Response('Offline fixture refuses this request',{status:451});
        if(url.pathname.startsWith('/@'))await new Promise(resolve=>setTimeout(resolve,650));
        const account=['www.meta.ai','meta.ai'].includes(url.hostname)?fixture.account:null;
        return new Response(render(account,url),{headers:{'content-type':'text/html; charset=utf-8'}});
      });
    }
    // An initial offline attempt may predate protocol registration. Its retry
    // and all subsequent navigation use the fixture sessions above.
    for(const window of BrowserWindow.getAllWindows())if(window.getParentWindow())window.webContents.stop();
  },dataDir);
  page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.waitForFunction(()=>Boolean(window.musebench));
  await page.getByRole('group',{name:'Choose workspace',exact:true}).waitFor();
  await page.evaluate(()=>window.musebench.personal({type:'navigate',destination:'chat'}));
  chatId=await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow())?.contentView.children.find(view=>view.webContents&&/^https:\/\/(www\.)?meta\.ai\//.test(view.webContents.getURL()))?.webContents.id),'native Meta chat exists');
  await navigate('https://www.meta.ai/');await until(async()=>!(await state()).profile,'signed-out profile is empty');
  await login(alice);
  await remote(`document.querySelector('textarea').value='Unsent Alice chat draft';history.replaceState({},'', '/conversation/offline-draft');`);
  const before=await app.evaluate(({webContents},id)=>({id,url:webContents.fromId(id).getURL()}),chatId);
  const official=await until(async()=>{const value=(await state()).profile;return value?.displayName==='Alice Rivera'?value:null;},'full official Alice name reaches personal state');
  await sidebarName('Alice Rivera');
  assert.equal(official.accountName,'Alice Rivera');assert.equal(official.handle,'alice_rivera');
  assert.match(official.accountId,/^meta:/);
  assert.equal(await remote(`document.querySelector('textarea').value`),'Unsent Alice chat draft');
  assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).getURL(),chatId),before.url);
  pass('Real Meta account discovery publishes Alice Rivera through IPC to the sidebar without navigating the active chat or losing its draft');

  await openProfile();await page.getByRole('heading',{name:'Alice Rivera',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Edit profile',exact:true});
  await dialog.getByLabel('Display name',{exact:true}).fill('Alice local name');
  await dialog.getByPlaceholder('What are you building?',{exact:true}).fill('Only Alice should see this bio');
  await dialog.getByRole('button',{name:'Rose mascot',exact:true}).click();await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await sidebarName('Alice local name');await page.reload();await openProfile();
  await page.getByRole('heading',{name:'Alice local name',exact:true}).waitFor();await page.getByText('Only Alice should see this bio',{exact:true}).waitFor();
  assert.equal((await state()).profile.displayName,'Alice Rivera');
  pass('Profile editing changes the local sidebar name, bio and avatar; the custom name survives renderer reload while the provider name stays intact');

  await page.getByRole('button',{name:'Edit profile',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit profile',exact:true});
  await dialog.getByLabel('Display name',{exact:true}).fill('Unsaved Alice draft');
  await setAccount(null);await navigate('https://auth.meta.com/login');
  await until(async()=>!(await state()).profile,'logout clears backend profile');await sidebarName('Your account');
  await page.getByRole('heading',{name:'Your account',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Edit profile',exact:true}).count(),0);
  assert.equal(await page.getByText('Only Alice should see this bio',{exact:true}).count(),0);
  pass('An actual authentication navigation clears the profile and closes the prior account’s unsaved editor');

  await setAccount(bob);await navigate('https://www.meta.ai/');
  const next=await until(async()=>{const value=(await state()).profile;return value?.displayName==='Bob Rivera'?value:null;},'Bob full account name reaches personal state');
  await sidebarName('Bob Rivera');await page.getByRole('heading',{name:'Bob Rivera',exact:true}).waitFor();
  assert.notEqual(next.accountId,official.accountId);assert.equal(await page.getByText('Only Alice should see this bio',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit profile',exact:true});
  assert.equal(await dialog.getByLabel('Display name',{exact:true}).inputValue(),'Bob Rivera');
  assert.equal(await dialog.getByPlaceholder('What are you building?',{exact:true}).inputValue(),'');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  pass('A different authenticated account receives Bob Rivera as its default without Alice’s custom name or bio');

  await login(alice);await until(async()=>(await state()).profile?.displayName==='Alice Rivera','Alice account is restored');
  await sidebarName('Alice local name');await page.getByRole('heading',{name:'Alice local name',exact:true}).waitFor();
  await page.getByText('Only Alice should see this bio',{exact:true}).waitFor();
  pass('Returning to Alice restores her own saved display name and profile fields');

  await until(()=>app.evaluate(()=>globalThis.__profileAccountFixture.windows.filter(window=>window.urls.some(url=>url.includes('/@'))).every(window=>window.closed)),'all own-profile lookup windows close');
  const evidence=await app.evaluate(()=>globalThis.__profileAccountFixture);
  const lookups=evidence.windows.filter(window=>window.urls.some(url=>url.includes('/@')));
  assert(lookups.some(window=>window.urls.includes('https://www.meta.ai/@alice_rivera')));
  assert(lookups.some(window=>window.urls.includes('https://www.meta.ai/@bob_rivera')));
  for(const window of lookups){
    assert.equal(window.visible,false);assert.equal(window.everShown,false);assert.equal(window.closed,true);assert.equal(window.sameSession,true);
    assert.deepEqual(window.preferences,{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,preload:null});
  }
  assert(evidence.requests.every(request=>request.method==='GET'));
  report.lookupWindows=lookups;report.fixtureRequests=evidence.requests;
  pass('Own-profile lookups stay hidden, use the shared sandboxed session without a preload, and close after discovery; fixture requests are GET only');
  assert.deepEqual(report.errors,[]);await page.screenshot({path:path.join(output,'profile.png')});report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(error);process.exitCode=1;report.failureEvidence=await app?.evaluate(()=>globalThis.__profileAccountFixture).catch(()=>null);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await app?.close().catch(()=>{});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);}
