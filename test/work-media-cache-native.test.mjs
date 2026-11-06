import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkMediaCache } from '../electron/work-media-cache.mjs';
import { createWorkAssetStore } from '../src/work/assets.mjs';
import { createWorkJobQueue } from '../src/work/jobs.mjs';
import { createDefaultVideoData } from '../src/shared/work-video-schema.mjs';
import { createWorkAssetHandler,createWorkAssetAccess } from '../electron/work-assets-protocol.mjs';
import { discoverWorkMediaCapabilities,runMediaProcess,probeWorkMedia,createWorkMediaThumbnail } from '../electron/work-media-worker.mjs';

test('native media import produces browsable thumbnail, queued waveform/proxy and item-authorized playback range',async t=>{
  const capabilities=await discoverWorkMediaCapabilities();if(!capabilities.available||!capabilities.mp4){t.skip('Verified FFmpeg H.264/AAC toolchain unavailable');return;}
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'muse-cache-native-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'generated sync clip.mp4');await runMediaProcess(capabilities.ffmpegPath,['-v','error','-nostdin','-y','-f','lavfi','-i','color=c=red:s=160x90:r=24:d=0.5','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=0.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',file]);
  const now=new Date().toISOString();let document={version:2,id:'native-item',kind:'video',title:'Native fixture',revision:0,createdAt:now,updatedAt:now,assets:[],data:createDefaultVideoData()};
  const assets=createWorkAssetStore({rootDir:path.join(root,'assets'),getDocument:async()=>document,probeMedia:input=>probeWorkMedia({...input,capabilities}),createMediaThumbnail:input=>createWorkMediaThumbnail({...input,capabilities})});await assets.initialize();t.after(()=>assets.close());
  const token=assets.issueImportToken({itemId:document.id,ownerId:'native-proof',paths:[file]});const imported=await assets.import({itemId:document.id,ownerId:'native-proof',importToken:token});assert.deepEqual(imported.errors,[]);assert.equal(imported.assets.length,1);const asset=imported.assets[0];document={...document,assets:[asset]};
  assert.equal((await assets.read({itemId:document.id,assetId:asset.id,thumbnail:true})).buffer.subarray(1,4).toString(),'PNG');
  const cache=createWorkMediaCache({rootDir:path.join(root,'cache'),assets,readDocument:async()=>document,capabilities});await cache.initialize();
  const queue=createWorkJobQueue({rootDir:path.join(root,'jobs'),runners:{mediaDerivative:cache.runner}});await queue.initialize();t.after(()=>queue.close());
  const proxy=await cache.request({itemId:document.id,assetId:asset.id,kind:'proxy',queue});await queue.waitForIdle();assert.equal((await queue.get(proxy.job.id)).state,'completed');
  const waveform=await cache.request({itemId:document.id,assetId:asset.id,kind:'waveform',queue});await queue.waitForIdle();assert.equal((await queue.get(waveform.job.id)).state,'completed');
  const receipts=await cache.list({itemId:document.id,assetId:asset.id});assert.equal(receipts.derivatives.length,2);assert(Math.max(...receipts.derivatives.find(d=>d.kind==='waveform').waveform)>.02);assert(!JSON.stringify(receipts).includes(root));
  const access=createWorkAssetAccess(),capability=access.grant({itemId:document.id,ownerId:'editor'});const handle=createWorkAssetHandler({store:assets,authorize:access.authorize,resolveDerivative:cache.resolve});const url=`musebench-work-asset://asset/${document.id}/${asset.id}?hash=${asset.hash}&access=${capability}&derivative=proxy`;
  const response=await handle(new Request(url,{headers:{range:'bytes=0-31'}}));assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,32);assert.equal(bytes.toString('ascii',4,8),'ftyp');
  assert.equal((await handle(new Request(url.replace(document.id,'another-item')))).status,403);assert.equal((await handle(new Request(url.replace(`&access=${capability}`,'')))).status,403);
});
