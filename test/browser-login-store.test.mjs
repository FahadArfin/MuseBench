import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBrowserLoginStore} from '../electron/browser-login-store.mjs';

const fixtureCookie={name:'fixture',value:'fixture-private-value',domain:'meta.ai',path:'/',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'strict'};
const protectionFixture=()=>({isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:text=>Buffer.from(text).map(byte=>byte^123),decryptString:bytes=>Buffer.from(bytes).map(byte=>byte^123).toString()});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function within(promise,ms=500){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser login operation did not reach its deadline.')),ms);})]).finally(()=>clearTimeout(timer));
}
function manualTimers(){
 const timers=new Map();let id=0;
 return {timers,setTimeout(fn,ms){const token={id:++id,unref(){}};timers.set(token,{fn,ms});return token;},clearTimeout(token){timers.delete(token);},fire(ms){const match=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(match,`Missing ${ms}ms deadline`);timers.delete(match[0]);match[1].fn();}};
}
async function loginFixture(){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'musebench-login-test-'));
 const protection=protectionFixture(),cookies=new EventEmitter();let rows=[];
 cookies.get=async()=>rows.map(cookie=>({...cookie}));
 cookies.set=async value=>{const cookie={...value,domain:value.domain??new URL(value.url).hostname,hostOnly:!value.domain,session:true};rows=rows.filter(row=>`${row.domain}/${row.path}/${row.name}`!==`${cookie.domain}/${cookie.path}/${cookie.name}`);rows.push(cookie);cookies.emit('changed',{},cookie,'explicit',false);};
 return {dataDir,protection,cookies,session:{cookies},get rows(){return rows;},set rows(value){rows=value;},async seed(value=[fixtureCookie]){await writeFile(path.join(dataDir,'browser-login.bin'),protection.encryptString(JSON.stringify({version:1,cookies:value})));},dispose:()=>rm(dataDir,{recursive:true,force:true})};
}

test('encrypted session restoration preserves flags and honors logout without retaining unrelated cookies',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'musebench-login-test-'));
 const protection={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'dpapi',encryptString:text=>Buffer.from(text).map(byte=>byte^123),decryptString:bytes=>Buffer.from(bytes).map(byte=>byte^123).toString()};
 const cookie={name:'fictional',value:'fixture-secret',domain:'.meta.ai',path:'/',session:true,secure:true,httpOnly:true,sameSite:'lax',hostOnly:false};
 let rows=[cookie,{...cookie,domain:'.unrelated.invalid'}];
 const cookies=new EventEmitter();cookies.get=async()=>rows;cookies.set=async value=>{assert.equal(value.expirationDate,undefined);assert.equal(value.secure,true);assert.equal(value.httpOnly,true);assert.equal(value.sameSite,'lax');rows.push({...value,session:true,hostOnly:!value.domain,domain:value.domain??new URL(value.url).hostname});};
 const session={cookies};
 try {
  const first=await createBrowserLoginStore({dataDir:dir,protection,session});await first.save();await first.close();
  assert.equal((await readFile(path.join(dir,'browser-login.bin'))).includes(Buffer.from('fixture-secret')),false);
  rows=[];const second=await createBrowserLoginStore({dataDir:dir,protection,session});assert.equal(rows.length,1);assert.equal(rows[0].domain,'.meta.ai');assert.equal(rows[0].value,'fixture-secret');
  rows=[];cookies.emit('changed');await assert.rejects(readFile(path.join(dir,'browser-login.bin')),{code:'ENOENT'});await second.save();await second.close();
  const third=await createBrowserLoginStore({dataDir:dir,protection,session});assert.equal(rows.length,0);await third.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a cookie removed during asynchronous encryption cannot commit an old login snapshot',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'musebench-login-test-'));
 let release,started;
 const began=new Promise(resolve=>{started=resolve;});
 let rows=[{name:'fixture',value:'fixture-only',domain:'meta.ai',path:'/',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'strict'}];
 const cookies=new EventEmitter();cookies.get=async()=>rows;cookies.set=()=>assert.fail('No initial snapshot');
 const protection={isEncryptionAvailable:()=>true,encryptStringAsync:async text=>{started();await new Promise(resolve=>{release=resolve;});return Buffer.from(text);},decryptStringAsync:async bytes=>({result:bytes.toString(),shouldReEncrypt:false})};
 try{
  const store=await createBrowserLoginStore({dataDir:dir,protection,session:{cookies},debounceMs:100000});
  const saving=store.save();await began;rows=[];cookies.emit('changed');release();await saving;
  await assert.rejects(readFile(path.join(dir,'browser-login.bin')),{code:'ENOENT'});
  protection.encryptStringAsync=async text=>Buffer.from(text);await store.close();
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,'browser-login.bin'),'utf8')).cookies,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('unavailable OS encryption never writes plaintext or reads cookie values',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'musebench-login-test-'));
 try{const store=await createBrowserLoginStore({dataDir:dir,protection:{isEncryptionAvailable:()=>false},session:{cookies:{get:()=>assert.fail('must not read cookies')}}});await store.save();await store.close();await assert.rejects(readFile(path.join(dir,'browser-login.bin')),{code:'ENOENT'});}finally{await rm(dir,{recursive:true,force:true});}
});

