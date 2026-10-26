import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createImageStore} from '../src/controller/code-images.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
test('screenshots survive store reopen and reject other projects, changed bytes and forged refs',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-images-'));try{
 const store=createImageStore(dir),ref=await store.import('p',{name:'screen.png',dataUrl:png});
 assert.equal(ref.mime,'image/png');assert.equal(await createImageStore(dir).read('p',ref),png);
 await assert.rejects(store.resolve('other',[ref]),/unavailable/);
 await assert.rejects(store.resolve('p',[{...ref,id:'../escape'}]),/Invalid/);
 const [file]=await store.resolve('p',[ref]);await writeFile(file,'tampered');await assert.rejects(store.resolve('p',[ref]),/changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('screenshots reject non-images and oversized lists before writing',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'muse-images-'));try{
 const store=createImageStore(dir);
 await assert.rejects(store.import('p',{name:'bad.png',dataUrl:'data:image/png;base64,aGVsbG8='}),/image/);
 const ref=await store.import('p',{name:'screen.png',dataUrl:png});
 await assert.rejects(store.resolve('p',Array(5).fill(ref)),/four/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
