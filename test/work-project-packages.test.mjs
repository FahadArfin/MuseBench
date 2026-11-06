import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWorkProjectPackage,validateWorkProjectPackage,importWorkProjectPackage,WORK_PACKAGE_LIMITS} from '../src/work/project-packages.mjs';
import {createDefaultVideoData} from '../src/shared/work-video-schema.mjs';
import {createVideoClip} from '../src/shared/work-video-operations.mjs';

const bytes=Buffer.from('fixture image bytes'),hash=createHash('sha256').update(bytes).digest('hex');
const doc=()=>({version:2,id:'project-original',kind:'design',title:'Portable 日本語 العربية',revision:4,createdAt:'2026-11-05T00:00:00.000Z',updatedAt:'2026-11-05T00:00:00.000Z',assets:[{id:'asset-original',hash,name:'sample.png',mediaType:'image/png',bytes:bytes.length,storageRef:`assets/${hash}.png`,origin:'import'}],data:{artboards:[{id:'board-original',name:'Poster',width:800,height:600,background:'#ffffff',nodes:[{id:'node-original',type:'image',x:0,y:0,width:100,height:100,rotation:0,opacity:1,locked:false,hidden:false,assetId:'asset-original'}]}],activeArtboardId:'board-original'}});
test('portable package contains selected document and verified required bytes, omits history/private state by default',async()=>{
 const document=doc();document.chat='SECRET';document.credentials={key:'SECRET'};
 const packed=await createWorkProjectPackage({document,resolveAsset:()=>bytes,history:[doc()]});
 assert(!packed.includes(Buffer.from('SECRET')));const validated=validateWorkProjectPackage(packed);
 assert.equal(validated.document.title,document.title);assert.equal(validated.history.length,0);assert.deepEqual(validated.assets[0].bytes,bytes);
 assert.equal(validated.document.assets[0].storageRef,`content/${hash}`);
});
test('import remaps project/object/asset IDs and references and uses managed writer storage',async()=>{
 const packed=await createWorkProjectPackage({document:doc(),resolveAsset:()=>bytes});let writes=0,n=0;
 const imported=await importWorkProjectPackage({bytes:packed,createId:()=>`new-${++n}`,writeAsset:async({asset,bytes:actual})=>{writes++;assert.deepEqual(actual,bytes);return {...asset,storageRef:`assets/${hash}.png`};}});
 assert.equal(writes,1);assert.notEqual(imported.document.id,'project-original');assert.notEqual(imported.document.assets[0].id,'asset-original');
 assert.equal(imported.document.data.artboards[0].nodes[0].assetId,imported.document.assets[0].id);
 assert.equal(imported.document.data.activeArtboardId,imported.document.data.artboards[0].id);
 assert.equal(imported.document.revision,0);assert.equal(doc().data.artboards[0].nodes[0].assetId,'asset-original');
});
test('hashes, unsafe names/paths, unknown package keys, duplicated entries and oversized bytes fail before writing',async()=>{
 const packed=await createWorkProjectPackage({document:doc(),resolveAsset:()=>bytes});const original=JSON.parse(packed);
 for(const mutate of [p=>p.assets[0].data=Buffer.from('corrupt').toString('base64'),p=>p.assets[0].path='../secret',p=>p.document.assets[0].storageRef='C:/secret',p=>p.credentials={},p=>p.assets.push(p.assets[0]),p=>p.document.assets[0].name='../sample.png']){
  const p=structuredClone(original);mutate(p);let writes=0;
  await assert.rejects(importWorkProjectPackage({bytes:Buffer.from(JSON.stringify(p)),writeAsset:()=>{writes++;}}));assert.equal(writes,0);
 }
 assert.throws(()=>validateWorkProjectPackage(Buffer.alloc(WORK_PACKAGE_LIMITS.maxPackageBytes+1)),/size|large|limit/i);
});
test('explicit history is validated, includes its required bytes, and preserves independent revision chain',async()=>{
 const older=doc();older.revision=2;older.title='Earlier';
 const packed=await createWorkProjectPackage({document:doc(),resolveAsset:()=>bytes,history:[older],includeHistory:true});
 assert.equal(validateWorkProjectPackage(packed).history[0].title,'Earlier');
 const imported=await importWorkProjectPackage({bytes:packed,writeAsset:async({asset})=>({...asset,storageRef:`assets/${hash}.png`})});
 assert.equal(imported.history[0].id,imported.document.id);assert.equal(imported.history[0].revision,0);assert.equal(imported.document.revision,1);
});
test('unreferenced assets never enter packages and writer-created asset IDs are remapped',async()=>{
 const document=doc();document.assets.push({...document.assets[0],id:'unused',name:'private.png',hash:'a'.repeat(64)});let reads=0;
 const packed=await createWorkProjectPackage({document,resolveAsset:()=>{reads++;return bytes;}});assert.equal(reads,1);assert(!packed.includes(Buffer.from('private.png')));
 const imported=await importWorkProjectPackage({bytes:packed,writeAsset:async({asset})=>({...asset,id:'store-assigned-id',storageRef:`originals/${hash}.png`})});
 assert.equal(imported.document.data.artboards[0].nodes[0].assetId,'store-assigned-id');
});
test('rehashed malformed manifests still reject traversal, missing assets and incompatible history',async()=>{
 const original=JSON.parse(await createWorkProjectPackage({document:doc(),resolveAsset:()=>bytes}));
 for(const mutate of [p=>p.document.assets[0].storageRef='../secret',p=>p.document.assets[0].storageRef='originals/unrelated.png',p=>p.document.assets[0].name='C:\\private.png',p=>p.assets=[],p=>p.history=[{document:{...p.document,id:'different-id',revision:1},hash:''}]]){
  const p=structuredClone(original);mutate(p);p.documentHash=createHash('sha256').update(JSON.stringify(p.document)).digest('hex');if(p.history.length)p.history[0].hash=createHash('sha256').update(JSON.stringify(p.history[0].document)).digest('hex');
  let writes=0;await assert.rejects(importWorkProjectPackage({bytes:JSON.stringify(p),writeAsset:()=>{writes++;}}));assert.equal(writes,0);
 }
});
test('import remaps grouping labels and never merges separate source groups',async()=>{
 const document=doc();document.data.artboards[0].nodes[0].groupId='source-group';
 const packed=await createWorkProjectPackage({document,resolveAsset:()=>bytes});
 const imported=await importWorkProjectPackage({bytes:packed,writeAsset:async({asset})=>({...asset,storageRef:`originals/${hash}.png`})});
 assert.notEqual(imported.document.data.artboards[0].nodes[0].groupId,'source-group');
});
test('explicit history preserves relinked asset snapshots with the same original ID and different hashes',async()=>{
 const document=doc(),old=doc();old.revision=2;const oldBytes=Buffer.from('old image'),oldHash=createHash('sha256').update(oldBytes).digest('hex');old.assets[0]={...old.assets[0],hash:oldHash,bytes:oldBytes.length,storageRef:`originals/${oldHash}.png`};
 const packed=await createWorkProjectPackage({document,includeHistory:true,history:[old],resolveAsset:asset=>asset.hash===oldHash?oldBytes:bytes});
 const written=[];const imported=await importWorkProjectPackage({bytes:packed,writeAsset:async({asset,bytes})=>{written.push(bytes);return{...asset,storageRef:`originals/${asset.hash}.png`};}});
 assert.equal(written.length,2);assert.notEqual(imported.history[0].assets[0].id,imported.document.assets[0].id);
 assert.equal(imported.history[0].data.artboards[0].nodes[0].assetId,imported.history[0].assets[0].id);assert.equal(imported.document.data.artboards[0].nodes[0].assetId,imported.document.assets[0].id);
 assert.equal(imported.history[0].assets[0].hash,oldHash);assert.equal(imported.document.assets[0].hash,hash);
});
test('store byte deduplication safely merges duplicate source asset IDs and updates their references',async()=>{
 const document=doc();document.assets.push({...document.assets[0],id:'second-source-id'});document.data.artboards[0].nodes.push({...document.data.artboards[0].nodes[0],id:'second-node',assetId:'second-source-id'});
 const packed=await createWorkProjectPackage({document,resolveAsset:()=>bytes});
 const imported=await importWorkProjectPackage({bytes:packed,writeAsset:async({asset})=>({...asset,id:'deduplicated-store-id',storageRef:`originals/${hash}.png`})});
 assert.equal(imported.document.assets.length,1);assert(imported.document.data.artboards[0].nodes.every(node=>node.assetId==='deduplicated-store-id'));
});
test('portable video preserves linked editing with new independent linked-group IDs',async()=>{
 const document=doc();document.kind='video';document.data=createDefaultVideoData();document.data.tracks[0].clips.push(...['first','second'].map((id,index)=>createVideoClip({id,kind:'image',assetId:'asset-original',start:index*30000,duration:30000,linkedGroupId:'source-linked-group'})));
 const packed=await createWorkProjectPackage({document,resolveAsset:()=>bytes});const imported=await importWorkProjectPackage({bytes:packed,writeAsset:async({asset})=>({...asset,storageRef:`originals/${hash}.png`})});
 const clips=imported.document.data.tracks[0].clips;assert.notEqual(clips[0].linkedGroupId,'source-linked-group');assert.equal(clips[0].linkedGroupId,clips[1].linkedGroupId);
});

