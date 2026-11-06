export const WORK_MEDIA_LIMITS = Object.freeze({ maxBytes: 2 * 1024 ** 3, maxDuration: 7200, maxDimension: 8192, maxStreams: 32, maxDerivativeBytes: 256 * 1024 ** 2, maxWaveformSamples: 1000 });
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ratio = value => { const [a,b] = String(value || '').split('/').map(Number); return a > 0 && b > 0 ? a/b : 0; };

/** Only measured FFprobe data is accepted; suffixes do not establish decodability. */
export function normalizeMediaProbe(raw, capabilities = {}) {
  if (!raw || !Array.isArray(raw.streams) || !raw.streams.length || raw.streams.length > WORK_MEDIA_LIMITS.maxStreams) throw Error('Media has no supported streams or too many streams.');
  const stillImage=['png_pipe','jpeg_pipe','webp_pipe','image2','bmp_pipe','tiff_pipe'].includes(raw.format?.format_name)&&raw.streams.every(s=>s.codec_type==='video'&&['png','mjpeg','webp','bmp','tiff'].includes(s.codec_name));
  const duration = stillImage?0:number(raw.format?.duration, NaN);
  if ((!stillImage&&!(duration > 0)) || duration > WORK_MEDIA_LIMITS.maxDuration) throw Error('Media duration is missing or exceeds the 2 hour limit.');
  const bytes = number(raw.format?.size);
  if (bytes > WORK_MEDIA_LIMITS.maxBytes) throw Error('Media exceeds the 2 GiB asset limit.');
  const streams = raw.streams.filter(s => ['video','audio'].includes(s.codec_type)).map(s => ({
    index: number(s.index), type: s.codec_type, codec: String(s.codec_name || 'unknown'),
    startTime: number(s.start_time), duration: number(s.duration, duration),
    ...(s.codec_type === 'video' ? { width:number(s.width),height:number(s.height),frameRate:ratio(s.avg_frame_rate),nominalFrameRate:ratio(s.r_frame_rate),timebase:String(s.time_base || ''),rotation:number(s.side_data_list?.find(d => Number.isFinite(Number(d.rotation)))?.rotation ?? s.tags?.rotate) } : { sampleRate:number(s.sample_rate),channels:number(s.channels) }),
  }));
  if (!streams.length) throw Error('Media has no audio or video streams.');
  const video = streams.find(s => s.type === 'video'); const audio = streams.filter(s => s.type === 'audio');
  if (streams.some(s=>s.type==='video'&&(!(s.width > 0) || !(s.height > 0) || s.width > WORK_MEDIA_LIMITS.maxDimension || s.height > WORK_MEDIA_LIMITS.maxDimension))) throw Error('Media dimensions exceed the 8192 pixel limit.');
  const decoders = new Set(capabilities.decoders || []);
  return {duration,bytes,stillImage,streams,audio,width:video?.width,height:video?.height,rotation:video?.rotation || 0,frameRate:video?.frameRate || 0,timebase:video?.timebase,variableFrameRate:Boolean(video && Math.abs(video.frameRate-video.nominalFrameRate) > .001),decodable:streams.every(s => decoders.has(s.codec)),unsupportedCodecs:streams.filter(s => !decoders.has(s.codec)).map(s => s.codec)};
}
export function mediaIdentityMatches(original, replacement) {
  return /^[a-f0-9]{64}$/i.test(original?.hash || '') && original.hash === replacement?.hash && original.bytes === replacement?.bytes;
}
