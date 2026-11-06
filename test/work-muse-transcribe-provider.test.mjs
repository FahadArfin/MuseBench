import test from 'node:test';
import assert from 'node:assert/strict';
import {createMuseTranscribeProvider} from '../src/work/providers/muse-transcribe.mjs';
function wav(){const buffer=Buffer.alloc(48044);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(24000,24);buffer.writeUInt32LE(48000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(48000,40);return buffer;}
const request={itemId:'item',revision:1,providerId:'muse-transcribe',connectionId:'connection',action:'audio.transcribe',clientRequestId:'click',prompt:'',referenceAssetIds:['audio'],settings:{count:1},userAuthorized:true};
test('verified PCM WAV asset uploads to Meta STT and returns editable seconds',async()=>{
 let body;const adapter=createMuseTranscribeProvider({getConnectionStatus:async()=>({ready:true,connectionId:'connection'}),getCredential:async()=>({key:'private-fixture',connectionId:'connection',verify:async()=>{}}),readReferenceAsset:async({itemId,assetId})=>{assert.equal(itemId,'item');assert.equal(assetId,'audio');return{bytes:wav(),mediaType:'audio/wav'};},fetchImpl:async(url,options)=>{assert.equal(new URL(url).origin,'https://api.meta.ai');body=options.body;return new Response(JSON.stringify({sessionId:'session',audioDurationMs:1000,turns:[{startMs:100,endMs:900,transcript:'Hello'}]}));}});
 assert.equal((await adapter.getCapabilities())[0].available,true);const result=await adapter.start(request,{signal:new AbortController().signal,localJobId:'local'});assert.equal(JSON.parse(await body.get('request').text()).model,'muse-voice-transcribe-1.0');assert.deepEqual(result.transcript,[{start:.1,end:.9,text:'Hello'}]);assert.equal(result.remoteJobId,'session');
});
test('unsupported or corrupt media is rejected without sending audio',async()=>{
 let sent=0;const adapter=createMuseTranscribeProvider({getConnectionStatus:async()=>({ready:true,connectionId:'connection'}),getCredential:async()=>({key:'fixture',connectionId:'connection',verify:async()=>{}}),readReferenceAsset:async()=>({bytes:Buffer.from('corrupt'),mediaType:'audio/wav'}),fetchImpl:async()=>{sent++;}});
 await assert.rejects(()=>adapter.start(request,{signal:new AbortController().signal}),{code:'INVALID_REFERENCE'});assert.equal(sent,0);
});
