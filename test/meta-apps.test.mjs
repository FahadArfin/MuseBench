import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {EventEmitter} from 'node:events';
import {validatePersonalCommand} from '../electron/personal-policy.mjs';
const adapter=await import('../electron/meta-apps.mjs').catch(()=>({}));

test('Meta apps policy accepts only known navigation and provider IDs',()=>{
 assert.deepEqual(validatePersonalCommand({type:'metaApps',action:'refresh'}),{type:'metaApps',action:'refresh'});
 assert.deepEqual(validatePersonalCommand({type:'metaApps',action:'connect',appId:'gmail'}),{type:'metaApps',action:'connect',appId:'gmail'});
 for(const command of [{action:'disconnect',appId:'gmail'},{action:'connect',appId:'unknown'},{action:'connect'},{action:'refresh',appId:'gmail'},{action:'connect',appId:'gmail',url:'https://evil.test'}])assert.throws(()=>validatePersonalCommand({type:'metaApps',...command}));
});

test('app row ownership never binds an unknown sibling provider and waits for hydrated app rows',{timeout:15000},async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<section role="dialog" aria-label="Settings"><h2>Apps</h2><section id="group"><div><span>Gmail</span><span>Connected</span></div><div><span>OneDrive</span><button onclick="window.wrong++">Connect</button></div></section><div><span>Google Drive</span><button>Connect</button></div></section><script>window.wrong=0</script>`}));await page.goto('https://www.meta.ai/');
 const contents=new EventEmitter();Object.assign(contents,{getURL:()=>page.url(),isDestroyed:()=>false,executeJavaScript:script=>page.evaluate(script)});
 assert.equal((await adapter.readMetaApps(contents)).items.find(x=>x.id==='gmail').status,'unknown');
 assert.equal(await adapter.connectMetaApp(contents,'gmail'),false);assert.equal(await page.evaluate(()=>window.wrong),0);
 await page.locator('[role="dialog"]').evaluate(dialog=>{dialog.innerHTML='<h2>Apps</h2>';setTimeout(()=>{dialog.innerHTML+='<div><span>Gmail</span><button>Connect</button></div>';},400);});
 const result=await adapter.readMetaApps(contents);assert.equal(result.status,'ready');assert.equal(result.items.find(x=>x.id==='gmail').status,'unconnected');
 await page.locator('[role="dialog"]').evaluate(dialog=>dialog.innerHTML='<h2>Apps</h2>');
 assert.equal((await adapter.readMetaApps(contents)).status,'unavailable','A heading alone is not a successful app inventory');
});

test('Meta apps reads exact visible rows and connects only the selected unconnected app',{timeout:30000},async t=>{
 assert.equal(typeof adapter.readMetaApps,'function');
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<section role="dialog" aria-label="Settings"><h2>Apps</h2><h3>Unconnected apps</h3><div id="drive"><span>Google Drive</span><button onclick="window.clicked.push('drive')">Connect</button></div><div><span>Gmail</span><button onclick="window.clicked.push('gmail')">Connect</button></div><div><span>Google Calendar</span><button onclick="window.clicked.push('forbidden')">Disconnect</button></div><div hidden><span>Outlook Email</span><button>Connect</button></div></section><button onclick="window.clicked.push('forbidden')">Connect</button><script>window.clicked=[]</script>`}));await page.goto('https://www.meta.ai/');
 const contents=new EventEmitter();Object.assign(contents,{getURL:()=>page.url(),isDestroyed:()=>false,executeJavaScript:script=>page.evaluate(script)});
 const read=await adapter.readMetaApps(contents);assert.equal(read.status,'ready');assert.equal(read.items.find(x=>x.id==='gmail').status,'unconnected');assert.equal(read.items.find(x=>x.id==='google-calendar').status,'connected');assert.equal(read.items.find(x=>x.id==='outlook-email').status,'unknown');
 assert.equal(await adapter.connectMetaApp(contents,'gmail'),true);assert.deepEqual(await page.evaluate(()=>window.clicked),['gmail']);
 assert.equal(await adapter.connectMetaApp(contents,'google-calendar'),false);assert.equal(await adapter.connectMetaApp(contents,'unknown'),false);
 await page.locator('#drive').evaluate(row=>row.after(row.cloneNode(true)));assert.equal((await adapter.readMetaApps(contents)).items.find(x=>x.id==='google-drive').status,'unknown');assert.equal(await adapter.connectMetaApp(contents,'google-drive'),false);
 assert.deepEqual(await page.evaluate(()=>window.clicked),['gmail']);
 // Caller cancellation and changed origins must invalidate queued scripts.
 let finish;const delayed=new EventEmitter();Object.assign(delayed,{getURL:()=>page.url(),isDestroyed:()=>false,executeJavaScript:(script,gesture)=>gesture?new Promise(resolve=>{finish=()=>resolve(page.evaluate(script));}):page.evaluate(script)});
 const abort=new AbortController();const pending=adapter.connectMetaApp(delayed,'gmail',{signal:abort.signal});abort.abort();assert.equal(await pending,false);await finish();assert.deepEqual(await page.evaluate(()=>window.clicked),['gmail']);
 const wrong={getURL:()=> 'https://www.meta.ai.evil.test/',isDestroyed:()=>false,executeJavaScript(){assert.fail('untrusted document');}};assert.equal((await adapter.readMetaApps(wrong)).status,'unavailable');assert.equal(await adapter.connectMetaApp(wrong,'gmail'),false);
 const leaving=adapter.connectMetaApp(delayed,'gmail');delayed.emit('did-start-navigation',{},'https://www.meta.ai/new',false,true);assert.equal(await leaving,false);await finish();assert.deepEqual(await page.evaluate(()=>window.clicked),['gmail']);assert.equal(delayed.listenerCount('did-start-navigation'),0);
 const timeout=adapter.connectMetaApp(delayed,'gmail');assert.equal(await timeout,false);await finish();assert.deepEqual(await page.evaluate(()=>window.clicked),['gmail'],'A queued script cannot click after the deadline');
 await page.getByText('Gmail',{exact:true}).evaluate(label=>label.parentElement.style.opacity='0');
 assert.equal((await adapter.readMetaApps(contents)).items.find(x=>x.id==='gmail').status,'unknown');assert.equal(await adapter.connectMetaApp(contents,'gmail'),false);
 await page.locator('[role="dialog"]').evaluate(dialog=>dialog.hidden=true);assert.equal((await adapter.readMetaApps(contents)).status,'unavailable');
});
