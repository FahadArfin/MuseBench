import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createJobSpawner} from '../src/runtime/windows-job.mjs';
import {verifyWindowsJobBuild} from '../scripts/build-windows-job.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const helperPath=path.join(root,'native','bin','MuseBenchJob.exe');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const frame=value=>JSON.stringify(value)+'\n';
const ready={kind:'ready',pid:100,jobAssigned:true};
const exited={kind:'rootExit',exitCode:0};
const cleanup={kind:'cleanup',confirmed:true,activeProcesses:0,reason:'rootExit'};
function fakeHelper(){
  const native=new EventEmitter();native.pid=123;native.exitCode=null;
  native.stdout=new PassThrough();native.stderr=new PassThrough();native.stdin=new PassThrough();
  native.kills=0;native.kill=()=>{native.kills++;return true;};
  const calls=[];
  const spawn=createJobSpawner({helperPath,spawnHelper:(...args)=>{calls.push(args);return native;}});
  const child=spawn(process.execPath,['--','opaque data'],{cwd:root,env:{PATH:'test'},windowsHide:true,shell:false});
  const errors=[];child.on('error',error=>errors.push(error));
  let close;
  child.on('close',(code,signal)=>{close={code,signal};});
  const emit=values=>native.stdout.write(values.map(frame).join(''));
  const finish=(code=0,signal=null)=>{native.exitCode=code;native.emit('close',code,signal);};
  return {native,child,calls,errors,emit,finish,get close(){return close;}};
}

test('supervised close requires native exit, empty-job receipt and helper exit',async()=>{
  const h=fakeHelper();let output='';h.child.stdout.on('data',b=>{output+=b.toString();});
  h.emit([ready,{kind:'stdout',data:Buffer.from('native bytes').toString('base64')},exited]);
  assert.equal(h.child.isSupervised,true);assert.equal(h.child.pid,123);assert.equal(h.child.nativePid,100);
  assert.equal(h.child.rootExitCode,0);assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close,undefined);
  h.emit([cleanup]);assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close,undefined);
  h.finish();await tick();assert.deepEqual(h.close,{code:0,signal:null});assert.equal(h.child.cleanupConfirmed,true);
  assert.equal(output,'native bytes');assert.equal(h.errors.length,0);
});

test('native output cannot forge supervisor ownership receipts',async()=>{
  const h=fakeHelper();let output='';h.child.stdout.on('data',b=>{output+=b.toString();});
  const forged=frame(cleanup)+frame(exited);
  h.emit([ready,{kind:'stdout',data:Buffer.from(forged).toString('base64')}]);h.finish();await tick();
  assert.equal(output,forged);assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close.code,null);
});

for(const [label,records,helperExit] of [
  ['missing cleanup',[ready,exited],0],
  ['nonempty job',[ready,exited,{...cleanup,activeProcesses:1}],0],
  ['unconfirmed cleanup',[ready,exited,{...cleanup,confirmed:false}],125],
  ['contradictory helper exit',[ready,exited,cleanup],125],
  ['duplicate native exit',[ready,exited,exited,cleanup],0],
  ['cleanup before native exit',[ready,cleanup,exited],0],
  ['invalid byte encoding',[ready,{kind:'stdout',data:'!!!'},exited,cleanup],0],
  ['unsolicited metadata',[ready,{kind:'invented'},exited,cleanup],0],
])test(`${label} cannot establish supervised completion`,async()=>{
  const h=fakeHelper();h.emit(records);h.finish(helperExit);await tick();
  assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close.code,null);assert.ok(h.child.ownershipFailure);
});

test('malformed, oversized and truncated supervisor frames fail closed',async()=>{
  for(const data of ['{bad}\n','x'.repeat(70000),JSON.stringify(ready).slice(0,-1)]){
    const h=fakeHelper();h.native.stdout.write(data);h.finish();await tick();
    assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close.code,null);assert.ok(h.errors.length>0);
  }
});