test('an early protection failure is sanitized and returns usable failure status',async()=>{
 const fixture=await loginFixture();const failures=[];
 fixture.protection.isEncryptionAvailable=()=>{throw Error('fixture-private-key-material');};
 fixture.cookies.get=()=>assert.fail('Protection failure must not inspect cookies');
 try{
  const store=await within(createBrowserLoginStore({...fixture,onFailure:failure=>failures.push(failure)}));
  assert.equal(store.canUseSession(),true);
  assert.equal(store.snapshot().status,'failed');
  assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_RESTORE_FAILED');
  assert.equal(JSON.stringify([...failures,store.snapshot()]).includes('fixture-private-key-material'),false);
  await store.close();assert.equal(fixture.cookies.listenerCount('changed'),0);
 }finally{await fixture.dispose();}
});

test('a stalled restore decrypt has a deadline and cannot replay cookies after it expires',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),decrypt=deferred(),began=deferred();
 await fixture.seed();fixture.protection.decryptStringAsync=()=>{began.resolve();return decrypt.promise;};
 let sets=0;fixture.cookies.set=async()=>{sets++;};
 try{
  const restoring=createBrowserLoginStore({...fixture,...clock,restoreTimeoutMs:31});await began.promise;clock.fire(31);
  const store=await within(restoring);assert.equal(store.canUseSession(),true);assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_RESTORE_TIMEOUT');
  assert.equal(fixture.cookies.listenerCount('changed'),0);assert.equal(clock.timers.size,0);
  decrypt.resolve({result:JSON.stringify({version:1,cookies:[fixtureCookie]})});await tick();assert.equal(sets,0);
  await store.close();assert.equal(clock.timers.size,0);
 }finally{decrypt.resolve({result:'{}'});await fixture.dispose();}
});

test('a stalled native restore set quarantines the partition after the startup deadline',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),setting=deferred(),began=deferred();
 await fixture.seed();fixture.cookies.set=async value=>{began.resolve();await setting.promise;fixture.rows=[{...fixtureCookie,...value}];};
 try{
  const restoring=createBrowserLoginStore({...fixture,...clock,restoreTimeoutMs:32});await began.promise;clock.fire(32);
  const store=await within(restoring);assert.equal(store.canUseSession(),false);assert.equal(store.snapshot().sessionBlocked,true);
  assert.equal(fixture.cookies.listenerCount('changed'),0);assert.equal(clock.timers.size,0);
  // Native mutation cannot be cancelled. The session remains unavailable even
  // after its late completion, so no active page can observe a revived login.
  setting.resolve();await tick();assert.equal(fixture.rows.length,1);assert.equal(store.canUseSession(),false);
  await store.close();assert.equal(clock.timers.size,0);
 }finally{setting.resolve();await fixture.dispose();}
});

test('logout during startup aborts a pending replay and quarantines its late set',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),setting=deferred(),began=deferred();
 await fixture.seed([fixtureCookie,{...fixtureCookie,name:'another'}]);let sets=0;
 fixture.cookies.set=async value=>{sets++;began.resolve();await setting.promise;fixture.rows=[{...fixtureCookie,...value}];};
 try{
  const restoring=createBrowserLoginStore({...fixture,...clock,restoreTimeoutMs:33});await began.promise;
  fixture.cookies.emit('changed',{},fixtureCookie,'explicit',true);
  const store=await within(restoring);assert.equal(store.canUseSession(),false);assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_RESTORE_CHANGED');
  await assert.rejects(readFile(path.join(fixture.dataDir,'browser-login.bin')),{code:'ENOENT'});
  setting.resolve();await tick();assert.equal(sets,1);assert.equal(store.canUseSession(),false);assert.equal(clock.timers.size,0);
  await store.close();
 }finally{setting.resolve();await fixture.dispose();}
});

