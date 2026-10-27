import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {createBillingReader} from '../electron/billing-reader.mjs';
test('billing reader is opt-in and reads only the allowed billing main element',async()=>{
 let created=0,origin='https://dev.meta.ai',url,opts,nav,closed;
 class Window{constructor(o){created++;opts=o;this.webContents={isLoadingMainFrame:()=>false,on:(type,fn)=>{if(type==='will-navigate')nav=fn;},setWindowOpenHandler:()=>{},executeJavaScript:async script=>vm.runInNewContext(script,{location:{origin,pathname:'/billing'},document:{querySelector:s=>{assert.equal(s,'main');return{innerText:'Month-to-date spend\nUSD 12.00'};}}})};}isDestroyed(){return false;}on(type,fn){closed=fn;}loadURL(value){url=value;return Promise.resolve();}close(){closed();}}
 const r=createBillingReader({BrowserWindow:Window,session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){}})}});
 assert.equal(await r.read(),null);assert.equal(created,0);r.open();assert.equal(url,'https://dev.meta.ai/billing');assert.equal(opts.webPreferences.sandbox,true);assert.equal(opts.webPreferences.nodeIntegration,false);
 assert.equal((await r.read()).spent,12);origin='https://auth.meta.com';assert.equal(await r.read(),null);
 let prevented=false;nav({preventDefault(){prevented=true;}},'https://evil.example');assert.equal(prevented,true);r.close();assert.equal(await r.read(),null);
});
