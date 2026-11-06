import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMotionData, validateMotionData} from '../src/shared/work-motion-schema.mjs';
import {applyMotionOperation,sampleMotionScene,motionFrameTimes,convertToMotionData} from '../src/shared/work-motion-operations.mjs';
const node={id:'node',type:'text',x:10,y:20,width:200,height:100,rotation:0,opacity:1,locked:false,hidden:false,text:'Hello'};
const fixture=()=>({...createMotionData(),scenes:[{id:'scene',name:'First',startTicks:0,durationTicks:5000,background:'#fff',nodes:[node],tracks:[]}]});
test('keyframes are immutable, interpolated exactly, movable and removable',()=>{
 const original=fixture();
 let data=applyMotionOperation(original,{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'x',tick:0,value:10,easing:'linear',id:'k1'});
 data=applyMotionOperation(data,{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'x',tick:1000,value:110,id:'k2'});
 assert.equal(original.scenes[0].tracks.length,0);assert.equal(sampleMotionScene(data,500).nodes[0].x,60);
 assert.equal(sampleMotionScene(data,1000).nodes[0].x,110);
 data=applyMotionOperation(data,{type:'moveKeyframe',sceneId:'scene',trackId:data.scenes[0].tracks[0].id,keyframeId:'k2',tick:2000});
 assert.equal(sampleMotionScene(data,1000).nodes[0].x,60);
 data=applyMotionOperation(data,{type:'deleteKeyframe',sceneId:'scene',trackId:data.scenes[0].tracks[0].id,keyframeId:'k2'});
 assert.equal(data.scenes[0].tracks[0].keyframes.length,1);
 assert.deepEqual(validateMotionData(JSON.parse(JSON.stringify(data))),data);
});
test('presets preserve editable chart data and loop endpoint has explicit semantics',()=>{
 const data=applyMotionOperation(fixture(),{type:'preset',sceneId:'scene',nodeId:'node',preset:'fade',durationTicks:1000});
 assert.equal(sampleMotionScene(data,0).nodes[0].opacity,0);assert.equal(sampleMotionScene(data,1000).nodes[0].opacity,1);
 assert.equal(sampleMotionScene({...data,loop:true},5000).nodes[0].opacity,0);
 assert.equal(sampleMotionScene({...data,loop:true},5000,{loop:false}).nodes[0].opacity,1);
 assert.deepEqual(motionFrameTimes({...data,durationTicks:1000,fps:10,scenes:[{...data.scenes[0],durationTicks:1000}]}),[0,100,200,300,400,500,600,700,800,900]);
});
test('schema rejects duplicate ticks, dangling targets and unsafe bounds',()=>{
 const data=fixture();data.scenes[0].tracks=[{id:'t',nodeId:'missing',property:'x',keyframes:[{id:'k',tick:0,value:0,easing:'linear'}]}];
 assert.throws(()=>validateMotionData(data),/nodeId/);
 assert.throws(()=>validateMotionData({...fixture(),fps:Infinity}),/fps/);
 assert.throws(()=>applyMotionOperation(fixture(),{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'opacity',tick:0,value:2}),/value/);
});
test('poster conversion creates new IDs, independent nodes, and source identity mapping',()=>{
 let sequence=0;const source={version:2,id:'poster',kind:'design',assets:[],data:{artboards:[{id:'board',name:'Poster',width:800,height:600,background:'#fff',nodes:[node]}]}};
 const result=convertToMotionData(source,{makeId:()=>`new-${++sequence}`});
 assert.equal(result.scenes[0].sourceId,'board');assert.equal(result.scenes[0].nodes[0].sourceId,'node');
 assert.notEqual(result.scenes[0].nodes[0].id,'node');result.scenes[0].nodes[0].text='Changed';assert.equal(node.text,'Hello');
});
test('deleting a layer removes only its tracks; sampled text scales typography',()=>{
 let data=applyMotionOperation(fixture(),{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'scaleY',tick:0,value:2});
 data.scenes[0].nodes[0].style={fontSize:30};assert.equal(sampleMotionScene(data,0).nodes[0].style.fontSize,60);
 assert.equal(applyMotionOperation(data,{type:'replaceNodes',sceneId:'scene',nodes:[]}).scenes[0].tracks.length,0);
});
test('motion rejects unsafe backgrounds and duplicate IDs across scenes',()=>{
 assert.throws(()=>validateMotionData({...fixture(),scenes:[{...fixture().scenes[0],background:'url(file:///private)'}]}),/safe color/);
 const data=fixture();data.durationTicks=10000;data.scenes.push({...structuredClone(data.scenes[0]),id:'other',startTicks:5000});assert.throws(()=>validateMotionData(data),/duplicate id/i);
});
test('scene duration edits keep following scenes in sync and reject keyframe loss',()=>{
 let data=fixture();data.durationTicks=7000;data.scenes.push({id:'second',name:'Second',startTicks:5000,durationTicks:2000,background:'#fff',nodes:[],tracks:[]});
 data=applyMotionOperation(data,{type:'sceneDuration',sceneId:'scene',durationTicks:3000});assert.equal(data.durationTicks,5000);assert.equal(data.scenes[1].startTicks,3000);
 data=applyMotionOperation(data,{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'x',tick:2000,value:20});assert.throws(()=>applyMotionOperation(data,{type:'sceneDuration',sceneId:'scene',durationTicks:1000}),/tick/);
});
test('legacy conversion retains source artifact, editable chart/kicker and integer scene boundaries',()=>{
 let i=0;const source={version:1,kind:'motion',title:'Old animation',charts:[{type:'bar',title:'Legacy chart',labels:['A'],values:[42]}],scenes:[{kicker:'Opening',title:'One',body:'Editable text',duration:2},{title:'Two',body:'More text',duration:3}]};const before=JSON.stringify(source);
 const data=convertToMotionData(source,{makeId:()=>`legacy-${++i}`});assert.equal(JSON.stringify(source),before);assert.equal(data.durationTicks,5000);assert.equal(sampleMotionScene(data,2000).name,'Two');assert.equal(data.scenes[0].nodes[1].text,'Editable text');assert.ok(data.scenes[0].nodes.some(n=>n.text==='Opening'));assert.deepEqual(data.scenes[0].nodes.find(n=>n.type==='chart').chart.values,[42]);
});
test('outgoing keyframe easing controls interpolation',()=>{
 let data=applyMotionOperation(fixture(),{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'x',tick:0,value:0,easing:'ease-in'});data=applyMotionOperation(data,{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'x',tick:1000,value:100});assert.equal(sampleMotionScene(data,500).nodes[0].x,25);
 data=applyMotionOperation(data,{type:'setKeyframe',sceneId:'scene',nodeId:'node',property:'x',tick:0,value:0,easing:'step'});assert.equal(sampleMotionScene(data,999).nodes[0].x,0);assert.equal(sampleMotionScene(data,1000).nodes[0].x,100);
});
