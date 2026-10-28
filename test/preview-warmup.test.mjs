import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';

let moduleId=0;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const capture=(key,capturedAt='2026-10-28T12:00:00Z')=>({file:`${key}.png`,capturedAt,width:100,height:80,origin:'https://www.meta.ai'});
async function harness(t,pages){
 const originalImage=globalThis.Image,originalFetch=globalThis.fetch,images=[];
 let currentPages=pages;
 globalThis.Image=class{
  constructor(){images.push(this);}
  decode(){return new Promise((resolve,reject)=>{this.finish=resolve;this.fail=reject;});}
 };
 globalThis.fetch=async()=>({ok:true,json:async()=>({version:1,pages:currentPages})});
 t.after(()=>{globalThis.Image=originalImage;globalThis.fetch=originalFetch;});
 const source=await readFile(new URL('../src/preview/snapshots.ts',import.meta.url),'utf8');
 const {outputText}=transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,target:ScriptTarget.ES2022}});
 const snapshots=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${moduleId++}`);
 return {snapshots,images,setPages:pages=>{currentPages=pages;},finish:async image=>{image.finish();await tick();}};
}

test('snapshot predecode limits concurrent work and reuses a captured image without selecting a page',async t=>{
 const {snapshots,images,finish}=await harness(t,{bot:capture('bot'),ideas:capture('ideas'),chat:capture('chat'),media:capture('media')});
 await snapshots.loadSnapshots();
 assert.equal(images.length,2,'only two image decodes may start concurrently');
 const revision=snapshots.snapshotRevision();
 const selected=snapshots.selectedSnapshot();
 snapshots.prewarmSnapshot('meta-media');
 snapshots.prewarmSnapshot('meta-media');
 snapshots.prewarmSnapshot('meta-chat');
 assert.equal(images.length,2);
 assert.equal(snapshots.snapshotRevision(),revision,'warming must not emit navigation state');
 assert.deepEqual(snapshots.selectedSnapshot(),selected,'warming must not change selection');
 await finish(images[0]);
 assert.equal(images.length,3);
 await finish(images[1]);
 assert.equal(images.length,4);
 await finish(images[2]);await finish(images[3]);
 await snapshots.loadSnapshots();
 for(const target of ['bot','ideas','meta-chat','meta-media','muse-search','muse-feed','muse-library'])snapshots.prewarmSnapshot(target);
 assert.equal(images.length,4,'the same capturedAt must not trigger duplicate loads');
 assert.deepEqual(new Set(images.map(image=>image.src)),new Set([
  '/__musebench_snapshots/bot.png?v=2026-10-28T12%3A00%3A00Z',
  '/__musebench_snapshots/ideas.png?v=2026-10-28T12%3A00%3A00Z',
  '/__musebench_snapshots/chat.png?v=2026-10-28T12%3A00%3A00Z',
  '/__musebench_snapshots/media.png?v=2026-10-28T12%3A00%3A00Z',
 ]));
});

test('a refreshed manifest drops obsolete queued images and decodes the new capture once',async t=>{
 const {snapshots,images,finish,setPages}=await harness(t,{bot:capture('bot'),ideas:capture('ideas'),goals:capture('goals'),chat:capture('chat')});
 await snapshots.loadSnapshots();
 assert.equal(images.length,2);
 setPages({chat:capture('chat','2026-10-28T13:00:00Z')});
 await snapshots.loadSnapshots();
 snapshots.prewarmSnapshot('meta-chat');
 assert.equal(images.length,2,'stale in-flight decodes still occupy the concurrency slots');
 await finish(images[0]);
 assert.equal(images.length,3);
 assert.equal(images[2].src,'/__musebench_snapshots/chat.png?v=2026-10-28T13%3A00%3A00Z');
 await finish(images[1]);await finish(images[2]);
 assert.equal(images.length,3,'obsolete queued captures must not be loaded');
 await snapshots.loadSnapshots();snapshots.prewarmSnapshot('meta-chat');
 assert.equal(images.length,3);
});

test('a failed image decode releases a worker and repeated hints cannot create a retry loop',async t=>{
 const {snapshots,images,finish}=await harness(t,{bot:capture('bot'),ideas:capture('ideas'),goals:capture('goals')});
 await snapshots.loadSnapshots();
 assert.equal(images.length,2);
 images[0].fail(new Error('Missing private capture'));await tick();
 assert.equal(images.length,3);
 snapshots.prewarmSnapshot('bot');snapshots.prewarmSnapshot('bot');
 assert.equal(images.length,3);
 await finish(images[1]);await finish(images[2]);
});
