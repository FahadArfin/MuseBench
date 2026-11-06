import {randomUUID, createHash} from 'node:crypto';
import {lstat, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateWorkDocument, validateSceneNodes} from '../src/shared/work-documents.mjs';
import {escapeSceneHtml, sceneNodeContent, sceneNodeStyle, sceneStyleText} from '../src/shared/work-scene-render.mjs';
const formats = new Set(['png','jpeg','jpg','webp','pdf']);
const safeColor = value => typeof value === 'string' && /^(#[a-f\d]{3,8}|[a-z]{1,32}|rgba?\([\d\s.,%]+\))$/i.test(value);

export function designExportSettings(surface, format, settings = {}) {
  if (!formats.has(format)) throw Error('Unsupported design export format');
  const width = settings.width ?? surface.width, height = settings.height ?? surface.height;
  const dpi = settings.dpi ?? 96, bleed = settings.bleed ?? 0, margin = settings.margin ?? 0, quality = settings.quality ?? .95;
  for (const [key,value,min,max] of [['width',width,1,16384],['height',height,1,16384],['dpi',dpi,36,1200],['bleed',bleed,0,2048],['margin',margin,0,2048],['quality',quality,0,1]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw Error(`Invalid export ${key}`);
  }
  if (settings.transparent !== undefined && typeof settings.transparent !== 'boolean') throw Error('Invalid transparency setting');
  const padding = bleed + margin, outputWidth = Math.round(width + 2 * padding), outputHeight = Math.round(height + 2 * padding);
  if (outputWidth > 16384 || outputHeight > 16384 || outputWidth * outputHeight > 64000000) throw Error('Export exceeds 64 megapixel limit');
  if (['jpeg','jpg'].includes(format) && (!safeColor(settings.background) || settings.background === 'transparent' || settings.transparent === true || /^rgba/i.test(settings.background) || /^#[a-f\d]{4}$|^#[a-f\d]{8}$/i.test(settings.background))) throw Error('JPEG requires an explicit opaque background color');
  if (settings.background !== undefined && !safeColor(settings.background)) throw Error('Invalid export background');
  return {width:Math.round(width),height:Math.round(height),dpi,bleed,margin,padding,outputWidth,outputHeight,quality,
    paperWidthInches:outputWidth/dpi,paperHeightInches:outputHeight/dpi,
    background:settings.background ?? (settings.transparent ? 'transparent' : surface.background),
    surfaceBackground:settings.transparent ? 'transparent' : surface.background,cropMarks:settings.cropMarks === true};
}

export function renderSceneHtml(surface, {settings = designExportSettings(surface,'png'), resolveAsset = () => '', fontCss = '', resolveAssetDimensions = () => undefined} = {}) {
  const nodes = validateSceneNodes(surface.nodes), e = escapeSceneHtml;
  const sx = settings.width/surface.width, sy = settings.height/surface.height;
  const p = settings.padding, w = settings.outputWidth, h = settings.outputHeight;
  const marks = settings.cropMarks ? `<svg style="position:absolute;inset:0;pointer-events:none" width="${w}" height="${h}"><path d="M0 ${p} H${p} M${p} 0 V${p} M${w-p} 0 V${p} M${w-p} ${p} H${w} M0 ${h-p} H${p} M${p} ${h-p} V${h} M${w-p} ${h-p} H${w} M${w-p} ${h-p} V${h}" stroke="#000" fill="none"/></svg>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none';"><style>${fontCss}*{box-sizing:border-box}html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:${e(settings.background)}}@page{margin:0;size:${settings.paperWidthInches}in ${settings.paperHeightInches}in}</style></head><body><div style="position:absolute;left:${settings.margin}px;top:${settings.margin}px;width:${settings.width+2*settings.bleed}px;height:${settings.height+2*settings.bleed}px;overflow:hidden"><div style="position:absolute;left:${settings.bleed}px;top:${settings.bleed}px;width:${surface.width}px;height:${surface.height}px;transform-origin:top left;transform:scale(${sx},${sy});background:${e(settings.surfaceBackground ?? surface.background)}">${nodes.map(node => `<div style="${e(sceneStyleText(sceneNodeStyle(node)))}">${sceneNodeContent(node,resolveAsset,resolveAssetDimensions)}</div>`).join('')}</div></div>${marks}</body></html>`;
}

export async function exportFontCss(surface) {
  if (!surface.nodes.some(node => /\bInter\b/i.test(node.style?.fontFamily || ''))) return '';
  let css = '';
  for (const variant of ['normal','italic']) {
    const bytes = await readFile(new URL('../node_modules/@fontsource-variable/inter/files/inter-latin-wght-'+variant+'.woff2',import.meta.url));
    css += `@font-face{font-family:Inter;font-style:${variant};font-weight:100 900;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`;
  }
  return css;
}

export function createWorkDesignExporter({BrowserWindow, timeoutMs = 120000} = {}) {
  const active = new Set();
  let closed = false;
  async function run({document:input, format, filePath, settings:raw = {}, resolveAsset, signal, onProgress}) {
    if (closed) throw Error('Design exporter is closed');
    const document = validateWorkDocument(input);
    if (!['design','image'].includes(document.kind)) throw Error('Design exporter requires image or design document');
    if (typeof BrowserWindow !== 'function') throw Error('Electron render capability unavailable');
    if (!path.isAbsolute(filePath || '') || filePath.includes('\0')) throw Error('Native export destination required');
    const existing = await lstat(filePath).catch(error => {if (error.code !== 'ENOENT') throw error; return null;});
    if (existing && !existing.isFile()) throw Error('Export destination must be a regular file');
    const surfaces=format==='pdf'?designPdfSurfaces(document,raw):[document.data.artboards.find(board=>board.id===(raw.artboardId||document.data.activeArtboardId))||document.data.artboards[0]];const surface=surfaces[0];
    const settings = designExportSettings(surface,format,raw);
    let win, temp, timer, rejectAbort, abortError;
    const interrupted = new Promise((_,reject) => {rejectAbort = reject;});
    interrupted.catch(() => {});
    const abort = reason => {
      abortError = reason instanceof Error ? reason : signal?.reason instanceof Error ? signal.reason : Error('Design export cancelled');
      rejectAbort(abortError);
      if (win && !win.isDestroyed()) win.destroy();
    };
    const wait = promise => Promise.race([promise,interrupted]);
    const job = {abort};
    active.add(job);
    signal?.addEventListener('abort',abort,{once:true});
    timer = setTimeout(() => abort(Error('Design export timed out')),Math.max(1000,Math.min(timeoutMs,300000)));
    try {
      if (signal?.aborted) abort();
      const urls = new Map();
      for (const node of surfaces.flatMap(surface=>surface.nodes)) {
        if (node.type !== 'image' || urls.has(node.assetId)) continue;
        if (!resolveAsset) throw Error('Managed image resolver unavailable');
        const asset = document.assets.find(asset => asset.id === node.assetId);
        if (!asset) throw Error('Missing managed image asset');
        const result = await wait(resolveAsset(asset.id,asset));
        const bytes = Buffer.isBuffer(result) ? result : Buffer.from(result?.bytes || result?.buffer || []);
        if (!bytes.length || bytes.length > 128*1024*1024 || !['image/png','image/jpeg','image/webp','image/gif'].includes(asset.mediaType)) throw Error('Unsupported or empty managed image asset');
        if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.hash) throw Error('Managed image asset hash mismatch');
        urls.set(asset.id,`data:${asset.mediaType};base64,${bytes.toString('base64')}`);
      }
      onProgress?.(.2);
      const fontCss = await wait(exportFontCss({nodes:surfaces.flatMap(surface=>surface.nodes)}));
      const renderOptions={settings:format==='pdf'?raw:settings,fontCss,resolveAsset:id=>urls.get(id)||'',resolveAssetDimensions:id=>{const asset=document.assets.find(asset=>asset.id===id);return asset?.width&&asset.height?{width:asset.width,height:asset.height}:undefined;}};const html=format==='pdf'?renderDesignPdfHtml(surfaces,renderOptions):renderSceneHtml(surface,renderOptions);
      const url = 'data:text/html;charset=utf-8,'+encodeURIComponent(html);
      win = new BrowserWindow({show:false,transparent:true,backgroundColor:'#00000000',width:settings.outputWidth,height:settings.outputHeight,useContentSize:true,
        webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,plugins:false,backgroundThrottling:false,offscreen:{deviceScaleFactor:1},partition:'work-design-'+randomUUID()}});
      const web = win.webContents;
      web.on('render-process-gone',abort);
      web.setWindowOpenHandler(() => ({action:'deny'}));
      for (const event of ['will-navigate','will-redirect','will-attach-webview']) web.on(event,event => event.preventDefault());
      web.session.setPermissionRequestHandler((_web,_permission,callback) => callback(false));
      web.session.setPermissionCheckHandler(() => false);
      web.session.webRequest.onBeforeRequest((details,callback) => callback({cancel:details.url !== url && !details.url.startsWith('data:image/') && !details.url.startsWith('data:font/')}));
      await wait(win.loadURL(url));
      await wait(web.executeJavaScript(`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await Promise.all([...document.querySelectorAll('svg image')].map(e=>{const i=new Image();i.src=e.getAttribute('href');return i.decode();}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`));
      const requestedFonts = [...new Set(surfaces.flatMap(surface=>surface.nodes).map(node => node.style?.fontFamily).filter(Boolean))];
      const missing = await wait(web.executeJavaScript(`(()=>{const c=document.createElement('canvas').getContext('2d'),sample='Wim12345@';return ${JSON.stringify(requestedFonts)}.filter(font=>{const name=font.split(',')[0].replace(/["']/g,'').trim();if(['sans-serif','serif','monospace','system-ui'].includes(name))return false;return ['monospace','serif','sans-serif'].every(fallback=>{c.font='72px '+fallback;const w=c.measureText(sample).width;c.font='72px "'+name+'",'+fallback;return Math.abs(c.measureText(sample).width-w)<.001;});});})()`));
      if (missing.length) throw Error('Required export font unavailable: '+missing.join(', ')+'. Choose an installed font.');
      onProgress?.(.55);
      let bytes;
      if (format === 'pdf') {
        bytes = await wait(web.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:{width:settings.paperWidthInches*25400,height:settings.paperHeightInches*25400},margins:{top:0,bottom:0,left:0,right:0},displayHeaderFooter:false,scale:1}));
        if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw Error('Invalid PDF output');
      } else {
        let image = await wait(web.capturePage({x:0,y:0,width:settings.outputWidth,height:settings.outputHeight},{stayHidden:true,stayAwake:true}));
        if (image.getSize().width !== settings.outputWidth || image.getSize().height !== settings.outputHeight) image = image.resize({width:settings.outputWidth,height:settings.outputHeight,quality:'best'});
        if (format === 'jpeg' || format === 'jpg') bytes = image.toJPEG(Math.round(settings.quality*100));
        else if (format === 'webp') {
          const png = image.toPNG().toString('base64');
          const encoded = await wait(web.executeJavaScript(`(async()=>{const i=new Image();i.src='data:image/png;base64,${png}';await i.decode();const c=document.createElement('canvas');c.width=${settings.outputWidth};c.height=${settings.outputHeight};c.getContext('2d').drawImage(i,0,0);return c.toDataURL('image/webp',${settings.quality})})()`));
          if (!encoded.startsWith('data:image/webp;base64,')) throw Error('WebP encoder unavailable');
          bytes = Buffer.from(encoded.split(',')[1],'base64');
        } else bytes = image.toPNG();
      }
      if (abortError || signal?.aborted) throw abortError || Error('Design export cancelled');
      temp = path.join(path.dirname(filePath),'.'+path.basename(filePath)+'.'+randomUUID()+'.tmp');
      const handle = await open(temp,'wx',0o600);
      await handle.close();
      await writeFile(temp,bytes);
      const info = await stat(temp);
      if (!info.size) throw Error('Empty design output');
      if (abortError || signal?.aborted) throw abortError || Error('Design export cancelled');
      await rename(temp,filePath);
      temp = null;
      onProgress?.(1);
      return {filePath,format,bytes:info.size,width:settings.outputWidth,height:settings.outputHeight,dpi:settings.dpi,paperWidthInches:settings.paperWidthInches,paperHeightInches:settings.paperHeightInches,itemId:document.id,revision:document.revision,colorSpace:'RGB',flattened:true,fonts:requestedFonts,pages:surfaces.length,pageDimensions:surfaces.map(surface=>{const s=designExportSettings(surface,format,raw);return {widthInches:s.paperWidthInches,heightInches:s.paperHeightInches};})};
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
      active.delete(job);
      if (win && !win.isDestroyed()) win.destroy();
      if (temp) await rm(temp,{force:true});
    }
  }
  return {export:run,close(){closed=true;for(const job of active)job.abort();},cancelAll(){for(const job of active)job.abort();}};
}
export function designPdfSurfaces(document,settings={}){
  const boards=document.data.artboards;
  if(settings.range!==undefined&&settings.range!==''){
    if(typeof settings.range!=='string'||settings.range.length>1000||!/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/.test(settings.range))throw Error('Invalid PDF artboard range');
    const selected=new Set();for(const part of settings.range.split(',')){const [start,end=start]=part.split('-').map(Number);if(start<1||end>boards.length||end<start)throw Error('PDF range exceeds artboards');for(let i=start;i<=end;i++)selected.add(i-1);}return [...selected].sort((a,b)=>a-b).map(i=>boards[i]);
  }
  if(settings.artboardId){const board=boards.find(b=>b.id===settings.artboardId);if(!board)throw Error('PDF artboard no longer exists');return [board];}
  return boards;
}
export function renderDesignPdfHtml(surfaces,{settings={},resolveAsset=()=>'',resolveAssetDimensions=()=>undefined,fontCss=''}={}){
  const pages=surfaces.map((surface,index)=>{const options=designExportSettings(surface,'pdf',settings),html=renderSceneHtml(surface,{settings:options,resolveAsset,resolveAssetDimensions});const body=html.slice(html.indexOf('<body>')+6,html.indexOf('</body>'));return {index,options,body};});
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none';"><style>${fontCss}*{box-sizing:border-box}html,body{margin:0;padding:0}${pages.map(({index,options:o})=>`@page work${index}{size:${o.paperWidthInches}in ${o.paperHeightInches}in;margin:0}`).join('')}</style></head><body>${pages.map(({index,options:o,body})=>`<section style="page:work${index};position:relative;width:${o.paperWidthInches}in;height:${o.paperHeightInches}in;overflow:hidden;background:${escapeSceneHtml(o.background)};break-after:${index===pages.length-1?'auto':'page'}"><div style="position:absolute;left:0;top:0;transform-origin:top left;transform:scale(${96/o.dpi});width:${o.outputWidth}px;height:${o.outputHeight}px">${body}</div></section>`).join('')}</body></html>`;
}
