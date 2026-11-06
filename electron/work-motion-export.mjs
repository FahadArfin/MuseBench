import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateWorkDocument} from '../src/shared/work-documents.mjs';
import {sampleMotionScene,motionFrameTimes} from '../src/shared/work-motion-operations.mjs';
import {sceneNodeContent,sceneNodeStyle,sceneStyleText,escapeSceneHtml} from '../src/shared/work-scene-render.mjs';
import {encodeFrameSequence} from './work-video-export.mjs';
import {discoverWorkMediaCapabilities} from './work-media-worker.mjs';
import {exportFontCss} from './work-design-export.mjs';
const check=signal=>{if(signal?.aborted)throw Error('Motion export cancelled.');};
export function compileMotionExportPlan(document,settings={}){
 const validated=validateWorkDocument(document);if(validated.kind!=='motion')throw Error('Motion export requires a motion document.');
 const format=settings.format||'mp4';if(!['mp4','gif'].includes(format))throw Error('Motion export supports MP4 or GIF.');
 const fps=settings.fps??(format==='gif'?15:validated.data.fps);if(![12,15,24,30].includes(fps)||(format==='gif'&&fps>24))throw Error('Motion export frame rate must be 12, 15, 24, or 30 (GIF maximum 24).');
 const maximum=format==='gif'?720:1920,scale=Math.min(1,maximum/Math.max(validated.data.width,validated.data.height));
 const width=settings.width??Math.max(16,Math.floor(validated.data.width*scale/2)*2),height=settings.height??Math.max(16,Math.floor(validated.data.height*scale/2)*2);
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>=16&&v<=maximum&&v%2===0))throw Error(`Motion ${format} dimensions must be even, 16–${maximum} pixels.`);
 const times=motionFrameTimes({...validated.data,fps});if(times.length>7200)throw Error('Motion export exceeds 7200 frames.');
 return {document:validated,revision:validated.revision,format,fps,width,height,times,duration:times.length/fps,sourceDuration:validated.data.durationTicks/1000};
}
export function renderMotionFrameHtml(data,tick,resolveAsset=()=>'',{width=data.width,height=data.height,resolveAssetDimensions=()=>undefined}={}){
 const scene=sampleMotionScene(data,tick,{loop:false}),e=escapeSceneHtml;
 return `<div style="position:relative;width:${data.width}px;height:${data.height}px;overflow:hidden;transform:scale(${width/data.width},${height/data.height});transform-origin:top left;background:${e(scene.background)}">${scene.nodes.map(n=>`<div style="${e(sceneStyleText(sceneNodeStyle(n)))}">${sceneNodeContent(n,resolveAsset,resolveAssetDimensions)}</div>`).join('')}</div>`;
}
/** Assets are resolved only through the service-owned resolver, then hash checked. */
export async function renderWorkMotion({document,resolveAsset,destinationPath,outputPath,settings={},format,signal,onProgress,BrowserWindow,capabilities}){
 const timeout=AbortSignal.timeout(600000);signal=signal?AbortSignal.any([signal,timeout]):timeout;
 const plan=compileMotionExportPlan(document,{...settings,...(format?{format}:{})});check(signal);
 if(!BrowserWindow){const electron=await import('electron');BrowserWindow=electron.BrowserWindow;}
 if(typeof BrowserWindow!=='function')throw Error('Motion export requires the isolated Electron renderer.');
 capabilities=capabilities||await discoverWorkMediaCapabilities();if(!capabilities.available||!capabilities[plan.format])throw Error(`Motion ${plan.format.toUpperCase()} export is unavailable. ${capabilities.reasons?.join(' ')||'Required FFmpeg encoder or probe is missing.'}`);
 let assetBytes=0;const assets=new Map();for(const id of new Set(plan.document.data.scenes.flatMap(s=>s.nodes.filter(n=>n.type==='image').map(n=>n.assetId)))){
  check(signal);const asset=plan.document.assets.find(a=>a.id===id);if(!asset||!/^image\/(png|jpeg|webp|gif)$/.test(asset.mediaType))throw Error(`Motion image ${id} is missing or unsupported.`);
  const resolved=await resolveAsset(id),filePath=typeof resolved==='string'?resolved:resolved?.filePath||resolved?.path;
  const payload=resolved?.bytes??resolved?.buffer;let bytes;if(Buffer.isBuffer(resolved))bytes=resolved;else if(payload instanceof Uint8Array||payload instanceof ArrayBuffer)bytes=Buffer.from(payload);else{
   if(typeof filePath!=='string'||!path.isAbsolute(filePath))throw Error(`Managed image ${id} is unavailable.`);
   if((await stat(filePath)).size>64*1024*1024)throw Error('Motion export image exceeds 64 MiB.');bytes=await readFile(filePath);
  }
  assetBytes+=bytes.length;if(bytes.length>64*1024*1024||assetBytes>128*1024*1024)throw Error('Motion export supports at most 64 MiB per image and 128 MiB total image bytes.');
  if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.hash)throw Error(`Motion image ${id} changed since import.`);
  assets.set(id,`data:${asset.mediaType};base64,${bytes.toString('base64')}`);
 }
 const scratch=await mkdtemp(path.join(tmpdir(),'musebench-motion-'));let win;
 const abort=()=>{if(win&&!win.isDestroyed())win.destroy();};signal?.addEventListener('abort',abort,{once:true});
 try{
  win=new BrowserWindow({show:false,width:plan.width,height:plan.height,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,backgroundThrottling:false,offscreen:{deviceScaleFactor:1},partition:`work-motion-${randomUUID()}`}});
  const web=win.webContents;web.setWindowOpenHandler(()=>({action:'deny'}));for(const event of ['will-navigate','will-redirect','will-attach-webview'])web.on(event,e=>e.preventDefault());
  web.session.setPermissionRequestHandler((_c,_p,cb)=>cb(false));web.session.setPermissionCheckHandler(()=>false);
  const nodes=plan.document.data.scenes.flatMap(s=>s.nodes),fontCss=await exportFontCss({nodes});
  const requestedFonts=[...new Set(nodes.map(n=>n.style?.fontFamily).filter(Boolean))];
  const url='data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; style-src \'unsafe-inline\'"><style>'+fontCss+'html,body{margin:0;padding:0;overflow:hidden;background:#000}</style><main id="frame"></main>');
  web.session.webRequest.onBeforeRequest((details,cb)=>cb({cancel:details.url!==url&&!details.url.startsWith('data:image/')&&!details.url.startsWith('data:font/')}));
  await win.loadURL(url);
  let frameBytes=0;for(let i=0;i<plan.times.length;i++){
   check(signal);const html=renderMotionFrameHtml(plan.document.data,plan.times[i],id=>assets.get(id)||'',{...plan,resolveAssetDimensions:id=>plan.document.assets.find(a=>a.id===id)});
   await web.executeJavaScript(`(async()=>{document.getElementById('frame').innerHTML=${JSON.stringify(html)};await document.fonts.ready;await Promise.all([...Array.from(document.images).map(i=>i.decode()),...Array.from(document.querySelectorAll('svg image')).map(e=>{const i=new Image();i.src=e.getAttribute('href');return i.decode();})]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;})()`);
   if(i===0&&requestedFonts.length){const missing=await web.executeJavaScript(`(()=>{const c=document.createElement('canvas').getContext('2d'),sample='Wim12345@';return ${JSON.stringify(requestedFonts)}.filter(font=>{const name=font.split(',')[0].replace(/["']/g,'').trim();if(['sans-serif','serif','monospace','system-ui'].includes(name))return false;return ['monospace','serif','sans-serif'].every(fallback=>{c.font='72px '+fallback;const w=c.measureText(sample).width;c.font='72px "'+name+'",'+fallback;return Math.abs(c.measureText(sample).width-w)<.001;});});})()`);if(missing.length)throw Error('Required motion export font unavailable: '+missing.join(', ')+'. Choose an installed font.');}
   const bitmap=await web.capturePage({x:0,y:0,width:plan.width,height:plan.height});const png=bitmap.toPNG();frameBytes+=png.length;if(frameBytes>2*1024**3)throw Error('Motion render exceeded the 2 GiB temporary frame limit. Reduce dimensions or duration.');await writeFile(path.join(scratch,String(i).padStart(6,'0')+'.png'),png);
   onProgress?.({phase:'frames',progress:(i+1)/plan.times.length*.75});
  }
  check(signal);const receipt=await encodeFrameSequence({framePattern:path.join(scratch,'%06d.png'),frameCount:plan.times.length,fps:plan.fps,width:plan.width,height:plan.height,format:plan.format,outputPath:destinationPath||outputPath,signal,capabilities,onProgress:event=>onProgress?.({...event,progress:.75+(event.progress||0)*.25})});
  return {...receipt,revision:plan.revision,sourceDuration:plan.sourceDuration,frameCount:plan.times.length,fps:plan.fps,warnings:plan.format==='gif'?['GIF has no audio, a maximum 256-color palette, and limited transparency.']:[]};
 }finally{signal?.removeEventListener('abort',abort);if(win&&!win.isDestroyed())win.destroy();await rm(scratch,{recursive:true,force:true});}
}
