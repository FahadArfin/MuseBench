import test from 'node:test';
import assert from 'node:assert/strict';
import * as schema from '../src/shared/work-documents.mjs';
import {demoArtifact} from '../src/shared/work-artifacts.mjs';
const node = (extra={}) => ({id:'text-1',type:'text',x:10,y:20,width:200,height:60,rotation:0,opacity:1,locked:false,hidden:false,text:'Hello',...extra});
const design = () => schema.createDesignDocument({id:'item-1',title:'Poster',now:'2026-11-05T12:00:00.000Z'});
test('factories create independent versioned design and image scenes',()=>{
  for(const kind of ['design','image']) {const value=schema.createWorkDocument(kind,{id:'item-1'});assert.equal(value.kind,kind);assert.equal(value.version,2);assert.equal(value.revision,0);assert.equal(value.data.artboards.length,1);assert.deepEqual(schema.validateWorkDocument(value),value);}
  const value=design();value.data.artboards[0].nodes.push(node());const out=schema.validateWorkDocument(value);out.data.artboards[0].nodes[0].text='Changed';assert.equal(value.data.artboards[0].nodes[0].text,'Hello');
});
test('unknown versions kinds fields and malformed envelope fail predictably',()=>{
  for(const patch of [{version:3},{kind:'websites'},{revision:-1},{revision:1.5},{id:''},{createdAt:'yesterday'},{script:'alert(1)'},{assets:null}])assert.throws(()=>schema.validateWorkDocument({...design(),...patch}),/document|version|kind|revision|id|createdAt|script|assets/i);
});
test('finite bounded geometry duplicate IDs unsafe styles and dangling references are rejected',()=>{
  for(const bad of [node({x:Infinity}),node({width:0}),node({opacity:2}),node({rotation:NaN}),node({assetId:'missing'}),node({style:{fill:'url(file:///secret)'}}),node({onclick:'run()'}),node({style:{fontSize:Infinity}})]) {const d=design();d.data.artboards[0].nodes=[bad];assert.throws(()=>schema.validateWorkDocument(d));}
  const d=design();d.data.artboards[0].nodes=[node(),node()];assert.throws(()=>schema.validateWorkDocument(d),/duplicate/i);
});
test('managed assets require hashes safe storage and matching references',()=>{
  const d=design();d.assets=[{id:'asset-1',hash:'a'.repeat(64),name:'photo.png',mediaType:'image/png',bytes:5,storageRef:'assets/'+ 'a'.repeat(64)+'.png',origin:'import'}];d.data.artboards[0].nodes=[node({type:'image',text:undefined,assetId:'asset-1'})];delete d.data.artboards[0].nodes[0].text;assert.equal(schema.validateWorkDocument(d).assets.length,1);
  for(const storageRef of ['../secret','C:\\secret','/secret','https://example.com/a','assets/../../secret','assets/%2e%2e/secret'])assert.throws(()=>schema.validateWorkDocument({...d,assets:[{...d.assets[0],storageRef}]}));
});
test('legacy readers preserve all four v1 kinds without rewriting',()=>{
  for(const kind of ['dashboard','motion','document','slides']) {const input=demoArtifact(kind);const serialized=JSON.stringify(input);assert.deepEqual(schema.readWorkDocumentValue(input),input);assert.equal(JSON.stringify(input),serialized);}
});
test('budget guards reject excessive dimensions and nodes',()=>{
  const d=design();d.data.artboards[0].width=100001;assert.throws(()=>schema.validateWorkDocument(d),/width|limit/i);
  d.data.artboards[0].width=100;d.data.artboards[0].nodes=Array.from({length:2001},(_,i)=>node({id:'node-'+i}));assert.throws(()=>schema.validateWorkDocument(d),/limit|nodes/i);
});
test('all enabled editor factories validate through explicit owned schemas',()=>{
  for(const kind of ['slides','motion','video','document']) {const value=schema.createWorkDocument(kind,{id:'item-'+kind});assert.equal(value.kind,kind);assert.deepEqual(schema.validateWorkDocument(value),value);assert.throws(()=>schema.validateWorkDocument({...value,data:{...value.data,executable:'evil()'}}),/field|unsupported|not supported|unrecognized/i);}
});
test('non-JSON values sparse arrays cycles and getters fail before serialization',()=>{
 const d=design();d.data.artboards[0].nodes=Array(1);assert.throws(()=>schema.validateWorkDocument(d),/sparse|array|JSON/i);
 const getter=design();Object.defineProperty(getter,'title',{get(){throw Error('getter executed');},enumerable:true});assert.throws(()=>schema.validateWorkDocument(getter),/accessor/i);
 const cycle=design();cycle.data.artboards[0].nodes.push(cycle);assert.throws(()=>schema.validateWorkDocument(cycle),/cyclic/i);
 const symbol=design();symbol[Symbol('secret')]='hidden';assert.throws(()=>schema.validateWorkDocument(symbol),/symbol|JSON/i);
});
test('all editor kinds reject dangling asset references and globally duplicate ids',()=>{
  const d=schema.createWorkDocument('video',{id:'video-1'});d.data.storyboard=[{id:'story-1',title:'A',duration:1000,narration:'',transition:'cut',assetId:'missing'}];assert.throws(()=>schema.validateWorkDocument(d),/asset/i);
  const v=schema.createWorkDocument('video',{id:'video-1'});v.data.captions=[{id:v.data.tracks[0].id,start:0,end:1000,text:'Caption',style:{fontSize:30,color:'#ffffff',background:'#000000',position:'bottom',safeArea:.1}}];assert.throws(()=>schema.validateWorkDocument(v),/duplicate/i);
});
test('generated asset provenance is explicitly bounded data and retains attribution',()=>{
 const d=design();d.assets=[{id:'generated-1',hash:'b'.repeat(64),name:'generated.png',mediaType:'image/png',bytes:10,storageRef:'originals/generated.png',origin:{type:'generated',providerId:'native-muse',model:'image-model',requestId:'request-1',prompt:'A quiet landscape',referenceAssetIds:[],settings:{count:1,size:'1024x1024'},sourceItemId:d.id,sourceRevision:0}}];
 assert.deepEqual(schema.validateWorkDocument(d).assets[0].origin,d.assets[0].origin);
 assert.throws(()=>schema.validateWorkDocument({...d,assets:[{...d.assets[0],origin:{...d.assets[0].origin,settings:{count:1,command:'evil'}}}]}),/field/i);
});
test('hostile field names produce bounded field-specific errors',()=>{
 for(const kind of ['design','slides','document','motion','video']){const d=schema.createWorkDocument(kind);d.data['hostile'.repeat(1000)]=true;assert.throws(()=>schema.validateWorkDocument(d),e=>e instanceof schema.WorkDocumentValidationError&&e.message.length<1600&&e.path.length<=512);}
});
