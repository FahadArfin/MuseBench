// Official contract checked 2026-11-05: https://dev.meta.ai/docs/image-generation
// https://dev.meta.ai/docs/api-reference/images/schemas . Native process only.
// Muse Voice Transcribe is STT only; no speech synthesis or masked edit is advertised here.
const fail=code=>Object.assign(Error(code.toLowerCase().replaceAll('_',' ')),{code});
const sizes=['1024x1024','1536x1024','1024x1536','1792x1024','1024x1792'];
const aspects=['1:1','3:2','2:3','7:4','4:7'];
async function boundedJson(response){
 if(Number(response.headers.get('content-length'))>64*1024*1024)throw fail('INVALID_OUTPUT');
 if(!response.body)throw fail('INVALID_OUTPUT');const reader=response.body.getReader(),chunks=[];let length=0;
 try{for(;;){const{value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>64*1024*1024){await reader.cancel();throw fail('INVALID_OUTPUT');}chunks.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('INVALID_OUTPUT');}
}
/** getCredential returns {key,connectionId,verify}; caller obtains it only from approved native billing storage.
 * readReferenceAsset resolves an item-owned managed asset ID, never a renderer-supplied path or URL.
 * API sizes specify aspect only: consumer must use probed actual dimensions after managed import. */
export function createMuseImageProvider({getConnectionStatus,getCredential,readReferenceAsset,fetchImpl=fetch}={}){
 const adapter={id:'muse-image',label:'Muse Image · Meta Model API',model:'muse-image-1.0',verified:true,connectionId:null,
  async getCapabilities(){let status;try{status=await getConnectionStatus?.();}catch{status={ready:false};}adapter.connectionId=status?.ready&&typeof status.connectionId==='string'?status.connectionId:null;
   return ['image.generate','image.edit'].map(action=>({action,available:!!adapter.connectionId&&(action==='image.generate'||!!readReferenceAsset),sizes:[...sizes],aspects:[...aspects],maxCount:10,maxPromptLength:4000,maxReferences:action==='image.edit'?1:0,cancellation:'none',costEstimate:'$0.01 per returned image (Meta pricing checked 2026-11-05). Output resolution is provider-fixed; size chooses aspect ratio.'}));
  },
  async start(request,{signal,localJobId}={}){
   const status=await getConnectionStatus?.();if(!status?.ready||status.connectionId!==request.connectionId)throw fail('AUTH_UNAVAILABLE');
   if(!['image.generate','image.edit'].includes(request.action)||request.userAuthorized!==true||typeof request.prompt!=='string'||!request.prompt.trim()||request.prompt.length>4000||!Number.isInteger(request.settings?.count)||request.settings.count<1||request.settings.count>10||!sizes.includes(request.settings.size)||!aspects.includes(request.settings.aspect)||request.settings.mask!==undefined||!Array.isArray(request.referenceAssetIds)||request.referenceAssetIds.length!==(request.action==='image.edit'?1:0))throw fail('INVALID_REQUEST');
   const credentials=await getCredential();if(credentials?.connectionId!==request.connectionId||typeof credentials.key!=='string'||!credentials.key||typeof credentials.verify!=='function')throw fail('AUTH_UNAVAILABLE');
   let body,headers={Authorization:`Bearer ${credentials.key}`,Accept:'application/json'};
   if(request.action==='image.edit'){
    const source=await readReferenceAsset({itemId:request.itemId,assetId:request.referenceAssetIds[0]});
    if(source?.mediaType!=='image/png'||!source.bytes||source.bytes.byteLength<1||source.bytes.byteLength>20*1024*1024)throw fail('INVALID_REFERENCE');
    body=new FormData();body.set('model',adapter.model);body.set('prompt',request.prompt);body.set('n',String(request.settings.count));body.set('size',request.settings.size);body.set('response_format','b64_json');body.set('output_format','png');body.set('image',new Blob([source.bytes],{type:'image/png'}),'reference.png');
   }else{headers['Content-Type']='application/json';body=JSON.stringify({model:adapter.model,prompt:request.prompt,n:request.settings.count,size:request.settings.size,response_format:'b64_json',output_format:'png'});}
   await credentials.verify();if(signal?.aborted)throw fail('REMOTE_UNCERTAIN');
   // Exactly one request. A failed/aborted HTTP request never triggers a hidden billable retry.
   const response=await fetchImpl(`https://api.meta.ai/v1/images/${request.action==='image.edit'?'edits':'generations'}`,{method:'POST',headers,body,signal,redirect:'error',credentials:'omit'});
   if(!response.ok){await response.body?.cancel();throw fail(response.status===401||response.status===403?'AUTH_UNAVAILABLE':response.status===429?'RATE_LIMIT':response.status===400?'PROMPT_REJECTED':'REMOTE_UNCERTAIN');}
   const json=await boundedJson(response);if(!Array.isArray(json.data)||!json.data.length||json.data.length>request.settings.count)throw fail('INVALID_OUTPUT');
   const outputs=json.data.map(image=>{const b64=image?.b64_json;if(typeof b64!=='string'||!b64.length||b64.length>48*1024*1024||b64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64))throw fail('INVALID_OUTPUT');return{bytes:Buffer.from(b64,'base64'),name:'muse-image.png',mediaType:'image/png'};});
   const requestId=response.headers.get('x-request-id');return{status:'completed',remoteJobId:requestId&&requestId.length<=256?requestId:localJobId,outputs};
  },
  async poll(){throw fail('RECONCILIATION_REQUIRED');},
  async cancel(){throw fail('CANCELLATION_UNCONFIRMED');}
 };return adapter;
}
