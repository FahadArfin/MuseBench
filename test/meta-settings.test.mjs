import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import * as navigation from '../electron/meta-navigation.mjs';

test('Meta settings accepts only read-only General and Apps shortcuts on official documents',async()=>{
 assert.equal(typeof navigation.runMetaSettings,'function');
 for(const section of ['upgrade','connect','logout',null,{}])assert.equal(await navigation.runMetaSettings({executeJavaScript(){assert.fail('unsupported action');}},section),false);
 for(const url of ['https://muse.ai/','https://auth.meta.ai/','https://www.meta.ai.evil.test/','https://user:secret@www.meta.ai/','https://www.meta.ai:444/','http://www.meta.ai/']){
  assert.equal(await navigation.runMetaSettings({isDestroyed:()=>false,getURL:()=>url,executeJavaScript(){assert.fail('untrusted document');}},'apps'),false);
 }
 assert.equal(await navigation.runMetaSettings({isDestroyed:()=>true,getURL(){assert.fail('destroyed');}},'general'),false);
});

test('Meta settings navigates official menus without clicking upgrade or app consent controls', {timeout:30000},async t=>{
 assert.equal(typeof navigation.runMetaSettings,'function');
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();
 const html=`<!doctype html><body>
 <button onclick="window.unrelated++">Settings</button><button onclick="window.unrelated++">Apps</button>
 <nav data-slot="sidebar" aria-label="Sidebar"><button data-testid="new-chat-button">New chat</button><button data-testid="user-menu-button" data-slot="dropdown-menu-trigger">Profile</button></nav>
 <div role="menu" hidden><button role="menuitem" id="settings">Settings</button><button role="menuitem" onclick="window.forbidden++">Log out</button></div>
 <script>
 window.forbidden=0;window.unrelated=0;window.menuClicks=0;window.settingsClicks=0;
 document.querySelector('[data-testid="user-menu-button"]').onclick=()=>{window.menuClicks++;document.querySelector('[role="menu"]').hidden=false;};
 document.querySelector('#settings').onclick=()=>{window.settingsClicks++;document.querySelector('[role="menu"]').hidden=true;
 const dialog=document.createElement('section');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Settings');
 dialog.innerHTML='<h2>Settings</h2><nav><button>General</button><button>Apps</button></nav><article><h2>General</h2><button onclick="window.forbidden++">Upgrade</button></article>';
 document.body.append(dialog);
 for(const tab of dialog.querySelectorAll('nav button'))tab.onclick=()=>{dialog.querySelector('article').innerHTML='<h2>'+tab.textContent+'</h2><button onclick="window.forbidden++">'+(tab.textContent==='Apps'?'Connect':'Upgrade')+'</button>';};
 };
 </script>`;
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://www.meta.ai/');
 const contents={getURL:()=>page.url(),isDestroyed:()=>false,executeJavaScript:script=>page.evaluate(script)};
 assert.equal(await navigation.runMetaSettings(contents,'apps'),true);
 assert.equal(await page.locator('article h2').textContent(),'Apps');
 assert.equal(await navigation.runMetaSettings(contents,'general'),true);
 assert.equal(await page.locator('article h2').textContent(),'General');
 assert.deepEqual(await page.evaluate(()=>({forbidden,unrelated,menuClicks,settingsClicks})),{forbidden:0,unrelated:0,menuClicks:1,settingsClicks:1});
 await page.locator('[role="dialog"] nav button').evaluateAll(buttons=>buttons.forEach(b=>b.onclick=null));
 await page.locator('article').evaluate(article=>article.innerHTML='<div>General</div><a href="https://accountscenter.meta.com/">Accounts Center</a>');
 assert.equal(await navigation.runMetaSettings(contents,'general'),true,'Live Meta renders General as plain text with its Accounts Center link');
 await page.locator('article').evaluate(article=>article.innerHTML='<div>Apps</div><h3>Unconnected apps</h3><button onclick="window.forbidden++">Google Drive Connect</button>');
 assert.equal(await navigation.runMetaSettings(contents,'apps'),true,'Live Meta renders Apps as plain text with a connection section heading');
 // A heading in a hidden template cannot masquerade as successful navigation.
 await page.locator('article').evaluate(e=>e.hidden=true);
 await page.locator('[role="dialog"] nav button').evaluateAll(buttons=>buttons.forEach(b=>b.onclick=null));
 assert.equal(await navigation.runMetaSettings(contents,'apps'),false);
 assert.equal(await page.evaluate(()=>window.forbidden),0);
 await page.evaluate(()=>{
  document.querySelector('[role="dialog"]').remove();
  const menu=document.querySelector('[role="menu"]');menu.hidden=true;
  const apps=document.createElement('button');apps.setAttribute('role','menuitem');apps.textContent='Apps';menu.prepend(apps);
  apps.onclick=()=>{menu.hidden=true;const dialog=document.createElement('section');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Apps');dialog.innerHTML='<h2>Unconnected apps</h2><button onclick="window.forbidden++">Connect</button>';document.body.append(dialog);};
 });
 assert.equal(await navigation.runMetaSettings(contents,'apps'),true,'The observed direct Apps menu item opens its visible dialog');
 assert.deepEqual(await page.evaluate(()=>({forbidden,settingsClicks})),{forbidden:0,settingsClicks:1});
});

test('newer Meta settings intent cancels stale hydrated tabs, including navigation and caller abort', {timeout:30000},async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><section role="dialog" aria-label="Settings"><h2>Settings</h2><nav><button id="general">General</button><button id="apps">Apps</button></nav><article><h2>Apps</h2></article></section>'}));await page.goto('https://www.meta.ai/');
 const {EventEmitter}=await import('node:events');const contents=new EventEmitter();Object.assign(contents,{getURL:()=>page.url(),isDestroyed:()=>false,executeJavaScript:script=>page.evaluate(script)});
 const reset=()=>page.evaluate(()=>{document.querySelector('article').innerHTML='<h2>Apps</h2>';const general=document.querySelector('#general');general.onclick=null;setTimeout(()=>general.onclick=()=>document.querySelector('article').innerHTML='<h2>General</h2>',500);document.querySelector('#apps').onclick=()=>document.querySelector('article').innerHTML='<h2>Apps</h2>';});
 await reset();const earlier=navigation.runMetaSettings(contents,'general');await new Promise(resolve=>setTimeout(resolve,150));assert.equal(await navigation.runMetaSettings(contents,'apps'),true);assert.equal(await earlier,false,'Superseded navigation must not report success');await page.waitForTimeout(900);assert.equal(await page.locator('article h2').textContent(),'Apps');
 await reset();const controller=new AbortController();const pending=navigation.runMetaSettings(contents,'general',{signal:controller.signal});await page.waitForTimeout(150);controller.abort();assert.equal(await pending,false);await page.waitForTimeout(900);assert.equal(await page.locator('article h2').textContent(),'Apps','An aborted request cannot click a late hydrated tab');
 await reset();const leaving=navigation.runMetaSettings(contents,'general');await page.waitForTimeout(150);contents.emit('did-start-navigation',{},'https://www.meta.ai/create',false,true);assert.equal(await leaving,false);await page.waitForTimeout(900);assert.equal(await page.locator('article h2').textContent(),'Apps');
 assert.equal(contents.listenerCount('did-start-navigation'),0);assert.equal(contents.listenerCount('destroyed'),0);
 const aborted=new AbortController();aborted.abort();assert.equal(await navigation.runMetaSettings({isDestroyed(){assert.fail('Already aborted request must not inspect contents');}},'apps',{signal:aborted.signal}),false);
});

