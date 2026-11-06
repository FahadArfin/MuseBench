import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeMediaProbe, WORK_MEDIA_LIMITS } from '../src/work/media.mjs';

// Self-contained containers only. In particular, never open HLS/DASH/concat playlists.
export const WORK_MEDIA_INPUT_ARGS=Object.freeze(['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,wav,mp3,aac,ogg,flac,png_pipe,jpeg_pipe,webp_pipe,image2,bmp_pipe,tiff_pipe,gif','-max_streams','32','-max_pixels','67108864']);

export function runMediaProcess(executable, args, {signal,timeoutMs=30000,maxOutputBytes=2*1024**2,onStdout, binary=false, cwd}={}) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) return reject(Error('Media job cancelled.'));
    let child; let failure; let total=0; const output=[]; const errors=[];
    const fail = error => { failure ||= error; child?.kill('SIGKILL'); };
    const abort = () => fail(Error('Media job cancelled.'));
    try { child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],cwd}); } catch(error) { reject(error); return; }
    const timer=setTimeout(()=>fail(Error('Media process timed out.')),Math.max(1,Math.min(timeoutMs,600000)));
    signal?.addEventListener('abort',abort,{once:true});
    const receive=(list,chunk,isOutput) => { total+=chunk.length; if(total>maxOutputBytes) { fail(Error('Media process output limit exceeded.')); return; } list.push(chunk); if(isOutput)try{onStdout?.(chunk.toString());}catch(error){fail(error);} };
    child.stdout.on('data',chunk=>receive(output,chunk,true)); child.stderr.on('data',chunk=>receive(errors,chunk,false));
    child.once('error',error=>{failure ||= error;});
    child.once('close',code=>{ clearTimeout(timer); signal?.removeEventListener('abort',abort); const stderr=Buffer.concat(errors).toString(); if(failure) reject(failure); else if(code!==0) reject(Error(`Media process failed (${code}): ${stderr.slice(-3000)}`)); else resolve({stdout:binary?Buffer.concat(output):Buffer.concat(output).toString(),stderr}); });
  });
}

async function findTool(name, override) {
  if(override===null) return null;
  let candidates=[];
  if(override!==undefined) { if(!path.isAbsolute(override)) throw Error('Media executable override must be an absolute trusted native path.'); candidates=[override]; }
  else { try { candidates=(await runMediaProcess(process.platform==='win32'?'where.exe':'which',[name],{timeoutMs:5000,maxOutputBytes:32768})).stdout.split(/\r?\n/).filter(p=>path.isAbsolute(p.trim())).map(p=>p.trim()); } catch {return null;} }
  for(const candidate of candidates) { try { const {stdout}=await runMediaProcess(candidate,['-version'],{timeoutMs:5000,maxOutputBytes:65536}); if(stdout.startsWith(`${name} version `)) return candidate; } catch {} }
  return null;
}
export async function discoverWorkMediaCapabilities({ffmpegPath,ffprobePath}={}) {
  const [ffmpeg,ffprobe]=await Promise.all([findTool('ffmpeg',ffmpegPath),findTool('ffprobe',ffprobePath)]);
  const result={available:Boolean(ffmpeg&&ffprobe),ffmpegPath:ffmpeg,ffprobePath:ffprobe,decoders:[],encoders:[],filters:[],mp4:false,gif:false,reasons:[],filterScriptOption:'-/filter_complex'};
  if(!result.available) { result.reasons.push('Verified FFmpeg and FFprobe are required. Install them through your system package manager to enable media processing.'); return result; }
  const version=(await runMediaProcess(ffmpeg,['-version'],{timeoutMs:5000,maxOutputBytes:65536})).stdout;
  result.toolVersion=version.split(/\r?\n/,1)[0].slice(0,240);
  const major=Number(version.match(/^ffmpeg version (?:n)?(\d+)/m)?.[1]);
  if(major&&major<7)result.filterScriptOption='-filter_complex_script';
  const listing=await Promise.all(['-decoders','-encoders','-filters'].map(flag=>runMediaProcess(ffmpeg,['-hide_banner',flag],{timeoutMs:10000,maxOutputBytes:1024**2})));
  const parse=(text,pattern)=>text.split(/\r?\n/).map(line=>line.match(pattern)?.[1]).filter(Boolean);
  result.decoders=parse(listing[0].stdout,/^\s*[VAS][A-Z.]{5}\s+(\S+)/);
  result.encoders=parse(listing[1].stdout,/^\s*[VAS][A-Z.]{5}\s+(\S+)/);
  result.filters=parse(listing[2].stdout,/^\s*[TSC.]{2,3}\s+(\S+)\s/);
  const fonts=process.platform==='win32'?[path.join(process.env.WINDIR||'C:\\Windows','Fonts','msyh.ttc'),path.join(process.env.WINDIR||'C:\\Windows','Fonts','segoeui.ttf')]:process.platform==='darwin'?['/System/Library/Fonts/Supplemental/Arial Unicode.ttf','/System/Library/Fonts/Helvetica.ttc']:['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'];
  for(const font of fonts){try{await access(font);result.fontFile=font;break;}catch{}}
  result.mp4=result.encoders.includes('libx264')&&result.encoders.includes('aac');
  result.gif=result.encoders.includes('gif')&&['palettegen','paletteuse'].every(f=>result.filters.includes(f));
  if(!result.mp4) result.reasons.push('H.264 (libx264) and AAC encoders are required for MP4.');
  return result;
}
export async function assertNativeMediaPath(filePath) {
  if(typeof filePath!=='string'||!path.isAbsolute(filePath)||filePath.includes('\0')) throw Error('An absolute trusted native media path is required.');
  const info=await lstat(filePath); if(!info.isFile()||info.isSymbolicLink()) throw Error('Media source must be a regular managed file.');
  if(info.size>WORK_MEDIA_LIMITS.maxBytes) throw Error('Media exceeds the 2 GiB asset limit.'); return info;
}
export async function probeWorkMedia({filePath,capabilities,signal}) {
  const caps=capabilities||await discoverWorkMediaCapabilities(); if(!caps.available) throw Error(caps.reasons.join(' '));
  await assertNativeMediaPath(filePath);
  const {stdout}=await runMediaProcess(caps.ffprobePath,['-v','error',...WORK_MEDIA_INPUT_ARGS,'-show_format','-show_streams','-of','json',filePath],{signal,timeoutMs:15000});
  let raw; try {raw=JSON.parse(stdout);} catch {throw Error('Media probe returned invalid metadata.');} return normalizeMediaProbe(raw,caps);
}

