import path from 'node:path';
import fs from 'node:fs/promises';
import {constants as FS} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createWorkAssetStore} from '../src/work/assets.mjs';
import {createWorkJobQueue} from '../src/work/jobs.mjs';
import {createWorkTemplateStore} from '../src/work/templates.mjs';
import {createWorkBrandKitStore,validateBrandKit} from '../src/work/brand-kits.mjs';
import {validateWorkDocument} from '../src/shared/work-documents.mjs';
import {createWorkProjectPackage,importWorkProjectPackage} from '../src/work/project-packages.mjs';
import {createWorkDesignExporter,designExportSettings} from './work-design-export.mjs';
import {discoverWorkMediaCapabilities,probeWorkMedia,createWorkMediaThumbnail} from './work-media-worker.mjs';
import {createWorkMediaCache} from './work-media-cache.mjs';
import {decodeWorkRaster} from './work-image-decoder.mjs';
import {createWorkAssetHandler,createWorkAssetAccess} from './work-assets-protocol.mjs';
import {exportSubtitles} from '../src/shared/work-caption-operations.mjs';
import {readStudioSourceContext} from '../src/work/studio-sources.mjs';
import {createWorkConversionReportStore} from '../src/work/conversion-reports.mjs';

const FORMATS={design:['png','jpeg','webp','pdf','json'],image:['png','jpeg','webp','pdf','json'],slides:['pptx','pdf','json'],document:['docx','pdf','json'],video:['mp4','srt','vtt','json'],motion:['mp4','gif','json']};
const FIELDS={create:['kind','title','document'],read:['itemId','revision'],commit:['itemId','expectedRevision','operations','origin'],versions:['itemId'],checkpoint:['itemId','name'],restore:['itemId','revision','expectedRevision'],assets:['itemId'],importAssets:['itemId'],renameAsset:['itemId','assetId','name'],removeAsset:['itemId','assetId'],relinkAsset:['itemId','assetId'],export:['itemId','revision','format','settings'],jobs:['itemId'],cancelJob:['jobId'],retryJob:['jobId'],openJob:['jobId'],templates:['action','itemId','templateId','favorite','title','category'],brands:['action','kit','brandId'],duplicate:['itemId','title'],convert:['itemId','targetKind','options','selection','preview'],packageExport:['itemId','includeHistory'],packageImport:[],importOffice:['kind','itemId','reviewToken','accept','reference'],propose:['itemId','revision','selection','instruction'],proposals:['itemId','proposalId'],applyProposal:['itemId','proposalId','expectedRevision'],discardProposal:['itemId','proposalId'],stopProposal:['itemId','proposalId'],providerCapabilities:[],providerStart:['request'],providerPoll:['jobId'],providerCancel:['jobId'],providerAccept:['itemId','jobId','expectedRevision','assetId'],present:['itemId','slideIndex','displayId'],presenterSlide:['index'],closePresenter:[]};
Object.assign(FIELDS,{exportCapabilities:['itemId'],duplicate:['itemId','title','document'],checkpoint:['itemId','name','revision'],packageExport:['itemId','revision','includeHistory'],providerJobs:['itemId'],providerAccept:['itemId','jobId','expectedRevision','assetId','surfaceId','nodeId','trackId','clipId','start']});
FIELDS.assets=['itemId','action','assetId','favorite'];FIELDS.convertArtifact=['itemId','selection','targetKind'];
FIELDS.mediaDerivative=['itemId','assetId','kind'];FIELDS.mediaDerivatives=['itemId','assetId'];
FIELDS.sources=['itemId'];FIELDS.importSources=['itemId'];FIELDS.propose.push('sourceIds');
FIELDS.brands=['action','kit','brandId','itemId'];FIELDS.convertLegacy=['itemId'];FIELDS.conversionReport=['itemId'];
function request(input){if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(FIELDS,input.type)||Object.keys(input).some(k=>k!=='type'&&!FIELDS[input.type].includes(k)))throw Error('Unsupported studio request or unknown fields.');return input;}
const filename=title=>String(title).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100)||'Work project';
const plainAsset=asset=>Object.fromEntries(['id','hash','name','mediaType','bytes','storageRef','width','height','duration','origin'].filter(k=>asset[k]!==undefined).map(k=>[k,asset[k]]));
async function managedNativePath(target,{missing=false}={}){
  if(typeof target!=='string'||!path.isAbsolute(target)||target.includes('\0')||target.split(/[\\/]/).includes('..'))throw Error('A native picker must choose an absolute local path without traversal.');
  let cursor=path.parse(target).root;
  for(const part of path.relative(cursor,target).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);try{const info=await fs.lstat(cursor);if(info.isSymbolicLink())throw Error('Symbolic links and junctions are not allowed in studio file paths.');if(cursor!==target&&!info.isDirectory())throw Error('Studio path ancestor is not a folder.');}catch(error){if(missing&&error.code==='ENOENT')return target;throw error;}}
  return target;
}
async function nativeBytes(file,limit){
  await managedNativePath(file);const handle=await fs.open(file,FS.O_RDONLY|(FS.O_NOFOLLOW??0));
  try{const opened=await handle.stat();if(!opened.isFile()||opened.size<1||opened.size>limit)throw Error('The chosen file exceeds the safe import limit.');const bytes=Buffer.alloc(opened.size+1);let length=0;while(length<bytes.length){const read=await handle.read(bytes,length,bytes.length-length,null);if(!read.bytesRead)break;length+=read.bytesRead;}if(length!==opened.size)throw Error('The chosen file changed during import.');await managedNativePath(file);const current=await fs.lstat(file);if(opened.ino!==current.ino||(current.dev!==0&&opened.dev!==0&&opened.dev!==current.dev))throw Error('The chosen file identity changed during import.');return bytes.subarray(0,length);}finally{await handle.close();}
}
async function publishNativeBytes(destination,bytes){
  await managedNativePath(destination,{missing:true});const existing=await fs.lstat(destination).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});if(existing&&!existing.isFile())throw Error('Choose a regular output file.');const temporary=destination+'.'+randomUUID()+'.tmp';
  try{const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await managedNativePath(destination,{missing:true});await fs.rename(temporary,destination);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
}
function pageIndexes(range,count){
  if(range===undefined||range==='')return Array.from({length:count},(_,i)=>i);
  if(typeof range!=='string'||range.length>1000||! /^[1-9]\d*(?:\s*-\s*[1-9]\d*)?(?:\s*,\s*[1-9]\d*(?:\s*-\s*[1-9]\d*)?)*$/.test(range))throw Error('Choose a valid page range such as 1-3, 5.');
  const selected=new Set();for(const part of range.split(',')){const [start,end=start]=part.split('-').map(Number);if(start>end||end>count)throw Error('Export page range exceeds the saved document.');for(let i=start;i<=end;i++)selected.add(i-1);}return [...selected].sort((a,b)=>a-b);
}
async function exportSettings(document,format,input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Export settings must be a plain object.');
  const visual=['design','image','slides'].includes(document.kind),allowed=visual?['width','height','quality','transparent','range','dpi','bleed','margin','cropMarks','background','artboardId']:document.kind==='motion'?['width','height','fps']:document.kind==='video'?['width','height','fps','aspectRatio','resolution','quality','range','burnCaptions']:document.kind==='document'&&format==='pdf'?['range']:[];
  if(format==='json'||format==='srt'||format==='vtt')allowed.length=0;
  if(format==='pptx')allowed.splice(0,allowed.length,'range');
  if(Object.keys(input).some(key=>!allowed.includes(key)))throw Error('Unsupported export setting for this format.');
  const settings=structuredClone(input);
  if(settings.width!==undefined||settings.height!==undefined){if(![settings.width,settings.height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=12000)||settings.width*settings.height>24_000_000)throw Error('Export dimensions must be whole pixels within 12000 pixels and 24 megapixels.');}
  if(document.kind==='video'&&format==='mp4'&&settings.width!==undefined){const {width,height}=settings,short=Math.min(width,height);if(![720,1080].includes(short)||width!==height&&Math.abs(Math.max(width,height)/short-16/9)>.002)throw Error('Video exports support 720p or 1080p in 16:9, 9:16, or square dimensions.');settings.resolution=short;settings.aspectRatio=width===height?'1:1':width>height?'16:9':'9:16';delete settings.width;delete settings.height;}
  if(document.kind==='document'&&format==='pdf'){const [{validateDocumentPageRange},{paginateDocument}]=await Promise.all([import('./work-docx-export.mjs'),import('../src/shared/work-document-blocks.mjs')]);if(settings.range!==undefined)settings.range=validateDocumentPageRange(settings.range,paginateDocument(document.data).length);}
  if(visual&&format!=='json'){
    const surfaces=document.kind==='slides'?document.data.slides:document.data.artboards;
    if(settings.range!==undefined){const indexes=pageIndexes(settings.range,surfaces.length);if(!['pdf','pptx'].includes(format)&&indexes.length!==1)throw Error('Choose exactly one artboard for a raster export.');if(document.kind!=='slides')settings.artboardId=surfaces[indexes[0]].id;}
    if(format==='jpeg'){if(settings.transparent===true)throw Error('JPEG cannot preserve transparency. Choose PNG or WebP.');settings.background??='#ffffff';}
    if(['design','image'].includes(document.kind)&&format!=='pptx')designExportSettings(surfaces.find(s=>s.id===(settings.artboardId??document.data.activeArtboardId))??surfaces[0],format,settings);
  }
  return settings;
}