test('a timed out save cannot commit when encryption completes late and does not retain timers or listeners',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),encrypt=deferred(),began=deferred();fixture.rows=[fixtureCookie];
 fixture.protection.encryptStringAsync=()=>{began.resolve();return encrypt.promise;};
 try{
  const store=await createBrowserLoginStore({...fixture,...clock,saveTimeoutMs:34});
  const saving=store.save();const rejected=assert.rejects(saving,{code:'BROWSER_LOGIN_SAVE_TIMEOUT'});await began.promise;clock.fire(34);await rejected;
  assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_SAVE_TIMEOUT');assert.equal(store.canUseSession(),true);
  assert.equal(fixture.cookies.listenerCount('changed'),0);assert.equal(clock.timers.size,0);
  fixture.rows=[];fixture.cookies.emit('changed');encrypt.resolve(Buffer.from('late encrypted fixture'));await tick();await tick();
  assert.deepEqual(await readdir(fixture.dataDir),[]);await store.close();assert.equal(clock.timers.size,0);
 }finally{encrypt.resolve(Buffer.from('late encrypted fixture'));await fixture.dispose();}
});

test('close has its own deadline while an early cookie read is stalled',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),getting=deferred(),began=deferred();
 try{
  const store=await createBrowserLoginStore({...fixture,...clock,saveTimeoutMs:35,closeTimeoutMs:36});
  fixture.cookies.get=()=>{began.resolve();return getting.promise;};
  const saving=store.save();const saveRejected=assert.rejects(saving,{code:'BROWSER_LOGIN_CLOSE_TIMEOUT'});await began.promise;
  const closing=store.close();assert.equal(store.close(),closing);const rejected=assert.rejects(closing,{code:'BROWSER_LOGIN_CLOSE_TIMEOUT'});clock.fire(36);await rejected;await saveRejected;
  assert.equal(fixture.cookies.listenerCount('changed'),0);assert.equal(clock.timers.size,0);
  getting.resolve([fixtureCookie]);await tick();await tick();assert.deepEqual(await readdir(fixture.dataDir),[]);
 }finally{getting.resolve([]);await fixture.dispose();}
});

test('debounced failures remain visible without leaking native error details',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),failed=deferred();const failures=[];
 try{
  const store=await createBrowserLoginStore({...fixture,...clock,debounceMs:37,onFailure:failure=>{failures.push(failure);failed.resolve();}});
  fixture.cookies.get=async()=>{throw Error('fixture-private-provider-url-and-cookie');};fixture.cookies.emit('changed');clock.fire(37);await within(failed.promise);
  assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_SAVE_FAILED');assert.equal(failures.length,1);
  assert.equal(JSON.stringify([...failures,store.snapshot()]).includes('fixture-private-provider'),false);
  fixture.cookies.get=async()=>[];await store.close();assert.equal(clock.timers.size,0);assert.equal(fixture.cookies.listenerCount('changed'),0);
 }finally{await fixture.dispose();}
});

test('normal startup replay ignores its own insertion notifications and preserves every saved cookie',async()=>{
 const fixture=await loginFixture(),clock=manualTimers();await fixture.seed([fixtureCookie,{...fixtureCookie,name:'second'}]);
 try{
  const store=await createBrowserLoginStore({...fixture,...clock});assert.equal(store.canUseSession(),true);assert.equal(store.snapshot().status,'ready');
  assert.deepEqual(fixture.rows.map(cookie=>cookie.name),['fixture','second']);assert.equal(clock.timers.size,0);
  await store.close();assert.equal(clock.timers.size,0);assert.equal(fixture.cookies.listenerCount('changed'),0);
 }finally{await fixture.dispose();}
});

test('delayed notifications from an earlier replay do not abort the next restore set',async()=>{
 const fixture=await loginFixture();await fixture.seed([fixtureCookie,{...fixtureCookie,name:'second'}]);let previous;
 fixture.cookies.set=async value=>{
  const cookie={...fixtureCookie,...value};fixture.rows=[...fixture.rows,cookie];
  if(previous)fixture.cookies.emit('changed',{},previous,'explicit',false);
  previous=cookie;
 };
 try{
  const store=await createBrowserLoginStore(fixture);assert.equal(store.canUseSession(),true);assert.equal(store.snapshot().status,'ready');
  assert.deepEqual(fixture.rows.map(cookie=>cookie.name),['fixture','second']);await store.close();
 }finally{await fixture.dispose();}
});

