import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkMediaCache } from '../electron/work-media-cache.mjs';
import { createWorkJobQueue } from '../src/work/jobs.mjs';

async function setup(t,options={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'muse-cache-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let hash='a'.repeat(64),calls=0;const original=path.join(root,'original.mp4');await fs.writeFile(original,'managed original');
  const asset=()=>({id:'asset-1',hash,name:'clip',mediaType:'video/mp4',bytes:16,storageRef:`originals/${hash}.mp4`});
  const document=()=>({version:2,id:'item-1',kind:'video',revision:2,assets:[asset()],data:{}});
  const assets={describe:async ({itemId,assetId,hash:expected})=>{assert.equal(itemId,'item-1');assert.equal(assetId,'asset-1');if(expected&&expected!==hash)throw Error('Original identity changed');return asset();},resolve:async input=>{await assets.describe(input);return original;}};
  const derive=options.derive||(async({cacheDir,kind,signal})=>{calls++;signal?.throwIfAborted();const filePath=path.join(cacheDir,'generated.tmp');await fs.writeFile(filePath,kind==='proxy'?Buffer.alloc(64,1):Buffer.alloc(32,2));return {filePath,bytes:kind==='proxy'?64:32,original:false,...(kind==='waveform'?{waveform:[.1,.5,.2],waveformDuration:1}:{})};});
  const cache=createWorkMediaCache({rootDir:path.join(root,'cache'),assets,readDocument:async()=>document(),capabilities:{available:true,mp4:true},derive,maxBytes:options.maxBytes||1024});await cache.initialize();
  const queue=createWorkJobQueue({rootDir:path.join(root,'jobs'),validateDocument:d=>d,runners:{mediaDerivative:cache.runner}});await queue.initialize();t.after(()=>queue.close());
  return {root,cache,queue,document,calls:()=>calls,relink:()=>{hash='b'.repeat(64);}};
}
test('shared job queue publishes item/hash-bound cached waveform and proxy receipts',async t=>{
  const s=await setup(t);const queued=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'waveform',queue:s.queue});assert(queued.job.id);await s.queue.waitForIdle();
  assert.equal((await s.queue.get(queued.job.id)).state,'completed');
  const result=await s.cache.list({itemId:'item-1',assetId:'asset-1'});assert.deepEqual(result.derivatives[0].waveform,[.1,.5,.2]);assert(!JSON.stringify(result).includes(s.root));
  const reused=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'waveform',queue:s.queue});assert(reused.derivative);assert.equal(s.calls(),1);
  await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});await s.queue.waitForIdle();const resolved=await s.cache.resolve({itemId:'item-1',assetId:'asset-1',hash:'a'.repeat(64),kind:'proxy'});assert.equal(resolved.mediaType,'video/mp4');assert.equal((await fs.stat(resolved.filePath)).size,64);
});
test('relink identity invalidates cache and hostile paths/tampered cache are rejected',async t=>{
  const s=await setup(t);await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});await s.queue.waitForIdle();
  const resolved=await s.cache.resolve({itemId:'item-1',assetId:'asset-1',hash:'a'.repeat(64),kind:'proxy'});await fs.writeFile(resolved.filePath,Buffer.alloc(64,3));await assert.rejects(s.cache.resolve({itemId:'item-1',assetId:'asset-1',hash:'a'.repeat(64),kind:'proxy'}),/integrity/i);
  await assert.rejects(s.cache.resolve({itemId:'../item-1',assetId:'asset-1',hash:'../escape',kind:'proxy'}),/invalid/i);
  s.relink();assert.deepEqual((await s.cache.list({itemId:'item-1',assetId:'asset-1'})).derivatives,[]);
});
test('cancellation removes staging and never publishes incomplete recipe',async t=>{
  let started;const ready=new Promise(resolve=>{started=resolve;});
  const s=await setup(t,{derive:async({cacheDir,signal})=>{await fs.writeFile(path.join(cacheDir,'partial'),'partial');started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}});
  const queued=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});await ready;await s.queue.cancel(queued.job.id);await s.queue.waitForIdle();assert.equal((await s.queue.get(queued.job.id)).state,'cancelled');assert.deepEqual((await s.cache.list({itemId:'item-1',assetId:'asset-1'})).derivatives,[]);
  const names=await fs.readdir(path.join(s.root,'cache','item-1','a'.repeat(64)));assert(names.every(name=>!name.startsWith('.build-')));
});
test('cache byte limit rejects oversized derivative without publishing it',async t=>{
  const s=await setup(t,{maxBytes:48});const result=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});await s.queue.waitForIdle();assert.equal((await s.queue.get(result.job.id)).state,'failed');assert.deepEqual((await s.cache.list({itemId:'item-1',assetId:'asset-1'})).derivatives,[]);
});
test('duplicate requests share one running derivative job',async t=>{
  let release,started;const ready=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const s=await setup(t,{derive:async({cacheDir})=>{started();await gate;const filePath=path.join(cacheDir,'proxy.tmp');await fs.writeFile(filePath,Buffer.alloc(32));return {filePath};}});
  const first=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});await ready;const second=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});assert.equal(first.job.id,second.job.id);release();await s.queue.waitForIdle();
});
test('worker output cannot escape staging and recovery removes only abandoned staging',async t=>{
  let outside;const s=await setup(t,{derive:async()=>({filePath:outside})});outside=path.join(s.root,'external-original');await fs.writeFile(outside,'keep original');const queued=await s.cache.request({itemId:'item-1',assetId:'asset-1',kind:'proxy',queue:s.queue});await s.queue.waitForIdle();assert.equal((await s.queue.get(queued.job.id)).state,'failed');assert.equal(await fs.readFile(outside,'utf8'),'keep original');
  const parent=path.join(s.root,'cache','item-1','a'.repeat(64));const stage=path.join(parent,'.build-ABC123');await fs.mkdir(stage,{recursive:true});await fs.writeFile(path.join(stage,'partial'),'interrupted preview');const preserved=path.join(parent,'unrelated');await fs.mkdir(preserved);await fs.writeFile(path.join(preserved,'keep'),'keep');await s.cache.initialize();await assert.rejects(fs.stat(stage),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(preserved,'keep'),'utf8'),'keep');
});
