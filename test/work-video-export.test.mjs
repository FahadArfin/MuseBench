import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkRenderPlan } from '../src/shared/work-render-plan.mjs';
import { createDefaultVideoData } from '../src/shared/work-video-schema.mjs';
import { renderWorkVideo } from '../electron/work-video-export.mjs';
import { validateEncodedMedia } from '../electron/work-video-export.mjs';

function document() {const data=createDefaultVideoData(); data.tracks[0].clips.push({id:'clip',kind:'video',assetId:'original',start:0,duration:30000,sourceIn:15000,speed:2,transform:{x:0,y:0,scale:1,rotation:0,fit:'contain',crop:{left:0,top:0,right:0,bottom:0}},audio:{gain:.5,muted:false,fadeIn:3000,fadeOut:3000},transition:{type:'crossfade',duration:3000}});return {version:2,id:'test',kind:'video',revision:4,assets:[],data};}
test('render compiler is deterministic, resolves original assets and explicit range/presets',()=>{
  const doc=document(); const settings={aspectRatio:'9:16',resolution:720,fps:24,range:{start:7500,end:22500}};
  const a=compileWorkRenderPlan(doc,settings); assert.deepEqual(a,compileWorkRenderPlan(doc,settings));
  assert.equal(a.width,720);assert.equal(a.height,1280);assert.equal(a.duration,.5);assert.equal(a.fps,24);
  assert.deepEqual(a.assetIds,['original']);assert.equal(a.clips[0].speed,2);assert.equal(a.clips[0].sourceIn,.5);
});
test('rejects unsupported quality, range, dimensions and malformed timeline',()=>{
  assert.throws(()=>compileWorkRenderPlan(document(),{fps:60}), /24|30/);
  assert.throws(()=>compileWorkRenderPlan(document(),{range:{start:0,end:90000}}), /range/i);
  assert.throws(()=>compileWorkRenderPlan(document(),{quality:'arbitrary command'}), /quality/i);
  const doc=document();doc.data.tracks[0].clips[0].speed=0;assert.throws(()=>compileWorkRenderPlan(doc));
});
test('render fails closed without toolchain or native destination',async()=>{
  await assert.rejects(renderWorkVideo({document:document(),destinationPath:'relative.mp4',resolveAsset:()=>'',capabilities:{available:false,mp4:false,reasons:['Unavailable']}}),/destination|absolute/i);
});
test('muted visual tracks cannot reappear in final render inputs',()=>{
  const doc=document();doc.data.tracks[0].muted=true;doc.data.captions=[{id:'c',start:0,end:30000,text:'caption',style:{fontSize:48,color:'#ffffff',background:'#000000',position:'bottom',safeArea:.1}}];
  const plan=compileWorkRenderPlan(doc);assert.equal(plan.clips.length,0);assert.deepEqual(plan.assetIds,[]);
});
test('GIF centisecond quantization is accepted while MP4 frame rate remains exact',()=>{
  const metadata={width:320,height:180,duration:1.01,frameRate:50/3,streams:[{type:'video',codec:'gif'}],audio:[]};
  assert.doesNotThrow(()=>validateEncodedMedia(metadata,{width:320,height:180,duration:1,fps:15,format:'gif'}));
  assert.throws(()=>validateEncodedMedia({...metadata,streams:[{type:'video',codec:'h264'}]},{width:320,height:180,duration:1,fps:15,format:'mp4'}),/verification/);
});
