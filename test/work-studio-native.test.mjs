import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createWorkService} from '../src/work/index.mjs';
import {createDesktopWorkStudio} from '../electron/work-studio.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=','base64');
const fakeImage={isEmpty:()=>false,getSize:()=>({width:1,height:1}),resize(){return this;},toPNG:()=>PNG};
async function fixture(t,options={}){
 const root=await mkdtemp(path.join(tmpdir(),'work-studio-native-')),dialogs=[],answers={open:{canceled:true},save:{canceled:true}},instances=[];
 const open=async()=>{const work=await createWorkService({dataDir:path.join(root,'work'),projectsDir:path.join(root,'projects')}),studio=await createDesktopWorkStudio({dataDir:path.join(root,'studio'),work,dialog:{async showOpenDialog(){dialogs.push('open');return answers.open;},async showSaveDialog(){dialogs.push('save');return answers.save;}},nativeImage:{createFromBuffer:()=>fakeImage},getWindow:()=>undefined,mediaCapabilities:{available:false,mp4:false,gif:false,reasons:['fixture']},...options});const instance={studio,work};instances.push(instance);return instance;};
 const initial=await open();t.after(async()=>{for(const current of instances){await current.studio.close();await current.work.close();}await rm(root,{recursive:true,force:true});});return{...initial,dialogs,answers,root,open};
}
test('studio rejects renderer paths and unknown commands before side effects',async t=>{const {studio,dialogs}=await fixture(t);await assert.rejects(studio.dispatch({type:'create',kind:'design',title:'Poster',filePath:'C:/private'}),/unsupported|unknown/i);await assert.rejects(studio.dispatch({type:'shell',command:'whoami'}),/unsupported|unknown/i);assert.deepEqual(dialogs,[]);});
test('native studio creates reads commits and cancels pickers with explicit item identity',async t=>{const {studio,work,dialogs}=await fixture(t);const first=await studio.dispatch({type:'create',kind:'design',title:'Poster'});const second=await studio.dispatch({type:'create',kind:'image',title:'Photo'});assert.notEqual(first.itemId,second.itemId);const saved=await studio.dispatch({type:'commit',itemId:first.itemId,expectedRevision:0,operations:[{type:'rename',title:'Renamed poster'}],origin:'user'});assert.equal(saved.revision,1);assert.equal((await studio.dispatch({type:'read',itemId:second.itemId})).document.title,'Photo');assert.equal(work.getState().activeId,second.itemId);await assert.rejects(studio.dispatch({type:'commit',itemId:first.itemId,expectedRevision:0,operations:[{type:'rename',title:'Stale'}]}),/revision|changed|conflict/i);const cancelled=await studio.dispatch({type:'export',itemId:first.itemId,revision:1,format:'json',settings:{}});assert.equal(cancelled.canceled,true);assert.deepEqual(await studio.dispatch({type:'jobs',itemId:first.itemId}),{jobs:[]});assert.deepEqual(dialogs,['save']);});
test('a renderer cannot inject foreign managed asset metadata into a document',async t=>{const {studio}=await fixture(t);const item=await studio.dispatch({type:'create',kind:'design',title:'Poster'});await assert.rejects(studio.dispatch({type:'commit',itemId:item.itemId,expectedRevision:0,operations:[{type:'replaceAssets',assets:[{id:'private',hash:'a'.repeat(64),name:'private.png',mediaType:'image/png',bytes:1,storageRef:'originals/private.png',origin:'import'}]}]}),/asset|managed/i);assert.equal((await studio.dispatch({type:'read',itemId:item.itemId})).revision,0);});