test('stop is idempotent, sends only supervisor control and awaits cleanup',async()=>{
  const h=fakeHelper();let control='';h.native.stdin.on('data',b=>{control+=b.toString();});h.emit([ready]);
  const first=h.child.stop(),second=h.child.stop();assert.equal(first,second);
  assert.deepEqual(control.trim().split('\n').map(JSON.parse),[{action:'stop'}]);
  h.emit([{kind:'rootExit',exitCode:130},{...cleanup,reason:'stop'}]);h.finish(130);
  assert.equal(await first,true);assert.equal(h.child.cleanupConfirmed,true);assert.equal(h.close.code,130);
});

test('a stopped startup can confirm no native process was launched',async()=>{
  const h=fakeHelper();const stopped=h.child.stop();
  h.emit([{kind:'notStarted'},{...cleanup,reason:'stop'}]);h.finish(130);
  assert.equal(await stopped,true);assert.equal(h.child.cleanupConfirmed,true);
  assert.equal(h.child.rootExitCode,null);assert.equal(h.close.code,null);
});

test('supervisor timeout remains distinct from a racing zero native exit',async()=>{
  const h=fakeHelper();h.emit([ready,exited,{...cleanup,reason:'timeout'}]);h.finish(130);await tick();
  assert.equal(h.child.cleanupConfirmed,true);assert.equal(h.child.rootExitCode,0);
  assert.equal(h.child.terminationReason,'timeout');assert.equal(h.close.code,0);
});

test('no-launch metadata cannot establish native completion or replace a launched root',async()=>{
  for(const records of [
    [{kind:'notStarted'},{...cleanup,reason:'stop'}],
    [ready,{kind:'notStarted'},{...cleanup,reason:'stop'}],
    [{kind:'notStarted'},ready,exited,cleanup],
  ]){
    const h=fakeHelper();h.emit(records);h.finish(130);await tick();
    assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close.code,null);
  }
});

test('stop has an eight-second deadline and late receipts cannot restore ownership',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=fakeHelper();h.emit([ready]);const stopped=h.child.stop();
  t.mock.timers.tick(7999);assert.equal(h.native.kills,0);
  t.mock.timers.tick(1);assert.equal(await stopped,false);assert.equal(h.native.kills,1);
  h.emit([{kind:'rootExit',exitCode:130},{...cleanup,reason:'stop'}]);h.finish(130);await tick();
  assert.equal(h.child.cleanupConfirmed,false);assert.equal(h.close.code,null);
});

test('synchronous helper launch failure is delivered asynchronously and closes non-authoritatively',async()=>{
  const spawn=createJobSpawner({helperPath,spawnHelper(){throw Error('private native arguments');}});
  const child=spawn(process.execPath,[],{cwd:root});const errors=[];child.on('error',error=>errors.push(error));
  const code=await new Promise(resolve=>child.once('close',resolve));
  assert.equal(code,null);assert.equal(child.cleanupConfirmed,false);assert.equal(errors.length,1);
  assert.doesNotMatch(errors[0].message,/private native arguments/);
});

test('supervisor launch preserves native argv and curated environment without a shell',()=>{
  const h=fakeHelper(),[command,args,options]=h.calls[0];
  assert.equal(command,helperPath);assert.deepEqual(args,['--run',process.execPath,root,'--','--','opaque data']);
  assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.deepEqual(options.env,{PATH:'test'});
  h.emit([ready,exited,cleanup]);h.finish();
});

