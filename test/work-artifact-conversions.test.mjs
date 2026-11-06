import test from 'node:test';
import assert from 'node:assert/strict';
import {convertArtifactSelection,createWorkArtifactSnapshot} from '../src/work/artifact-conversions.mjs';
import {isWorkSharingSupported} from '../src/shared/work-sharing.mjs';
const artifact=()=>({version:1,kind:'dashboard',title:'Quarterly',summary:'Private unrelated summary',sources:[{name:'Public ledger',detail:'Fictional sample'}],metrics:[],charts:[{title:'Revenue',type:'bar',labels:['Q1','Q2'],values:[-2,8],source:'Public ledger',calculation:'Sum revenue',unit:'USD'}],sections:[],scenes:[],table:{columns:['Quarter','Revenue'],rows:[['Q1',-2],['Q2',8]]}});
test('selected dashboard chart converts to editable independent slide/design/document objects with exact values and provenance',()=>{
 for(const targetKind of ['design','slides','document']){
  const source=artifact(),copy=convertArtifactSelection({artifact:source,selection:{type:'chart',index:0},targetKind,sourceItemId:'source-item',sourceRevision:3});
  assert.equal(copy.version,2);assert.equal(copy.kind,targetKind);assert.notEqual(copy.id,'source-item');
  const nodes=targetKind==='document'?copy.data.blocks:targetKind==='slides'?copy.data.slides[0].nodes:copy.data.artboards[0].nodes;
  assert.deepEqual(nodes.find(n=>n.type==='chart').chart.values,[-2,8]);assert.match(JSON.stringify(copy.data),/Public ledger/);assert.match(JSON.stringify(copy.data),/Sum revenue/);assert(!JSON.stringify(copy).includes('Private unrelated summary'));
  nodes.find(n=>n.type==='chart').chart.values[0]=999;assert.equal(source.charts[0].values[0],-2);
 }
});
test('selected table is editable and preserves cell values, documents stringify numeric cells explicitly',()=>{
 for(const targetKind of ['design','slides','document']){
  const copy=convertArtifactSelection({artifact:artifact(),selection:{type:'table'},targetKind});
  const nodes=targetKind==='document'?copy.data.blocks:targetKind==='slides'?copy.data.slides[0].nodes:copy.data.artboards[0].nodes;
  const table=nodes.find(n=>n.type==='table');assert.deepEqual(table.table?.rows??table.rows,targetKind==='document'?[['Q1','-2'],['Q2','8']]:[['Q1',-2],['Q2',8]]);
 }
});
test('invalid selections, unsupported targets and non-dashboard sources fail explicitly',()=>{
 for(const patch of [{selection:{type:'chart',index:99}},{selection:{type:'metric',index:0}},{selection:{type:'chart',index:0,path:'C:/private'}},{sourceItemId:'C:/private'},{sourceRevision:-1},{targetKind:'video'},{artifact:{...artifact(),kind:'slides'}}])assert.throws(()=>convertArtifactSelection({artifact:artifact(),selection:{type:'chart',index:0},targetKind:'design',...patch}));
});
test('supported sharing snapshot excludes private chat, attached input paths and credentials and remains independent',()=>{
 const source=artifact();source.privateChat=[{text:'PRIVATE_CHAT'}];source.credentials={token:'PRIVATE_TOKEN'};source.workspacePath='C:/PRIVATE_WORKSPACE';source.history=[{private:'PRIVATE_HISTORY'}];source.sources[0].path='C:/PRIVATE_INPUT';
 const copy=createWorkArtifactSnapshot(source),serialized=JSON.stringify(copy);assert(!serialized.includes('PRIVATE_'));assert.equal(copy.sources[0].detail,'Fictional sample');
 source.charts[0].values[0]=99;assert.equal(copy.charts[0].values[0],-2);
});
test('creative documents remain private/exportable until a supported sharing viewer exists',()=>{
 assert.throws(()=>createWorkArtifactSnapshot({version:2,kind:'design',data:{}}),/private|export|sharing/i);
});
test('Sites and Spaces offer only declared legacy snapshot kinds and exclude creative/future schemas',()=>{
 for(const kind of ['dashboard','motion','document','slides'])assert.equal(isWorkSharingSupported({kind}),true);
 for(const item of [{kind:'image'},{kind:'video'},{kind:'design'},{kind:'unknown'},{kind:'slides',documentVersion:2},{kind:'slides',documentRevision:0},{kind:'document',documentVersion:3},null])assert.equal(isWorkSharingSupported(item),false);
});
