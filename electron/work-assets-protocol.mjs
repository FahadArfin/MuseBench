import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {randomBytes} from 'node:crypto';
/** Capabilities are issued only through the trusted app bridge and never saved in a document. */
export function createWorkAssetAccess(){
 const tokens=new Map(),owners=new Map();
 return{
  grant({itemId,ownerId}){if(!/^[A-Za-z0-9_-]{1,128}$/.test(itemId)||typeof ownerId!=='string'||!ownerId)throw Error('Asset access requires an item and trusted renderer owner');const key=JSON.stringify([itemId,ownerId]),existing=owners.get(key);if(existing)return existing;const token=randomBytes(32).toString('base64url');tokens.set(token,{itemId,ownerId,key});owners.set(key,token);return token;},
  authorize(request,itemId){try{const token=new URL(request.url).searchParams.get('access'),record=tokens.get(token);return !!record&&record.itemId===itemId;}catch{return false;}},
  revokeOwner(ownerId){for(const[token,record]of tokens)if(record.ownerId===ownerId){tokens.delete(token);owners.delete(record.key);}},
  close(){tokens.clear();owners.clear();},
 };
}
// Callers bind authorize to the app's own renderer/frame, never the currently selected item.
export function workAssetAddress(value){
 try{const url=new URL(value);if(url.protocol!=='musebench-work-asset:'||url.hostname!=='asset'||url.username||url.password||url.port||url.hash)return null;
  const match=/^\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
  if(!match||[...url.searchParams.keys()].some(key=>!['thumbnail','hash','access','derivative'].includes(key))||url.searchParams.has('thumbnail')&&url.searchParams.get('thumbnail')!=='1')return null;
  if(url.searchParams.has('access')&&!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('access')))return null;
  if(url.searchParams.has('hash')&&!/^[a-f0-9]{64}$/.test(url.searchParams.get('hash')))return null;
  if(url.searchParams.has('derivative')&&(!['proxy','thumbnail'].includes(url.searchParams.get('derivative'))||!url.searchParams.has('hash')||url.searchParams.has('thumbnail')))return null;
  return{itemId:match[1],assetId:match[2],...(url.searchParams.has('hash')?{hash:url.searchParams.get('hash')}:{}),thumbnail:url.searchParams.get('thumbnail')==='1',...(url.searchParams.has('derivative')?{derivative:url.searchParams.get('derivative')}:{} )};
 }catch{return null;}
}
export function createWorkAssetHandler({store,authorize=()=>false,resolveDerivative}){
 return async request=>{
  if(!['GET','HEAD','OPTIONS'].includes(request.method))return new Response('Method not allowed',{status:405});
  const address=workAssetAddress(request.url);if(!address)return new Response('Asset not found',{status:404});
  if(!await authorize(request,address.itemId))return new Response('Asset access denied',{status:403});
  // Access is an unguessable item capability, never an ambient cookie or referrer.
  const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, HEAD, OPTIONS','access-control-allow-headers':'Range','access-control-expose-headers':'Content-Length, Content-Range, Accept-Ranges'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   const asset=await store.describe(address);let file,mediaType;if(address.derivative){if(!resolveDerivative)throw Error('Managed derivative is unavailable');const resolved=await resolveDerivative({itemId:address.itemId,assetId:address.assetId,hash:address.hash,kind:address.derivative});file=typeof resolved==='string'?resolved:resolved.filePath;mediaType=typeof resolved==='string'?(address.derivative==='proxy'?'video/mp4':'image/jpeg'):resolved.mediaType;}else{file=await store.resolve(address);mediaType=address.thumbnail?'image/png':asset.mediaType;}const size=(await stat(file)).size,headers={...cors,'content-type':mediaType,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'accept-ranges':'bytes','content-length':String(size)};
   const range=request.headers?.get?.('range');let start=0,end=size-1,status=200;
   if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});
    if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<1)return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});start=Math.max(0,size-suffix);}else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return new Response(null,{status:416,headers:{'content-range':`bytes */${size}`}});
    status=206;headers['content-range']=`bytes ${start}-${end}/${size}`;headers['content-length']=String(end-start+1);
   }
   return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file,{start,end})),{status,headers});
  }catch{return new Response('Managed asset missing or invalid. Relink it from the asset browser.',{status:404});}
 };
}
