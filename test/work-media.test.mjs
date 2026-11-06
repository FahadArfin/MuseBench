import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaProbe, mediaIdentityMatches } from '../src/work/media.mjs';
import { runMediaProcess, discoverWorkMediaCapabilities } from '../electron/work-media-worker.mjs';

test('probe reports measured timing, rotation, streams and decoder support', () => {
  const result = normalizeMediaProbe({ format: { duration: '2', size: '400' }, streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '30000/1001', r_frame_rate: '30/1', time_base: '1/30000', side_data_list: [{rotation: 90}] },
    { index: 1, codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, start_time: '.2' },
  ] }, { decoders: ['h264', 'aac'] });
  assert.equal(result.duration, 2); assert.equal(result.rotation, 90); assert.equal(result.variableFrameRate, true);
  assert.equal(result.audio[0].startTime, .2); assert.equal(result.decodable, true);
  assert.equal(normalizeMediaProbe({format:{duration:'2'},streams:[{codec_type:'video',codec_name:'unknown',width:20,height:20}]},{decoders:[]}).decodable, false);
});
test('rejects invalid and unbounded media metadata; relink requires exact identity', () => {
  assert.throws(() => normalizeMediaProbe({format:{duration:'Infinity'}, streams:[]}), /duration|streams/i);
  assert.throws(() => normalizeMediaProbe({format:{duration:'40000'},streams:[{codec_type:'audio'}]}), /duration/i);
  assert.equal(mediaIdentityMatches({hash:'a'.repeat(64),bytes:40},{hash:'a'.repeat(64),bytes:40}),true);
  assert.equal(mediaIdentityMatches({hash:'a'.repeat(64),bytes:40},{hash:'b'.repeat(64),bytes:40}),false);
});
test('native processes are bounded and cancellable without shell execution', async () => {
  await assert.rejects(runMediaProcess(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:40}), /timed out/);
  const controller = new AbortController();
  const pending = runMediaProcess(process.execPath,['-e','setTimeout(()=>{},10000)'],{signal:controller.signal});
  controller.abort(); await assert.rejects(pending, /cancel/i);
  await assert.rejects(runMediaProcess(process.execPath,['-e','process.stdout.write("a".repeat(10000))'],{maxOutputBytes:100}), /limit/);
});
test('explicitly disabled toolchain stays unavailable', async () => {
  const result = await discoverWorkMediaCapabilities({ffmpegPath:null,ffprobePath:null});
  assert.equal(result.available,false); assert.equal(result.mp4,false);
});
test('still image metadata is distinguished from an unknown-duration video',()=>{
  const raw={format:{format_name:'png_pipe'},streams:[{codec_type:'video',codec_name:'png',width:64,height:64}]};
  const image=normalizeMediaProbe(raw,{decoders:['png']});assert.equal(image.stillImage,true);assert.equal(image.duration,0);
  assert.throws(()=>normalizeMediaProbe({...raw,format:{format_name:'mov,mp4'}}),/duration/);
});