test('export discovery reports live format availability and JSON jobs publish the requested frozen revision',async t=>{
 const h=await fixture(t),item=await h.studio.dispatch({type:'create',kind:'design',title:'Export me'});
 const caps=await h.studio.dispatch({type:'exportCapabilities',itemId:item.itemId});assert.equal(caps.formats.find(c=>c.format==='json').available,true);assert.equal(caps.formats.find(c=>c.format==='png').available,false);
 const destination=path.join(h.root,'chosen.json');h.answers.save={canceled:false,filePath:destination};
 await assert.rejects(h.studio.dispatch({type:'export',itemId:item.itemId,revision:0,format:'json',settings:{outputPath:'C:/private'}}),/setting|unsupported/i);assert.equal(h.dialogs.length,0);
 const {job}=await h.studio.dispatch({type:'export',itemId:item.itemId,revision:0,format:'json',settings:{}});assert.ok(['queued','running'].includes(job.state));
 await h.studio.jobs.waitForIdle();const saved=(await h.studio.dispatch({type:'jobs',itemId:item.itemId})).jobs[0];assert.equal(saved.state,'completed');assert.equal(JSON.parse(await readFile(destination,'utf8')).id,item.itemId);assert.equal(saved.receipt.revision,0);
});

test('draft duplication preserves unsaved edits and clones only source-owned assets',async t=>{
 const h=await fixture(t),item=await h.studio.dispatch({type:'create',kind:'design',title:'Original'}),asset=await h.studio.assets.importBytes({itemId:item.itemId,buffer:PNG,name:'pixel.png',mediaType:'image/png'});
 const draft=structuredClone(item.document);draft.assets=[asset];draft.title='Unsaved copy';draft.data.artboards[0].nodes=[{id:'picture',type:'image',assetId:asset.id,x:0,y:0,width:100,height:100,rotation:0,opacity:1,locked:false,hidden:false}];
 await assert.rejects(h.studio.dispatch({type:'create',kind:'design',document:draft}),/managed|import/i);
 const originalRead=h.studio.assets.read;h.studio.assets.read=()=>{throw Error('Internal copies must stream managed originals, not materialize portable package bytes.');};let copied;try{copied=await h.studio.dispatch({type:'duplicate',itemId:item.itemId,document:draft,title:'Rescued draft'});}finally{h.studio.assets.read=originalRead;}assert.notEqual(copied.itemId,item.itemId);assert.equal(copied.document.title,'Rescued draft');assert.notEqual(copied.document.assets[0].id,asset.id);assert.equal(copied.document.data.artboards[0].nodes[0].assetId,copied.document.assets[0].id);assert.deepEqual((await h.studio.assets.read({itemId:copied.itemId,assetId:copied.document.assets[0].id})).buffer,PNG);assert.equal((await h.studio.dispatch({type:'read',itemId:item.itemId})).document.title,'Original');
 const wrong={...draft,id:copied.itemId};await assert.rejects(h.studio.dispatch({type:'duplicate',itemId:item.itemId,document:wrong}),/identity|item/i);
});

test('templates and conversions copy managed assets from the original source item',async t=>{
 const h=await fixture(t),created=await h.studio.dispatch({type:'create',kind:'slides',title:'Source deck'}),asset=await h.studio.assets.importBytes({itemId:created.itemId,buffer:PNG,name:'pixel.png',mediaType:'image/png'}),data=structuredClone(created.document.data);
 data.slides[0].nodes.push({id:'picture',type:'image',assetId:asset.id,x:0,y:0,width:100,height:100,rotation:0,opacity:1,locked:false,hidden:false});await h.studio.dispatch({type:'commit',itemId:created.itemId,expectedRevision:0,operations:[{type:'replaceAssets',assets:[asset]},{type:'replaceData',data}]});
 const template=await h.studio.dispatch({type:'templates',action:'save',itemId:created.itemId,title:'Reusable deck'});const fromTemplate=await h.studio.dispatch({type:'templates',action:'create',templateId:template.id});assert.notEqual(fromTemplate.document.assets[0].id,asset.id);
 const converted=await h.studio.dispatch({type:'convert',itemId:created.itemId,targetKind:'design',options:{}});assert.equal(converted.document.kind,'design');assert.equal(converted.report.sourceItemId,created.itemId);assert.deepEqual((await h.studio.assets.read({itemId:converted.itemId,assetId:converted.document.assets[0].id})).buffer,PNG);assert.equal((await h.studio.dispatch({type:'read',itemId:created.itemId})).revision,1);
});

