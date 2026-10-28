import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingPayments} from '../electron/billing-payments.mjs';
test('purchases open Meta in an isolated desktop window, without reading the checkout',async()=>{
 const windows=[],external=[];const partition={setPermissionRequestHandler(){},setPermissionCheckHandler(){}};
 class Window{constructor(options){this.options=options;this.events={};this.webContents={on:(name,fn)=>this.events[name]=fn,setWindowOpenHandler:fn=>this.popup=fn};windows.push(this);}on(name,fn){this.events[name]=fn;}isDestroyed(){return false;}loadURL(url){this.url=url;return Promise.resolve();}show(){}focus(){}setTitle(){}close(){this.events.closed?.();}}
 const p=createBillingPayments({BrowserWindow:Window,session:{fromPartition:()=>partition},shell:{openExternal:async url=>external.push(url)}});
 await p.open({destination:'subscriptions'});assert.equal(windows[0].url,'https://accountscenter.meta.com/');assert.equal(windows[0].options.webPreferences.nodeIntegration,false);assert.equal(windows[0].options.webPreferences.sandbox,true);assert.equal(windows[0].options.webPreferences.preload,undefined);
 let blocked=false;windows[0].events['will-navigate']({preventDefault:()=>blocked=true},'file:///private');assert.equal(blocked,true);
 await p.open({destination:'apiBilling',external:true});assert.deepEqual(external,['https://dev.meta.ai/billing/']);
 await assert.rejects(p.open({destination:'https://evil.test'}),/destination/);p.close();
});
