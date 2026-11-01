import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat,link,symlink,rename,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {existsSync} from 'node:fs';
import {createSourceSnapshots} from '../src/controller/source-snapshots.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,{limits={},safeFile}={}){
 const base=await mkdtemp(path.join(tmpdir(),'muse-source-gc-')),root=path.join(base,'project'),directory=path.join(base,'objects');await mkdir(root);let time=Date.now();
 const make=()=>createSourceSnapshots({directory,limits,safeFile,gc:{graceMs:1000,now:()=>time}});let store=make();
 t.after(async()=>{await store.close();await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 return{base,root,directory,get store(){return store;},advance(){time+=10000;},async restart(){await store.close();store=make();}};
}
async function object(f,text){const id=digest(text);await mkdir(f.directory,{recursive:true});await writeFile(path.join(f.directory,id),text);return{hash:id,object:id,size:Buffer.byteLength(text),binary:false};}
async function collect(f,manifests=[],options={}){assert.equal(typeof f.store.collect,'function','snapshot storage must reclaim unreachable owned objects');return f.store.collect({references:()=>({complete:true,manifests}),...options});}
const exists=async file=>!!await lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});

test('GC preserves retained task and checkpoint evidence while reclaiming unreachable source objects',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'task baseline');const baseline=await f.store.snapshot(f.root);await writeFile(path.join(f.root,'a'),'paused checkpoint');const checkpoint=await f.store.snapshot(f.root);await writeFile(path.join(f.root,'a'),'unretained observation');const orphan=await f.store.snapshot(f.root);f.advance();
 const result=await collect(f,[baseline.files,checkpoint.files]);assert.equal(result.deleted,1);assert.equal(result.bytesDeleted,22);assert.equal(await f.store.text(baseline.files.a),'task baseline');assert.equal(await f.store.text(checkpoint.files.a),'paused checkpoint');assert.equal(await exists(path.join(f.directory,orphan.files.a.object)),false);
});

test('new objects receive a grace period and expired scan caches do not retain them forever',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'fresh');const snapshot=await f.store.snapshot(f.root);assert.equal((await collect(f)).deleted,0);assert.equal(await f.store.text(snapshot.files.a),'fresh');f.advance();assert.equal((await collect(f)).deleted,1);
 const captured=await f.store.snapshot(f.root);assert.equal(await f.store.text(captured.files.a),'fresh');assert.equal(f.store.stats.hashedFiles,1);
});

test('incomplete, corrupt, throwing and asynchronous inventories fail closed',async t=>{
 const f=await fixture(t),file=await object(f,'do not guess');f.advance();
 for(const references of [()=>({complete:false,manifests:[]}),()=>({complete:true,manifests:[{a:{...file,object:'../outside'}}]}),()=>({complete:true,manifests:[{a:{object:file.object}}]}),()=>({complete:true,manifests:[{a:{hash:file.hash,size:file.size,binary:false}}]}),()=>({complete:true,manifests:[null]}),()=>{throw Error('corrupt retained checkpoint');},async()=>({complete:true,manifests:[]}),async()=>{throw Error('asynchronous reference failure');}]){
  const result=await collect(f,[],{references});assert.equal(result.deleted,0);assert.equal(result.skipped,'references');assert.equal(await exists(path.join(f.directory,file.object)),true);
 }
});

test('incremental sweeps honor entry and deletion budgets and eventually finish',async t=>{
 const f=await fixture(t);for(let i=0;i<7;i++)await object(f,'orphan '+i);f.advance();let deleted=0,done=false;
 for(let pass=0;pass<20&&!done;pass++){const result=await collect(f,[],{maxEntries:2,maxDeletes:1,maxDurationMs:1000});assert.ok(result.scanned<=2);assert.ok(result.deleted<=1);deleted+=result.deleted;done=result.done;}
 assert.equal(done,true);assert.equal(deleted,7);assert.deepEqual(await readdir(f.directory),[]);
});

test('large retained inventories mark incrementally and eventually reclaim an unreachable object',async t=>{
 const f=await fixture(t),orphan=await object(f,'unreachable beside large retained history'),files=Object.create(null);f.advance();
 for(let i=0;i<100000;i++){const id=i.toString(16).padStart(64,'0');files['source-'+i]={hash:id,object:id,size:1,binary:false};}
 const inventory={complete:true,revision:'durable-1',manifests:Array.from({length:5},()=>({...files}))},references=()=>inventory;let largestSliceMs=0,passes=0,deleted=0;
 const start=performance.now(),first=await collect(f,[],{references,maxMarkEntries:2048});assert.equal(first.phase,'mark');assert.ok(first.marked>0&&first.marked<=2048);
 for(;passes<500&&!deleted;passes++){const at=performance.now(),result=await collect(f,[],{references,maxMarkEntries:8192});largestSliceMs=Math.max(largestSliceMs,performance.now()-at);assert.ok(result.marked<=8192);deleted+=result.deleted;}
 assert.equal(deleted,1);assert.equal(await exists(path.join(f.directory,orphan.object)),false);t.diagnostic(JSON.stringify({retainedManifests:5,filesPerManifest:100000,passes,elapsedMs:Math.round(performance.now()-start),largestSliceMs:Math.round(largestSliceMs)}));
});

