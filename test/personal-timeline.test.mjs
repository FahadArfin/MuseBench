import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPersonalTimeline} from '../electron/personal-timeline.mjs';
test('timeline adapter executes only on exact service origins without credentials',async()=>{
 for(const url of ['https://auth.meta.ai/','https://auth.muse.ai/','https://www.facebook.com/','https://muse.ai.evil.example/','https://name:secret@muse.ai/','http://www.meta.ai/']){
  let calls=0;assert.equal(await applyPersonalTimeline({isDestroyed:()=>false,getURL:()=>url,executeJavaScript:()=>{calls++;return true;}},true),false);assert.equal(calls,0);
 }
 for(const url of ['https://muse.ai/','https://www.meta.ai/','https://meta.ai/']){
  let calls=0;assert.equal(await applyPersonalTimeline({isDestroyed:()=>false,getURL:()=>url,executeJavaScript:()=>{calls++;return true;}},true),true);assert.equal(calls,1);
 }
});
test('timeline installation contains no supplied CSS and tolerates destroyed or changing pages',async()=>{
 let script='';const contents={isDestroyed:()=>false,getURL:()=>'https://muse.ai/',executeJavaScript:source=>{script=source;return true;}};
 await applyPersonalTimeline(contents,true,{theme:'url(https://invalid.example)',font:'unsafe value'});assert(!script.includes('invalid.example'));assert(!script.includes('unsafe value'));
 assert.equal(await applyPersonalTimeline({isDestroyed:()=>true,getURL:()=>assert.fail('destroyed getter')},true),false);
 assert.equal(await applyPersonalTimeline({...contents,executeJavaScript:()=>{throw Error('navigation');}},true),false);
});