/** PNG bytes for the asset-store hook; never returns native filesystem paths to UI. */
export async function createWorkMediaThumbnail({filePath,metadata,maxThumbnailSize=320,capabilities,signal}){
  const caps=capabilities||await discoverWorkMediaCapabilities();await assertNativeMediaPath(filePath);metadata ||= await probeWorkMedia({filePath,capabilities:caps,signal});
  if(!metadata.width||!metadata.decodable)return null;
  const size=Math.max(32,Math.min(640,Number.isSafeInteger(maxThumbnailSize)?maxThumbnailSize:320));
  return (await runMediaProcess(caps.ffmpegPath,['-v','error','-nostdin',...WORK_MEDIA_INPUT_ARGS,'-i',filePath,'-frames:v','1','-vf',`scale=${size}:${size}:force_original_aspect_ratio=decrease`,'-f','image2pipe','-vcodec','png','pipe:1'],{signal,timeoutMs:20000,maxOutputBytes:4*1024**2,binary:true})).stdout;
}

/** Derivatives are regenerable and distinct from immutable originals. cacheDir is main-owned. */
export async function createWorkMediaDerivative({filePath,cacheDir,kind='thumbnail',at=0,capabilities,signal,onProgress}) {
  if(!['thumbnail','waveform','proxy'].includes(kind)) throw Error('Unsupported media derivative.');
  if(!path.isAbsolute(cacheDir)) throw Error('Managed cache directory is required.');
  const caps=capabilities||await discoverWorkMediaCapabilities(); const metadata=await probeWorkMedia({filePath,capabilities:caps,signal});
  if(!metadata.decodable) throw Error(`Unsupported decoder: ${metadata.unsupportedCodecs.join(', ')}`);
  if(kind==='proxy'&&!caps.mp4) throw Error('H.264 and AAC encoders are unavailable.');
  if(kind==='thumbnail'&&!metadata.width) throw Error('Audio-only media has no thumbnail.');
  if(kind==='waveform'&&!metadata.audio.length) throw Error('Silent media has no audio waveform.');
  await mkdir(cacheDir,{recursive:true});
  let used=0; for(const name of await readdir(cacheDir)) {const entry=await stat(path.join(cacheDir,name)); if(entry.isFile()) used+=entry.size;}
  if(used>=WORK_MEDIA_LIMITS.maxDerivativeBytes) throw Error('Media cache limit reached. Clear regenerable previews before retrying.');
  const extension=kind==='proxy'?'mp4':kind==='thumbnail'?'jpg':'f32'; const finalPath=path.join(cacheDir,`${randomUUID()}.${extension}`); const temporary=`${finalPath}.tmp`;
  const args=['-hide_banner','-loglevel','error','-nostdin','-y',...WORK_MEDIA_INPUT_ARGS,'-i',filePath];
  if(kind==='thumbnail') args.push('-ss',String(Math.max(0,Math.min(Number(at)||0,metadata.duration-.001))),'-frames:v','1','-vf','scale=320:320:force_original_aspect_ratio=decrease','-f','image2',temporary);
  if(kind==='waveform') args.push('-vn','-ac','1','-ar','8000','-t',String(Math.min(metadata.duration,600)),'-f','f32le',temporary);
  if(kind==='proxy') args.push('-vf','scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2','-r','24','-c:v','libx264','-preset','ultrafast','-crf','30','-c:a','aac','-b:a','64k','-fs',String(WORK_MEDIA_LIMITS.maxDerivativeBytes-used),'-movflags','+faststart','-f','mp4',temporary);
  try { onProgress?.({progress:0,phase:kind}); await runMediaProcess(caps.ffmpegPath,args,{signal,timeoutMs:120000}); const size=(await stat(temporary)).size; if(used+size>WORK_MEDIA_LIMITS.maxDerivativeBytes) throw Error('Media cache limit exceeded.'); if(kind==='proxy') {const proxy=await probeWorkMedia({filePath:temporary,capabilities:caps,signal}); if(Math.abs(proxy.duration-metadata.duration)>.15) throw Error('Preview proxy was truncated by the cache limit.');} let waveform;if(kind==='waveform'){const raw=await readFile(temporary),count=raw.length/4,step=Math.max(1,Math.ceil(count/WORK_MEDIA_LIMITS.maxWaveformSamples));waveform=[];for(let i=0;i<count;i+=step){let peak=0;for(let j=i;j<Math.min(count,i+step);j++)peak=Math.max(peak,Math.abs(raw.readFloatLE(j*4)));waveform.push(Math.min(1,peak));}} await rename(temporary,finalPath); onProgress?.({progress:1,phase:kind}); return {kind,filePath:finalPath,bytes:size,original:false,metadata,...(waveform?{waveform,waveformDuration:Math.min(metadata.duration,600)}:{})}; }
  finally {await rm(temporary,{force:true});}
}
