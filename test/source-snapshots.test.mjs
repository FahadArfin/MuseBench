import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createSourceSnapshots} from '../src/controller/source-snapshots.mjs';
import {restoreSelected} from '../src/controller/checkpoint-restore.mjs';
async function fixture(t,limits={}){const base=await mkdtemp(path.join(tmpdir(),'muse-snapshot-')),root=path.join(base,'project'),directory=path.join(base,'objects');await mkdir(root);const store=createSourceSnapshots({directory,limits});t.after(async()=>{store.close();await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return{root,directory,store};}
test('large text uses immutable disk objects, tiny manifests and deduplicated capture',async t=>{
 const f=await fixture(t),text=JSON.stringify({data:'x'.repeat(10*1024*1024)});await writeFile(path.join(f.root,'large.json'),text);await writeFile(path.join(f.root,'same.json'),text);
 const snap=await f.store.snapshot(f.root);assert.ok(JSON.stringify(snap).length<1500);assert.equal(snap.files['large.json'].text,undefined);assert.equal(snap.files['large.json'].object,snap.files['same.json'].object);assert.equal(await f.store.text(snap.files['large.json'],11*1024*1024),text);assert.equal(snap.files['large.json'].binary,false);
 await assert.rejects(f.store.text(snap.files['large.json'],1024),/limit/i);
});
test('binary edits and deletions change revisions without retaining binary content',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'asset.bin'),Buffer.alloc(3*1024*1024));let snap=await f.store.snapshot(f.root);const first=snap.revision;assert.equal(snap.files['asset.bin'].binary,true);assert.equal(snap.files['asset.bin'].object,undefined);await writeFile(path.join(f.root,'asset.bin'),Buffer.alloc(3*1024*1024,1));snap=await f.store.snapshot(f.root);assert.notEqual(snap.revision,first);await rm(path.join(f.root,'asset.bin'));assert.deepEqual(Object.keys((await f.store.snapshot(f.root)).files),[]);
});
test('incremental scans reuse stable metadata but verified scans hash again',async t=>{
 const f=await fixture(t);const file=path.join(f.root,'a.txt');await writeFile(file,'aaa');const first=await f.store.snapshot(f.root);await f.store.snapshot(f.root);assert.equal(f.store.stats.hashedFiles,0);assert.equal(f.store.stats.reusedFiles,1);await f.store.snapshot(f.root,{verify:true});assert.equal(f.store.stats.hashedFiles,1);const before=await stat(file);await writeFile(file,'bbb');await utimes(file,before.atime,before.mtime);assert.notEqual((await f.store.snapshot(f.root)).revision,first.revision);
});
test('budgets and cancellation fail without publishing a partial scan',async t=>{
 const f=await fixture(t,{fileBytes:10,totalBytes:12,files:2});await writeFile(path.join(f.root,'a'),'123456');await writeFile(path.join(f.root,'b'),'123456');await f.store.snapshot(f.root);await writeFile(path.join(f.root,'c'),'1');await assert.rejects(f.store.snapshot(f.root),/file.*limit/i);await rm(path.join(f.root,'c'));await writeFile(path.join(f.root,'b'),'1234567');await assert.rejects(f.store.snapshot(f.root),/snapshot.*limit/i);await writeFile(path.join(f.root,'b'),'x'.repeat(11));await assert.rejects(f.store.snapshot(f.root),/file.*limit/i);const controller=new AbortController();controller.abort();await assert.rejects(f.store.snapshot(f.root,{signal:controller.signal}),/abort|cancel/i);
});
test('legacy inline text and disk captures verify integrity before copy',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'hello');const snap=await f.store.snapshot(f.root),file=snap.files.a;const destination=path.join(f.root,'copy');await f.store.copy(file,destination);assert.equal(await readFile(destination,'utf8'),'hello');assert.equal(await f.store.text({hash:file.hash,text:'hello',binary:false},100),'hello');await writeFile(path.join(f.directory,file.object),'wrong');await assert.rejects(f.store.text(file,100),/integrity|corrupt/i);await assert.rejects(f.store.text({...file,object:'../escape'},100),/reference/i);
});

