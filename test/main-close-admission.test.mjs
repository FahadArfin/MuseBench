import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {createCodeBilling} from '../electron/code-billing.mjs';
import {createBackgroundEngine} from '../electron/background-engine.mjs';
import {createQuitLifecycle} from '../electron/quit-lifecycle.mjs';
import {allowedWhileBillingBlocked} from '../electron/billing-action-policy.mjs';
import {updateBlocked} from '../electron/app-updates.mjs';

const mainSource=await readFile(new URL('../electron/main.mjs',import.meta.url),'utf8');
const account={state:'accountLogin',usage:{windows:[]}};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

// Execute main's registrations, IPC completion and retry code. Copying their
// admission predicates here would let a main-process regression pass unnoticed.
function statement(start,end){
 const from=mainSource.indexOf(start),to=mainSource.indexOf(end,from);
 assert.ok(from>=0&&to>=from,`Missing main registration: ${start}`);
 return mainSource.slice(from,to+end.length);
}
function line(pattern){const match=mainSource.match(pattern);assert.ok(match,`Missing main declaration: ${pattern}`);return match[0];}
const registrations=[
 line(/^const retryPendingQuit=.*$/m),
 line(/^\s*ownedWorkBusy=.*$/m),
 line(/^\s*const updateBusy=.*$/m),
 statement("window.on('close',event=>{",'\n    });'),
 statement("app.on('before-quit',event=>{",'\n});'),
 statement('const handler = (name, fn) => {','\n    });};'),
 statement("handler('musebench:code-billing',async command=>{",'\n    });'),
 line(/^\s*handler\('musebench:personal',.*$/m),
 'globalThis.admissionBusy=updateBusy;',
].join('\n');

async function fixture(t,options={},finish=()=>{}){
 const dataDir=await mkdtemp(path.join(tmpdir(),'musebench-main-close-'));
 const pending=[],immediates=[],callbacks={},ipc=new Map(),notices=[];
 const counts={windowsClosed:0,cleanupRequests:0,quits:0};
 let billing,background,context;
 t.after(async()=>{
  try{finish();await Promise.allSettled(pending);await billing?.close();await background?.close();}
  finally{
   assert.equal(path.dirname(dataDir),path.resolve(tmpdir()));
   assert.ok(path.basename(dataDir).startsWith('musebench-main-close-'));
   await rm(dataDir,{recursive:true,force:true});
  }
 });
 billing=await createCodeBilling({dataDir,environment:{},getBinary:()=>path.join(dataDir,'fictional-muse.exe'),
  safeStorage:{isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text).map(byte=>byte^123)},
  probe:async()=>account,...options});
 const idle={isBusy:()=>false},state={getState:()=>({})};
 const event=()=>({prevented:false,preventDefault(){this.prevented=true;}});
 const closeWindow=()=>{const value=event();callbacks.window(value);if(!value.prevented)counts.windowsClosed++;return value;};
 const quit=()=>{const value=event();callbacks.quit(value);if(!value.prevented)counts.quits++;return value;};
 const heldAction=deferred();
 const lifecycle=createQuitLifecycle({close:async()=>{counts.cleanupRequests++;await Promise.all([billing.close(),background.close()]);},quit});
 context=createContext({codeBilling:billing,closing:false,opening:null,pendingIpc:0,pendingQuit:false,pendingWindowClose:false,updateInstalling:false,
  view:{},handlers:[],onboardingOwners:idle,discoveryOAuth:idle,nativeControl:idle,mobileHost:idle,customize:idle,
  controller:{...state,canRestartForUpdate:()=>true},work:state,sites:state,dictation:{snapshot:()=>({status:'idle'})},updateBlocked,
  updateShutdown:{preparing:()=>false},quitLifecycle:lifecycle,allowedWhileBillingBlocked,
  showBlocked:async message=>{notices.push(message);},trustedSender:()=>true,uiURL:'file:///fictional/index.html',billingChanged:()=>{},
  personal:{dispatch:()=>heldAction.promise},nativeTheme:{},
  window:{on:(name,callback)=>{assert.equal(name,'close');callbacks.window=callback;},isDestroyed:()=>false,webContents:{},close:closeWindow},
  app:{on:(name,callback)=>{assert.equal(name,'before-quit');callbacks.quit=callback;},quit},
  ipcMain:{handle:(name,callback)=>ipc.set(name,callback)},setImmediate:callback=>immediates.push(callback),
 });
 runInContext(registrations,context,{filename:'electron/main.mjs:close-admission'});
 background=await createBackgroundEngine({dataDir,createTray:()=>assert.fail('Background mode stays disabled'),openWindow:async()=>{},windowOpen:()=>true,
  quit,isBusy:()=>context.admissionBusy(),onBlocked:message=>notices.push(message)});
 context.background=background;
 const invoke=(name,command)=>{const request=ipc.get(name)({},command);pending.push(request);return request;};
 return{billing,context,counts,notices,close:target=>target==='window'?closeWindow():quit(),
  billingAction:command=>invoke('musebench:code-billing',command),
  holdAction:()=>invoke('musebench:personal',{type:'reload'}),finishAction:()=>heldAction.resolve({}),
  async drain(){while(immediates.length){immediates.shift()();await Promise.resolve();}if(counts.cleanupRequests)await lifecycle.request();},
 };
}

