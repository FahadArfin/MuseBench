import { lstat, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compileWorkRenderPlan } from '../src/shared/work-render-plan.mjs';
import { wrapCaptionText } from '../src/shared/work-caption-operations.mjs';
import { createVideoTextRenderer, centerVideoTitleRaster } from './work-video-fonts.mjs';
import { assertNativeMediaPath, discoverWorkMediaCapabilities, probeWorkMedia, runMediaProcess, WORK_MEDIA_INPUT_ARGS } from './work-media-worker.mjs';

const activeDestinations=new Set();
const n=value=>String(Math.round(value*1000000)/1000000);
function checkAbort(signal){if(signal?.aborted) throw Error('Media job cancelled.');}
async function atomicOutput(outputPath,signal,operation){
  if(typeof outputPath!=='string'||!path.isAbsolute(outputPath)||outputPath.includes('\0')) throw Error('An absolute native-selected export destination is required.');
  const key=process.platform==='win32'?path.resolve(outputPath).toLowerCase():path.resolve(outputPath);
  if(activeDestinations.has(key)) throw Error('An export is already running for this destination.');
  activeDestinations.add(key); let temporary;let scratch;
  try {checkAbort(signal); const existing=await lstat(outputPath).catch(e=>{if(e.code!=='ENOENT') throw e;return null;});if(existing&&!existing.isFile())throw Error('Export destination must be a regular file.');
    temporary=path.join(path.dirname(outputPath),`.${path.basename(outputPath)}.${randomUUID()}.tmp`);
    scratch=await mkdtemp(path.join(path.dirname(outputPath),'.work-render-'));
    const receipt=await operation(temporary,scratch);checkAbort(signal);if(!(await stat(temporary)).size)throw Error('Encoder returned an empty output.');await rename(temporary,outputPath);return {...receipt,filePath:outputPath,bytes:(await stat(outputPath)).size};
  }finally{activeDestinations.delete(key);if(temporary)await rm(temporary,{force:true});if(scratch)await rm(scratch,{recursive:true,force:true});}
}
export function validateEncodedMedia(metadata,expected){
  const video=metadata.streams.find(s=>s.type==='video');
  // GIF avg_frame_rate is not reliable (FFmpeg 8 may report 50/3 for 15 frames in 1s).
  // GIF verification below measures every actual frame delay and frame count instead.
  if(!video||metadata.width!==expected.width||metadata.height!==expected.height||Math.abs(metadata.duration-expected.duration)>Math.max(.12,2/expected.fps)||(expected.format!=='gif'&&Math.abs(metadata.frameRate-expected.fps)>.02))throw Error('Rendered output failed dimensions, duration or frame-rate verification.');
  if(expected.format==='mp4'&&(video.codec!=='h264'||(expected.audio&&!metadata.audio.some(a=>a.codec==='aac'))))throw Error('Rendered output is missing required H.264/AAC streams.');
  if(expected.audio&&metadata.audio.some(a=>Math.abs(a.startTime)>.1||Math.abs(a.duration-expected.duration)>.15))throw Error('Rendered audio failed timestamp or duration verification.');
  if(expected.format==='gif'&&video.codec!=='gif')throw Error('Rendered output is not a GIF.');
}
async function verifyOutput(filePath,expected,caps,signal){
  const metadata=await probeWorkMedia({filePath,capabilities:caps,signal});validateEncodedMedia(metadata,expected);
  if(expected.format==='gif'){
    const {stdout}=await runMediaProcess(caps.ffprobePath,['-v','error','-show_frames','-select_streams','v:0','-show_entries','frame=duration_time,pkt_duration_time','-of','json',filePath],{signal,timeoutMs:15000});const frames=JSON.parse(stdout).frames;
    if(frames.length!==Math.round(expected.duration*expected.fps)||frames.some(f=>{const delay=Number(f.duration_time??f.pkt_duration_time);return !(delay>0)||Math.abs(delay-1/expected.fps)>.011;}))throw Error('GIF frame count or centisecond timing verification failed.');
  }
  const positions=[0,Math.max(0,expected.duration/2),Math.max(0,expected.duration-1/expected.fps)];
  for(const at of positions)await runMediaProcess(caps.ffmpegPath,['-v','error','-nostdin','-protocol_whitelist','file,pipe','-ss',n(at),'-i',filePath,'-map','0:v:0','-frames:v','1','-f','null','pipe:1'],{signal,timeoutMs:15000});
  if(metadata.audio.length)await runMediaProcess(caps.ffmpegPath,['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',filePath,'-map','0:a:0','-vn','-f','null','pipe:1'],{signal,timeoutMs:60000});
  return metadata;
}
async function capabilitiesOrThrow(capabilities,format='mp4'){const caps=capabilities||await discoverWorkMediaCapabilities();if(!caps.available||!caps[format])throw Error(`Media ${format.toUpperCase()} capability unavailable. ${caps.reasons?.join(' ')||'Required encoder is missing.'}`);return caps;}
function atempo(speed){const parts=[];while(speed>2){parts.push('atempo=2');speed/=2;}while(speed<.5){parts.push('atempo=0.5');speed/=.5;}parts.push(`atempo=${n(speed)}`);return parts;}
function duckExpression(clip,plan){const d=clip.audio.ducking;if(!d)return '1';const intervals=plan.duckingIntervals.filter(c=>c.trackId===d.sidechainTrackId);let expression='1';for(const other of intervals){const start=other.start-clip.start,end=start+other.duration;const attack=Math.max(.000001,d.attack),release=Math.max(.000001,d.release);const envelope=`if(lt(t,${n(start)}),1,if(lt(t,${n(end)}),1-(1-${n(d.amount)})*min(1,(t-${n(start)})/${n(attack)}),if(lt(t,${n(end+release)}),${n(d.amount)}+(1-${n(d.amount)})*(t-${n(end)})/${n(release)},1)))`;expression=`min(${expression},${envelope})`;}return expression;}

