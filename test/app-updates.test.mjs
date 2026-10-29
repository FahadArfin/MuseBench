import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createAppUpdates,createUpdateShutdown,updateBlocked,updateSurfaceBlockers} from '../electron/app-updates.mjs';

function setup(options={}){
 const updater=new EventEmitter(),calls=[],timers=[];
 updater.checkForUpdates=async()=>{calls.push('check');updater.emit('update-available',{version:'0.2.9'});};
 updater.downloadUpdate=async()=>{calls.push('download');updater.emit('download-progress',{percent:42});updater.emit('update-downloaded',{version:'0.2.9'});};
 updater.quitAndInstall=(...args)=>calls.push(['install',...args]);
 const service=createAppUpdates({updater,version:'0.2.1',enabled:true,prepareInstall:async()=>calls.push('prepare'),isBusy:()=>false,setInterval:(fn,ms)=>{timers.push({fn,ms});return{unref(){}};},clearInterval:()=>{},...options});
 return{service,updater,calls,timers};
}
test('checks every thirty minutes without downloading and installs only on explicit action',async()=>{
 const {service,updater,calls,timers}=setup();assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);service.start();assert.equal(timers[0].ms,1800000);await service.dispatch('check');assert.equal(service.snapshot().status,'available');assert.deepEqual(calls,['check']);await service.dispatch('download');assert.equal(service.snapshot().status,'downloaded');await service.dispatch('install');assert.deepEqual(calls.slice(-2),['prepare',['install',true,true]]);service.close();
});
test('busy work prevents restart and preparation failure never launches installer',async()=>{
 let busy=true;const {service,calls}=setup({isBusy:()=>busy,prepareInstall:async()=>{throw Error('not closed');}});await service.dispatch('check');await service.dispatch('download');await assert.rejects(service.dispatch('install'),/work/i);assert.equal(service.snapshot().status,'downloaded');busy=false;await service.dispatch('install');assert.equal(service.snapshot().status,'downloaded');assert.ok(!calls.some(c=>Array.isArray(c)));assert.match(service.snapshot().error,/restart/i);
});
test('duplicate requests and background checks do not replace downloaded update',async()=>{
 const {service,updater,calls}=setup();let finish;updater.checkForUpdates=()=>new Promise(r=>finish=r);const first=service.dispatch('check');await service.dispatch('check');updater.emit('update-available',{version:'0.2.9'});finish();await first;await service.dispatch('download');await service.dispatch('check');assert.deepEqual(calls,['download']);assert.equal(service.snapshot().status,'downloaded');await assert.rejects(service.dispatch({url:'https://example.com'}));
});
test('offline errors are bounded and recover on next explicit check',async()=>{
 const {service,updater}=setup();updater.checkForUpdates=async()=>{throw Error('secret arbitrary server error');};await service.dispatch('check');assert.equal(service.snapshot().status,'error');assert.doesNotMatch(service.snapshot().error,/secret/);updater.checkForUpdates=async()=>updater.emit('update-not-available');await service.dispatch('check');assert.equal(service.snapshot().status,'current');assert.equal(service.snapshot().error,null);
});
test('blocked predicate includes background work, checks, goals, children and unknown cleanup',()=>{
 for(const state of [{busy:true},{tasks:[{runtimeBusy:true}]},{task:{check:{status:'running'}}},{task:{goal:{driver:{armed:true}}}},{runtime:{childrenBusy:true}},{runtime:{cleanup:'unconfirmed'}},{runtime:{pending:{}}}])assert.equal(updateBlocked(state),true,JSON.stringify(state));assert.equal(updateBlocked({runtime:{status:'idle',cleanup:'confirmed'}}),false);
});
test('dictation listening and stopping both prevent update shutdown',()=>{assert.equal(updateBlocked({status:'listening'}),true);assert.equal(updateBlocked({status:'stopping'}),true);});
test('surface blockers name only active work and exclude raw payloads',()=>{
 assert.deepEqual(updateSurfaceBlockers('work','Work',{item:{title:'Project report'},busy:false,runtime:{status:'idle'}}),[]);
 const rows=updateSurfaceBlockers('work','Work',{item:{title:'Project report'},runtime:{cleanup:'unconfirmed'},error:'private',artifact:{content:'private'}});
 assert.equal(rows[0].label,'Work · Project report');assert.match(rows[0].detail,/cleanup/);assert.doesNotMatch(JSON.stringify(rows),/private/);
 assert.equal(updateSurfaceBlockers('voice','Dictation',{status:'listening',text:'private'})[0].label,'Dictation');
});
test('failed shutdown requires reopen and never repeats installation',async()=>{const {service,calls}=setup({prepareInstall:async()=>{throw Object.assign(Error('cleanup unknown'),{restartRequired:true});}});await service.dispatch('check');await service.dispatch('download');await service.dispatch('install');assert.equal(service.snapshot().status,'restart-required');await service.dispatch('check');await service.dispatch('install');assert.deepEqual(calls,['check','download']);});
test('window and quit must wait for update shutdown; lock survives closed services',async()=>{
 let finish,locked=false;const shutdown=createUpdateShutdown({isBusy:()=>false,voice:async()=>({status:'idle'}),lock:value=>{locked=value;},closeServices:()=>new Promise(r=>finish=r),verifyClosed:()=>true});
 const pending=shutdown.prepare();assert.equal(shutdown.preparing(),true);await new Promise(r=>setImmediate(r));assert.equal(shutdown.preparing(),true);assert.equal(locked,true);finish();await pending;assert.equal(shutdown.preparing(),false);assert.equal(locked,true);
});
test('restart lock is released if activity appears during preflight',async()=>{let locked=false,busy=false;const shutdown=createUpdateShutdown({isBusy:()=>busy,voice:async()=>{busy=true;return{status:'idle'};},lock:v=>{locked=v;},closeServices:async()=>assert.fail('must not close'),verifyClosed:()=>true});await assert.rejects(shutdown.prepare());assert.equal(locked,false);assert.equal(shutdown.preparing(),false);});

