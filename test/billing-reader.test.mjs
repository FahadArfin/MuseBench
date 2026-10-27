import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {billingTextScript,createBillingReader} from '../electron/billing-reader.mjs';
test('billing reader is opt-in and reads only the allowed billing main element',async()=>{
 let created=0,origin='https://dev.meta.ai',url,opts,nav,closed;
 class Window{constructor(o){created++;opts=o;this.webContents={isLoadingMainFrame:()=>false,on:(type,fn)=>{if(type==='will-navigate')nav=fn;},setWindowOpenHandler:()=>{},executeJavaScript:async script=>vm.runInNewContext(script,{location:{origin,pathname:'/billing'},document:{querySelector:s=>{assert.equal(s,'main');return{innerText:'Month-to-date spend\nUSD 12.00'};}}})};}isDestroyed(){return false;}on(type,fn){closed=fn;}loadURL(value){url=value;return Promise.resolve();}close(){closed();}}
 const r=createBillingReader({BrowserWindow:Window,session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){}})}});
 assert.equal(await r.read(),null);assert.equal(created,0);r.open();assert.equal(url,'https://dev.meta.ai/billing');assert.equal(opts.webPreferences.sandbox,true);assert.equal(opts.webPreferences.nodeIntegration,false);
 assert.equal((await r.read()).spent,12);origin='https://auth.meta.com';assert.equal(await r.read(),null);
 let prevented=false;nav({preventDefault(){prevented=true;}},'https://evil.example');assert.equal(prevented,true);r.close();assert.equal(await r.read(),null);
});

test('embedded reader filters financial fields and excludes payment identifiers',()=>{
 const text=vm.runInNewContext(billingTextScript,{location:{origin:'https://billing.dev.meta.ai',pathname:'/payment_settings/'},document:{body:{innerText:'Current balance\n$1.25\nFree credits in use\n$42.00\nPayment methods\nPrivate card details\nYour balance reaches\n$20.00'}}});
 assert.match(text,/42.00/);assert(!text.includes('Private'));assert(!text.includes('Payment methods'));
});
test('native reader chooses matching team iframe, rejects duplicates and wrong origins',async()=>{
 let win,closed,frameReads=0;
 const frame={url:'https://billing.dev.meta.ai/payment_settings/?team_id=example',executeJavaScript:async()=>{frameReads++;return 'Current balance\n$1.25';}};
 class Window{constructor(){win=this;this.webContents={isLoadingMainFrame:()=>false,on(){},setWindowOpenHandler(){},getURL:()=> 'https://dev.meta.ai/billing?team_id=example',mainFrame:{framesInSubtree:[frame]},executeJavaScript:async()=>''};}isDestroyed(){return false;}on(type,fn){if(type==='closed')closed=fn;}loadURL(){return Promise.resolve();}close(){closed();}}
 const r=createBillingReader({BrowserWindow:Window,session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){}})}});r.open();assert.equal((await r.read()).currentBalance,1.25);assert.equal(frameReads,1);
 win.webContents.mainFrame.framesInSubtree.push(frame);assert.equal(await r.read(),null);assert.equal(frameReads,1);win.webContents.mainFrame.framesInSubtree=[{...frame,url:'https://evil.example/payment_settings/?team_id=example'}];assert.equal(await r.read(),null);assert.equal(frameReads,1);r.close();
});
