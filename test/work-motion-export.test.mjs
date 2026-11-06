import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMotionData} from '../src/shared/work-motion-schema.mjs';
import {compileMotionExportPlan,renderMotionFrameHtml,renderWorkMotion} from '../electron/work-motion-export.mjs';
const document=()=>({version:2,id:'doc',kind:'motion',title:'Animation',revision:4,createdAt:'2026-11-05T12:00:00.000Z',updatedAt:'2026-11-05T12:00:00.000Z',assets:[],data:createMotionData({makeId:()=> 'scene'})});
test('export frame schedule is half-open and bounded for GIF',()=>{
 const plan=compileMotionExportPlan(document(),{format:'gif'});assert.equal(plan.times.length,75);assert.equal(plan.times[0],0);assert.ok(plan.times.at(-1)<5000);assert.equal(plan.width,720);assert.equal(plan.height,404);assert.equal(plan.revision,4);
 assert.throws(()=>compileMotionExportPlan(document(),{format:'gif',fps:30}),/frame rate/);assert.throws(()=>compileMotionExportPlan(document(),{format:'gif',width:1280}),/dimensions/);
});
test('export markup escapes scene strings and samples keyframe boundaries',()=>{
 const doc=document();doc.data.scenes[0].nodes=[{id:'title',type:'text',x:0,y:0,width:100,height:100,rotation:0,opacity:1,locked:false,hidden:false,text:'<script>alert(1)</script>'}];
 doc.data.scenes[0].tracks=[{id:'t',nodeId:'title',property:'opacity',keyframes:[{id:'k0',tick:0,value:0,easing:'linear'},{id:'k1',tick:1000,value:1,easing:'linear'}]}];
 const plan=compileMotionExportPlan(doc);const html=renderMotionFrameHtml(plan.document.data,0);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('opacity:0'));assert.ok(!html.includes('<script>'));
 assert.ok(renderMotionFrameHtml(plan.document.data,1000).includes('opacity:1'));
});
test('cancelled or unavailable export fails before creating a renderer',async()=>{
 const controller=new AbortController();controller.abort();let opened=0;const BrowserWindow=function(){opened++;throw Error('Unexpected renderer');};
 await assert.rejects(renderWorkMotion({document:document(),signal:controller.signal,BrowserWindow}),/cancelled/);
 await assert.rejects(renderWorkMotion({document:document(),BrowserWindow,capabilities:{available:false,reasons:['FFmpeg missing']}}),/FFmpeg missing/);assert.equal(opened,0);
});