test('aborted or timed out queued settings scripts cannot resume clicks later', {timeout:20000},async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><section role="dialog" aria-label="Settings"><h2>Settings</h2><button onclick="window.clicks++">General</button><article><h2>Apps</h2></article></section><script>window.clicks=0</script>'}));await page.goto('https://www.meta.ai/');
 const queued=delay=>{let execution;return {getURL:()=>page.url(),isDestroyed:()=>false,executeJavaScript(script,userGesture){if(!userGesture)return page.evaluate(script);return execution=new Promise(resolve=>setTimeout(resolve,delay)).then(()=>page.evaluate(script));},finished:()=>execution};};
 const early=queued(300),controller=new AbortController();const aborted=navigation.runMetaSettings(early,'general',{signal:controller.signal});await page.waitForTimeout(50);controller.abort();assert.equal(await aborted,false);await early.finished();assert.equal(await page.evaluate(()=>window.clicks),0,'Cancellation tombstone prevents a still-queued script from starting');
 const late=queued(5500),started=Date.now();assert.equal(await navigation.runMetaSettings(late,'general'),false);assert(Date.now()-started<5300,'Outer deadline settles without waiting for unresponsive renderer');await late.finished();assert.equal(await page.evaluate(()=>window.clicks),0,'Expired deadline and tombstone prevent delayed execution after outer timeout');
});