test('async encryption availability failures are sanitized without trying the synchronous fallback',async()=>{
 const fixture=await loginFixture();
 fixture.protection.isEncryptionAvailable=()=>assert.fail('Use the available nonblocking API');
 fixture.protection.isAsyncEncryptionAvailable=async()=>{throw Error('fixture-private-async-key');};
 fixture.cookies.get=()=>assert.fail('No cookie read before protected storage is available');
 try{
  const store=await within(createBrowserLoginStore(fixture));assert.equal(store.canUseSession(),true);
  assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_RESTORE_FAILED');assert.equal(JSON.stringify(store.snapshot()).includes('fixture-private-async-key'),false);
  await store.close();
 }finally{await fixture.dispose();}
});

test('late encryption availability cannot restart a timed out restore or attach a listener',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),available=deferred(),began=deferred();
 fixture.protection.isAsyncEncryptionAvailable=()=>{began.resolve();return available.promise;};
 fixture.cookies.get=()=>assert.fail('Timed out initialization must stay stopped');
 try{
  const restoring=createBrowserLoginStore({...fixture,...clock,restoreTimeoutMs:38});await began.promise;clock.fire(38);
  const store=await within(restoring);assert.equal(store.canUseSession(),true);assert.equal(store.snapshot().failure.code,'BROWSER_LOGIN_RESTORE_TIMEOUT');
  available.resolve(true);await tick();assert.equal(fixture.cookies.listenerCount('changed'),0);assert.equal(clock.timers.size,0);await store.close();
 }finally{available.resolve(false);await fixture.dispose();}
});

test('late startup enumeration cannot replay into a session opened after the restore deadline',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),getting=deferred(),began=deferred();await fixture.seed();
 fixture.cookies.get=()=>{began.resolve();return getting.promise;};fixture.cookies.set=()=>assert.fail('No late replay into an active session');
 try{
  const restoring=createBrowserLoginStore({...fixture,...clock,restoreTimeoutMs:39});await began.promise;clock.fire(39);
  const store=await within(restoring);assert.equal(store.canUseSession(),true);getting.resolve([]);await tick();
  assert.equal(clock.timers.size,0);assert.equal(fixture.cookies.listenerCount('changed'),0);await store.close();
 }finally{getting.resolve([]);await fixture.dispose();}
});

test('a save timeout cancels queued saves and fences a late cookie enumeration',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),getting=deferred(),began=deferred();
 try{
  const store=await createBrowserLoginStore({...fixture,...clock,saveTimeoutMs:40});let reads=0;
  fixture.cookies.get=()=>{reads++;began.resolve();return getting.promise;};
  fixture.protection.encryptStringAsync=()=>assert.fail('Late cookie reads must not reach encryption');
  const first=assert.rejects(store.save(),{code:'BROWSER_LOGIN_SAVE_TIMEOUT'});await began.promise;
  const second=assert.rejects(store.save(),{code:'BROWSER_LOGIN_SAVE_TIMEOUT'});clock.fire(40);await first;await second;
  getting.resolve([fixtureCookie]);await tick();assert.equal(reads,1);assert.equal(clock.timers.size,0);assert.equal(fixture.cookies.listenerCount('changed'),0);
  assert.deepEqual(await readdir(fixture.dataDir),[]);await store.close();
 }finally{getting.resolve([]);await fixture.dispose();}
});

test('the final save is bounded and cannot commit after close times out',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),encrypting=deferred(),began=deferred();fixture.rows=[fixtureCookie];
 fixture.protection.encryptStringAsync=()=>{began.resolve();return encrypting.promise;};
 try{
  const store=await createBrowserLoginStore({...fixture,...clock,saveTimeoutMs:41,closeTimeoutMs:42});
  const closing=assert.rejects(store.close(),{code:'BROWSER_LOGIN_CLOSE_TIMEOUT'});await began.promise;clock.fire(42);await closing;
  encrypting.resolve(Buffer.from('late encrypted fixture'));await tick();await tick();
  assert.equal(store.snapshot().status,'closed');assert.equal(fixture.cookies.listenerCount('changed'),0);assert.equal(clock.timers.size,0);
  assert.deepEqual(await readdir(fixture.dataDir),[]);await assert.rejects(store.save(),{code:'BROWSER_LOGIN_CLOSED'});assert.deepEqual(fixture.rows,[fixtureCookie]);
 }finally{encrypting.resolve(Buffer.from('late encrypted fixture'));await fixture.dispose();}
});