test('portable import preserves explicitly included revisions under a new item identity',async t=>{
 const h=await fixture(t),created=await h.studio.dispatch({type:'create',kind:'design',title:'Before'});await h.studio.dispatch({type:'commit',itemId:created.itemId,expectedRevision:0,operations:[{type:'rename',title:'After'}]});
 const file=path.join(h.root,'portable.musework');h.answers.save={canceled:false,filePath:file};await h.studio.dispatch({type:'packageExport',itemId:created.itemId,revision:1,includeHistory:true});h.answers.open={canceled:false,filePaths:[file]};const imported=await h.studio.dispatch({type:'packageImport'});assert.notEqual(imported.itemId,created.itemId);assert.equal(imported.document.title,'After');const versions=await h.studio.dispatch({type:'versions',itemId:imported.itemId});assert.equal(versions.versions.length,2);assert.equal((await h.studio.dispatch({type:'read',itemId:imported.itemId,revision:0})).document.title,'Before');
});

test('trusted Office acceptance remaps imported original asset metadata into managed storage',async t=>{
 const h=await fixture(t),created=await h.studio.dispatch({type:'create',kind:'document',title:'Office source'}),file=path.join(h.root,'source.docx');const {buildDocx}=await import('../electron/work-docx-export.mjs');await writeFile(file,(await buildDocx({document:created.document})).bytes);h.answers.open={canceled:false,filePaths:[file]};
 const review=await h.studio.dispatch({type:'importOffice',kind:'document'});assert.ok(review.reviewToken);await assert.rejects(h.studio.dispatch({type:'importOffice',reviewToken:review.reviewToken,accept:true,reference:true}),/reference|PowerPoint/i);const accepted=await h.studio.dispatch({type:'importOffice',reviewToken:review.reviewToken,accept:true});assert.equal(accepted.document.kind,'document');assert.ok(accepted.document.assets.some(a=>a.mediaType.includes('wordprocessingml')));assert.ok(accepted.document.assets.every(a=>a.storageRef.startsWith('originals/')));
});

test('asset preview access requires an item-bound bridge capability even with an empty referrer',async t=>{
 const h=await fixture(t),item=await h.studio.dispatch({type:'create',kind:'design',title:'Owned preview'}),other=await h.studio.dispatch({type:'create',kind:'image',title:'Other'}),asset=await h.studio.assets.importBytes({itemId:item.itemId,buffer:PNG,name:'pixel.png',mediaType:'image/png'}),url=`musebench-work-asset://asset/${item.itemId}/${asset.id}?hash=${asset.hash}`;
 assert.equal((await h.studio.handleAsset(new Request(url))).status,403);assert.equal((await h.studio.handleAsset(new Request(url+'&access='+other.assetAccessToken))).status,403);
 const allowed=await h.studio.handleAsset(new Request(url+'&access='+item.assetAccessToken));assert.equal(allowed.status,200);assert.deepEqual(Buffer.from(await allowed.arrayBuffer()),PNG);assert.equal((await h.work.readWorkDocument(item.itemId)).document.assetAccessToken,undefined);
 h.studio.revokeAssetAccess('work-studio');assert.equal((await h.studio.handleAsset(new Request(url+'&access='+item.assetAccessToken))).status,403);
});

test('legacy chart conversion remains attached to its source after another item is selected',async t=>{
 const h=await fixture(t),legacy=await h.work.dispatch({type:'create',team:'finance',kind:'dashboard',title:'Legacy chart',brief:'Chart',demo:true}),source=await h.work.getArtifact(legacy.item.id);await h.studio.dispatch({type:'create',kind:'image',title:'Other'});
 const result=await h.studio.dispatch({type:'convertArtifact',itemId:legacy.item.id,selection:{type:'chart',index:0},targetKind:'design'});assert.notEqual(result.itemId,legacy.item.id);assert.deepEqual(result.document.data.artboards[0].nodes.find(n=>n.type==='chart').chart.values,source.charts[0].values);assert.deepEqual(await h.work.getArtifact(legacy.item.id),source);
 await assert.rejects(h.studio.dispatch({type:'convertArtifact',itemId:legacy.item.id,selection:{type:'chart',index:0,path:'secret'},targetKind:'design'}),/selection|unsupported/i);
});

