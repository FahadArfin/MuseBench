import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGeneratedMedia,acceptGeneratedMedia,transcriptToCaptions,acceptGeneratedAsset} from '../src/work/generated-media.mjs';
import {createDefaultVideoData} from '../src/shared/work-video-schema.mjs';
const asset={id:'sound',mediaType:'audio/wav',duration:3,origin:{type:'generated'}};
test('duration, format and missing-audio concerns are explicit before acceptance',()=>{
 assert.equal(inspectGeneratedMedia(asset,{kind:'audio',targetDuration:5}).durationMismatch,true);
 assert.throws(()=>inspectGeneratedMedia({...asset,duration:0},{kind:'audio'}));
 assert.throws(()=>inspectGeneratedMedia({...asset,mediaType:'text/html'},{kind:'audio'}));
 assert.equal(inspectGeneratedMedia({id:'clip',mediaType:'video/mp4',duration:4},{kind:'video',requireAudio:true}).audioUnverified,true);
});
test('accepted narration is an ordinary editable clip, bound to source item/revision',()=>{
 const doc={id:'item',revision:2,kind:'video',assets:[],data:createDefaultVideoData()};
 const job={itemId:'item',revision:2,status:'completed',assets:[asset]};
 const next=acceptGeneratedMedia(doc,job,{assetId:'sound',trackId:doc.data.tracks.find(t=>t.type==='audio').id,clipId:'voice',start:30000});
 const clip=next.data.tracks.flatMap(t=>t.clips).find(c=>c.id==='voice');assert.equal(clip.duration,90000);assert.equal(clip.start,30000);assert.equal(clip.assetId,'sound');assert.equal(doc.assets.length,0);
 assert.throws(()=>acceptGeneratedMedia({...doc,revision:3},job,{assetId:'sound',trackId:'audio',clipId:'voice',start:0}),{code:'STALE_RESULT'});
 assert.throws(()=>acceptGeneratedMedia(doc,{...job,status:'cancelled'},{assetId:'sound',trackId:'audio',clipId:'voice',start:0}));
});
test('transcripts become independently editable captions with integer ticks',()=>{
 const captions=transcriptToCaptions([{start:.25,end:1.5,text:'Hello'}],{timebase:30000,offset:30000,idPrefix:'asr'});assert.equal(captions[0].start,37500);assert.equal(captions[0].end,75000);assert.equal(captions[0].text,'Hello');
 assert.throws(()=>transcriptToCaptions([{start:1,end:0,text:'bad'}],{timebase:30000}));
});
test('image generation acceptance adds an ordinary layer in one change without touching original assets',()=>{
 const image={...asset,id:'image',mediaType:'image/png',width:2048,height:1024};const doc={id:'item',kind:'design',revision:2,assets:[],data:{artboards:[{id:'board',width:1000,height:1000,nodes:[]}]}};
 const next=acceptGeneratedAsset(doc,{itemId:'item',revision:2,status:'completed',assets:[image]},{assetId:'image',nodeId:'layer'});assert.equal(next.assets.length,1);assert.equal(next.data.artboards[0].nodes[0].assetId,'image');assert.equal(next.data.artboards[0].nodes[0].width,800);assert.equal(next.data.artboards[0].nodes[0].height,400);assert.equal(doc.assets.length,0);
 assert.throws(()=>acceptGeneratedAsset({...doc,revision:3},{itemId:'item',revision:2,status:'completed',assets:[image]},{assetId:'image',nodeId:'layer'}),{code:'STALE_RESULT'});
});
