import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile,utimes,symlink,truncate} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stageCatalogPackage,removeCatalogStage,pruneCatalogStages} from '../electron/extension-staging.mjs';
const commit='a'.repeat(40),root='b'.repeat(40),sub='c'.repeat(40);
const hash=text=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
const file=(name,text='hello',mode='100644')=>({path:name,type:'blob',mode,sha:hash(text),size:Buffer.byteLength(text)});
function fixture(entries=[file('SKILL.md')],options={}){
 const calls=[];const fetch=async(url,init)=>{
  calls.push(url);assert.equal(init.redirect,'error');assert.ok(init.signal);
  let body;if(url.endsWith('/commits/main'))body={sha:commit,commit:{tree:{sha:root}}};
  else if(url.endsWith(`/git/trees/${root}`))body={tree:[{path:'skill',type:'tree',mode:'040000',sha:sub},file('LICENSE','MIT')]};
  else if(url.endsWith(`/git/trees/${sub}`))body={tree:entries,truncated:options.truncated};
  else if(url.includes('/git/blobs/')){const sha=url.split('/').at(-1);const text=sha===hash('MIT')?'MIT':'hello';body={encoding:'base64',content:Buffer.from(options.corrupt?'wrong':text).toString('base64'),size:Buffer.byteLength(text),sha};}
  else throw Error('Unexpected URL '+url);
  return new Response(JSON.stringify(body));
 };return{fetch,calls};
}
async function temp(t){const dir=await mkdtemp(path.join(os.tmpdir(),'catalog-stage-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const descriptor={repo:'owner/repo',ref:'main',path:'skill',kind:'skill'};
async function storedStage(dataDir,index=1){const folder=path.join(dataDir,'catalog-staging',`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'payload'),'keep');return folder;}
test('removes only owned direct UUID stages and preserves outside paths',async t=>{
 const dataDir=await temp(t),folder=await storedStage(dataDir),outside=await temp(t);
 await writeFile(path.join(outside,'payload'),'outside');
 for(const candidate of [outside,dataDir,path.dirname(folder),path.join(folder,'payload'),path.join(dataDir,'catalog-staging','arbitrary'),path.join(folder,'..','..')])assert.equal(await removeCatalogStage(candidate,{dataDir}),false);
 assert.equal(await readFile(path.join(outside,'payload'),'utf8'),'outside');assert.equal(await removeCatalogStage(folder,{dataDir}),true);assert.equal(await removeCatalogStage(folder,{dataDir}),false);
});
test('cleanup refuses junctions to outside directories',async t=>{
 const dataDir=await temp(t),outside=await temp(t),folder=await storedStage(dataDir);await writeFile(path.join(outside,'payload'),'outside');
 await symlink(outside,path.join(folder,'linked'),process.platform==='win32'?'junction':'dir');
 assert.equal(await removeCatalogStage(folder,{dataDir}),false);assert.equal(await readFile(path.join(outside,'payload'),'utf8'),'outside');
});
test('prunes expired and oldest excess stages while retaining protected review contents',async t=>{
 const dataDir=await temp(t),old=new Date(Date.now()-25*60*60*1000),protectedFolder=await storedStage(dataDir,1),expired=await storedStage(dataDir,2);
 await utimes(protectedFolder,old,old);await utimes(expired,old,old);
 for(let i=3;i<=14;i++)await storedStage(dataDir,i);
 const result=await pruneCatalogStages({dataDir,protectedFolders:[protectedFolder]});
 assert.ok(result.removed>=4);assert.equal((await readdir(path.join(dataDir,'catalog-staging'))).length,10);
 assert.equal(await readFile(path.join(protectedFolder,'payload'),'utf8'),'keep');await assert.rejects(readFile(path.join(expired,'payload')),{code:'ENOENT'});
});
test('stage startup removes expired incomplete downloads but ignores arbitrary sibling folders',async t=>{
 const dataDir=await temp(t),base=path.join(dataDir,'catalog-staging'),old=new Date(Date.now()-25*60*60*1000);
 await mkdir(path.join(base,'.pending-a1b2c3'),{recursive:true});await utimes(path.join(base,'.pending-a1b2c3'),old,old);await mkdir(path.join(base,'unrelated'));
 await stageCatalogPackage(descriptor,{dataDir,fetch:fixture().fetch});
 const names=await readdir(base);assert.ok(names.includes('unrelated'));assert.ok(!names.includes('.pending-a1b2c3'));
});
test('prunes by byte budget below the count cap and preserves protected large packages',async t=>{
 const dataDir=await temp(t),protectedFolder=await storedStage(dataDir,1),other=await storedStage(dataDir,2);
 await truncate(path.join(protectedFolder,'payload'),70*1024*1024);await truncate(path.join(other,'payload'),70*1024*1024);
 const result=await pruneCatalogStages({dataDir,protectedFolders:[protectedFolder]});
 assert.equal(result.removed,1);assert.equal(result.retained,1);assert.equal(result.bytes,70*1024*1024);
 assert.deepEqual(await readdir(path.join(dataDir,'catalog-staging')),[path.basename(protectedFolder)]);
});
test('pruning preserves a recent in-flight download and refuses a linked staging root',async t=>{
 const dataDir=await temp(t),base=path.join(dataDir,'catalog-staging');await mkdir(path.join(base,'.pending-a1b2c3'),{recursive:true});
 await pruneCatalogStages({dataDir});assert.deepEqual(await readdir(base),['.pending-a1b2c3']);
 const otherData=await temp(t);await symlink(base,path.join(otherData,'catalog-staging'),process.platform==='win32'?'junction':'dir');
 const folder=await storedStage(dataDir,1);assert.equal(await removeCatalogStage(folder,{dataDir:otherData}),false);assert.equal((await pruneCatalogStages({dataDir:otherData})).removed,0);
});
test('pins commit, stages only selected files and retains ancestor license',async t=>{
 const dataDir=await temp(t),mock=fixture();const result=await stageCatalogPackage(descriptor,{dataDir,fetch:mock.fetch});
 assert.equal(result.source.commit,commit);assert.match(result.revision,/^[a-f0-9]{64}$/);assert.equal(await readFile(path.join(result.folder,'SKILL.md'),'utf8'),'hello');
 assert.equal(result.files.length,2);assert.equal(result.licenses.length,1);assert.equal(await readFile(path.join(result.folder,result.licenses[0]),'utf8'),'MIT');
 assert.ok(mock.calls.every(url=>url.startsWith('https://api.github.com/repos/owner/repo/')));
 assert.equal(mock.calls.filter(url=>url.includes('/commits/')).length,1);
 const second=await stageCatalogPackage(descriptor,{dataDir,fetch:mock.fetch});assert.notEqual(second.folder,result.folder);assert.equal(second.revision,result.revision);
});
for(const bad of ['../escape','/absolute','a\\b','a:stream','CON.txt','NUL','trailing.','trailing ','a//b','.git/config','x/../y'])test('rejects unsafe path '+bad,async t=>{
 const dataDir=await temp(t);await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:fixture([file(bad)]).fetch}),/path|name/i);
});
for(const entry of [{path:'link',type:'blob',mode:'120000',sha:hash('hello')},{path:'module',type:'commit',mode:'160000',sha:commit}])test('rejects '+entry.mode,async t=>{await assert.rejects(stageCatalogPackage(descriptor,{dataDir:await temp(t),fetch:fixture([entry]).fetch}),/symbolic|submodule|unsupported/i);});
test('rejects Windows case collisions before download',async t=>{await assert.rejects(stageCatalogPackage(descriptor,{dataDir:await temp(t),fetch:fixture([file('A.txt'),file('a.txt')]).fetch}),/collision/i);});
test('rejects truncated trees and oversized files',async t=>{
 const dataDir=await temp(t);await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:fixture(undefined,{truncated:true}).fetch}),/truncated/i);
 await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:fixture([{...file('large'),size:100000000}]).fetch}),/large|limit/i);
});
test('verifies git blob hashes and removes failed staging',async t=>{
 const dataDir=await temp(t);await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:fixture(undefined,{corrupt:true}).fetch}),/integrity|hash|size/i);
 const remaining=await readdir(path.join(dataDir,'catalog-staging')).catch(()=>[]);assert.deepEqual(remaining,[]);
});
test('rejects URLs and traversal in trusted descriptors defensively',async t=>{
 const dataDir=await temp(t);for(const change of [{repo:'https://evil.com/repo'},{repo:'a/../b'},{path:'../x'},{ref:'x?token=y'},{kind:'server'}])await assert.rejects(stageCatalogPackage({...descriptor,...change},{dataDir,fetch:()=>{throw Error('must not fetch');}}),/descriptor|repository|path|ref|kind/i);
});
test('bounds declared file count and cumulative bytes before any blob is written',async t=>{
 const dataDir=await temp(t);
 await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:fixture(Array.from({length:501},(_,i)=>file(`f${i}`))).fetch}),/limit/i);
 await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:fixture(Array.from({length:9},(_,i)=>({...file(`f${i}`),size:4*1024*1024}))).fetch}),/limit/i);
});
test('bounds streamed HTTP bodies even without content-length',async t=>{
 const fetch=async()=>new Response(new ReadableStream({start(controller){for(let i=0;i<7;i++)controller.enqueue(new Uint8Array(1024*1024));controller.close();}}));
 await assert.rejects(stageCatalogPackage(descriptor,{dataDir:await temp(t),fetch}),/response size limit/i);
});
test('rejects special Windows console devices and short-name aliases',async t=>{
 for(const name of ['CONIN$','CONOUT$','CLOCK$','PROGRA~1'])await assert.rejects(stageCatalogPackage(descriptor,{dataDir:await temp(t),fetch:fixture([file(name)]).fetch}),/path|name/i);
});
test('rejects remote redirects without publishing a staging directory',async t=>{
 const dataDir=await temp(t);await assert.rejects(stageCatalogPackage(descriptor,{dataDir,fetch:async()=>new Response(null,{status:302,headers:{location:'https://evil.invalid/file'}})}),/302/);
 assert.deepEqual(await readdir(dataDir),[]);
});
test('preserves nested resources and never downloads unrelated repository files',async t=>{
 const child='d'.repeat(40),mock=fixture(),calls=[];
 const fetch=async(url,init)=>{
  calls.push(url);
  if(url.endsWith(`/git/trees/${sub}`))return new Response(JSON.stringify({tree:[file('SKILL.md'),{path:'scripts',type:'tree',mode:'040000',sha:child}]}));
  if(url.endsWith(`/git/trees/${child}`))return new Response(JSON.stringify({tree:[file('helper.py')]}));
  return mock.fetch(url,init);
 };
 const result=await stageCatalogPackage(descriptor,{dataDir:await temp(t),fetch});
 assert.equal(await readFile(path.join(result.folder,'scripts','helper.py'),'utf8'),'hello');
 assert.deepEqual(result.files.map(f=>f.path).sort(),['.catalog-licenses/0/LICENSE','SKILL.md','scripts/helper.py']);
 assert.ok(calls.filter(url=>url.includes('/git/trees/')).every(url=>[root,sub,child].some(id=>url.endsWith(id))));
});