test('busy state covers a native picker until the foreground export request settles',async t=>{
 let release;const pending=new Promise(resolve=>{release=resolve;}),h=await fixture(t,{dialog:{async showSaveDialog(){return pending;}}}),item=await h.studio.dispatch({type:'create',kind:'design',title:'Picker owner'});
 assert.equal(h.studio.isBusy(),false);const exporting=h.studio.dispatch({type:'export',itemId:item.itemId,revision:0,format:'json',settings:{}});assert.equal(h.studio.isBusy(),true);release({canceled:true});assert.equal((await exporting).cancelled,true);assert.equal(h.studio.isBusy(),false);
});

test('projector resolves each newly opened deck against that deck snapshot',async t=>{
 class WindowFixture{constructor(){this.webContents={setWindowOpenHandler(){},on(){}};this.closed=false;}isDestroyed(){return this.closed;}close(){this.closed=true;}on(){}getContentBounds(){return{width:1280,height:720};}async loadURL(){}}
 const h=await fixture(t,{BrowserWindow:WindowFixture});
 for(const title of ['First deck','Second deck']){const created=await h.studio.dispatch({type:'create',kind:'slides',title}),asset=await h.studio.assets.importBytes({itemId:created.itemId,buffer:PNG,name:'pixel.png',mediaType:'image/png'}),data=structuredClone(created.document.data);data.slides[0].nodes.push({id:'picture',type:'image',assetId:asset.id,x:0,y:0,width:100,height:100,rotation:0,opacity:1,locked:false,hidden:false});await h.studio.dispatch({type:'commit',itemId:created.itemId,expectedRevision:0,operations:[{type:'replaceAssets',assets:[asset]},{type:'replaceData',data}]});const opened=await h.studio.dispatch({type:'present',itemId:created.itemId});assert.equal(opened.count,1);}
});

test('native text-source picker binds imported context to its explicit original item',async t=>{
 const h=await fixture(t),first=await h.studio.dispatch({type:'create',kind:'design',title:'Source owner'}),second=await h.studio.dispatch({type:'create',kind:'image',title:'Selected other'}),file=path.join(h.root,'research.txt');await writeFile(file,'Private source retained for explicit Muse context.');h.answers.open={canceled:false,filePaths:[file]};
 const imported=await h.studio.dispatch({type:'importSources',itemId:first.itemId});assert.equal(imported.sources.length,1);assert.equal(h.work.getItem(first.itemId).sources.length,1);assert.equal(h.work.getItem(second.itemId).sources.length,0);assert.equal(h.work.getState().activeId,second.itemId);
 const sources=await h.studio.dispatch({type:'sources',itemId:first.itemId});assert.equal(sources.sources[0].name,'research.txt');assert.equal(sources.sources[0].path,undefined);await assert.rejects(h.studio.dispatch({type:'importSources',itemId:first.itemId,paths:[file]}),/unknown|unsupported/i);
});

