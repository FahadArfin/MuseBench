import test from 'node:test';
import assert from 'node:assert/strict';
import {createMuseImageProvider} from '../src/work/providers/muse-image.mjs';
const input={itemId:'item',revision:1,providerId:'muse-image',connectionId:'connection',action:'image.generate',clientRequestId:'click',prompt:'bird',referenceAssetIds:[],settings:{size:'1024x1024',aspect:'1:1',count:1},userAuthorized:true};
const config=()=>({getConnectionStatus:async()=>({ready:true,connectionId:'connection'}),getCredential:async()=>({key:'fixture-not-real',connectionId:'connection',verify:async()=>{}})});
test('Muse image uses exact native Meta endpoint, private auth and base64 outputs',async()=>{
 let call;const adapter=createMuseImageProvider({...config(),fetchImpl:async(url,options)=>{call={url,options};return new Response(JSON.stringify({data:[{b64_json:Buffer.from('image fixture').toString('base64')}]}),{headers:{'x-request-id':'meta-request'}});}});
 const caps=await adapter.getCapabilities();assert.equal(caps[0].available,true);assert.equal(caps[1].available,false);assert.equal(caps[0].cancellation,'none');
 const result=await adapter.start(input,{signal:new AbortController().signal,localJobId:'local'});
 assert.equal(call.url,'https://api.meta.ai/v1/images/generations');assert.equal(call.options.redirect,'error');assert.equal(JSON.parse(call.options.body).model,'muse-image-1.0');assert.equal(JSON.parse(call.options.body).response_format,'b64_json');assert.equal(result.remoteJobId,'meta-request');assert.equal(result.outputs[0].bytes.toString(),'image fixture');assert.doesNotMatch(JSON.stringify(result),/fixture-not-real/);
});
test('whole-image edits upload only item-authorized managed PNG bytes; targeted mask unsupported',async()=>{
 let body;const adapter=createMuseImageProvider({...config(),readReferenceAsset:async({itemId,assetId})=>{assert.equal(itemId,'item');assert.equal(assetId,'source');return{bytes:Buffer.from('png fixture'),mediaType:'image/png'};},fetchImpl:async(url,options)=>{assert.equal(url,'https://api.meta.ai/v1/images/edits');body=options.body;return new Response(JSON.stringify({data:[{b64_json:'aW1hZ2U='}]}));}});
 await adapter.getCapabilities();await adapter.start({...input,action:'image.edit',referenceAssetIds:['source']},{signal:new AbortController().signal,localJobId:'local'});assert.equal(body.get('image').size,11);assert.equal(body.get('mask'),null);
 await assert.rejects(()=>adapter.start({...input,settings:{...input.settings,mask:{}}},{signal:new AbortController().signal,localJobId:'local'}));
});
test('missing API auth never falls back to Muse CLI login and HTTP errors are sanitized',async()=>{
 const unavailable=createMuseImageProvider({getConnectionStatus:async()=>({ready:false}),getCredential:async()=>{throw Error('must not read');},fetchImpl:async()=>{throw Error('must not send');}});
 assert.ok((await unavailable.getCapabilities()).every(c=>!c.available));await assert.rejects(()=>unavailable.start(input,{signal:new AbortController().signal}),{code:'AUTH_UNAVAILABLE'});
 for(const [status,code]of [[401,'AUTH_UNAVAILABLE'],[429,'RATE_LIMIT'],[400,'PROMPT_REJECTED'],[503,'REMOTE_UNCERTAIN']]){
  const adapter=createMuseImageProvider({...config(),fetchImpl:async()=>new Response('provider-private-message',{status})});await adapter.getCapabilities();await assert.rejects(()=>adapter.start(input,{signal:new AbortController().signal}),{code});
 }
});
