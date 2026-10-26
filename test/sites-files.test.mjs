import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,readFile,symlink,link,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bundleFromFiles,validateBundle,collectSite,readSiteFile,replaceSiteFile,writeSiteDirectory,starterSite} from '../src/sites/files.mjs';

const base=()=>[{path:'index.html',data:'<!doctype html><h1>Site</h1>'}];
async function fixture(t){const dir=await mkdtemp(path.join(os.tmpdir(),'musebench-sites-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('bundles preserve exact binary bytes and derive hashes instead of trusting metadata',()=>{
 const binary=Buffer.from([0,255,80,78,71]);const bundle=bundleFromFiles([...base(),{path:'assets/logo.png',data:binary}]);
 assert.equal(bundle.totalBytes,33);assert.equal(Buffer.from(bundle.files[0].data,'base64').compare(binary),0);
 assert.equal(bundle.files[0].sha1,createHash('sha1').update(binary).digest('hex'));
 const stored=structuredClone(bundle);stored.hash='bad';stored.totalBytes=0;stored.files[0].mime='text/html';stored.files[0].sha1='bad';stored.files[0].bytes=0;
 assert.deepEqual(validateBundle(stored),bundle);assert.equal(bundleFromFiles([...base(),{path:'assets/logo.png',data:binary}].reverse()).hash,bundle.hash);
});
test('bundles reject traversal, Windows aliases, sensitive and unsupported files explicitly',()=>{
 for(const bad of ['../secret.txt','/root.js','C:/file.js','a\\file.js','a/../file.js','a//file.js','.env','.git/config','config.json','credentials.json','private/key.txt','src/main.ts','package.json','server.php','assets/site.js.map','CON.txt','aux.js','a./x.js','x /x.js','asset%2fsecret.js']){
  assert.throws(()=>bundleFromFiles([...base(),{path:bad,data:'x'}]),/unsafe|unsupported|sensitive|reserved|invalid/i,bad);
 }
 assert.throws(()=>bundleFromFiles([{path:'styles.css',data:'body{}'}]),/index.html/i);
 assert.throws(()=>bundleFromFiles([...base(),{path:'INDEX.HTML',data:'copy'}]),/duplicate/i);
 assert.throws(()=>validateBundle({files:[{path:'index.html',data:'*notbase64*'}]}),/base64/i);
 assert.throws(()=>bundleFromFiles([...base(),{path:'a.js',data:'x'},{path:'a.js/b.js',data:'x'}]),/collision|directory/i);
});
test('bundles enforce individual, aggregate and file-count limits before publication',()=>{
 assert.throws(()=>bundleFromFiles([...base(),{path:'large.png',data:Buffer.alloc(5*1024*1024+1)}]),/file.*limit|too large/i);
 assert.throws(()=>bundleFromFiles([...base(),...Array.from({length:6},(_,i)=>({path:`asset${i}.png`,data:Buffer.alloc(5*1024*1024)}))]),/total|bundle.*limit/i);
 assert.throws(()=>bundleFromFiles([...base(),...Array.from({length:200},(_,i)=>({path:`asset${i}.txt`,data:'x'}))]),/file.*limit|too many/i);
});
test('editing changes only an existing UTF8 text file and creates a new snapshot',()=>{
 const bundle=bundleFromFiles([...base(),{path:'logo.png',data:Buffer.from([0,255])}]);const edited=replaceSiteFile(bundle,'index.html','<!doctype html><h1>Edited</h1>');
 assert.equal(readSiteFile(edited,'index.html'),'<!doctype html><h1>Edited</h1>');assert.notEqual(edited.hash,bundle.hash);assert.equal(readSiteFile(bundle,'index.html'),'<!doctype html><h1>Site</h1>');
 assert.throws(()=>readSiteFile(bundle,'logo.png'),/editable|text/i);assert.throws(()=>replaceSiteFile(bundle,'new.html','x'),/not found|existing/i);
 assert.throws(()=>bundleFromFiles([{path:'index.html',data:Buffer.from([255])}]),/UTF-8/i);
 assert.throws(()=>replaceSiteFile(bundle,'index.html','\u0000'),/text|UTF-8/i);
});
test('folder collection rejects symlinks and junction aliases before copying outside bytes',async t=>{
 const dir=await fixture(t),publicDir=path.join(dir,'public'),outside=path.join(dir,'outside');await mkdir(publicDir);await mkdir(outside);await writeFile(path.join(publicDir,'index.html'),'safe');await writeFile(path.join(outside,'secret.txt'),'private');
 await symlink(outside,path.join(publicDir,'assets'),'junction');await assert.rejects(collectSite(publicDir),/link|junction|alias/i);
 await rm(path.join(publicDir,'assets'));await symlink(publicDir,path.join(dir,'alias'),'junction');await assert.rejects(collectSite(path.join(dir,'alias')),/link|junction|alias/i);
});
test('folder collection fails on hidden or unsupported files instead of omitting them',async t=>{
 const dir=await fixture(t);await writeFile(path.join(dir,'index.html'),'hello');await writeFile(path.join(dir,'.env'),'SECRET=value');await assert.rejects(collectSite(dir),/sensitive|unsafe|hidden/i);
 await rm(path.join(dir,'.env'));await writeFile(path.join(dir,'server.ts'),'secret');await assert.rejects(collectSite(dir),/unsupported|sensitive/i);
});
test('hard-linked files are rejected for both import and replacement without altering outside data',async t=>{
 const dir=await fixture(t),target=path.join(dir,'public'),outside=path.join(dir,'outside.html');await mkdir(target);await writeFile(outside,'private original');await link(outside,path.join(target,'index.html'));
 await assert.rejects(collectSite(target),/link/i);await assert.rejects(writeSiteDirectory(bundleFromFiles(base()),target),/link/i);assert.equal(await readFile(outside,'utf8'),'private original');
});
test('a maximum-size stored asset round-trips without recursion or metadata trust',()=>{
 const bundle=bundleFromFiles([...base(),{path:'asset.png',data:Buffer.alloc(5*1024*1024,127)}]);assert.equal(validateBundle(bundle).files[0].bytes,5*1024*1024);
});
test('directory writing makes an exact snapshot and never follows existing junctions',async t=>{
 const dir=await fixture(t),target=path.join(dir,'public');const bundle=bundleFromFiles([...base(),{path:'assets/app.js',data:'console.log(1)'}]);await writeSiteDirectory(bundle,target);assert.deepEqual(await collectSite(target),bundle);
 await writeSiteDirectory(bundleFromFiles(base()),target);await assert.rejects(readFile(path.join(target,'assets','app.js')),/ENOENT/);
 const outside=path.join(dir,'outside');await mkdir(outside);await writeFile(path.join(outside,'app.js'),'do not modify');await symlink(outside,path.join(target,'assets'),'junction');await assert.rejects(writeSiteDirectory(bundle,target),/link|junction|alias/i);assert.equal(await readFile(path.join(outside,'app.js'),'utf8'),'do not modify');
});
test('starter escapes user content and exports a complete editable static site',()=>{
 for(const template of ['blank','landing','portfolio']){const bundle=starterSite(template,'<script>alert(1)</script>','Text & details');const html=readSiteFile(bundle,'index.html');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.ok(bundle.files.length>=1);}
 assert.throws(()=>starterSite('unknown','title','text'),/template/i);
});