/** The sole native studio boundary. Renderer requests contain IDs, never paths,
 * credentials, native commands, or executable document content. */
export async function createDesktopWorkStudio({dataDir,work,dialog,BrowserWindow,nativeImage,normalizeVisual,shell,getWindow=()=>undefined,screen,codeBilling,onChange=()=>{},mediaCapabilities}={}){
  if(typeof dataDir!=='string'||!path.isAbsolute(dataDir))throw Error('A managed absolute studio data directory is required.');await managedNativePath(dataDir,{missing:true});const root=path.resolve(dataDir);await fs.mkdir(root,{recursive:true});await managedNativePath(root);let closed=false;
  const capabilities=mediaCapabilities??await discoverWorkMediaCapabilities(),jobStates=new Map(),providerStates=new Map();let foregroundRequests=0;
  const requireItem=id=>{const item=work.getItem(id);if(!item)throw Error('Saved Work item not found.');return item;};
  const read=id=>{requireItem(id);return work.readWorkDocument(id);};
  const assets=createWorkAssetStore({rootDir:path.join(root,'assets'),getDocument:async id=>(await read(id)).document,
    decodeImage:async({buffer,mediaType,width,height,orientation=1,maxThumbnailSize})=>{
      const image=nativeImage?.createFromBuffer(buffer);
      if(orientation!==1||!image||image.isEmpty()||image.getSize().width!==width||image.getSize().height!==height)return decodeWorkRaster({BrowserWindow,buffer,width,height,mediaType,maxThumbnailSize});
      const size=image.getSize(),scale=Math.min(1,maxThumbnailSize/size.width,maxThumbnailSize/size.height);
      return{width:size.width,height:size.height,thumbnail:image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale))}).toPNG()};
    },probeMedia:input=>probeWorkMedia({...input,capabilities}),createMediaThumbnail:input=>createWorkMediaThumbnail({...input,capabilities})});
  await assets.initialize();const assetAccess=createWorkAssetAccess();
  const designer=createWorkDesignExporter({BrowserWindow});
  const assetFor=(document,id)=>{const value=document.assets.find(a=>a.id===id);if(!value)throw Error('Asset is not part of this saved revision.');return value;};
  const resolveBytes=document=>async id=>{const a=assetFor(document,id);const result=await assets.read({itemId:document.id,assetId:id,hash:a.hash});return{...result,bytes:result.buffer};};
  const resolvePath=document=>async id=>{const a=assetFor(document,id);return assets.resolve({itemId:document.id,assetId:id,hash:a.hash});};
  const render=async({document,format,destinationPath,settings,signal,progress})=>{
    const resolveAsset=resolveBytes(document),common={document,format,destinationPath,filePath:destinationPath,settings,signal,onProgress:value=>progress(typeof value==='number'?value:{fraction:value?.progress??value?.fraction,message:value?.phase??value?.message}),resolveAsset};
    if(format==='json'){await fs.writeFile(destinationPath,JSON.stringify(document,null,2));return{toolVersion:'MuseBench document v2'};}
    if(document.kind==='design'||document.kind==='image')return designer.export(common);
    if(document.kind==='slides'){
      const slides=pageIndexes(settings.range,document.data.slides.length).map(i=>document.data.slides[i]);
      if(format==='pptx')return (await import('./work-pptx-export.mjs')).exportWorkPptx({...common,document:{...document,data:{...document.data,slides}}});
      const design={...document,kind:'design',data:{artboards:slides.map(s=>({id:s.id,name:s.name,width:document.data.width,height:document.data.height,background:s.background,nodes:s.nodes}))}};
      const {range,...designSettings}=settings;return designer.export({...common,document:design,settings:designSettings,resolveAsset});
    }
    if(document.kind==='document'){const m=await import('./work-docx-export.mjs');return format==='docx'?m.exportDocx(common):m.exportDocumentPdf({...common,BrowserWindow});}
    if(document.kind==='video'){
      if(format==='srt'||format==='vtt'){await fs.writeFile(destinationPath,exportSubtitles(document.data.captions??[],{timebase:document.data.timebase,format}));return{toolVersion:'MuseBench subtitles v1'};}
      return (await import('./work-video-export.mjs')).renderWorkVideo({...common,resolveAsset:resolvePath(document),capabilities});
    }
    if(document.kind==='motion')return (await import('./work-motion-export.mjs')).renderWorkMotion({...common,resolveAsset:resolvePath(document),capabilities,BrowserWindow});
    throw Error('This export is unavailable.');
  };
  const mediaCache=createWorkMediaCache({rootDir:path.join(root,'media-cache'),assets,readDocument:async id=>(await read(id)).document,capabilities});await mediaCache.initialize();
  const jobs=createWorkJobQueue({rootDir:path.join(root,'jobs'),runners:{export:render,mediaDerivative:mediaCache.runner},onChange:job=>{jobStates.set(job.id,job.state);onChange({type:'job',job});}});await jobs.initialize();
  const templates=createWorkTemplateStore({rootDir:path.join(root,'templates'),validateDocument:validateWorkDocument});
  const brands=createWorkBrandKitStore({rootDir:path.join(root,'brands')});
  const conversionReports=createWorkConversionReportStore({rootDir:path.join(root,'conversion-reports')});await conversionReports.initialize();
  async function createConverted(document,report){const metadata=await conversionReports.write({itemId:document.id,report});try{return{...await work.createDocument({kind:document.kind,document}),report:metadata.report};}catch(error){await conversionReports.remove(document.id).catch(()=>{});throw error;}}
  async function readWithReport(itemId,options){const result=await work.readWorkDocument(itemId,options);try{const metadata=await conversionReports.read(itemId);if(metadata)result.report=metadata.report;}catch(error){result.warning=[result.warning,'The document opened, but its conversion report could not be read: '+String(error.message).slice(0,200)].filter(Boolean).join(' ');}return result;}
  const brandNamespace=id=>'brand-'+createHash('sha256').update(id).digest('hex');
  const brandLocks=new Map();
  async function withBrand(id,action){const previous=brandLocks.get(id)??Promise.resolve(),pending=previous.catch(()=>{}).then(action);brandLocks.set(id,pending);try{return await pending;}finally{if(brandLocks.get(id)===pending)brandLocks.delete(id);}}
  async function copyBrandLogos(kit,{itemId,storageId,previous}){
    const logoAssets=[],logos=[];
    for(const logoId of kit.logos){
      let sourceItemId,source;
      const stored=previous?.logoStorageId===brandNamespace(kit.id)&&previous.logos.includes(logoId)?previous.logoAssets?.find(asset=>asset.id===logoId):null;
      if(stored){sourceItemId=brandNamespace(kit.id);source=await assets.describe({itemId:sourceItemId,assetId:logoId,hash:stored.hash});}
      else if(itemId){requireItem(itemId);try{source=await assets.describe({itemId,assetId:logoId});sourceItemId=itemId;}catch{/* No renderer-provided namespace is filesystem authority. */}}
      if(!source||!['image/png','image/jpeg','image/webp'].includes(source.mediaType))throw Error('Choose a managed logo owned by this project or its previously saved brand kit.');
      const copied=plainAsset(await assets.copy({sourceItemId,itemId:storageId,assetId:source.id,hash:source.hash}));
      const provenance=stored?.origin&&typeof stored.origin==='object'?stored.origin:source.origin;
      if(provenance&&typeof provenance==='object')copied.origin=structuredClone(provenance);
      logos.push(copied.id);if(!logoAssets.some(asset=>asset.id===copied.id))logoAssets.push(copied);
    }
    return{kit:validateBrandKit({...kit,logos,logoAssets,logoStorageId:storageId}),assets:logoAssets};
  }
  async function brandAction(r){
    if(!r.action||r.action==='list'){const kits=await brands.list();return{kits,brands:kits};}
    if(r.action==='remove')return brands.remove(r.brandId);
    const incoming=r.kit?validateBrandKit(r.kit):null,id=r.brandId??incoming?.id;
    if(typeof id!=='string'||!id||incoming&&incoming.id!==id)throw Error('Choose a valid brand kit.');
    return withBrand(id,async()=>{
      const previous=(await brands.list()).find(kit=>kit.id===id),kit=incoming??previous;
      if(!kit)throw Error('Saved brand kit not found.');
      if(r.action==='save'){const copied=await copyBrandLogos(kit,{itemId:r.itemId,storageId:brandNamespace(id),previous});return brands.save(copied.kit);}
      if(r.action==='prepare'){requireItem(r.itemId);return copyBrandLogos(kit,{itemId:r.itemId,storageId:r.itemId,previous});}
      throw Error('Unknown brand action.');
    });
  }
  const officeReviews=new Map(),proposalRuns=new Map();let proposalService,providerService,presenter;
  async function proposal(){return proposalService??=await (async()=>{
    const {createWorkProposalService}=await import('../src/work/proposals.mjs');
    return createWorkProposalService({readDocument:async id=>(await read(typeof id==='string'?id:id.itemId)).document,getSourceContext:args=>readStudioSourceContext({work,...args,sourceIds:args.sourceIds??[]}),commitEdit:value=>work.commitWorkEdit(value),request:async value=>{const result=await work.requestStudioMuse(value),state=work.getState();proposalRuns.set(value.itemId,{taskId:requireItem(value.itemId).taskId,runId:state.task?.runs?.at(-1)?.id});return result;},readResult:async({itemId,proposalId})=>{
      if(!/^[a-f0-9-]{36}$/.test(proposalId))throw Error('Invalid proposal identity.');const directory=await work.getWorkspace(itemId),file=path.join(directory,`work-proposal-${proposalId}.json`);
      const state=work.getState(),owned=proposalRuns.get(itemId),run=state.task?.runs?.at(-1),sameRun=owned?.runId&&owned.taskId===state.task?.id&&owned.runId===run?.id;
      const sentinel=()=>sameRun&&['completed','failed','cancelled'].includes(run.status)?{runtimeStatus:run.status,...(run.error?{error:String(run.error).slice(0,500)}:{})}:null;
      try{return JSON.parse((await nativeBytes(file,2*1024*1024)).toString('utf8'));}catch(error){if(error.code==='ENOENT')return sentinel();if(error instanceof SyntaxError&&sameRun&&!['completed','failed','cancelled','interrupted'].includes(run.status))return null;throw error;}
    },stop:async({itemId})=>{if(work.getState().item?.id!==itemId)throw Error('The original Muse request is no longer selected.');const result=await work.dispatch({type:'stop'});if(result.error)throw Error(result.error);}});
  })();}
  async function providers(){return providerService??=await (async()=>{
    const {createWorkProviderService}=await import('../src/work/providers/index.mjs');
    const adapters=[];
    if(codeBilling?.mediaConnection&&codeBilling?.mediaCredential){const m=await import('../src/work/providers/muse-image.mjs'),voice=await import('../src/work/providers/muse-transcribe.mjs');const options={getConnectionStatus:()=>codeBilling.mediaConnection(),getCredential:()=>codeBilling.mediaCredential(),readReferenceAsset:async({itemId,assetId})=>{const source=await assets.read({itemId,assetId});return{bytes:source.buffer,mediaType:source.mediaType};}};adapters.push(m.createMuseImageProvider(options),voice.createMuseTranscribeProvider(options));}
    const file=path.join(root,'provider-jobs.json');
    return createWorkProviderService({adapters,journal:{async read(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},async write(value){const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value),{flag:'wx'});await fs.rename(temp,file);}},importOutput:async({output,job})=>{if(!Buffer.isBuffer(output.bytes)&&!(output.bytes instanceof Uint8Array))throw Error('Provider output must contain verified native bytes.');return assets.importBytes({itemId:job.itemId,buffer:Buffer.from(output.bytes),name:output.name??'Muse image.png',mediaType:output.mediaType,origin:'generated'});}});
  })();}
  async function copyDocument(document,title,{sourceDocument=document,assetCopies=[]}={}){
    const candidate=validateWorkDocument({...document,title:title??document.title}),newId=randomUUID(),mapping=new Map(assetCopies.map(a=>[a.targetAssetId,a.sourceAssetId])),assetIds=new Map(),dataIds=new Map(),copiedAssets=[];
    // Native copies stream immutable managed originals rather than applying
    // the portable package's explicit 32/64 MiB transfer caps to local projects.
    for(const asset of candidate.assets){const sourceId=mapping.get(asset.id)??asset.id,source=assetFor(sourceDocument,sourceId);if(source.hash!==asset.hash)throw Error('Converted media does not match the original source revision.');const copied=plainAsset(await assets.copy({sourceItemId:sourceDocument.id,itemId:newId,assetId:sourceId,hash:source.hash}));assetIds.set(asset.id,copied.id);if(asset.origin&&typeof asset.origin==='object')copied.origin=structuredClone(asset.origin);if(!copiedAssets.some(a=>a.id===copied.id))copiedAssets.push(copied);}
    const allocate=id=>{if(!dataIds.has(id))dataIds.set(id,randomUUID());};
    const collect=value=>{if(!value||typeof value!=='object')return;if(typeof value.id==='string')allocate(value.id);if(typeof value.groupId==='string')allocate(value.groupId);for(const child of Object.values(value)){if(Array.isArray(child))child.forEach(collect);else if(child&&typeof child==='object')collect(child);}};collect(candidate.data);
    const remap=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(typeof child==='string'){if((key==='assetId'||key.endsWith('AssetId'))&&assetIds.has(child))value[key]=assetIds.get(child);else if(key!=='sourceItemId'&&(key==='id'||key.endsWith('Id'))&&dataIds.has(child))value[key]=dataIds.get(child);}else if(key.endsWith('AssetIds')&&Array.isArray(child))value[key]=child.map(id=>assetIds.get(id)??id);else if(key.endsWith('Ids')&&Array.isArray(child))value[key]=child.map(id=>dataIds.get(id)??id);else if(child&&typeof child==='object')remap(child);}};remap(candidate.data);
    const now=new Date().toISOString();return validateWorkDocument({...candidate,id:newId,title:title??candidate.title,revision:0,createdAt:now,updatedAt:now,assets:copiedAssets});
  }
  async function persistImported(result){
    const versions=[...result.history,result.document],first=versions.shift(),created=await work.createDocument({kind:first.kind,document:{...first,revision:0}});let current=created;
    for(const document of versions)current={itemId:created.itemId,...await work.commitWorkEdit({itemId:created.itemId,expectedRevision:current.revision,origin:'import',operations:[{type:'replaceAssets',assets:document.assets},{type:'replaceData',data:document.data},{type:'rename',title:document.title}]})};
    return current;
  }
  async function exportCapabilities(itemId){
    const document=itemId?(await read(itemId)).document:null,kinds=document?[document.kind]:Object.keys(FORMATS),formats=[...new Set(kinds.flatMap(kind=>FORMATS[kind]))];
    const rows=[];for(const format of formats){let available=true,reason,warnings;
      if(['png','jpeg','webp','pdf'].includes(format)&&typeof BrowserWindow!=='function'){available=false;reason='The native Electron renderer is unavailable.';}
      if(format==='mp4'||format==='gif'){available=capabilities.available===true&&capabilities[format]===true&&(document?.kind!=='motion'||typeof BrowserWindow==='function');if(!available)reason=capabilities.reasons?.join(' ')||'Required native media encoder or renderer is unavailable.';}
      if(format==='pptx')try{const module=await import('./work-pptx-export.mjs');if(document)warnings=module.inspectPptxLimitations(document);}catch{available=false;reason='The PowerPoint writer is unavailable.';}
      if(format==='docx')try{const module=await import('./work-docx-export.mjs');warnings=module.DOCUMENT_EXPORT_LIMITATIONS;}catch{available=false;reason='The Word writer is unavailable.';}
      rows.push({format,label:{json:'Editable project JSON',jpeg:'JPEG image',pptx:'Editable PowerPoint',docx:'Editable Word',pdf:'PDF',srt:'SRT subtitles',vtt:'WebVTT subtitles'}[format]??format.toUpperCase(),available,...(reason?{reason}:{}),...(warnings?{warnings}:{})});
    }return{formats:rows};
  }
  async function validateAssets(itemId,operations){for(const op of operations??[])if(op.type==='replaceAssets'){if(!Array.isArray(op.assets))throw Error('Invalid managed assets.');for(const a of op.assets){const owned=await assets.describe({itemId,assetId:a.id,hash:a.hash});if(['id','hash','storageRef','bytes','mediaType','width','height','duration'].some(key=>owned[key]!==a[key]))throw Error('Only unchanged managed asset identities owned by this item can be used.');await assets.resolve({itemId,assetId:a.id,hash:a.hash});}}}
  async function importMediaPaths(itemId,paths,replaceAssetId){requireItem(itemId);await read(itemId);const importToken=assets.issueImportToken({itemId,ownerId:'work-studio',paths});const imported=await assets.import({itemId,ownerId:'work-studio',importToken,...(replaceAssetId?{replaceAssetId}:{})});
    if(imported.assets.length){const current=await read(itemId),map=new Map(current.document.assets.map(a=>[a.id,a]));for(const asset of imported.assets)map.set(asset.id,plainAsset(asset));const saved=await work.commitWorkEdit({itemId,expectedRevision:current.revision,operations:[{type:'replaceAssets',assets:[...map.values()]}],origin:'import'});imported.document=saved.document;imported.revision=saved.revision;}
    return imported;
  }
  async function pickImport(itemId,replaceAssetId){await read(itemId);const result=await dialog.showOpenDialog(getWindow(),{title:replaceAssetId?'Relink managed asset':'Import media',properties:replaceAssetId?['openFile']:['openFile','multiSelections'],filters:[{name:'Images, video and audio',extensions:['png','jpg','jpeg','webp','mp4','mov','webm','wav','mp3','m4a']}]});if(result.canceled)return{cancelled:true,canceled:true,assets:[],errors:[]};return importMediaPaths(itemId,result.filePaths,replaceAssetId);}
  async function performDispatch(input){if(closed)throw Error('The creative studio is closed.');const r=request(input);if(r.itemId!==undefined)requireItem(r.itemId);
    switch(r.type){
      case'create':{if(r.document?.assets?.length)throw Error('Create imported projects through the managed import or copy action.');return work.createDocument(r);}
      case'read':return readWithReport(r.itemId,r.revision===undefined?undefined:{revision:r.revision});
      case'conversionReport':{const metadata=await conversionReports.read(r.itemId);return{report:metadata?.report??null};}
      case'commit':await validateAssets(r.itemId,r.operations);return work.commitWorkEdit(r);
      case'versions':return work.listWorkVersions(r.itemId);
      case'checkpoint':return work.checkpointWorkVersion(r);
      case'restore':return work.restoreWorkVersion(r);
      case'assets':if(r.action==='favorite')return{asset:await assets.setFavorite({itemId:r.itemId,assetId:r.assetId,favorite:r.favorite})};else if(r.action==='use')return{asset:await assets.markUsed({itemId:r.itemId,assetId:r.assetId})};else if(r.action&&r.action!=='list')throw Error('Unknown asset action.');return{assets:await assets.list({itemId:r.itemId})};
      case'sources':return{sources:requireItem(r.itemId).sources.map(({id,name,bytes,addedAt})=>({id,name,bytes,addedAt}))};
      case'importSources':{const selected=await dialog.showOpenDialog(getWindow(),{title:'Attach text sources for explicit Muse context',properties:['openFile','multiSelections'],filters:[{name:'Text source files',extensions:['csv','json','md','txt']}]});if(selected.canceled)return{cancelled:true,canceled:true,sources:requireItem(r.itemId).sources.map(({id,name,bytes,addedAt})=>({id,name,bytes,addedAt}))};const result=await work.addSources(selected.filePaths,{itemId:r.itemId});if(result.error)throw Error(result.error);return{sources:requireItem(r.itemId).sources.map(({id,name,bytes,addedAt})=>({id,name,bytes,addedAt}))};}
      case'mediaDerivative':return mediaCache.request({itemId:r.itemId,assetId:r.assetId,kind:r.kind,queue:jobs});
      case'mediaDerivatives':return mediaCache.list({itemId:r.itemId,assetId:r.assetId});
      case'importAssets':return pickImport(r.itemId);
      case'relinkAsset':return pickImport(r.itemId,r.assetId);
      case'renameAsset':return assets.rename(r);
      case'removeAsset':{const current=await read(r.itemId);const usage=(await assets.list({itemId:r.itemId,document:current.document})).find(a=>a.id===r.assetId)?.usageCount;if(usage)throw Error(`This asset is used by ${usage} object(s). Remove those references first; retained versions keep their original bytes.`);return assets.remove(r);}
      case'jobs':return{jobs:await jobs.list(r)};
      case'cancelJob':return jobs.cancel(r.jobId);
      case'retryJob':return jobs.retry(r.jobId);
      case'openJob':{const file=await jobs.outputPath(r.jobId);const error=await shell.openPath(file);if(error)throw Error(error);return{opened:true};}
      case'exportCapabilities':return exportCapabilities(r.itemId);
      case'export':{const current=await read(r.itemId);if(current.revision!==r.revision)throw Error('The project revision changed. Save and export again.');const format=r.format==='jpg'?'jpeg':r.format;if(!FORMATS[current.document.kind]?.includes(format))throw Error('Unsupported export format for this project.');const settings=await exportSettings(current.document,format,r.settings??{}),cap=(await exportCapabilities(r.itemId)).formats.find(c=>c.format===format);if(!cap?.available)throw Error(cap?.reason??'This export is unavailable.');if(current.document.kind==='video'&&format==='mp4'){const {compileWorkRenderPlan}=await import('../src/shared/work-render-plan.mjs');compileWorkRenderPlan(current.document,settings);}if(current.document.kind==='motion'&&['mp4','gif'].includes(format)){const {compileMotionExportPlan}=await import('./work-motion-export.mjs');compileMotionExportPlan(current.document,{...settings,format});}const selected=await dialog.showSaveDialog(getWindow(),{title:'Export Work',defaultPath:filename(current.document.title)+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});if(selected.canceled||!selected.filePath)return{saved:false,canceled:true,cancelled:true};await managedNativePath(selected.filePath,{missing:true});const job=await jobs.create({itemId:r.itemId,revision:r.revision,kind:'export',format,document:current.document,settings,destinationPath:selected.filePath});return{job};}
      case'templates':{if(!r.action||r.action==='list')return{templates:await templates.list()};if(r.action==='save')return templates.save({document:(await read(r.itemId)).document,title:r.title,category:r.category});if(r.action==='favorite')return templates.favorite(r.templateId,r.favorite);if(r.action==='remove')return templates.remove(r.templateId);if(r.action==='create'){const template=(await templates.list()).find(t=>t.id===r.templateId);if(!template)throw Error('Template not found.');if(template.document?.assets?.length){return work.createDocument({kind:template.document.kind,document:await copyDocument(template.document,r.title)});}const document=await templates.instantiate(r.templateId,{title:r.title});return work.createDocument({kind:document.kind,document});}throw Error('Unknown template action.');}
      case'brands':return brandAction(r);
      case'duplicate':{const source=(await read(r.itemId)).document,draft=r.document?validateWorkDocument(r.document):source;if(draft.id!==source.id||draft.kind!==source.kind)throw Error('The duplicate draft must keep the original item identity and kind.');await validateAssets(r.itemId,[{type:'replaceAssets',assets:draft.assets}]);const document=await copyDocument(draft,r.title);return work.createDocument({kind:document.kind,document});}
      case'packageExport':{const {document}=await read(r.itemId);if(r.revision!==undefined&&r.revision!==document.revision)throw Error('The project changed before packaging. Save and export again.');const selected=await dialog.showSaveDialog(getWindow(),{title:'Export portable Work project',defaultPath:filename(document.title)+'.musework',filters:[{name:'Muse Work project',extensions:['musework']}]});if(selected.canceled||!selected.filePath)return{saved:false,canceled:true,cancelled:true};const history=r.includeHistory?(await work.listWorkVersions(r.itemId)).versions.filter(v=>v.revision!==document.revision):[];const documents=[];for(const entry of history)documents.push((await work.readWorkDocument(r.itemId,{revision:entry.revision})).document);const bytes=await createWorkProjectPackage({document,includeHistory:!!r.includeHistory,history:documents,resolveAsset:async asset=>(await assets.read({itemId:r.itemId,assetId:asset.id,hash:asset.hash})).buffer});await publishNativeBytes(selected.filePath,bytes);return{saved:true,revision:document.revision};}
      case'packageImport':{const selected=await dialog.showOpenDialog(getWindow(),{title:'Import Work project',properties:['openFile'],filters:[{name:'Muse Work project',extensions:['musework']}]});if(selected.canceled)return{canceled:true,cancelled:true};const bytes=await nativeBytes(selected.filePaths[0],96*1024*1024),newId=randomUUID();let first=true;const result=await importWorkProjectPackage({bytes,createId:()=>{if(first){first=false;return newId;}return randomUUID();},writeAsset:async({asset,bytes})=>plainAsset(await assets.importBytes({itemId:newId,asset,buffer:bytes,name:asset.name,mediaType:asset.mediaType,origin:'import',validated:true}))});return persistImported(result);}
      case'convert':{const source=await read(r.itemId);const {convertWorkDocument}=await import('../src/work/conversions.mjs');if(r.options&&Object.keys(r.options).some(k=>!['copyMedia','surfaceIds','template','title'].includes(k)))throw Error('Unsupported conversion options.');const result=convertWorkDocument(source.document,{...r.options,kind:r.targetKind});if(r.preview)return result;const doc=await copyDocument(result.document,undefined,{sourceDocument:source.document,assetCopies:result.report.assetCopies});return createConverted(doc,result.report);}
      case'convertArtifact':{const artifact=await work.getArtifact(r.itemId);if(!artifact)throw Error('This Work item has no compatible artifact.');const {convertArtifactSelection}=await import('../src/work/artifact-conversions.mjs');const document=convertArtifactSelection({artifact,selection:r.selection,targetKind:r.targetKind,sourceItemId:r.itemId,sourceRevision:0});return createConverted(document,{sourceItemId:r.itemId,sourceRevision:0,conversion:artifact.kind+'-'+r.selection.type+'-to-'+document.kind,attributions:artifact.sources.map(source=>source.name+': '+source.detail),losses:['Only the selected chart or table is copied; the original artifact remains unchanged.']});}
      case'convertLegacy':{const artifact=await work.getArtifact(r.itemId);if(!artifact)throw Error('This Work item has no compatible legacy artifact.');const {convertLegacyWorkArtifact}=await import('../src/work/legacy-conversions.mjs');const result=convertLegacyWorkArtifact(artifact,{itemId:r.itemId});return createConverted(result.document,result.report);}
      case'importOffice':return importOffice(r);
      case'propose':return(await proposal()).start(r);
      case'proposals':if(!r.itemId)throw Error('Choose the original proposal item.');return r.proposalId?(await proposal()).poll(r):{proposals:await(await proposal()).list({itemId:r.itemId})};
      case'applyProposal':return(await proposal()).apply(r);
      case'discardProposal':return(await proposal()).discard(r);
      case'stopProposal':return(await proposal()).stop(r);
      case'providerCapabilities':return{capabilities:await(await providers()).getCapabilities()};
      case'providerJobs':return{jobs:await(await providers()).list(r.itemId)};
      case'providerAccept':{const current=await read(r.itemId),job=(await(await providers()).list(r.itemId)).find(j=>j.id===r.jobId);if(!job||job.itemId!==r.itemId||job.revision!==r.expectedRevision||current.revision!==r.expectedRevision||job.status!=='completed')throw Error('This generated result belongs to another item or revision. Review the original project before accepting it.');let document;if(job.action==='audio.transcribe'){if(current.document.kind!=='video')throw Error('Transcript captions require a video project.');const {transcriptToCaptions}=await import('../src/work/generated-media.mjs');document=structuredClone(current.document);document.data.captions.push(...transcriptToCaptions(job.transcript,{timebase:document.data.timebase,offset:r.start??0,idPrefix:job.id}));document=validateWorkDocument(document);}else{const {acceptGeneratedAsset}=await import('../src/work/generated-media.mjs');document=acceptGeneratedAsset(current.document,job,{assetId:r.assetId,surfaceId:r.surfaceId,nodeId:r.nodeId,trackId:r.trackId,clipId:r.clipId,start:r.start});await validateAssets(r.itemId,[{type:'replaceAssets',assets:document.assets}]);}return work.commitWorkEdit({itemId:r.itemId,expectedRevision:r.expectedRevision,origin:'import',operations:[{type:'replaceAssets',assets:document.assets},{type:'replaceData',data:document.data}]});}
      case'providerStart':{const current=await read(r.request?.itemId);if(current.revision!==r.request.revision)throw Error('The project changed. Review generation inputs again.');for(const id of r.request.referenceAssetIds??[])assetFor(current.document,id);return(await providers()).start(r.request);}
      case'providerPoll':return(await providers()).poll(r.jobId);
      case'providerCancel':return(await providers()).cancel(r.jobId);
      case'present':{const {document}=await read(r.itemId);presenter??=(await import('./work-presenter.mjs')).createWorkPresenter({BrowserWindow,screen,resolveAsset:async(id,snapshot)=>resolveBytes(snapshot)(id)});return presenter.open({document,index:r.slideIndex??0,displayId:r.displayId});}
      case'presenterSlide':return presenter?.showSlide(r.index);
      case'closePresenter':presenter?.close();return{closed:true};
      default:throw Error('This studio action is coming soon.');
    }
  }
  async function importOffice(r){
    if(r.accept){
      const pending=officeReviews.get(r.reviewToken);if(!pending)throw Error('Import review expired. Choose the source again.');
      if(r.reference&&pending.document.kind!=='slides')throw Error('Flattened reference mode currently supports PowerPoint only. Review the editable Word import instead.');
      let document=structuredClone(pending.document),report=structuredClone(pending.report);const mapping=new Map();
      const pendingImages=new Map((pending.assetPayloads??[]).filter(payload=>payload.asset.mediaType.startsWith('image/')).map(payload=>[payload.asset.id,payload]));
      for(const payload of pending.assetPayloads??[]){if(r.reference&&payload.asset.id!==pending.report.originalAssetId)continue;const imported=plainAsset(await assets.importBytes({itemId:document.id,asset:payload.asset,buffer:payload.bytes,name:payload.asset.name,mediaType:payload.asset.mediaType,origin:'import',validated:true}));mapping.set(payload.asset.id,imported.id);document.assets=document.assets.map(asset=>asset.id===payload.asset.id?imported:asset);}
      const remap=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(typeof child==='string'&&(key==='assetId'||key.endsWith('AssetId'))&&mapping.has(child))value[key]=mapping.get(child);else if(key.endsWith('AssetIds')&&Array.isArray(child))value[key]=child.map(id=>mapping.get(id)??id);else if(child&&typeof child==='object')remap(child);}};
      remap(document.data);if(mapping.has(report.originalAssetId))report.originalAssetId=mapping.get(report.originalAssetId);document=validateWorkDocument(document);
      if(r.reference){const {createOfficeReferenceDeck}=await import('./work-office-reference.mjs');const reference=await createOfficeReferenceDeck({document,report,BrowserWindow,designer,resolveAsset:async id=>{const payload=pendingImages.get(id);return payload?{bytes:payload.bytes,mediaType:payload.asset.mediaType}:resolveBytes(document)(id);},importAsset:async input=>plainAsset(await assets.importBytes({itemId:document.id,buffer:input.bytes,name:input.name,mediaType:input.mediaType,origin:'converted'}))});document=validateWorkDocument(reference.document);report=reference.report;}
      const result=await work.createDocument({kind:document.kind,document});officeReviews.delete(r.reviewToken);return{...result,report};
    }
    const kind=r.kind??work.getItem(r.itemId)?.kind;if(!['slides','document'].includes(kind))throw Error('Choose Presentation or Document import.');const ext=kind==='slides'?'pptx':'docx';const selected=await dialog.showOpenDialog(getWindow(),{title:`Import ${ext.toUpperCase()}`,properties:['openFile'],filters:[{name:ext.toUpperCase(),extensions:[ext]}]});if(selected.canceled)return{canceled:true,cancelled:true};const file=selected.filePaths[0],bytes=await nativeBytes(file,32*1024*1024);const importer=await import(`../src/work/import-${ext}.mjs`);const result=await importer[ext==='pptx'?'importPptx':'importDocx']({bytes,name:path.basename(file)});validateWorkDocument(result.document);const reviewToken=randomUUID();officeReviews.set(reviewToken,result);while(officeReviews.size>8)officeReviews.delete(officeReviews.keys().next().value);return{reviewToken,document:result.document,report:result.report};
  }
  async function dispatch(input){foregroundRequests++;try{const result=await performDispatch(input);if(input.type.startsWith('provider')){for(const job of result?.jobs??(result?.id?[result]:[]))if(job.id&&job.status)providerStates.set(job.id,job.status);}const itemId=result?.document?.id??result?.itemId??input.itemId;if(result&&typeof result==='object'&&itemId&&work.getItem(itemId)&&(result.document||['read','assets','importAssets','relinkAsset','mediaDerivative','mediaDerivatives','brands'].includes(input.type))){const ownerId=String(getWindow()?.webContents?.id??getWindow()?.id??'work-studio'),assetAccessToken=assetAccess.grant({itemId,ownerId}),withUrl=derivative=>derivative.kind==='waveform'?derivative:{...derivative,url:`musebench-work-asset://asset/${encodeURIComponent(itemId)}/${encodeURIComponent(derivative.assetId)}?hash=${derivative.hash}&access=${assetAccessToken}&derivative=${derivative.kind}`};return{...result,assetAccessToken,...(result.derivatives?{derivatives:result.derivatives.map(withUrl)}:{}),...(result.derivative?{derivative:withUrl(result.derivative)}:{})};}return result;}finally{foregroundRequests--;}}
  const isBusy=()=>foregroundRequests>0||[...jobStates.values()].some(state=>['queued','running','cancelling'].includes(state))||[...providerStates.values()].some(state=>['running','cancelling'].includes(state));
  async function importDroppedFiles({itemId,paths}){foregroundRequests++;try{if(closed)throw Error('The creative studio is closed.');const result=await importMediaPaths(itemId,paths);const ownerId=String(getWindow()?.webContents?.id??getWindow()?.id??'work-studio');return{...result,assetAccessToken:assetAccess.grant({itemId,ownerId})};}finally{foregroundRequests--;}}
  return{dispatch,importDroppedFiles,assets,jobs,isBusy,capabilities:{mp4:capabilities.mp4,gif:capabilities.gif},handleAsset:createWorkAssetHandler({store:assets,authorize:(req,id)=>!!work.getItem(id)&&assetAccess.authorize(req,id),resolveDerivative:mediaCache.resolve}),revokeAssetAccess:ownerId=>assetAccess.revokeOwner(String(ownerId)),async close(){closed=true;assetAccess.close();presenter?.close();await jobs.close();await conversionReports.close();await mediaCache.close();await assets.close();await designer.close?.();await providerService?.close?.();}};
}