for(const target of ['window','app']){
 test(`${target} close waits for a read-only billing IPC and completes after it drains`,{timeout:5000},async t=>{
  const started=deferred(),query=deferred();
  const f=await fixture(t,{probe:()=>{started.resolve();return query.promise;}},()=>query.resolve(account));
  const reading=f.billingAction({type:'status'});await started.promise;
  assert.equal(f.billing.isBusy(),true);assert.equal(f.billing.blocksWork(),false);
  assert.equal(f.close(target).prevented,true);assert.equal(f.notices.length,0);
  assert.equal(target==='window'?f.context.view.closeAfterIpc:f.context.pendingQuit,true);
  query.resolve(account);await reading;await f.drain();
  assert.equal(f.context.pendingIpc,0);assert.equal(f.notices.length,0);
  assert.equal(target==='window'?f.counts.windowsClosed:f.counts.quits,1);
 });

 test(`${target} close blocks an actual billing-source change instead of deferring it as a read`,{timeout:5000},async t=>{
  const started=deferred(),change=deferred();
  const f=await fixture(t,{beforeChange:()=>{started.resolve();return change.promise;}},()=>change.resolve());
  const changing=f.billingAction({type:'select',source:'account'});await started.promise;
  assert.equal(f.billing.blocksWork(),true);assert.equal(f.close(target).prevented,true);
  assert.equal(f.notices.length,1);assert.equal(f.context.pendingQuit,false);assert.equal(!!f.context.view.closeAfterIpc,false);
  change.resolve();await changing;await f.drain();
  assert.equal(f.counts.windowsClosed,0);assert.equal(f.counts.quits,0);assert.equal(f.counts.cleanupRequests,0);
 });

 test(`${target} close retains an unconfirmed account cleanup blocker while another IPC is pending`,{timeout:5000},async t=>{
  let confirmed=false;const exited=deferred();
  const cleanup={get confirmed(){return confirmed;},closed:exited.promise,wait:async()=>{if(!confirmed)throw Error('Fictional cleanup remains unconfirmed.');}};
  let f;
  f=await fixture(t,{probe:async()=>{throw Object.assign(Error('Fictional account cleanup failure.'),{code:'ACCOUNT_CLEANUP',cleanup});}},()=>{
   confirmed=true;exited.resolve();f?.finishAction();
  });
  assert.equal((await f.billingAction({type:'status'})).state.status,'error');
  const action=f.holdAction();assert.equal(f.context.pendingIpc,1);
  assert.equal(f.billing.isBusy(),true);assert.equal(f.billing.blocksWork(),true);assert.equal(f.close(target).prevented,true);
  assert.equal(f.notices.length,1);assert.equal(f.context.pendingQuit,false);assert.equal(!!f.context.view.closeAfterIpc,false);
  f.finishAction();await action;await f.drain();assert.equal(f.counts.cleanupRequests,0);
  confirmed=true;exited.resolve();await turn();assert.equal(f.billing.isBusy(),false);
 });
}
