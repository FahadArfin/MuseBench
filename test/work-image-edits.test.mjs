import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasPointToSource,createImageMask,addMaskStroke,maskAlphaAt,acceptImageEdit} from '../src/work/image-edits.mjs';
const node={id:'layer',type:'image',assetId:'original',x:100,y:100,width:200,height:100,rotation:90,image:{crop:{x:.25,y:.2,width:.5,height:.5},flipX:false,flipY:false}};
test('rotated and cropped canvas selections map back to immutable source pixels',()=>{
 for(const point of [canvasPointToSource({x:200,y:50},node,{width:1000,height:500}),canvasPointToSource({x:200,y:250},{...node,image:{...node.image,flipX:true}},{width:1000,height:500})]){assert.ok(Math.abs(point.x-250)<1e-9);assert.ok(Math.abs(point.y-225)<1e-9);}
 assert.equal(canvasPointToSource({x:0,y:0},node,{width:1000,height:500}),null);
});
test('contain letterboxing and cover clipping match actual image preview geometry',()=>{
 const square={...node,x:0,y:0,width:200,height:200,rotation:0,image:{fit:'contain'}};
 assert.equal(canvasPointToSource({x:100,y:25},square,{width:1000,height:500}),null);
 assert.deepEqual(canvasPointToSource({x:0,y:50},square,{width:1000,height:500}),{x:0,y:0});
 assert.deepEqual(canvasPointToSource({x:0,y:0},{...square,image:{fit:'cover'}},{width:1000,height:500}),{x:250,y:0});
});
test('brush/erase/invert/feather have explicit bounded source-space semantics',()=>{
 let mask=createImageMask({sourceAssetId:'original',width:100,height:100,feather:10});assert.equal(maskAlphaAt(mask,{x:50,y:50}),0);
 mask=addMaskStroke(mask,{mode:'brush',radius:20,points:[{x:0,y:50},{x:100,y:50}]});assert.equal(maskAlphaAt(mask,{x:0,y:50}),1);assert.equal(maskAlphaAt(mask,{x:50,y:75}),.5);
 mask=addMaskStroke(mask,{mode:'erase',radius:5,points:[{x:50,y:50}]});assert.equal(maskAlphaAt(mask,{x:50,y:50}),0);
 assert.equal(maskAlphaAt({...mask,inverted:true},{x:50,y:50}),1);assert.equal(maskAlphaAt({...mask,inverted:true},{x:-1,y:50}),0);
 assert.throws(()=>addMaskStroke(mask,{mode:'brush',radius:2,points:[{x:1000,y:0}]}));
});
test('accept creates a new asset layer, respects output size, and rejects stale revision/item/target',()=>{
 const document={id:'item',revision:2,kind:'image',assets:[{id:'original'}],data:{artboards:[{id:'board',nodes:[node]}]}};
 const proposal={itemId:'item',revision:2,surfaceId:'board',nodeId:'layer',sourceAssetId:'original',status:'completed',asset:{id:'generated',mediaType:'image/png',width:800,height:400,origin:{type:'generated'}}};
 const next=acceptImageEdit(document,proposal,{nodeId:'new-layer'});assert.equal(document.data.artboards[0].nodes.length,1);assert.equal(next.data.artboards[0].nodes.length,2);assert.equal(next.assets.length,2);assert.equal(next.data.artboards[0].nodes[1].assetId,'generated');assert.equal(next.data.artboards[0].nodes[1].image.crop.width,1);
 for(const change of [{revision:3},{id:'other'}])assert.throws(()=>acceptImageEdit({...document,...change},proposal,{nodeId:'new-layer'}),{code:'STALE_RESULT'});
 assert.throws(()=>acceptImageEdit(document,{...proposal,sourceAssetId:'wrong'},{nodeId:'new-layer'}),{code:'STALE_RESULT'});
 assert.throws(()=>acceptImageEdit(document,{...proposal,status:'cancelled'},{nodeId:'new-layer'}));
});