/** Original media paths come only from the main-owned managed asset resolver. */
export async function renderWorkVideo({document,resolveAsset,destinationPath,settings={},signal,onProgress,capabilities}){
  return atomicOutput(destinationPath,signal,async(temporary,scratch)=>{
    const plan=compileWorkRenderPlan(document,settings);const caps=await capabilitiesOrThrow(capabilities);const args=['-hide_banner','-loglevel','error','-nostdin','-y'];const inputs=new Map();
    for(const assetId of plan.assetIds){checkAbort(signal);const resolved=await resolveAsset(assetId);const filePath=typeof resolved==='string'?resolved:resolved?.filePath||resolved?.path;
      if(resolved?.proxy||resolved?.original===false)throw Error(`Original media is unavailable for ${assetId}. Relink the original before exporting.`);
      try{await assertNativeMediaPath(filePath);}catch{throw Error(`Original media is missing for ${assetId}. Relink the original before exporting.`);}
      const record=document.assets?.find(a=>a.id===assetId);if(record?.hash&&resolved?.hash&&record.hash!==resolved.hash)throw Error(`Original media identity changed for ${assetId}.`);
      const metadata=await probeWorkMedia({filePath,capabilities:caps,signal});if(!metadata.decodable)throw Error(`Unsupported decoder: ${metadata.unsupportedCodecs.join(', ')}`);
      const index=inputs.size;inputs.set(assetId,{index,filePath,metadata});if(plan.clips.some(c=>c.assetId===assetId&&c.kind==='image')){if(!metadata.stillImage)throw Error(`Clip ${assetId} is not a supported still image.`);args.push('-loop','1');}args.push(...WORK_MEDIA_INPUT_ARGS,'-i',filePath);
    }
    const needsText=plan.captions.length||plan.clips.some(c=>c.kind==='text');
    const textCount=plan.captions.length+plan.clips.filter(c=>c.kind==='text').length;if(textCount>128)throw Error('Export up to 128 titles and captions per selected range. Choose a smaller export range.');
    const textRenderer=needsText?await createVideoTextRenderer({texts:[...plan.captions.map(c=>c.text),...plan.clips.filter(c=>c.kind==='text').map(c=>c.text||'')],preferredFontFile:caps.fontFile,signal}):null;
    try{
    let textInputs=0,textPixels=0,textBytes=0;
    const textInput=async(name,options)=>{checkAbort(signal);const result=await textRenderer.render(options);textPixels+=result.width*result.height;textBytes+=result.png.length;if(textPixels>32*1024**2||textBytes>64*1024**2)throw Error('Video text overlays exceed the bounded render budget. Choose a smaller export range.');const file=path.join(scratch,name+'.png');await writeFile(file,result.png);const index=inputs.size+textInputs++;args.push('-f','image2','-pattern_type','none','-loop','1','-framerate',String(plan.fps),...WORK_MEDIA_INPUT_ARGS,'-i',file);return{...result,index};};
    const filters=[`color=c=black:s=${plan.width}x${plan.height}:r=${plan.fps}:d=${n(plan.duration)}[base]`];let visual='base';const audio=[];let serial=0;
    for(const clip of plan.clips){const i=serial++;const input=inputs.get(clip.assetId);const cutIn=Math.max(0,plan.rangeStart-clip.start),cutOut=Math.min(clip.duration,plan.rangeEnd-clip.start),start=Math.max(0,clip.start-plan.rangeStart);
      if(input&&clip.kind!=='image'&&clip.sourceIn+cutOut*clip.speed>input.metadata.duration+.05)throw Error(`Clip ${clip.id} extends beyond its original media. Trim or relink the clip.`);
      if(input&&['video','image'].includes(clip.kind)){
        if(!input.metadata.width)throw Error(`Clip ${clip.id} requires a video stream.`);
        const tr=clip.transform,crop=tr.crop;const w=Math.max(2,Math.round(plan.width*tr.scale/2)*2),h=Math.max(2,Math.round(plan.height*tr.scale/2)*2);
        if(w>8192||h>8192)throw Error('Export transform exceeds the 8192 pixel rendering limit.');
        const chain=[`trim=start=${n(clip.kind==='image'?0:clip.sourceIn)}:duration=${n(clip.kind==='image'?clip.duration:clip.duration*clip.speed)}`,`setpts=(PTS-STARTPTS)/${n(clip.kind==='image'?1:clip.speed)}`,`crop=iw*${n(1-crop.left-crop.right)}:ih*${n(1-crop.top-crop.bottom)}:iw*${n(crop.left)}:ih*${n(crop.top)}`,`scale=${w}:${h}:force_original_aspect_ratio=${tr.fit==='cover'?'increase':'decrease'}`];
        if(tr.fit==='cover')chain.push(`crop=${w}:${h}`);chain.push('setsar=1',`fps=${plan.fps}`,'format=rgba');
        if(tr.rotation)chain.push(`rotate=${n(tr.rotation*Math.PI/180)}:ow=rotw(${n(tr.rotation*Math.PI/180)}):oh=roth(${n(tr.rotation*Math.PI/180)}):c=none`);
        if(clip.transition.type==='crossfade'&&clip.transition.duration)chain.push(`fade=t=in:st=0:d=${n(clip.transition.duration)}:alpha=1`);
        chain.push(`trim=start=${n(cutIn)}:end=${n(cutOut)}`,`setpts=PTS-STARTPTS+${n(start)}/TB`);
        filters.push(`[${input.index}:v:0]${chain.join(',')}[v${i}]`);
        filters.push(`[${visual}][v${i}]overlay=x=(W-w)/2+${n(tr.x*plan.width/plan.projectWidth)}:y=(H-h)/2+${n(tr.y*plan.height/plan.projectHeight)}:eof_action=pass:repeatlast=0:enable='between(t,${n(start)},${n(start+cutOut-cutIn)})'[o${i}]`);visual=`o${i}`;
      }
      if(clip.kind==='text'){
        const tr=clip.transform,title=await textInput(`title-${i}`,{text:clip.text||'',fontSize:Math.max(8,Math.round(48*tr.scale*plan.height/plan.projectHeight)),maxWidth:plan.width}),placement=centerVideoTitleRaster(title,plan.width,plan.height);
        const chain=['format=rgba',`pad=${plan.width}:${plan.height}:${n(placement.x)}:${n(placement.y)}:color=black@0`,`trim=duration=${n(clip.duration)}`,'setpts=PTS-STARTPTS'];
        if(tr.rotation)chain.push(`rotate=${n(tr.rotation*Math.PI/180)}:ow=rotw(${n(tr.rotation*Math.PI/180)}):oh=roth(${n(tr.rotation*Math.PI/180)}):c=none`);
        if(clip.transition.type==='crossfade'&&clip.transition.duration)chain.push(`fade=t=in:st=0:d=${n(clip.transition.duration)}:alpha=1`);
        chain.push(`trim=start=${n(cutIn)}:end=${n(cutOut)}`,`setpts=PTS-STARTPTS+${n(start)}/TB`);
        filters.push(`[${title.index}:v:0]${chain.join(',')}[title${i}]`);filters.push(`[${visual}][title${i}]overlay=x=(W-w)/2+${n(tr.x*plan.width/plan.projectWidth)}:y=(H-h)/2+${n(tr.y*plan.height/plan.projectHeight)}:eof_action=pass:repeatlast=0[outtitle${i}]`);visual=`outtitle${i}`;
      }
      if(input&&['video','audio'].includes(clip.kind)&&input.metadata.audio.length&&!clip.trackMuted&&!clip.audio.muted){
        const origin=Math.min(...input.metadata.streams.map(s=>s.startTime));const audioStart=input.metadata.audio[0].startTime-origin;
        const chain=['asetpts=N/SR/TB',`atrim=start=${n(Math.max(0,clip.sourceIn-audioStart))}:duration=${n(clip.duration*clip.speed)}`,'asetpts=N/SR/TB',...atempo(clip.speed)];
        if(audioStart>clip.sourceIn)chain.push(`adelay=${Math.round((audioStart-clip.sourceIn)/clip.speed*1000)}:all=1`,'asetpts=N/SR/TB');
        if(clip.audio.fadeIn)chain.push(`afade=t=in:st=0:d=${n(clip.audio.fadeIn)}`);if(clip.audio.fadeOut)chain.push(`afade=t=out:st=${n(clip.duration-clip.audio.fadeOut)}:d=${n(clip.audio.fadeOut)}`);
        chain.push(`volume='${n(clip.audio.gain*clip.trackGain)}*(${duckExpression(clip,plan)})':eval=frame`,`atrim=start=${n(cutIn)}:end=${n(cutOut)}`,'asetpts=N/SR/TB');if(start>0)chain.push(`adelay=${Math.round(start*1000)}:all=1`);
        filters.push(`[${input.index}:a:0]${chain.join(',')}[a${i}]`);audio.push(`a${i}`);
      }
    }
    const texts=plan.captions;
    for(let i=0;i<texts.length;i++){const text=texts[i];const style=text.style;const fontSize=Math.max(8,Math.round(style.fontSize*plan.height/plan.projectHeight)),padding={x:12*plan.width/plan.projectWidth,y:4*plan.height/plan.projectHeight},maxWidth=Math.max(1,plan.width*(1-2*style.safeArea)-2*padding.x),wrapped=wrapCaptionText(text.text,{width:maxWidth,fontSize});const raster=await textInput(`caption-${i}`,{text:wrapped,fontSize,color:style.color,background:style.background,maxWidth,padding});
      const stack=texts.slice(0,i).map(c=>`(gte(t,${n(Math.max(0,c.start-plan.rangeStart))})*lt(t,${n(Math.min(plan.duration,c.end-plan.rangeStart))}))`).join('+')||'0';const offset=`(${stack})*${n(fontSize*1.4)}`;const y=style.position==='top'?`H*${n(style.safeArea)}+${offset}-${raster.bleed.top}`:style.position==='center'?`(H-${raster.logicalHeight})/2+${offset}-${raster.bleed.top}`:`H*(1-${n(style.safeArea)})-${raster.logicalHeight}-${offset}-${raster.bleed.top}`;
      filters.push(`[${visual}][${raster.index}:v:0]overlay=x=(W-${raster.logicalWidth})/2-${raster.bleed.left}:y='${y}':eof_action=pass:repeatlast=0:enable='gte(t,${n(Math.max(0,text.start-plan.rangeStart))})*lt(t,${n(Math.min(plan.duration,text.end-plan.rangeStart))})'[text${i}]`);visual=`text${i}`;
    }
    filters.push(`[${visual}]format=yuv420p[outv]`);
    if(audio.length)filters.push(`${audio.map(a=>`[${a}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest,apad,atrim=duration=${n(plan.duration)},asetpts=N/SR/TB[outa]`);
    await writeFile(path.join(scratch,'filters.txt'),filters.join(';\n'),'utf8');
    args.push('-filter_complex_threads','1',caps.filterScriptOption||'-/filter_complex','filters.txt','-map','[outv]');if(audio.length)args.push('-map','[outa]','-c:a','aac','-b:a','192k');else args.push('-an');
    args.push('-c:v','libx264','-preset','veryfast','-crf',String(plan.crf),'-pix_fmt','yuv420p','-r',String(plan.fps),'-t',n(plan.duration),'-movflags','+faststart','-progress','pipe:1','-f','mp4',temporary);
    onProgress?.({phase:'render',progress:0});await runMediaProcess(caps.ffmpegPath,args,{signal,cwd:scratch,timeoutMs:600000,maxOutputBytes:1024**2,onStdout:chunk=>{const match=chunk.match(/out_time_us=(\d+)/);if(match)onProgress?.({phase:'render',progress:Math.min(.95,Number(match[1])/1e6/plan.duration*.95)});}});
    onProgress?.({phase:'verify',progress:.96});const metadata=await verifyOutput(temporary,{...plan,format:'mp4',audio:audio.length>0},caps,signal);onProgress?.({phase:'verified',progress:1});return {format:'mp4',revision:plan.revision,width:plan.width,height:plan.height,duration:metadata.duration,metadata,verified:true,toolVersion:caps.toolVersion,fonts:textRenderer?.fonts||[],textRenderer:needsText?'Skia/HarfBuzz with verified per-character cmap coverage':null};
    }finally{textRenderer?.close();}
  });
}

/** Trusted renderer-generated PNG sequence only. No caller-supplied encoder arguments. */
export async function encodeFrameSequence({framePattern,frameCount,fps,width,height,format='mp4',outputPath,signal,onProgress,capabilities}){
  if(!path.isAbsolute(framePattern)||!/%06d\.png$/.test(framePattern))throw Error('A trusted absolute %06d.png frame pattern is required.');
  if(!Number.isSafeInteger(frameCount)||frameCount<1||frameCount>7200||![12,15,24,30].includes(fps)||frameCount/fps>120||![width,height].every(v=>Number.isSafeInteger(v)&&v>=16&&v<=1920&&v%2===0))throw Error('Frame sequence exceeds supported dimensions, rate or duration.');
  if(format==='gif'&&(fps>24||width>720||height>720))throw Error('GIF exports are limited to 720 pixels and 24 fps.');
  const caps=await capabilitiesOrThrow(capabilities,format);
  return atomicOutput(outputPath,signal,async temporary=>{
    await assertNativeMediaPath(framePattern.replace('%06d','000000'));await assertNativeMediaPath(framePattern.replace('%06d',String(frameCount-1).padStart(6,'0')));
    const args=['-v','error','-nostdin','-y','-framerate',String(fps),'-start_number','0','-i',framePattern,'-frames:v',String(frameCount)];
    if(format==='mp4')args.push('-vf',`scale=${width}:${height},format=yuv420p`,'-c:v','libx264','-preset','veryfast','-crf','22','-movflags','+faststart');
    else args.push('-filter_complex',`[0:v]scale=${width}:${height},split[a][b];[a]palettegen[p];[b][p]paletteuse`);
    args.push('-f',format,temporary);onProgress?.({phase:'encode',progress:0});await runMediaProcess(caps.ffmpegPath,args,{signal,timeoutMs:300000});const metadata=await verifyOutput(temporary,{width,height,fps,duration:frameCount/fps,format,audio:false},caps,signal);onProgress?.({phase:'verified',progress:1});return {format,duration:metadata.duration,width,height,verified:true,metadata,toolVersion:caps.toolVersion};
  });
}
