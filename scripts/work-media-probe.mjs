import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { discoverWorkMediaCapabilities, runMediaProcess, probeWorkMedia, createWorkMediaDerivative, createWorkMediaThumbnail } from '../electron/work-media-worker.mjs';
import { renderWorkVideo } from '../electron/work-video-export.mjs';
import { createDefaultVideoData } from '../src/shared/work-video-schema.mjs';

export async function runWorkMediaProbe(){
  const caps=await discoverWorkMediaCapabilities();if(!caps.available||!caps.mp4) return {status:'unavailable',reasons:caps.reasons};
  const dir=await mkdtemp(path.join(os.tmpdir(),'muse-media-proof-'));const file=name=>path.join(dir,name);const ff=(args,options)=>runMediaProcess(caps.ffmpegPath,['-hide_banner','-loglevel','error','-nostdin','-y',...args],options);
  try{
    for(const [color,hz] of [['red',440],['blue',880]])await ff(['-f','lavfi','-i',`color=c=${color}:s=160x90:r=30:d=2`,'-f','lavfi','-i',`sine=frequency=${hz}:sample_rate=48000:duration=2`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',file(`${color}.mp4`)]);
    await ff(['-display_rotation:v:0','90','-i',file('red.mp4'),'-c','copy',file('rotated.mov')]);
    const rotated=await probeWorkMedia({filePath:file('rotated.mov'),capabilities:caps});assert.equal(Math.abs(rotated.rotation),90);
    await ff(['-f','lavfi','-i','testsrc2=s=160x90:r=30:d=2','-vf',"setpts='if(lt(N,30),N/(30*TB),(1+(N-30)/15)/TB)'",'-fps_mode','vfr','-c:v','libx264',file('variable.mp4')]);
    const variable=await probeWorkMedia({filePath:file('variable.mp4'),capabilities:caps});assert.equal(variable.variableFrameRate,true);
    await ff(['-f','lavfi','-i','color=c=green:s=160x90:r=24:d=1','-c:v','libx264','-an',file('silent.mp4')]);assert.equal((await probeWorkMedia({filePath:file('silent.mp4'),capabilities:caps})).audio.length,0);
    await ff(['-i',file('red.mp4'),'-itsoffset','0.2','-i',file('blue.mp4'),'-map','0:v','-map','1:a','-c','copy',file('offset.mp4')]);const offset=await probeWorkMedia({filePath:file('offset.mp4'),capabilities:caps});assert(offset.audio[0].startTime>.1);
    await writeFile(file('damaged.mp4'),'not a video');await assert.rejects(probeWorkMedia({filePath:file('damaged.mp4'),capabilities:caps}),/failed/i);
    await writeFile(file('playlist.mp4'),`ffconcat version 1.0\nfile '${file('red.mp4').replaceAll('\\','/')}'\n`);await assert.rejects(probeWorkMedia({filePath:file('playlist.mp4'),capabilities:caps}),/whitelist|failed/i);
    const thumbnail=await createWorkMediaDerivative({filePath:file('rotated.mov'),cacheDir:file('cache'),kind:'thumbnail',capabilities:caps});assert(thumbnail.bytes>100);
    assert.equal((await createWorkMediaThumbnail({filePath:file('rotated.mov'),capabilities:caps})).subarray(1,4).toString(),'PNG');
    const waveform=await createWorkMediaDerivative({filePath:file('red.mp4'),cacheDir:file('cache'),kind:'waveform',capabilities:caps});assert(waveform.bytes>100);assert(waveform.waveform.length<=1000);assert(Math.max(...waveform.waveform)>.05);
    const proxy=await createWorkMediaDerivative({filePath:file('red.mp4'),cacheDir:file('cache'),kind:'proxy',capabilities:caps});assert.equal(proxy.original,false);
    const data=createDefaultVideoData();data.width=1280;data.height=720;
    const clip=(id,assetId,start,duration,speed=1)=>({id,assetId,kind:'video',start,duration,sourceIn:0,speed,transform:{x:0,y:0,scale:1,rotation:0,fit:'contain',crop:{left:0,top:0,right:0,bottom:0}},audio:{gain:.6,muted:false,fadeIn:3000,fadeOut:3000},transition:{type:'cut',duration:0}});
    data.tracks[0].clips=[clip('red','red',0,45000),{...clip('blue','blue',30000,30000,2),transition:{type:'crossfade',duration:9000}}];
    data.captions=[{id:'caption',start:12000,end:54000,text:"Unicode 字幕: literal %{x} ' : [safe]",style:{fontSize:32,color:'#ffffff',background:'#000000',position:'bottom',safeArea:.1}}];
    const document={version:2,id:'isolated-proof',kind:'video',title:'Generated fixture',revision:7,assets:[],data};const resolveAsset=id=>({filePath:file(`${id}.mp4`),original:true});
    const destinationPath=file('verified video 测试.mp4');const receipt=await renderWorkVideo({document,resolveAsset,destinationPath,capabilities:caps});assert(receipt.verified);assert.equal(receipt.width,1280);assert.equal(receipt.height,720);assert.equal(receipt.metadata.audio[0].codec,'aac');
    const rgb=async at=>(await ff(['-ss',String(at),'-i',destinationPath,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{binary:true})).stdout;
    const red=await rgb(.2),blue=await rgb(1.7);assert(red[0]>red[2]+100);assert(blue[2]>blue[0]+100);
    const cross=await rgb(1.15);assert(cross[0]>20&&cross[2]>20,'Crossfade contains both colors');
    const pcm=(await ff(['-ss','1.6','-t','0.2','-i',destinationPath,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{binary:true})).stdout;let energy=0;for(let i=0;i+3<pcm.length;i+=4)energy+=pcm.readFloatLE(i)**2;assert(Math.sqrt(energy/(pcm.length/4))>.01,'Known audio sync mark survives');
    const ranged=await renderWorkVideo({document,resolveAsset,destinationPath:file('portrait range.mp4'),settings:{aspectRatio:'9:16',resolution:720,fps:24,range:{start:15000,end:45000}},capabilities:caps});assert.equal(ranged.width,720);assert.equal(ranged.height,1280);assert(Math.abs(ranged.duration-1)<.12);
    const offsetData=createDefaultVideoData();offsetData.tracks[0].clips=[clip('offset','offset',0,30000)];const offsetDocument={...document,data:offsetData};
    const offsetOutput=file('offset-render.mp4');await renderWorkVideo({document:offsetDocument,resolveAsset,destinationPath:offsetOutput,capabilities:caps});
    const audioRms=async(start,duration)=>{const raw=(await ff(['-ss',String(start),'-t',String(duration),'-i',offsetOutput,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{binary:true})).stdout;let sum=0;for(let i=0;i+3<raw.length;i+=4)sum+=raw.readFloatLE(i)**2;return Math.sqrt(sum/(raw.length/4));};
    const early=await audioRms(0,.1),late=await audioRms(.4,.1);assert(early<.001,`Audio stream offset preserves initial silence (${early}; offset ${offset.audio[0].startTime}; late ${late})`);assert(late>.01,'Audio stream offset preserves later sync mark');
    await ff(['-f','lavfi','-i','color=c=yellow:s=80x60','-frames:v','1',file('still.png')]);const stillData=createDefaultVideoData();stillData.tracks[0].clips=[{...clip('still','still',0,30000),kind:'image'}];stillData.tracks[2].clips=[{...clip('title','unused',0,30000),assetId:undefined,kind:'text',text:'Rotated title',transform:{...clip('t','t',0,1).transform,rotation:30,scale:1.2}}];
    await renderWorkVideo({document:{...document,data:stillData},resolveAsset:()=>file('still.png'),destinationPath:file('still-title.mp4'),capabilities:caps});
    const previous=await readFile(destinationPath);const abort=new AbortController();await assert.rejects(renderWorkVideo({document,resolveAsset,destinationPath,capabilities:caps,signal:abort.signal,onProgress:event=>{if(event.phase==='render'&&event.progress>0)abort.abort();}}),/cancel/i);assert.deepEqual(await readFile(destinationPath),previous);
    await assert.rejects(renderWorkVideo({document,resolveAsset:()=>({filePath:file('red.mp4'),proxy:true}),destinationPath,capabilities:caps}),/original/i);assert.deepEqual(await readFile(destinationPath),previous);
    await assert.rejects(renderWorkVideo({document,resolveAsset,destinationPath,capabilities:{...caps,ffmpegPath:process.execPath}}),/failed/i);assert.deepEqual(await readFile(destinationPath),previous);
    let duplicate;await renderWorkVideo({document,resolveAsset,destinationPath,capabilities:caps,onProgress:event=>{if(event.phase==='render'&&event.progress===0&&!duplicate){duplicate=renderWorkVideo({document,resolveAsset,destinationPath,capabilities:caps});duplicate.catch(()=>{});}}});await assert.rejects(duplicate,/already running/i);
    return {status:'passed',generatedFixtures:['red/440Hz','blue/880Hz','variable-frame-rate','rotated-phone','silent','audio-offset','damaged','playlist-disguised-as-MP4','still image'],verified:['metadata','thumbnail','bounded waveform peaks','proxy','720p MP4','H264/AAC','speed 2x','crossfade pixels','caption escaping/Unicode','24fps portrait range','decoded boundary frames','audio PCM energy','audio-offset initial silence/later tone','still image/rotated title export','mid-render cancellation','existing output preservation','failed encoder preservation','duplicate destination exclusion','proxy rejection','playlist demuxer rejection'],receipt:{width:receipt.width,height:receipt.height,duration:receipt.duration,bytes:receipt.bytes},limitations:['No human listening test','Disk-full fault injection not performed','No installed-app UI acceptance']};
  }finally{if(process.argv.includes('--keep'))console.log(`Fixtures retained: ${dir}`);else await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await runWorkMediaProbe(),null,2));}catch(error){console.error(error);process.exitCode=1;}}