test('reference revision changes invalidate a partially marked inventory before any deletion',async t=>{
 const f=await fixture(t),orphan=await object(f,'checkpoint created while marking');f.advance();const files={};for(let i=0;i<20;i++){const id=i.toString(16).padStart(64,'0');files['a'+i]={hash:id,object:id,size:1,binary:false};}
 let inventory={complete:true,revision:'before-checkpoint',manifests:[files]};const references=()=>inventory;assert.equal((await collect(f,[],{references,maxMarkEntries:1})).phase,'mark');inventory={complete:true,revision:'after-checkpoint',manifests:[{...files,checkpoint:orphan}]};
 for(let pass=0;pass<30;pass++){const result=await collect(f,[],{references,maxMarkEntries:2});assert.equal(result.deleted,0);if(result.done)break;}
 assert.equal(await f.store.text(orphan),'checkpoint created while marking');
});

test('references added after the initial inventory are rechecked before unlink',async t=>{
 const f=await fixture(t),file=await object(f,'newly retained checkpoint');f.advance();let calls=0;
 const result=await collect(f,[],{references:()=>({complete:true,manifests:++calls===1?[]:[{a:file}]})});assert.ok(calls>=2);assert.equal(result.deleted,0);assert.equal(await f.store.text(file),'newly retained checkpoint');
});

test('a refused or asynchronous reference lock never deletes an object or invokes a late deletion',async t=>{
 const f=await fixture(t),file=await object(f,'wait for the durable owner lock');f.advance();
 for(const withReferenceLock of [()=>false,()=>{throw Error('SQLITE_BUSY');},async work=>work(),work=>Promise.resolve().then(work),null]){
  const result=await collect(f,[],{withReferenceLock});await new Promise(resolve=>setImmediate(resolve));assert.equal(result.deleted,0);assert.equal(result.skipped,'reference-lock');assert.equal(await exists(path.join(f.directory,file.object)),true);
 }
});

test('new references discovered inside the lock invalidate a previously marked revision',async t=>{
 const f=await fixture(t),file=await object(f,'checkpoint committed before the write lock');f.advance();let revision='before-lock',locked=false,calls=0;
 const references=()=>{if(++calls>1)assert.equal(locked,true);return{complete:true,revision,manifests:revision==='before-lock'?[]:[{a:file}]};};
 const result=await collect(f,[],{references,withReferenceLock:work=>{locked=true;revision='after-lock';try{return work();}finally{locked=false;}}});assert.equal(result.deleted,0);assert.equal(result.skipped,'references-changed');assert.ok(calls>=2);assert.equal(await f.store.text(file),'checkpoint committed before the write lock');
});

test('the final reference validation and unlink complete synchronously under the supplied lock',async t=>{
 const f=await fixture(t),file=await object(f,'synchronous protected deletion');f.advance();let locked=false,calls=0;
 const references=()=>{if(++calls>1)assert.equal(locked,true);return{complete:true,revision:'stable',manifests:[]};};
 const result=await collect(f,[],{references,withReferenceLock:work=>{locked=true;try{const value=work();assert.equal(existsSync(path.join(f.directory,file.object)),false);return value;}finally{locked=false;}}});assert.equal(result.deleted,1);assert.ok(calls>=2);assert.equal(locked,false);
});

test('failed captures leave reclaimable objects without publishing a partial cache',async t=>{
 const f=await fixture(t,{limits:{files:1}});await writeFile(path.join(f.root,'a'),'captured before limit');await writeFile(path.join(f.root,'b'),'over file limit');await assert.rejects(f.store.snapshot(f.root),/file.*limit/i);assert.equal((await readdir(f.directory)).length,1);f.advance();assert.equal((await collect(f)).deleted,1);assert.deepEqual(await readdir(f.directory),[]);
});

test('cancellation protects the active capture and later reclaims its abandoned objects',async t=>{
 let entered,release,root,store;const blocked=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const f=await fixture(t,{safeFile:async(_root,name)=>{if(name==='b'){entered();await gate;}return path.join(root,name);}});root=f.root;store=f.store;await writeFile(path.join(root,'a'),'first completed object');await writeFile(path.join(root,'b'),'second');const capture=store.snapshot(root);await blocked;f.advance();
 const busy=await collect(f);assert.equal(busy.deleted,0);assert.equal(busy.skipped,'busy');store.cancel();release();await assert.rejects(capture,/cancel/i);assert.equal((await collect(f)).deleted,1);
});