test('saved brand logos survive deletion of their source Work item and prepare as an uncommitted independent draft',async t=>{
 const h=await fixture(t),source=await h.studio.dispatch({type:'create',kind:'design',title:'Logo source'}),target=await h.studio.dispatch({type:'create',kind:'image',title:'Brand destination'}),asset=await h.studio.assets.importBytes({itemId:source.itemId,buffer:PNG,name:'logo.png',mediaType:'image/png'});
 await h.studio.dispatch({type:'commit',itemId:source.itemId,expectedRevision:0,operations:[{type:'replaceAssets',assets:[asset]}]});
 const kit={id:'portable-brand',name:'Portable brand',colors:['#112233'],fonts:['Arial'],logos:[asset.id],textStyles:{}},saved=await h.studio.dispatch({type:'brands',action:'save',itemId:source.itemId,kit});assert.notEqual(saved.logos[0],asset.id);assert.match(saved.logoStorageId,/^brand-[a-f0-9]{64}$/);assert.equal(saved.logoAssets[0].hash,asset.hash);
 await h.studio.close();await h.work.close();const manifestFile=path.join(h.root,'work','manifest.json'),manifest=JSON.parse(await readFile(manifestFile,'utf8'));manifest.items=manifest.items.filter(record=>record.item.id!==source.itemId);manifest.activeId=target.itemId;await writeFile(manifestFile,JSON.stringify(manifest));await rm(path.join(h.root,'studio','assets',source.itemId),{recursive:true,force:true});
 const reopened=await h.open();assert.equal(reopened.work.getItem(source.itemId),null);const restoredKit=(await reopened.studio.dispatch({type:'brands',action:'list'})).kits.find(value=>value.id===kit.id);assert.equal(restoredKit.logoAssets[0].hash,asset.hash);
 const prepared=await reopened.studio.dispatch({type:'brands',action:'prepare',itemId:target.itemId,brandId:kit.id});assert.equal(prepared.assets.length,1);assert.notEqual(prepared.kit.logos[0],saved.logos[0]);assert.equal(prepared.kit.logos[0],prepared.assets[0].id);assert.deepEqual((await reopened.studio.assets.read({itemId:target.itemId,assetId:prepared.assets[0].id})).buffer,PNG);assert.equal((await reopened.studio.dispatch({type:'read',itemId:target.itemId})).revision,0);assert.equal((await reopened.studio.dispatch({type:'read',itemId:target.itemId})).document.assets.length,0);
});

test('brand preparation rejects forged namespaces and saving rejects unrelated logo metadata',async t=>{
 const h=await fixture(t),target=await h.studio.dispatch({type:'create',kind:'design',title:'Own target'}),kit={id:'forged',name:'Forged',colors:['#112233'],fonts:[],logos:['unowned'],textStyles:{},logoStorageId:'foreign-item',logoAssets:[{id:'unowned',hash:'a'.repeat(64),name:'logo.png',mediaType:'image/png',bytes:1,storageRef:'originals/'+ 'a'.repeat(64)+'.png',width:1,height:1,origin:'import'}]};
 await assert.rejects(h.studio.dispatch({type:'brands',action:'save',itemId:target.itemId,kit}),/logo|owned|managed/i);await assert.rejects(h.studio.dispatch({type:'brands',action:'prepare',itemId:target.itemId,kit}),/logo|owned|managed/i);assert.equal((await h.studio.dispatch({type:'brands',action:'list'})).kits.length,0);
});

test('duplicate validates an override title before copying any managed media',async t=>{
 const h=await fixture(t),created=await h.studio.dispatch({type:'create',kind:'design',title:'Safe title'}),asset=await h.studio.assets.importBytes({itemId:created.itemId,buffer:PNG,name:'logo.png',mediaType:'image/png'});await h.studio.dispatch({type:'commit',itemId:created.itemId,expectedRevision:0,operations:[{type:'replaceAssets',assets:[asset]}]});let copies=0;const original=h.studio.assets.copy;h.studio.assets.copy=async request=>{copies++;return original(request);};
 await assert.rejects(h.studio.dispatch({type:'duplicate',itemId:created.itemId,title:'X'.repeat(241)}),/title|240|limit/i);assert.equal(copies,0);
});

test('legacy editable copies preserve their source and recover conversion reports after reopen',async t=>{
 const h=await fixture(t),copies=[];
 for(const kind of ['slides','document','motion']){const source=await h.work.dispatch({type:'create',team:'finance',kind,title:'Legacy '+kind,brief:'Preserve original.',demo:true}),artifact=await h.work.getArtifact(source.item.id),copied=await h.studio.dispatch({type:'convertLegacy',itemId:source.item.id});assert.notEqual(copied.itemId,source.item.id);assert.equal(copied.document.kind,kind);assert.equal(copied.report.sourceItemId,source.item.id);assert.deepEqual(await h.work.getArtifact(source.item.id),artifact);copies.push(copied);}
 await h.studio.close();await h.work.close();const reopened=await h.open();for(const copied of copies){const saved=await reopened.studio.dispatch({type:'read',itemId:copied.itemId});assert.equal(saved.report.conversion,copied.report.conversion);assert.equal(saved.report.sourceItemId,copied.report.sourceItemId);const report=await reopened.studio.dispatch({type:'conversionReport',itemId:copied.itemId});assert.equal(report.report.conversion,copied.report.conversion);}
});

