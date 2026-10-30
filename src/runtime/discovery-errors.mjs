// Only app-created errors receive a wire classification. Remote text, SDK error
// properties and similarly named plain objects cannot acquire this brand.
const messages=Object.freeze({
 authorization:'Remote authorization setup is required. Review configured headers; app-owned OAuth is not available yet.',
 redirect:'Remote redirects are refused. Configure the final endpoint and review it.',
});
const errors=new WeakMap();
export function discoverySetupError(kind){if(!Object.hasOwn(messages,kind))throw Error('Unknown discovery setup classification.');const error=Error(messages[kind]);errors.set(error,kind);return error;}
export function discoverySetupKind(error){return errors.get(error);}
export function readDiscoverySetupKind(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'musebenchDiscoverySetup')&&typeof value.musebenchDiscoverySetup==='string'&&Object.hasOwn(messages,value.musebenchDiscoverySetup)?value.musebenchDiscoverySetup:undefined;}
export async function readDiscoverySetupResponse(response){
 if(response.status!==409||response.headers.get('content-type')?.split(';')[0]!=='application/json'||!response.body)return undefined;
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();return undefined;}chunks.push(value);}return readDiscoverySetupKind(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}catch{return undefined;}finally{reader.releaseLock();}
}