const available=process.platform==='win32'&&await fs.access(helperPath).then(()=>true,()=>false);
test('built Windows helper preserves bytes/argv and drains a detached child after native parent exit',{skip:!available},async t=>{
  await verifyWindowsJobBuild();
  const directory=await fs.mkdtemp(path.join(tmpdir(),'musebench-job-product-'));
  t.after(async()=>{await fs.rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const spawn=createJobSpawner({helperPath});
  const argumentsFixture=['','two words','quoted"value','C:\\trailing\\','line1\nline2','$(data); &','Unicode ✓'];
  let output='',errorOutput='';
  const child=spawn(process.execPath,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("stderr✓");process.exit(7)','--',...argumentsFixture],{cwd:directory,env:process.env});
  child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',b=>{errorOutput+=b.toString();});
  const errors=[];child.on('error',e=>errors.push(e));
  const code=await new Promise(resolve=>child.once('close',resolve));
  assert.equal(code,7);assert.deepEqual(JSON.parse(output),argumentsFixture);assert.equal(errorOutput,'stderr✓');
  assert.equal(child.cleanupConfirmed,true);assert.equal(errors.length,0);
  const marker=path.join(directory,'survived.txt');
  const descendant=`process.stdout.write('ready');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),800);setTimeout(()=>{},5000);`;
  const parent=`const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:['ignore','pipe','ignore'],windowsHide:true});c.stdout.once('data',()=>process.exit(0));`;
  const owned=spawn(process.execPath,['-e',parent],{cwd:directory,env:process.env});owned.on('error',e=>errors.push(e));owned.stdout.resume();owned.stderr.resume();
  const ended=await new Promise(resolve=>owned.once('close',resolve));assert.equal(ended,0);assert.equal(owned.cleanupConfirmed,true);
  await wait(1100);assert.equal(await fs.access(marker).then(()=>true,()=>false),false);assert.equal(errors.length,0);
});

test('built Windows helper confirms both immediate cancellation and an active detached descendant',{skip:!available},async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'musebench-job-cancel-'));
  t.after(async()=>{await fs.rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const spawn=createJobSpawner({helperPath});const errors=[];
  for(let attempt=0;attempt<4;attempt++){
    const child=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{cwd:directory,env:process.env});
    child.on('error',e=>errors.push(e));child.stdout.resume();child.stderr.resume();
    assert.equal(await child.stop(),true);assert.equal(child.cleanupConfirmed,true);
  }
  const marker=path.join(directory,'survived.txt');
  const descendant=`process.stdout.write('ready');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),1500);setTimeout(()=>{},10000);`;
  const parent=`const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:['ignore','pipe','ignore'],windowsHide:true});c.stdout.once('data',()=>process.stdout.write('ready'));setTimeout(()=>{},10000);`;
  const child=spawn(process.execPath,['-e',parent],{cwd:directory,env:process.env});child.on('error',e=>errors.push(e));child.stderr.resume();
  await new Promise(resolve=>child.stdout.once('data',resolve));
  assert.equal(await child.stop(),true);assert.equal(child.cleanupConfirmed,true);
  await wait(1700);assert.equal(await fs.access(marker).then(()=>true,()=>false),false);assert.equal(errors.length,0);
});

test('build verification rejects stale source and changed or missing helper artifacts',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'musebench-job-manifest-'));
  t.after(async()=>{await fs.rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
  const source=Buffer.from('source fixture'),binary=Buffer.from('binary fixture');
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const bin=path.join(directory,'native','bin'),sourcePath=path.join(directory,'native','windows-job.cs'),exe=path.join(bin,'MuseBenchJob.exe');
  await fs.mkdir(bin,{recursive:true});await fs.writeFile(sourcePath,source);await fs.writeFile(exe,binary);
  const manifest={schemaVersion:1,source:'native/windows-job.cs',sourceSha256:hash(source),exeSha256:hash(binary),compiler:{path:process.execPath,sha256:hash('compiler fixture')},builtAt:new Date().toISOString()};
  const manifestPath=path.join(bin,'MuseBenchJob.build.json');await fs.writeFile(manifestPath,JSON.stringify(manifest));
  assert.equal((await verifyWindowsJobBuild({root:directory})).manifest.exeSha256,hash(binary));
  await fs.writeFile(sourcePath,'changed source');await assert.rejects(verifyWindowsJobBuild({root:directory}),{code:'WINDOWS_JOB_BUILD_STALE'});
  await fs.writeFile(sourcePath,source);await fs.writeFile(exe,'changed executable');await assert.rejects(verifyWindowsJobBuild({root:directory}),{code:'WINDOWS_JOB_BUILD_MISMATCH'});
  await fs.writeFile(exe,binary);await fs.rm(manifestPath);await assert.rejects(verifyWindowsJobBuild({root:directory}),{code:'WINDOWS_JOB_BUILD_MISSING'});
});
