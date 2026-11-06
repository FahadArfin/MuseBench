import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.versions.electron){
 await mkdir(path.join(root,'artifacts','work-motion'),{recursive:true});const fixture=await mkdtemp(path.join(root,'artifacts','work-motion','probe-'));
 const {default:electron}=await import('electron');const env={...process.env,MUSEBENCH_MOTION_PROBE:fixture};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(electron,[fileURLToPath(import.meta.url),`--user-data-dir=${path.join(fixture,'chromium')}`],{env,cwd:root,windowsHide:true,stdio:'inherit'});const timer=setTimeout(()=>child.kill('SIGKILL'),120000);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);assert.equal(code,0,'Motion runtime export probe failed');console.log(`Motion runtime report: ${path.join(fixture,'report.json')}`);
}else{
 const {app,BrowserWindow}=await import('electron');const fixture=process.env.MUSEBENCH_MOTION_PROBE;assert(fixture&&path.isAbsolute(fixture));app.setPath('userData',path.join(fixture,'chromium'));app.on('window-all-closed',()=>{});
 const {renderWorkMotion}=await import('../electron/work-motion-export.mjs');const {discoverWorkMediaCapabilities,runMediaProcess}=await import('../electron/work-media-worker.mjs');
 app.whenReady().then(async()=>{try{
  const caps=await discoverWorkMediaCapabilities();assert(caps.mp4&&caps.gif,`FFmpeg capability required: ${caps.reasons?.join('; ')}`);
  const document={version:2,id:'motion-probe',kind:'motion',title:'Keyframe runtime probe',revision:7,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),assets:[],data:{width:320,height:180,timebase:1000,durationTicks:1000,fps:15,loop:true,scenes:[{id:'scene',name:'Animated shape',startTicks:0,durationTicks:1000,background:'#ffffff',nodes:[{id:'shape',type:'shape',x:10,y:50,width:50,height:50,rotation:0,opacity:1,locked:false,hidden:false,shape:'rect',style:{fill:'#ff0000'}}],tracks:[{id:'track',nodeId:'shape',property:'x',keyframes:[{id:'a',tick:0,value:10,easing:'linear'},{id:'b',tick:1000,value:250,easing:'linear'}]}]}]}};
  document.data.scenes[0].nodes.push({id:'text',type:'text',x:10,y:10,width:300,height:30,rotation:0,opacity:1,locked:false,hidden:false,text:'Work motion',style:{fontFamily:'Inter',fontSize:20,color:'#000000'}});
  const outputs=[];for(const format of ['mp4','gif']){const output=await renderWorkMotion({document,BrowserWindow,resolveAsset:()=>{throw Error('No fixture images');},destinationPath:path.join(fixture,`motion.${format}`),format,settings:{fps:15},capabilities:caps});assert(output.verified);assert.equal(output.revision,7);assert.equal(output.frameCount,15);assert.ok(Math.abs(output.duration-1)<.1);
   const positions=[];for(const at of [0,.5]){const decoded=await runMediaProcess(caps.ffmpegPath,['-v','error','-ss',String(at),'-i',output.filePath,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{binary:true});const pixels=decoded.stdout;let min=320,max=-1;for(let y=0;y<180;y++)for(let x=0;x<320;x++){const p=(y*320+x)*3;if(pixels[p]>180&&pixels[p+1]<80&&pixels[p+2]<80){min=Math.min(min,x);max=Math.max(max,x);}}assert(max>min,'Exported frame must contain the shape');positions.push(min);}
   assert.ok(Math.abs(positions[0]-10)<4,`First exported frame x=${positions[0]}`);assert.ok(positions[1]-positions[0]>100,`Motion must advance in decoded output: ${positions}`);output.decodedFramePositions=positions;outputs.push(output);}
  const badFont=structuredClone(document);badFont.data.scenes[0].nodes[0]={...badFont.data.scenes[0].nodes[0],type:'text',text:'Test',style:{fontFamily:'DefinitelyMissingMuseBenchFont991',fontSize:24}};delete badFont.data.scenes[0].nodes[0].shape;
  await assert.rejects(renderWorkMotion({document:badFont,BrowserWindow,resolveAsset:()=>{},destinationPath:path.join(fixture,'missing-font.mp4'),capabilities:caps}),/font unavailable/i);
  await writeFile(path.join(fixture,'report.json'),JSON.stringify({at:new Date().toISOString(),isolated:true,modelRequests:0,missingFontRejected:true,outputs},null,2));console.log(JSON.stringify(outputs.map(({format,width,height,duration,frameCount,verified})=>({format,width,height,duration,frameCount,verified}))));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}});
}
