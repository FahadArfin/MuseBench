// Native-only Meta Model API adapter. Contract: https://dev.meta.ai/docs/speech-to-text (2026-11-05).
// Speech-to-text only. No narration synthesis and no hidden format conversion or retry.
const fail=code=>Object.assign(Error(code.toLowerCase().replaceAll('_',' ')),{code});
function validateWav(input){
 const b=Buffer.from(input??[]);if(b.length<44||b.length>31*1024*1024||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt32LE(4)+8!==b.length)throw fail('INVALID_REFERENCE');
 let format=false,data=0,rate=0;for(let p=12;p+8<=b.length;){const size=b.readUInt32LE(p+4),end=p+8+size;if(end>b.length)throw fail('INVALID_REFERENCE');const id=b.toString('ascii',p,p+4);if(id==='fmt '){if(size<16||b.readUInt16LE(p+8)!==1||b.readUInt16LE(p+10)!==1||![16000,24000].includes(b.readUInt32LE(p+12))||b.readUInt16LE(p+22)!==16||b.readUInt16LE(p+20)!==2)throw fail('INVALID_REFERENCE');rate=b.readUInt32LE(p+12);if(b.readUInt32LE(p+16)!==rate*2)throw fail('INVALID_REFERENCE');format=true;}if(id==='data')data+=size;p=end+(size%2);}
 if(!format||!data||data%2!==0||data/(rate*2)>600)throw fail('INVALID_REFERENCE');return b;
}
export function createMuseTranscribeProvider({getConnectionStatus,getCredential,readReferenceAsset,fetchImpl=fetch}={}){
 const adapter={id:'muse-transcribe',label:'Muse Voice Transcribe · Meta Model API',model:'muse-voice-transcribe-1.0',verified:true,connectionId:null,
  async getCapabilities(){let status;try{status=await getConnectionStatus?.();}catch{status={ready:false};}adapter.connectionId=status?.ready&&typeof status.connectionId==='string'?status.connectionId:null;return[{action:'audio.transcribe',available:!!adapter.connectionId&&!!readReferenceAsset,sizes:[],aspects:[],maxCount:1,maxPromptLength:1,maxReferences:1,cancellation:'none',costEstimate:'$0.18/hour of audio processed (Meta pricing checked 2026-11-05). WAV PCM mono, 16-bit, 16/24 kHz, up to 10 minutes.'}];},
  async start(request,{signal,localJobId}={}){
   const status=await getConnectionStatus?.();if(!status?.ready||status.connectionId!==request.connectionId)throw fail('AUTH_UNAVAILABLE');
   if(request.action!=='audio.transcribe'||request.userAuthorized!==true||request.prompt!==''||!Array.isArray(request.referenceAssetIds)||request.referenceAssetIds.length!==1||request.settings?.count!==1||Object.keys(request.settings).some(k=>k!=='count'))throw fail('INVALID_REQUEST');
   const source=await readReferenceAsset({itemId:request.itemId,assetId:request.referenceAssetIds[0]});if(source?.mediaType!=='audio/wav')throw fail('INVALID_REFERENCE');const bytes=validateWav(source.bytes);
   const credentials=await getCredential();if(credentials?.connectionId!==request.connectionId||!credentials.key||typeof credentials.verify!=='function')throw fail('AUTH_UNAVAILABLE');
   const form=new FormData();form.set('request',new Blob([JSON.stringify({model:adapter.model,mode:'ENDPOINTING',audioEncoding:'WAV'})],{type:'application/json'}));form.set('audio',new Blob([bytes],{type:'audio/wav'}),'audio.wav');await credentials.verify();if(signal?.aborted)throw fail('REMOTE_UNCERTAIN');
   const response=await fetchImpl(`https://api.meta.ai/v1/asr/transcribe?sessionId=${encodeURIComponent(localJobId??request.clientRequestId)}`,{method:'POST',headers:{Authorization:`Bearer ${credentials.key}`,Accept:'application/json'},body:form,signal,redirect:'error',credentials:'omit'});
   if(!response.ok){await response.body?.cancel();throw fail(response.status===401||response.status===403?'AUTH_UNAVAILABLE':response.status===429?'RATE_LIMIT':response.status===400||response.status===413?'INVALID_REFERENCE':'REMOTE_UNCERTAIN');}
   if(Number(response.headers.get('content-length'))>4*1024*1024)throw fail('INVALID_OUTPUT');if(!response.body)throw fail('INVALID_OUTPUT');let length=0;const chunks=[],reader=response.body.getReader();try{for(;;){const{done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4*1024*1024){await reader.cancel();throw fail('INVALID_OUTPUT');}chunks.push(value);}}finally{reader.releaseLock();}
   let json;try{json=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('INVALID_OUTPUT');}
   if(typeof json.sessionId!=='string'||!json.sessionId||json.sessionId.length>256||!Number.isFinite(json.audioDurationMs)||json.audioDurationMs<=0||json.audioDurationMs>600000||!Array.isArray(json.turns)||json.turns.length>10000)throw fail('INVALID_OUTPUT');
   const transcript=json.turns.map(t=>{if(typeof t.transcript!=='string'||!t.transcript.trim()||t.transcript.length>4000||!Number.isFinite(t.startMs)||!Number.isFinite(t.endMs)||t.startMs<0||t.endMs<=t.startMs||t.endMs>json.audioDurationMs)throw fail('INVALID_OUTPUT');return{start:t.startMs/1000,end:t.endMs/1000,text:t.transcript};});return{status:'completed',remoteJobId:json.sessionId,transcript};
  },async poll(){throw fail('RECONCILIATION_REQUIRED');},async cancel(){throw fail('CANCELLATION_UNCONFIRMED');}
 };return adapter;
}