test('a snapshot starting during maintenance waits safely without deadlocking',async t=>{
 const f=await fixture(t),old=await object(f,'old reusable object');await writeFile(path.join(f.root,'a'),'old reusable object');f.advance();const maintenance=collect(f),capture=f.store.snapshot(f.root);const [result,snapshot]=await Promise.all([maintenance,capture]);assert.equal(result.deleted,0);assert.equal(await f.store.text(snapshot.files.a),'old reusable object');assert.equal(snapshot.files.a.object,old.object);
});

test('a slow successful scan renews all object handoffs when its manifest becomes visible',async t=>{
 let entered,release,root;const blocked=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const f=await fixture(t,{safeFile:async(_root,name)=>{if(name==='b'){entered();await gate;}return path.join(root,name);}});root=f.root;await writeFile(path.join(root,'a'),'first source object');await writeFile(path.join(root,'b'),'last source object');const capture=f.store.snapshot(root);await blocked;f.advance();release();const snapshot=await capture;
 const result=await collect(f);assert.equal(result.deleted,0);assert.equal(await f.store.text(snapshot.files.a),'first source object');assert.equal(await f.store.text(snapshot.files.b),'last source object');
});

test('restart retains durable evidence and reclaims abandoned object and capture files after grace',async t=>{
 const f=await fixture(t),retained=await object(f,'retained across restart'),orphan=await object(f,'abandoned across restart'),temporary=path.join(f.directory,'.capture-'+randomUUID());await writeFile(temporary,'crashed capture');await writeFile(path.join(f.directory,'unrelated'),'not owned');f.advance();await f.restart();
 const result=await collect(f,[{a:retained}]);assert.equal(result.deleted,2);assert.equal(await f.store.text(retained),'retained across restart');assert.equal(await exists(path.join(f.directory,orphan.object)),false);assert.equal(await exists(temporary),false);assert.equal(await readFile(path.join(f.directory,'unrelated'),'utf8'),'not owned');
});

test('GC never unlinks hard links, directories or their contents',async t=>{
 const f=await fixture(t);await mkdir(f.directory);const outside=path.join(f.base,'outside');await writeFile(outside,'outside evidence');const id=digest('outside evidence');await link(outside,path.join(f.directory,id));const child=path.join(f.directory,digest('directory'));await mkdir(child);await writeFile(path.join(child,'nested'),'keep');f.advance();
 const result=await collect(f);assert.equal(result.deleted,0);assert.ok(result.unsafe>=2);assert.equal(await readFile(outside,'utf8'),'outside evidence');assert.equal(await readFile(path.join(f.directory,id),'utf8'),'outside evidence');assert.equal(await readFile(path.join(child,'nested'),'utf8'),'keep');
});

test('GC never follows object symbolic links',async t=>{
 const f=await fixture(t);await mkdir(f.directory);const outside=path.join(f.base,'outside');await writeFile(outside,'outside evidence');const target=path.join(f.directory,digest('symlink'));
 try{await symlink(outside,target,'file');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('File symlinks require Windows developer mode or privileges.');return;}throw error;}f.advance();assert.equal((await collect(f)).deleted,0);assert.equal((await lstat(target)).isSymbolicLink(),true);assert.equal(await readFile(outside,'utf8'),'outside evidence');
});

test('GC refuses a symbolic storage directory and revalidates a replaced storage path',async t=>{
 const f=await fixture(t),file=await object(f,'owned');f.advance();await collect(f,[{a:file}],{maxEntries:1});const moved=path.join(f.base,'moved');await rename(f.directory,moved);const outside=path.join(f.base,'elsewhere');await mkdir(outside);await writeFile(path.join(outside,file.object),'external evidence');await symlink(outside,f.directory,process.platform==='win32'?'junction':'dir');
 const result=await collect(f);assert.equal(result.deleted,0);assert.equal(result.skipped,'storage');assert.equal(await readFile(path.join(outside,file.object),'utf8'),'external evidence');assert.equal(await readFile(path.join(moved,file.object),'utf8'),'owned');
});

test('aborted maintenance and shutdown never query references or remove objects',async t=>{
 const f=await fixture(t),file=await object(f,'cancelled maintenance');f.advance();const controller=new AbortController();controller.abort();let calls=0;const references=()=>{calls++;return{complete:true,manifests:[]};};assert.equal((await collect(f,[],{signal:controller.signal,references})).deleted,0);await f.store.close();assert.equal((await collect(f,[],{references})).deleted,0);assert.equal(calls,0);assert.equal(await exists(path.join(f.directory,file.object)),true);
});