test('a check without a confirmed availability event never reports current',async()=>{
 const {service,updater}=setup();updater.checkForUpdates=async()=>null;
 await service.dispatch('check');assert.equal(service.snapshot().status,'error');assert.equal(service.snapshot().lastChecked,null);
});
test('an emitted check error is not overwritten with current when the promise resolves',async()=>{
 const {service,updater}=setup();updater.checkForUpdates=async()=>{updater.emit('error',Error('private transport details'));};
 await service.dispatch('check');assert.equal(service.snapshot().status,'error');assert.doesNotMatch(service.snapshot().error,/private/);
 updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.2.9'});
 await service.dispatch('check');assert.equal(service.snapshot().status,'available');assert.equal(service.snapshot().error,null);
});

test('release details and the confirmed download retain the exact offered version',async()=>{
 const {service,updater,calls}=setup();
 updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.2.9',releaseNotes:[{version:'0.2.8',note:'Older release'},{version:'0.2.9',note:'<h2>New</h2><p>Faster chats.</p><script>private()</script>'}],releaseDate:'2026-10-29T12:00:00Z'});
 await service.dispatch('check');
 assert.match(service.snapshot().releaseNotes,/Faster chats/);
 assert.doesNotMatch(service.snapshot().releaseNotes,/Older release|<|private/);
 assert.equal(service.snapshot().releaseDate,'2026-10-29T12:00:00.000Z');
 assert.equal(service.snapshot().downloadedVersion,null);
 updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'0.2.8'});
 await service.dispatch('download');assert.equal(service.snapshot().status,'available');
 assert.equal(service.snapshot().downloadedVersion,null);
 await assert.rejects(service.dispatch('install'));assert.deepEqual(calls,[]);
 updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'0.2.9'});
 await service.dispatch('download');await service.dispatch('check');
 assert.equal(service.snapshot().downloadedVersion,'0.2.9');assert.match(service.snapshot().releaseNotes,/Faster chats/);
});

test('release metadata stays bounded and is cleared when no update is available',async()=>{
 const {service,updater}=setup();updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.2.9',releaseNotes:'x'.repeat(50000),releaseDate:'not a date'});
 await service.dispatch('check');assert.ok(service.snapshot().releaseNotes.length<=8000);assert.equal(service.snapshot().releaseDate,null);
 updater.checkForUpdates=async()=>updater.emit('update-not-available');await service.dispatch('check');
 assert.equal(service.snapshot().releaseNotes,'');assert.equal(service.snapshot().downloadedVersion,null);
});

test('ready-download snapshots refresh restart blockers without changing download ownership',async()=>{
 let blocked=true;
 const {service,calls}=setup({isBusy:()=>blocked,getBlockers:()=>blocked?[{id:'code:one',label:'Code · Prepare the launch',detail:'Waiting for your answer',private:'secret'}]:[]});
 await service.dispatch('check');await service.dispatch('download');
 assert.deepEqual(service.snapshot().blockers,[{id:'code:one',label:'Code · Prepare the launch',detail:'Waiting for your answer'}]);
 await assert.rejects(service.dispatch('install'),/work/i);blocked=false;
 assert.deepEqual((await service.dispatch('status')).blockers,[]);
 assert.equal(service.snapshot().downloadedVersion,'0.2.9');await service.dispatch('install');
 assert.ok(calls.some(c=>Array.isArray(c)));
});

test('unknown restart readiness remains blocked and late events cannot change a confirmed download',async()=>{
 const {service,updater}=setup({getBlockers:()=>{throw Error('private');}});
 await service.dispatch('check');await service.dispatch('download');
 assert.match(service.snapshot().blockers[0].detail,/confirmed/i);
 updater.emit('update-available',{version:'0.2.10',releaseNotes:'wrong release'});
 updater.emit('update-downloaded',{version:'0.2.10'});
 assert.equal(service.snapshot().downloadedVersion,'0.2.9');
 await assert.rejects(service.dispatch('install'),/work/i);
});

test('status polling uses compact observations but installation rechecks authoritative readiness',async()=>{
 let reads=0;
 const {service,calls}=setup({getBlockers:()=>[],isBusy:()=>{reads++;return true;}});
 await service.dispatch('check');await service.dispatch('download');
 for(let i=0;i<4;i++)assert.deepEqual((await service.dispatch('status')).blockers,[]);
 assert.equal(reads,0,'Passive status must not invoke the full restart guard');
 await assert.rejects(service.dispatch('install'),/work/i);assert.equal(reads,1);
 assert.ok(!calls.some(c=>Array.isArray(c)));
});
