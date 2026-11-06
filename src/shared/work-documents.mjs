import {validateArtifact} from './work-artifacts.mjs';
import {WORK_LIMITS as L} from './work-limits.mjs';
import {validateSlidesData,createSlidesData} from './work-slides-schema.mjs';
import {validateVideoData,createDefaultVideoData} from './work-video-schema.mjs';
import {validateMotionData,createMotionData} from './work-motion-schema.mjs';
import {validateDocumentData,createDocumentData} from './work-document-blocks.mjs';

export class WorkDocumentValidationError extends Error {
  constructor(path,message,code='INVALID_DOCUMENT') {const boundedPath=String(path).slice(0,512);super(`${boundedPath}: ${String(message).slice(0,1000)}`);this.name='WorkDocumentValidationError';this.code=code;this.path=boundedPath;}
}
const fail=(path,message,code)=>{throw new WorkDocumentValidationError(path,message,code);};
function object(v,path,keys){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail(path,'expected plain object');if(keys)for(const k of Object.keys(v))if(!keys.includes(k))fail(`${path}.${k}`,'unrecognized field');return v;}
function str(v,path,max= L.maxTextLength,nonempty=false){if(typeof v!=='string'||v.length>max||(nonempty&&!v.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail(path,`expected ${nonempty?'nonempty ':''}string within limit ${max}`);return v;}
function num(v,path,min=-L.maxCoordinate,max=L.maxCoordinate){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(path,`expected finite number in ${min}..${max}`);return v;}
function bool(v,path){if(typeof v!=='boolean')fail(path,'expected boolean');return v;}
function one(v,choices,path){if(!choices.includes(v))fail(path,`expected ${choices.join('|')}`);return v;}
function array(v,path,max){if(!Array.isArray(v)||v.length>max)fail(path,`expected array within limit ${max}`);return v;}
function id(v,path,ids){str(v,path,L.maxIdLength,true);if(!/^[\p{L}\p{N}_:. -]+$/u.test(v))fail(path,'invalid id');if(ids){if(ids.has(v))fail(path,'duplicate id');ids.add(v);}return v;}
function color(v,path){str(v,path,128,true);if(!/^(?:#[a-f\d]{3,8}|[a-z]{1,32}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-]+\))$/i.test(v))fail(path,'expected safe color');return v;}
function jsonBudget(value){
  let count=0,bytes=0;const seen=new Set(),encoder=new TextEncoder();
  function addText(text,path){if(text.length>L.maxDocumentBytes)fail(path,'document byte limit exceeded');bytes+=encoder.encode(text).byteLength;if(bytes>L.maxDocumentBytes)fail(path,'document byte limit exceeded');}
  function walk(v,depth,path){
    if(++count>L.maxValues||depth>L.maxDepth)fail(path,'document structural limit exceeded');
    if(v===null||typeof v==='boolean')return;
    if(typeof v==='string'){addText(v,path);return;}
    if(typeof v==='number'){if(!Number.isFinite(v))fail(path,'non-finite number');return;}
    if(typeof v!=='object')fail(path,'expected serializable JSON');
    if(seen.has(v))fail(path,'cyclic document');seen.add(v);
    if(Object.getOwnPropertySymbols(v).length)fail(path,'symbol fields are not JSON');
    if(Array.isArray(v)){if(Object.keys(v).length!==v.length)fail(path,'sparse or extended array is not JSON');}
    else object(v,path);
    for(const key of Object.keys(v)){
      if(['__proto__','constructor','prototype'].includes(key))fail(path,'unsafe field');
      addText(key,path);const descriptor=Object.getOwnPropertyDescriptor(v,key);
      if(!descriptor||!('value'in descriptor))fail(path,'accessors are not JSON');
      walk(descriptor.value,depth+1,`${path}.${key}`);
    }
    seen.delete(v);
  }
  walk(value,0,'document');
  if(encoder.encode(JSON.stringify(value)).byteLength>L.maxDocumentBytes)fail('document','document byte limit exceeded');
}
function style(v,path){object(v,path,['fill','stroke','strokeWidth','fontFamily','fontSize','fontWeight','fontStyle','textAlign','color']);const o={};for(const key of ['fill','stroke','color'])if(v[key]!==undefined)o[key]=color(v[key],`${path}.${key}`);if(v.strokeWidth!==undefined)o.strokeWidth=num(v.strokeWidth,path+'.strokeWidth',0,1000);if(v.fontSize!==undefined)o.fontSize=num(v.fontSize,path+'.fontSize',1,2000);if(v.fontFamily!==undefined){o.fontFamily=str(v.fontFamily,path+'.fontFamily',200,true);if(/[<>;{}\\]|url\(/i.test(o.fontFamily))fail(path+'.fontFamily','unsafe font family');}if(v.fontWeight!==undefined)o.fontWeight=typeof v.fontWeight==='number'?num(v.fontWeight,path+'.fontWeight',1,1000):one(v.fontWeight,['normal','bold'],path+'.fontWeight');if(v.fontStyle!==undefined)o.fontStyle=one(v.fontStyle,['normal','italic'],path+'.fontStyle');if(v.textAlign!==undefined)o.textAlign=one(v.textAlign,['left','center','right','justify'],path+'.textAlign');return o;}
function image(v,path){object(v,path,['crop','brightness','contrast','saturation','flipX','flipY','mask','fit']);const o={};if(v.crop!==undefined){object(v.crop,path+'.crop',['x','y','width','height']);o.crop={};for(const k of ['x','y','width','height'])o.crop[k]=num(v.crop[k],path+'.crop.'+k,k==='width'||k==='height'?Number.EPSILON:0,1);if(o.crop.x+o.crop.width>1.000000001||o.crop.y+o.crop.height>1.000000001)fail(path+'.crop','crop exceeds image');}for(const k of ['brightness','contrast','saturation'])if(v[k]!==undefined)o[k]=num(v[k],path+'.'+k,k==='brightness'?-1:0,k==='brightness'?1:2);for(const k of ['flipX','flipY'])if(v[k]!==undefined)o[k]=bool(v[k],path+'.'+k);if(v.mask!==undefined)o.mask=one(v.mask,['none','ellipse','rounded'],path+'.mask');if(v.fit!==undefined)o.fit=one(v.fit,['cover','contain'],path+'.fit');return o;}
function sceneNode(v,path,ctx){object(v,path,['id','type','x','y','width','height','rotation','opacity','locked','hidden','groupId','text','assetId','style','shape','chart','table','image']);const o={id:id(v.id,path+'.id',ctx.ids),type:one(v.type,['text','shape','image','chart','table'],path+'.type')};for(const k of ['x','y'])o[k]=num(v[k],path+'.'+k);for(const k of ['width','height'])o[k]=num(v[k],path+'.'+k,Number.EPSILON,L.maxDimension);o.rotation=num(v.rotation,path+'.rotation',-360000,360000);o.opacity=num(v.opacity,path+'.opacity',0,1);o.locked=bool(v.locked,path+'.locked');o.hidden=bool(v.hidden,path+'.hidden');if(v.groupId!==undefined)o.groupId=id(v.groupId,path+'.groupId');if(v.text!==undefined)o.text=str(v.text,path+'.text');if(v.assetId!==undefined){o.assetId=id(v.assetId,path+'.assetId');if(ctx.assetIds&&!ctx.assetIds.has(o.assetId))fail(path+'.assetId','dangling asset reference');}if(o.type==='image'&&!o.assetId)fail(path+'.assetId','image requires asset reference');if(v.style!==undefined)o.style=style(v.style,path+'.style');if(v.shape!==undefined)o.shape=one(v.shape,['rect','ellipse','line'],path+'.shape');if(v.image!==undefined){if(o.type!=='image')fail(path+'.image','image adjustments require image node');o.image=image(v.image,path+'.image');}if(v.chart!==undefined){object(v.chart,path+'.chart',['type','labels','values','title']);const c=v.chart;o.chart={type:one(c.type,['bar','line'],path+'.chart.type'),labels:array(c.labels,path+'.chart.labels',L.maxChartPoints).map((s,i)=>str(s,`${path}.chart.labels.${i}`,1000)),values:array(c.values,path+'.chart.values',L.maxChartPoints).map((n,i)=>num(n,`${path}.chart.values.${i}`,-1e100,1e100))};if(!o.chart.labels.length||o.chart.labels.length!==o.chart.values.length)fail(path+'.chart','labels and values must match');if(c.title!==undefined)o.chart.title=str(c.title,path+'.chart.title',1000);}
if(v.table!==undefined){object(v.table,path+'.table',['columns','rows']);const columns=array(v.table.columns,path+'.table.columns',L.maxTableColumns).map((s,i)=>str(s,`${path}.table.columns.${i}`,1000));if(!columns.length)fail(path+'.table','empty columns');o.table={columns,rows:array(v.table.rows,path+'.table.rows',L.maxTableRows).map((r,i)=>{array(r,`${path}.table.rows.${i}`,columns.length);if(r.length!==columns.length)fail(path+'.table','ragged row');return r.map((c,j)=>typeof c==='number'?num(c,`${path}.table.rows.${i}.${j}`,-1e100,1e100):str(c,`${path}.table.rows.${i}.${j}`,10000));})};}if(o.type==='chart'&&!o.chart)fail(path+'.chart','chart node requires chart');if(o.type==='table'&&!o.table)fail(path+'.table','table node requires table');return o;}
export function validateSceneNodes(value,{assetIds,ids=new Set(),path='nodes'}={}){return array(value,path,L.maxNodesPerSurface).map((n,i)=>sceneNode(n,`${path}.${i}`,{assetIds,ids}));}
export function validateDesignData(value,{assetIds,ids=new Set()}={}){object(value,'data',['artboards','activeArtboardId']);let count=0;const artboards=array(value.artboards,'data.artboards',L.maxArtboards).map((b,i)=>{const p=`data.artboards.${i}`;object(b,p,['id','name','width','height','background','nodes','margin','safeArea']);const o={id:id(b.id,p+'.id',ids),name:str(b.name,p+'.name',240,true),width:num(b.width,p+'.width',1,L.maxDimension),height:num(b.height,p+'.height',1,L.maxDimension),background:color(b.background,p+'.background'),nodes:validateSceneNodes(b.nodes,{assetIds,ids,path:p+'.nodes'})};count+=o.nodes.length;for(const k of ['margin','safeArea'])if(b[k]!==undefined)o[k]=num(b[k],p+'.'+k,0,Math.min(o.width,o.height)/2);return o;});if(!artboards.length||count>L.maxNodes)fail('data.artboards','artboard/node limit exceeded');const result={artboards};if(value.activeArtboardId!==undefined){result.activeArtboardId=id(value.activeArtboardId,'data.activeArtboardId');if(!artboards.some(b=>b.id===result.activeArtboardId))fail('data.activeArtboardId','missing artboard');}return result;}
function asset(v,path,ids){object(v,path,['id','hash','name','mediaType','bytes','storageRef','width','height','duration','origin']);const o={id:id(v.id,path+'.id',ids),hash:str(v.hash,path+'.hash',64,true),name:str(v.name,path+'.name',255,true),mediaType:str(v.mediaType,path+'.mediaType',128,true),bytes:num(v.bytes,path+'.bytes',0,L.maxAssetBytes),storageRef:str(v.storageRef,path+'.storageRef',512,true),origin:validateOrigin(v.origin,path+'.origin')};if(!/^[a-f\d]{64}$/.test(o.hash))fail(path+'.hash','expected SHA256');if(!Number.isSafeInteger(o.bytes))fail(path+'.bytes','expected integer');if(!/^[a-z\d][a-z\d+.-]*\/[a-z\d][a-z\d+.-]*$/i.test(o.mediaType))fail(path+'.mediaType','invalid media type');if(!/^[a-zA-Z\d_-]+(?:\/[a-zA-Z\d_.-]+)+$/.test(o.storageRef)||o.storageRef.split('/').some(p=>p==='.'||p==='..'))fail(path+'.storageRef','expected managed relative storage reference');for(const k of ['width','height'])if(v[k]!==undefined)o[k]=num(v[k],path+'.'+k,1,L.maxDimension);if(v.duration!==undefined)o.duration=num(v.duration,path+'.duration',0,86400);return o;}
function validateOrigin(value,path){
 if(typeof value==='string')return one(value,['import','generated','converted','template'],path);
 object(value,path,['type','providerId','model','requestId','prompt','referenceAssetIds','settings','sourceItemId','sourceRevision']);
 const out={type:one(value.type,['generated'],path+'.type'),providerId:str(value.providerId,path+'.providerId',256,true),model:str(value.model,path+'.model',256),requestId:str(value.requestId,path+'.requestId',256,true),prompt:str(value.prompt,path+'.prompt',20000),referenceAssetIds:array(value.referenceAssetIds,path+'.referenceAssetIds',16).map((v,i)=>str(v,`${path}.referenceAssetIds.${i}`,256,true)),sourceItemId:str(value.sourceItemId,path+'.sourceItemId',256,true),sourceRevision:num(value.sourceRevision,path+'.sourceRevision',0,Number.MAX_SAFE_INTEGER)};
 if(!Number.isSafeInteger(out.sourceRevision))fail(path+'.sourceRevision','expected safe integer');
 const s=value.settings,p=path+'.settings';object(s,p,['count','size','aspect','voice','language','speed','duration','mask']);out.settings={count:num(s.count,p+'.count',1,16)};if(!Number.isInteger(out.settings.count))fail(p+'.count','expected integer');
 for(const k of ['size','aspect','voice','language'])if(s[k]!==undefined)out.settings[k]=str(s[k],p+'.'+k,120,true);
 for(const [k,max] of [['speed',4],['duration',600]])if(s[k]!==undefined)out.settings[k]=num(s[k],p+'.'+k,Number.EPSILON,max);
 if(s.mask!==undefined){
  const m=s.mask,q=p+'.mask';object(m,q,['version','sourceAssetId','width','height','inverted','feather','strokes']);
  if(m.version!==1||!out.referenceAssetIds.includes(m.sourceAssetId))fail(q,'invalid source mask reference');
  const mask={version:1,sourceAssetId:str(m.sourceAssetId,q+'.sourceAssetId',256,true),width:num(m.width,q+'.width',1,16384),height:num(m.height,q+'.height',1,16384),inverted:bool(m.inverted,q+'.inverted'),feather:num(m.feather,q+'.feather',0,256)};
  if(!Number.isInteger(mask.width)||!Number.isInteger(mask.height))fail(q,'mask dimensions must be integer');
  mask.strokes=array(m.strokes,q+'.strokes',2000).map((stroke,i)=>{const r=q+'.strokes.'+i;object(stroke,r,['mode','radius','points']);const points=array(stroke.points,r+'.points',20000).map((point,j)=>{const t=r+'.points.'+j;object(point,t,['x','y']);return{x:num(point.x,t+'.x',0,mask.width),y:num(point.y,t+'.y',0,mask.height)};});if(!points.length)fail(r+'.points','empty stroke');return{mode:one(stroke.mode,['brush','erase'],r+'.mode'),radius:num(stroke.radius,r+'.radius',Number.EPSILON,16384),points};});
  out.settings.mask=mask;
 }
 return out;
}
export function validateWorkAssetOrigin(value,path='asset.origin'){jsonBudget(value);return validateOrigin(value,path);}
const validators={design:validateDesignData,image:validateDesignData,slides:validateSlidesData,video:validateVideoData,motion:validateMotionData,document:validateDocumentData};
const factories={slides:createSlidesData,video:createDefaultVideoData,motion:createMotionData,document:createDocumentData};
function validateReferences(data,assetIds){
  const ids=new Set(assetIds);
  function visit(value,path){
    if(!value||typeof value!=='object')return;
    if(!Array.isArray(value)){
      if(value.id!==undefined)id(value.id,path+'.id',ids);
      if(value.assetId!==undefined){id(value.assetId,path+'.assetId');if(!assetIds.has(value.assetId))fail(path+'.assetId','dangling asset reference');}
    }
    for(const [key,child] of Object.entries(value))visit(child,path+'.'+key);
  }
  visit(data,'document.data');
}
export function validateWorkDocument(value){
  jsonBudget(value);
  object(value,'document',['version','id','kind','title','revision','createdAt','updatedAt','assets','data']);
  if(value.version!==2)fail('document.version',value.version>2?'unsupported future document version':'expected version 2','UNSUPPORTED_VERSION');
  const kind=one(value.kind,Object.keys(validators),'document.kind');
  const result={version:2,id:id(value.id,'document.id'),kind,title:str(value.title,'document.title',L.maxTitleLength,true),revision:num(value.revision,'document.revision',0,Number.MAX_SAFE_INTEGER)};
  if(!Number.isSafeInteger(result.revision))fail('document.revision','expected safe integer');
  for(const key of ['createdAt','updatedAt']){
    result[key]=str(value[key],'document.'+key,40,true);
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(result[key])||!Number.isFinite(Date.parse(result[key])))fail('document.'+key,'expected UTC ISO timestamp');
  }
  result.assets=array(value.assets,'document.assets',L.maxAssets).map((a,i)=>asset(a,`document.assets.${i}`,new Set()));
  const assetIds=new Set();
  for(const record of result.assets){if(assetIds.has(record.id))fail('document.assets','duplicate asset id');assetIds.add(record.id);}
  try{result.data=validators[kind](value.data,{assetIds,ids:new Set()});}catch(error){if(error instanceof WorkDocumentValidationError)throw error;fail('document.data',error.message??'invalid kind-specific data');}
  validateReferences(result.data,assetIds);
  return result;
}
export function createWorkDocument(kind,options={}){
  const now=options.now??new Date().toISOString();
  const data=options.data??(factories[kind]?factories[kind]():{artboards:[{id:globalThis.crypto.randomUUID(),name:'Artboard 1',width:1200,height:800,background:kind==='image'?'transparent':'#ffffff',nodes:[]}]});
  return validateWorkDocument({version:2,id:options.id??globalThis.crypto.randomUUID(),kind,title:options.title??`Untitled ${kind}`,revision:0,createdAt:now,updatedAt:now,assets:options.assets??[],data});
}
export const createDesignDocument=(options={})=>createWorkDocument('design',options);
export const createImageDocument=(options={})=>createWorkDocument('image',options);
/** Read-only compatibility dispatch: opening a v1 artifact never migrates or writes it. */
export function readWorkDocumentValue(value){return value?.version===1?validateArtifact(value):validateWorkDocument(value);}