test('large disk-backed text restores and redoes without embedding bodies in the journal',async t=>{
 const f=await fixture(t),name=path.join(f.root,'large.json'),old='a'.repeat(3*1024*1024),next='b'.repeat(3*1024*1024);await writeFile(name,old);const saved=await f.store.snapshot(f.root);await writeFile(name,next);const current=await f.store.snapshot(f.root);let journal;
 await restoreSelected({root:f.root,before:current.files,after:saved.files,paths:['large.json'],content:f.store,record:value=>{journal=structuredClone(value);}});assert.equal(await readFile(name,'utf8'),old);assert.ok(JSON.stringify(journal).length<2000);
 await restoreSelected({root:f.root,before:journal.after,after:journal.before,paths:journal.paths,content:f.store,record:()=>{}});assert.equal(await readFile(name,'utf8'),next);
 await writeFile(path.join(f.directory,saved.files['large.json'].object),'corrupt');await assert.rejects(restoreSelected({root:f.root,before:current.files,after:saved.files,paths:['large.json'],content:f.store,record:()=>{}}),/integrity/i);assert.equal(await readFile(name,'utf8'),next);
});

test('inline budgets remain bounded on cold and warm scans and stream-copy binary sources',async t=>{
 const f=await fixture(t,{inlineFileBytes:100,inlineTotalBytes:120});for(let i=0;i<6;i++)await writeFile(path.join(f.root,'small'+i),'x'.repeat(60));
 for(let pass=0;pass<2;pass++){const snap=await f.store.snapshot(f.root);assert.equal(Object.values(snap.files).filter(file=>file.text).length,2);assert.equal(Object.values(snap.files).reduce((n,file)=>n+(file.text?.length??0),0),120);}
 const source=Buffer.alloc(3*1024*1024);source[10]=1;await writeFile(path.join(f.root,'asset.bin'),source);const snap=await f.store.snapshot(f.root),destination=path.join(f.root,'copy.bin');await f.store.copySource(f.root,'asset.bin',snap.files['asset.bin'],destination);assert.deepEqual(await readFile(destination),source);
});

test('fresh verified captures reject corrupt objects that already exist at the content address',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'a'),'hello');const first=await f.store.snapshot(f.root);await writeFile(path.join(f.directory,first.files.a.object),'wrong');await assert.rejects(f.store.snapshot(f.root,{verify:true}),/integrity/i);
});

test('aggregate budget charges the actual captured size after a pre-open replacement',async t=>{
 const base=await mkdtemp(path.join(tmpdir(),'muse-snapshot-race-')),root=path.join(base,'project');await mkdir(root);const source=path.join(root,'a');await writeFile(source,'1');let calls=0;
 const store=createSourceSnapshots({directory:path.join(base,'objects'),limits:{totalBytes:10},safeFile:async()=>{if(++calls===2)await writeFile(source,'x'.repeat(20));return source;}});t.after(async()=>{store.close();await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});});await assert.rejects(store.snapshot(root),/snapshot.*limit|changed during inspection/i);
});

test('cancelling an active scan leaves later scans usable and does not publish partial cache entries',async t=>{
 const base=await mkdtemp(path.join(tmpdir(),'muse-snapshot-cancel-')),root=path.join(base,'project');await mkdir(root);await writeFile(path.join(root,'a'),'hello');let cancel=true;
 const store=createSourceSnapshots({directory:path.join(base,'objects'),safeFile:async(_root,name)=>{if(cancel)store.cancel();return path.join(root,name);}});t.after(async()=>{store.close();await rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});});await assert.rejects(store.snapshot(root),/cancel/i);cancel=false;await store.snapshot(root);assert.equal(store.stats.hashedFiles,1);assert.equal(store.stats.reusedFiles,0);
});

test('disk text reads preserve UTF-8 BOM and multibyte characters across I/O boundaries',async t=>{
 const f=await fixture(t),text='\uFEFF'+'a'.repeat(1024*1024-4)+'🫖\n';await writeFile(path.join(f.root,'unicode.txt'),text);const snap=await f.store.snapshot(f.root);assert.equal(snap.files['unicode.txt'].binary,false);assert.equal(await f.store.text(snap.files['unicode.txt'],2*1024*1024),text);
});
