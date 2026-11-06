import test from 'node:test';
import assert from 'node:assert/strict';
import { editScene, alignScene, duplicateSceneNodes, resizeArtboard } from '../src/shared/work-scene-operations.mjs';
const nodes = [{id:'a',type:'shape',x:10,y:20,width:50,height:30,rotation:0,opacity:1,locked:false,hidden:false},{id:'b',type:'text',text:'你好\nFlyer',x:90,y:80,width:40,height:40,rotation:0,opacity:1,locked:true,hidden:false}];
test('transform is immutable and respects locked layers',()=>{const next=editScene(nodes,['a','b'],{x:24});assert.equal(next[0].x,24);assert.equal(next[1].x,90);assert.equal(nodes[0].x,10);});
test('alignment and duplication preserve geometry with new IDs',()=>{assert.equal(alignScene(nodes.map(n=>({...n,locked:false})),['a','b'],'left')[1].x,10);const next=duplicateSceneNodes(nodes,['a'],()=> 'copy');assert.equal(next[2].id,'copy');assert.equal(next[2].x,26);});
test('invalid geometry and resize fail without mutation',()=>{assert.throws(()=>editScene(nodes,['a'],{width:-1}));assert.throws(()=>resizeArtboard({width:100,height:100,nodes},0,100));assert.equal(resizeArtboard({width:100,height:100,nodes},200,300).nodes[0].x,10);});
import {createWorkDocument,validateWorkDocument} from '../src/shared/work-documents.mjs';
import {groupScene} from '../src/shared/work-scene-operations.mjs';
test('ungroup and duplicate remain valid serialized documents',()=>{const doc=createWorkDocument('design'),board=doc.data.artboards[0];board.nodes=[{id:'a',type:'shape',shape:'rect',x:0,y:0,width:10,height:10,rotation:0,opacity:1,hidden:false,locked:false}];board.nodes=groupScene(board.nodes,['a'],'g');board.nodes=groupScene(board.nodes,['a']);board.nodes=duplicateSceneNodes(board.nodes,['a']);assert.doesNotThrow(()=>validateWorkDocument(doc));});


import {transformScene} from '../src/shared/work-scene-operations.mjs';
test('group transform scales and rotates object positions together',()=>{const input=[{...nodes[0],x:0,y:0,width:20,height:20},{...nodes[0],id:'c',x:40,y:0,width:20,height:20}];const scaled=transformScene(input,['a','c'],{scaleX:2,scaleY:2});assert.equal(scaled[1].x,80);assert.equal(scaled[1].width,40);const rotated=transformScene(input,['a','c'],{rotation:180});assert(Math.abs(rotated[0].x-40)<1e-8);assert.equal(rotated[0].rotation,180);});
test('distribution uses equal gaps for differently sized layers',()=>{const input=[{...nodes[0],id:'x',x:0,width:10},{...nodes[0],id:'y',x:40,width:30},{...nodes[0],id:'z',x:100,width:20}];const result=alignScene(input,['x','y','z'],'distribute-x');assert.equal(result[1].x-(result[0].x+result[0].width),result[2].x-(result[1].x+result[1].width));});
test('scene operations validate style/data and reject duplicate IDs',()=>{assert.throws(()=>editScene(nodes,['a'],{style:{fill:'url(file:///private)'}}));assert.throws(()=>duplicateSceneNodes(nodes,['a'],()=> 'a'));});