test('close saves a new login after an older in-flight snapshot is invalidated',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),encrypting=deferred(),began=deferred();fixture.rows=[fixtureCookie];let calls=0;
 fixture.protection.encryptStringAsync=async text=>{if(++calls===1){began.resolve();await encrypting.promise;}return fixture.protection.encryptString(text);};
 try{
  const store=await createBrowserLoginStore({...fixture,...clock});const first=store.save();await began.promise;
  fixture.rows=[{...fixtureCookie,value:'fixture-new-login'}];fixture.cookies.emit('changed');const closing=store.close();encrypting.resolve();await first;await closing;
  const saved=JSON.parse(fixture.protection.decryptString(await readFile(path.join(fixture.dataDir,'browser-login.bin'))));
  assert.equal(saved.cookies[0].value,'fixture-new-login');assert.equal(calls,2);assert.equal(clock.timers.size,0);
 }finally{encrypting.resolve();await fixture.dispose();}
});

test('close retries when a new login invalidates its final snapshot during encryption',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),encrypting=deferred(),began=deferred();fixture.rows=[fixtureCookie];let calls=0;
 fixture.protection.encryptStringAsync=async text=>{if(++calls===1){began.resolve();await encrypting.promise;}return fixture.protection.encryptString(text);};
 try{
  const store=await createBrowserLoginStore({...fixture,...clock});const closing=store.close();await began.promise;
  fixture.rows=[{...fixtureCookie,value:'fixture-new-final-login'}];fixture.cookies.emit('changed');encrypting.resolve();await within(closing);
  const saved=JSON.parse(fixture.protection.decryptString(await readFile(path.join(fixture.dataDir,'browser-login.bin'))));
  assert.equal(saved.cookies[0].value,'fixture-new-final-login');assert.equal(calls,2);assert.equal(clock.timers.size,0);assert.equal(fixture.cookies.listenerCount('changed'),0);
 }finally{encrypting.resolve();await fixture.dispose();}
});

test('close retries remain inside the original close deadline while cookies keep changing',async()=>{
 const fixture=await loginFixture(),clock=manualTimers(),began=[deferred(),deferred(),deferred()],gates=[];fixture.rows=[fixtureCookie];
 fixture.protection.encryptStringAsync=async text=>{const gate=deferred();gates.push(gate);began[gates.length-1]?.resolve();await gate.promise;return fixture.protection.encryptString(text);};
 try{
  const store=await createBrowserLoginStore({...fixture,...clock,saveTimeoutMs:43,closeTimeoutMs:44});const closing=store.close();void closing.catch(()=>{});await began[0].promise;
  const deadline=[...clock.timers].find(([,timer])=>timer.ms===44)[0];
  fixture.rows=[{...fixtureCookie,value:'fixture-changing-login-1'}];fixture.cookies.emit('changed');gates[0].resolve();await within(began[1].promise);
  assert.equal(clock.timers.has(deadline),true);
  fixture.rows=[{...fixtureCookie,value:'fixture-changing-login-2'}];fixture.cookies.emit('changed');gates[1].resolve();await within(began[2].promise);
  assert.equal(clock.timers.has(deadline),true);assert.equal([...clock.timers.values()].filter(timer=>timer.ms===44).length,1);
  clock.fire(44);await assert.rejects(closing,{code:'BROWSER_LOGIN_CLOSE_TIMEOUT'});gates[2].resolve();await tick();await tick();
  assert.deepEqual(await readdir(fixture.dataDir),[]);assert.equal(clock.timers.size,0);assert.equal(fixture.cookies.listenerCount('changed'),0);
 }finally{for(const gate of gates)gate.resolve();await fixture.dispose();}
});

test('plaintext backends disable persistence while allowing a fresh personal sign-in',async()=>{
 const fixture=await loginFixture();fixture.protection.getSelectedStorageBackend=()=> 'basic_text';fixture.cookies.get=()=>assert.fail('No plaintext fallback');
 try{
  const store=await createBrowserLoginStore(fixture);assert.equal(store.canUseSession(),true);assert.equal(store.snapshot().status,'disabled');
  await store.save();await store.close();assert.deepEqual(await readdir(fixture.dataDir),[]);assert.equal(fixture.cookies.listenerCount('changed'),0);
 }finally{await fixture.dispose();}
});
