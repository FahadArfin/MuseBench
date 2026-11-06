import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustImage, resetImage, cropImage } from '../src/shared/work-image-operations.mjs';
const node={id:'img',type:'image',assetId:'logo',x:0,y:0,width:100,height:50,rotation:0,opacity:1,locked:false,hidden:false};
test('non destructive crop/adjust preserve original asset and reject bounds',()=>{const next=cropImage(adjustImage(node,{brightness:.3,flipX:true}),{x:.1,y:.2,width:.8,height:.7});assert.equal(next.assetId,'logo');assert.equal(next.image.brightness,.3);assert.equal(node.image,undefined);assert.throws(()=>cropImage(node,{x:.8,y:0,width:.5,height:1}));});
test('reset clears transforms and retains original bytes reference',()=>{const next=resetImage(adjustImage(node,{contrast:1.8,mask:'ellipse'}));assert.equal(next.image.contrast,1);assert.equal(next.image.mask,'none');assert.equal(next.assetId,'logo');assert.throws(()=>adjustImage(node,{brightness:9}));});
test('adjustImage rejects invalid direct crop patches',()=>{assert.throws(()=>adjustImage(node,{crop:{x:0,y:0,width:2,height:1}}));});