test('private native dropped files use the normal managed pipeline without exposing public path requests',async t=>{
 const h=await fixture(t),first=await h.studio.dispatch({type:'create',kind:'design',title:'Drop owner'}),second=await h.studio.dispatch({type:'create',kind:'image',title:'Other selected'}),file=path.join(h.root,'dropped.png');await writeFile(file,PNG);
 const imported=await h.studio.importDroppedFiles({itemId:first.itemId,paths:[file]});assert.equal(imported.assets.length,1);assert.equal(imported.revision,1);assert.equal(imported.document.id,first.itemId);assert.ok(imported.assetAccessToken);assert.equal((await h.studio.dispatch({type:'read',itemId:second.itemId})).revision,0);assert.equal(h.work.getState().activeId,second.itemId);
 await assert.rejects(h.studio.dispatch({type:'importAssets',itemId:first.itemId,paths:[file]}),/unsupported|unknown/i);await assert.rejects(h.studio.importDroppedFiles({itemId:first.itemId,paths:['relative.png']}),/native|picker|path/i);
});

test('document PDF page ranges validate before the destination picker',async t=>{
 const h=await fixture(t,{BrowserWindow:function NativeWindowFixture(){}}),item=await h.studio.dispatch({type:'create',kind:'document',title:'One page'});
 await assert.rejects(h.studio.dispatch({type:'export',itemId:item.itemId,revision:0,format:'pdf',settings:{range:'2'}}),/range|page|outside|exceed/i);assert.equal(h.dialogs.length,0);const cancelled=await h.studio.dispatch({type:'export',itemId:item.itemId,revision:0,format:'pdf',settings:{range:'1'}});assert.equal(cancelled.cancelled,true);assert.deepEqual(h.dialogs,['save']);
});

test('reference acceptance keeps source pictures out of the managed destination catalog',async t=>{
 class RasterWindowFixture{constructor(){this.closed=false;this.webContents={on(){},setWindowOpenHandler(){},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}},async executeJavaScript(){return true;},async capturePage(){return fakeImage;}};}isDestroyed(){return this.closed;}destroy(){this.closed=true;}async loadURL(){}}
 const h=await fixture(t,{BrowserWindow:RasterWindowFixture}),created=await h.studio.dispatch({type:'create',kind:'slides',title:'Reference source'}),asset=await h.studio.assets.importBytes({itemId:created.itemId,buffer:PNG,name:'source.png',mediaType:'image/png'}),document=structuredClone(created.document);document.assets=[asset];document.data.slides[0].nodes.push({id:'picture',type:'image',assetId:asset.id,x:0,y:0,width:100,height:100,rotation:0,opacity:1,locked:false,hidden:false});
 const file=path.join(h.root,'reference.pptx'),{exportWorkPptx}=await import('../electron/work-pptx-export.mjs');await exportWorkPptx({document,destinationPath:file,resolveAsset:async()=>PNG});h.answers.open={canceled:false,filePaths:[file]};const review=await h.studio.dispatch({type:'importOffice',kind:'slides'}),accepted=await h.studio.dispatch({type:'importOffice',reviewToken:review.reviewToken,accept:true,reference:true});assert.equal(accepted.report.mode,'reference');const catalog=(await h.studio.dispatch({type:'assets',itemId:accepted.itemId})).assets;assert.equal(catalog.length,2);assert.equal(catalog.find(value=>value.mediaType==='image/png').origin,'converted');assert.equal(accepted.document.data.slides[0].nodes[0].locked,true);
});
