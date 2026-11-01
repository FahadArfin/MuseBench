// Real Electron shell and provider adapter, isolated offline account fixture.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedDesktopEnvironment} from './isolated-desktop-environment.mjs';
import {waitForDesktopRenderer} from './electron-window.mjs';
await mkdir('artifacts/meta-chat-history',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/meta-chat-history/desktop-'));
let app,page;const report={checks:[],errors:[],providerRequests:0};
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
const until=async(fn,label)=>{const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out: '+label);};
const state=()=>page.evaluate(()=>window.musebench.personalState());
try{
 app=await electron.launch({args:['.','--host-resolver-rules=MAP * ~NOTFOUND'],env:isolatedDesktopEnvironment(path.join(output,'profile'))});
 await app.evaluate(async({session})=>{
  globalThis.metaHistoryFixture={account:'alice',requests:0};
  const provider=session.fromPartition('persist:musebench-personal-muse');
  await provider.protocol.handle('https',async request=>{
   const url=new URL(request.url);if(!['www.meta.ai','meta.ai'].includes(url.hostname)||request.method!=='GET')return new Response('Blocked',{status:451});
   if(url.pathname==='/conversation/slow'){globalThis.metaHistoryFixture.slowRequested=true;await new Promise(resolve=>{globalThis.metaHistoryFixture.releaseSlow=resolve;});}
   globalThis.metaHistoryFixture.requests++;const account=globalThis.metaHistoryFixture.account;
   const rows=account==='alice'?[{title:'Favorite project',path:'/conversation/favorite',pinned:true},...(globalThis.metaHistoryFixture.hideTea?[]:[{title:'Tea notes',path:'/conversation/tea'}]),{title:'Weekend ideas',path:null,clickPath:'/conversation/weekend'},...(globalThis.metaHistoryFixture.slowEnabled?[{title:'Slow conversation',path:'/conversation/slow'}]:[])]:[{title:'Bob conversation',path:'/conversation/bob'}];
   return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Offline Meta history</title><style>body{margin:0;background:#181818;color:#eee;font:16px system-ui}main{padding:35px}textarea{display:block;width:60%;height:100px}nav{width:200px}button,a{color:inherit}[role=dialog]{padding:20px}</style></head><body><nav data-slot="sidebar" aria-label="Sidebar"><a href="/" data-testid="new-chat-button">New chat</a><button id="search">Search</button><a href="/create">Media</a><a href="/artifacts">Artifacts</a><a href="/scheduled">Scheduled</a><a href="/vibes">Vibes</a><div data-testid="user-menu-button" data-slot="dropdown-menu-trigger"><span>${account}</span></div></nav><main><h1>Existing conversation</h1><textarea aria-label="Website draft"></textarea></main><script>
   const rows=${JSON.stringify(rows)};document.getElementById('search').onclick=()=>{if(document.querySelector('[role=dialog]'))return;const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<input placeholder="Search chats"><button aria-label="Close">Close</button>';dialog.querySelector('button').onclick=()=>dialog.remove();const render=()=>{for(const pinned of [true,false]){const group=document.createElement('div');group.setAttribute('role','group');group.setAttribute('aria-label',pinned?'Pinned':'Recent');for(const row of rows.filter(row=>!!row.pinned===pinned)){const option=document.createElement(row.path?'a':'div');option.setAttribute('role','option');if(row.path)option.href=row.path;option.innerHTML='<span>'+row.title+'</span><time> Oct 31</time>';option.onclick=event=>{event.preventDefault();history.pushState({},'',row.path??row.clickPath);document.querySelector('main h1').textContent=row.title;dialog.remove();};group.append(option);}dialog.append(group);}};setTimeout(render,350);document.body.append(dialog);};
   const fixtureNav=document.querySelector('nav');const mountNav=()=>{if(innerWidth===0||innerHeight===0)fixtureNav.remove();else if(!fixtureNav.isConnected)document.body.prepend(fixtureNav);};addEventListener('resize',mountNav);mountNav();</script></body></html>`,{headers:{'content-type':'text/html'}});
  });
 });
 page=await waitForDesktopRenderer(app);page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).setContentSize(1024,768));
 await page.setViewportSize({width:1024,height:768});
 await page.evaluate(()=>window.musebench.personal({type:'navigate',destination:'chat'}));
 let chatId;
 await until(async()=>{chatId=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.find(view=>view.webContents&&view.webContents.getURL().startsWith('https://www.meta.ai/'))?.webContents.id);return !!chatId;},'native chat');
 await app.evaluate(async({webContents},id)=>{await webContents.fromId(id).loadURL('https://www.meta.ai/');},chatId);
 await until(async()=>!!(await state()).profile?.accountId,'confirmed Meta account');
 const nav=page.getByRole('navigation',{name:'Meta AI navigation',exact:true});await nav.getByRole('button',{name:'Chat',exact:true}).click();
 await page.getByRole('button',{name:'Expand Meta Recents',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Expand Meta Pinned chats',exact:true}).getAttribute('aria-expanded'),'false');
 assert.equal((await state()).metaChats.status,'idle');
 const before=await app.evaluate(({BrowserWindow,webContents},id)=>{webContents.fromId(id).executeJavaScript("document.querySelector('textarea').value='Keep my unsent draft'");return{url:webContents.fromId(id).getURL(),views:BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.length};},chatId);
 pass('Both sections start collapsed and do not create a background history reader');
 await page.getByRole('button',{name:'Expand Meta Recents',exact:true}).click();
 await until(async()=>(await state()).metaChats.status==='ready','real adapter reads rendered history');
 assert.deepEqual((await state()).metaChats.items.map(row=>row.title),['Favorite project','Tea notes','Weekend ideas']);
 assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript("document.querySelector('textarea').value"),chatId),'Keep my unsent draft');
 assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).getURL(),chatId),before.url);
 await until(()=>app.evaluate(({BrowserWindow},count)=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.length===count,before.views),'temporary reader disposed');
 pass('Loading recents reads provider titles, preserves the active website draft and disposes its temporary view');
 await page.getByRole('button',{name:'Expand Meta Pinned chats',exact:true}).click();
 await until(async()=>(await state()).metaChats.status==='ready','pinned refresh');
 const pinned=page.getByRole('region',{name:'Meta Pinned chats',exact:true});
 await pinned.getByRole('button',{name:'Favorite project',exact:true}).click();
 await until(async()=>!!(await state()).metaChats.selectedId,'selected saved chat');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.find(view=>view.webContents&&view.getVisible())?.webContents.getURL()),'https://www.meta.ai/conversation/favorite');
 assert.equal(await page.locator('.meta-chat-history [aria-current=page]').count(),1);
 const shownViewport=await app.evaluate(async({BrowserWindow})=>{const view=BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.find(view=>view.webContents&&view.getVisible());return{bounds:view.getBounds().width,width:await view.webContents.executeJavaScript('innerWidth')};});
 assert(Math.abs(shownViewport.bounds-shownViewport.width)<=1,'A visible chat must use its actual native bounds after removing the temporary viewport');

 await page.screenshot({path:path.join(output,'sidebar.png')});
 pass('Provider pins are mirrored and a sidebar click opens the bound conversation with only one selected occurrence');
 const recents=page.getByRole('region',{name:'Meta Recents',exact:true});
 const favoriteId=await app.evaluate(async({BrowserWindow})=>{const view=BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.find(view=>view.webContents&&view.getVisible());await view.webContents.executeJavaScript("document.querySelector('textarea').value='Saved favorite draft'");return view.webContents.id;});
 await recents.getByRole('button',{name:'Weekend ideas',exact:true}).click();
 await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.some(view=>view.webContents&&view.getVisible()&&view.webContents.getURL()==='https://www.meta.ai/conversation/weekend')),'title-only conversation opens after a linked chat');
 await pinned.getByRole('button',{name:'Favorite project',exact:true}).click();
 await until(()=>app.evaluate(({webContents},id)=>webContents.fromId(id)&&webContents.fromId(id).getURL()==='https://www.meta.ai/conversation/favorite',favoriteId),'return to retained conversation');
 assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript("document.querySelector('textarea').value"),favoriteId),'Saved favorite draft');
 pass('Mixed link and title-only chats open correctly and returning to a saved chat preserves its own draft');

 await recents.getByRole('button',{name:'Pin Tea notes in MuseBench',exact:true}).click();
 await until(async()=>(await state()).metaChats.items.find(row=>row.title==='Tea notes')?.localPinned,'local pin saved');
 await pinned.getByRole('button',{name:'Tea notes',exact:true}).waitFor();
 const pinFile=await app.evaluate(({app})=>app.getPath('userData')+'\\meta-chat-pins.json');const pinData=JSON.parse(await readFile(pinFile,'utf8'));
 assert.equal(Object.values(pinData.accounts)[0][0].title,'Tea notes');
 assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript("document.querySelector('textarea').value"),chatId),'Keep my unsent draft');
 pass('Local pin controls persist a chat under its confirmed account without disturbing the original draft');
 await pinned.getByRole('button',{name:'Unpin Tea notes in MuseBench',exact:true}).click();
 await until(async()=>!(await state()).metaChats.items.find(row=>row.title==='Tea notes')?.localPinned,'local unpin saved');
 await pinned.getByRole('button',{name:'Tea notes',exact:true}).waitFor({state:'detached'});
 await recents.getByRole('button',{name:'Pin Tea notes in MuseBench',exact:true}).click();
 await until(async()=>(await state()).metaChats.items.find(row=>row.title==='Tea notes')?.localPinned,'pin restored for isolation check');
 await page.screenshot({path:path.join(output,'sidebar.png')});
 pass('Unpin removes only the local pin while keeping the recent conversation available');
 await app.evaluate(()=>{globalThis.metaHistoryFixture.hideTea=true;});
 await page.evaluate(()=>window.musebench.personal({type:'metaChats',action:'refresh'}));
 assert.equal((await state()).metaChats.items.find(row=>row.title==='Tea notes')?.recent,false);
 await recents.getByRole('button',{name:'Tea notes',exact:true}).waitFor({state:'detached'});
 await pinned.getByRole('button',{name:'Tea notes',exact:true}).click();
 await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.some(view=>view.webContents&&view.getVisible()&&view.webContents.getURL()==='https://www.meta.ai/conversation/tea')),'saved pin opens after leaving recents');
 pass('Saved pins remain visible and open their validated conversation after leaving provider Recents');

 await app.evaluate(()=>{globalThis.metaHistoryFixture.slowEnabled=true;});
 await page.evaluate(()=>window.musebench.personal({type:'metaChats',action:'refresh'}));
 const slow=(await state()).metaChats.items.find(row=>row.title==='Slow conversation');
 const countViews=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).contentView.children.length);
 const baselineViews=await countViews();
 const pendingOpen=page.evaluate(id=>window.musebench.personal({type:'metaChats',action:'open',id}),slow.id);
 await until(()=>app.evaluate(()=>globalThis.metaHistoryFixture.slowRequested),'delayed conversation request');
 await page.evaluate(()=>window.musebench.personal({type:'navigate',destination:'chat'}));
 await app.evaluate(()=>globalThis.metaHistoryFixture.releaseSlow());await pendingOpen;
 assert.equal(await countViews(),baselineViews);
 pass('Canceling an unopened conversation disposes its unused native view');
 await app.evaluate(()=>{globalThis.metaHistoryFixture.account='bob';});
 await page.evaluate(()=>window.musebench.personal({type:'metaChats',action:'refresh'}));
 assert.equal((await state()).metaChats.status,'unavailable');
 assert.equal((await state()).metaChats.items.some(row=>row.title==='Bob conversation'),false);
 pass('A fresh reader with a different account cannot attribute its history to the retained account');
 const oldId=(await state()).metaChats.items[0].id;
 await app.evaluate(async({webContents},id)=>{globalThis.metaHistoryFixture.account='bob';await webContents.fromId(id).loadURL('https://www.meta.ai/');},chatId);
 await until(async()=>(await state()).profile?.handle==='bob','account switch');
 assert.equal((await state()).metaChats.items.length,0);
 await assert.rejects(page.evaluate(id=>window.musebench.personal({type:'metaChats',action:'open',id}),oldId));
 pass('Account changes clear prior history immediately and stale account selections are refused');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await app?.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(output);}
