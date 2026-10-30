// Main-only OAuth protocol. No provider, recovery middleware, ambient fetch or logging.
import {randomBytes} from 'node:crypto';
import {resolveRemoteDestination} from '../src/runtime/discovery-remote-network.mjs';
import {discoverOAuthProtectedResourceMetadata,discoverAuthorizationServerMetadata,selectResourceURL,registerClient,startAuthorization,exchangeAuthorization,refreshAuthorization,validateAuthorizationResponseIssuer,computeScopeUnion,buildDiscoveryUrls,extractWWWAuthenticateParams,validateClientMetadataUrl,IssuerMismatchError} from '@modelcontextprotocol/client';
export const oauthFailure=(code='network-failed')=>Object.assign(new Error('Discovery sign-in could not be completed.'),{code});
const opaque=()=>randomBytes(24).toString('base64url');
const limits=Object.freeze({headers:16384,body:131072,frame:131072,operation:1048576,wire:1048576});
const validText=(v,max=16384)=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=max&&!/[\x00-\x1f\x7f]/.test(v);
function scopes(value){const result=value===undefined?[]:Array.isArray(value)?value:typeof value==='string'?value.split(' ').filter(Boolean):null;if(!result||result.length>256||result.some(v=>!validText(v,200)||/\s/.test(v))||new Set(result).size!==result.length)throw oauthFailure('scope-changed');return [...result].sort();}
export function createDiscoveryOAuthFlow({networkFactory,now=Date.now}){
 if(typeof networkFactory!=='function')throw oauthFailure();
 function destination(value){let url;try{if(!validText(String(value)))throw 0;url=new URL(value);if(url.username||url.password||url.hash||url.protocol!=='https:'&&!(networkFactory.allowInsecureLoopback===true&&url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw 0;}catch{throw oauthFailure('unsupported-public-client');}return url;}
 function context(previous){return previous??{deadline:now()+30000,reads:0,bytes:0};}
 async function stage(purpose,allowed,signal,account,action){
  const ctx=account??context();if(now()>=ctx.deadline)throw oauthFailure('expired');const timer=AbortSignal.timeout(Math.max(1,ctx.deadline-now())),phaseSignal=AbortSignal.any([timer,...(signal?[signal]:[])]);const networks=new Map();let posts=0;
  const fetchFn=async(input,init={})=>{
   phaseSignal.throwIfAborted();const url=destination(String(input));const method=(init.method??'GET').toUpperCase();if(!allowed.some(v=>v.url===url.href&&v.method===method))throw oauthFailure();
   if(method==='POST'&&++posts>1||purpose==='metadata'&&++ctx.reads>12)throw oauthFailure();
   const headers=new Headers(init.headers);if(purpose==='metadata')for(const name of [...headers.keys()])if(!['accept','mcp-protocol-version'].includes(name.toLowerCase()))throw oauthFailure();
   let network=networks.get(url.origin);if(!network){network=await networkFactory({purpose,url:url.href,limits});networks.set(url.origin,network);network.begin(phaseSignal);}
   const body=init.body instanceof URLSearchParams?init.body.toString():init.body;ctx.bytes+=body?Buffer.byteLength(body):0;if(ctx.bytes>1048576)throw oauthFailure();
   const response=await network.fetch(url.href,{...init,headers,body,signal:phaseSignal,redirect:'error'});if(response.status>=300&&response.status<400)throw oauthFailure();
   let headerBytes=0;for(const [k,v] of response.headers)headerBytes+=Buffer.byteLength(k)+Buffer.byteLength(v)+4;ctx.bytes+=headerBytes;if(headerBytes>16384||ctx.bytes>1048576)throw oauthFailure();
   const parts=[];let bytes=0;const reader=response.body?.getReader();try{if(reader)while(true){phaseSignal.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;ctx.bytes+=value.byteLength;if(bytes>131072||ctx.bytes>1048576)throw oauthFailure();parts.push(value);}}finally{await reader?.cancel().catch(()=>{});}
   return new Response([204,205,304].includes(response.status)?null:Buffer.concat(parts),{status:response.status,headers:response.headers});
  };
  try{return await action(fetchFn);}catch(error){if(error instanceof IssuerMismatchError)throw oauthFailure('issuer-mismatch');if(['network-failed','unsupported-public-client','issuer-mismatch','scope-changed','registration-required','expired'].includes(error?.code))throw error;throw oauthFailure();}finally{for(const network of networks.values()){network.end();network.close();}}
 }
 function publicMetadata(metadata,issuer){
  if(!metadata||metadata.issuer!==issuer)throw oauthFailure('issuer-mismatch');for(const key of ['authorization_endpoint','token_endpoint'])destination(metadata[key]);if(metadata.registration_endpoint)destination(metadata.registration_endpoint);
  if(!metadata.code_challenge_methods_supported?.includes('S256')||metadata.token_endpoint_auth_methods_supported&&!metadata.token_endpoint_auth_methods_supported.includes('none')||metadata.dpop_required===true||metadata.token_type==='DPoP')throw oauthFailure('unsupported-public-client');
  if(metadata.response_types_supported&&!metadata.response_types_supported.includes('code')||metadata.grant_types_supported&&!metadata.grant_types_supported.includes('authorization_code'))throw oauthFailure('unsupported-public-client');return metadata;
 }
 function tokenResult(value,review,previous){
  if(value.token_type?.toLowerCase()!=='bearer'||!validText(value.access_token)||value.refresh_token!==undefined&&!validText(value.refresh_token))throw oauthFailure('unsupported-public-client');
  const granted=value.scope===undefined?[...review.scopes]:scopes(value.scope);if(granted.length!==review.scopes.length||granted.some((v,i)=>v!==review.scopes[i]))throw oauthFailure('scope-changed');
  const expiresAt=value.expires_in===undefined?null:now()+value.expires_in*1000;if(expiresAt!==null&&(!Number.isSafeInteger(expiresAt)||expiresAt<now()))throw oauthFailure();
  return{accessToken:value.access_token,...(value.refresh_token??previous?{refreshToken:value.refresh_token??previous}:{}),expiresAt,scopes:granted};
 }
 return{
  async discoverResource({source,challenge,signal,reviewedDestinations=[],discoveryContext}){
   const ctx=context(discoveryContext),endpoint=destination(source.url),approved=new Set([endpoint.origin]);for(const v of reviewedDestinations)destination(v);
   let retained=challenge;
   if(!retained)retained=await stage('metadata',[{url:endpoint.href,method:'GET'}],signal,ctx,async fetchFn=>{const response=await fetchFn(endpoint.href,{headers:{accept:'application/json'}});if(/^DPoP\b/i.test(response.headers.get('www-authenticate')??''))throw oauthFailure('unsupported-public-client');return extractWWWAuthenticateParams(response);});
   const metadataUrl=retained.resourceMetadataUrl??retained.resource_metadata;
   let urls;if(metadataUrl){const url=destination(metadataUrl);urls=[url.href];if(!approved.has(url.origin)&&!reviewedDestinations.includes(url.href))return{source,challenge:retained,discoveryContext:ctx,reviewedDestinations:[...reviewedDestinations],pendingDestination:{id:opaque(),url:url.href,purpose:'metadata'},issuerChoices:[]};}
   else{const path=endpoint.pathname.replace(/\/$/,'');urls=[new URL(`/.well-known/oauth-protected-resource${path==='/'?'':path}`,endpoint.origin).href,new URL('/.well-known/oauth-protected-resource',endpoint.origin).href];}
   const metadata=await stage('metadata',urls.map(url=>({url,method:'GET'})),signal,ctx,fetchFn=>discoverOAuthProtectedResourceMetadata(endpoint,{...(metadataUrl?{resourceMetadataUrl:metadataUrl}:{})},fetchFn));
   let resource;try{resource=await selectResourceURL(endpoint,{},metadata);}catch{throw oauthFailure();}if(!resource||!Array.isArray(metadata.authorization_servers)||metadata.authorization_servers.length<1||metadata.authorization_servers.length>12)throw oauthFailure();destination(resource);
   const requested=scopes(computeScopeUnion(retained.scope??(metadata.scopes_supported??[]).join(' ')));const issuerChoices=metadata.authorization_servers.map(issuer=>({id:opaque(),issuer:destination(issuer).href,exactIssuer:issuer}));
   return{source,resource:metadata.resource,resourceMetadata:metadata,scopes:requested,issuerChoices,challenge:retained,discoveryContext:ctx,reviewedDestinations:[...reviewedDestinations],destinations:urls};
  },
  async discoverIssuer({resourceReview,issuerChoiceId,signal}){
   const choice=resourceReview.issuerChoices.find(v=>v.id===issuerChoiceId);if(!choice)throw oauthFailure('issuer-mismatch');const issuer=choice.exactIssuer;destination(issuer);const allowed=buildDiscoveryUrls(issuer).map(v=>({url:v.url.href,method:'GET'}));
   const metadata=publicMetadata(await stage('metadata',allowed,signal,resourceReview.discoveryContext,fetchFn=>discoverAuthorizationServerMetadata(issuer,{fetchFn})),issuer);
   return{...resourceReview,issuer,metadata,destinations:[...new Set([...resourceReview.destinations,...allowed.map(v=>v.url),metadata.authorization_endpoint,metadata.token_endpoint,...(metadata.registration_endpoint?[metadata.registration_endpoint]:[])])].slice(0,12)};
  },
  async register({review,clientMetadata,signal}){
   publicMetadata(review.metadata,review.issuer);const callback=new URL(clientMetadata.callbackUri);if(callback.href!==`http://127.0.0.1:${callback.port}/oauth/mcp/callback`||Number(callback.port)<1024)throw oauthFailure('unsupported-public-client');
   const base={callbackUri:callback.href,callbackPort:Number(callback.port)};
   if(clientMetadata.stored?.clientId)return{...base,clientId:clientMetadata.stored.clientId,method:'stored'};
   if(clientMetadata.clientId){if(!validText(clientMetadata.clientId))throw oauthFailure('unsupported-public-client');return{...base,clientId:clientMetadata.clientId,method:clientMetadata.method==='manual'?'manual':'preregistered'};}
   if(clientMetadata.cimd){try{validateClientMetadataUrl(clientMetadata.cimd);}catch{throw oauthFailure('unsupported-public-client');}if(!review.metadata.client_id_metadata_document_supported||destination(clientMetadata.cimd).protocol!=='https:')throw oauthFailure('unsupported-public-client');return{...base,clientId:clientMetadata.cimd,method:'cimd'};}
   if(!review.metadata.registration_endpoint)throw oauthFailure('registration-required');
   const profile={client_name:'MuseBench',application_type:'native',redirect_uris:[callback.href],token_endpoint_auth_method:'none',grant_types:['authorization_code',...(review.metadata.grant_types_supported?.includes('refresh_token')?['refresh_token']:[])],response_types:['code']};
   const r=await stage('registration',[{url:destination(review.metadata.registration_endpoint).href,method:'POST'}],signal,null,fetchFn=>registerClient(review.issuer,{metadata:review.metadata,clientMetadata:profile,scope:review.scopes.join(' ')||undefined,fetchFn}));
   if(r.client_secret!==undefined||r.token_endpoint_auth_method&&r.token_endpoint_auth_method!=='none'||!validText(r.client_id)||!r.redirect_uris?.includes(callback.href))throw oauthFailure('unsupported-public-client');return{...base,clientId:r.client_id,method:'dcr',clientMetadata:profile};
  },
  async authorize({review,registration,callbackUri,state}){
   const target=destination(review.metadata.authorization_endpoint);let timer;
   try{await Promise.race([resolveRemoteDestination(target,{...(networkFactory.lookup?{lookup:networkFactory.lookup}:{})}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(oauthFailure()),30000);timer.unref?.();})]);}catch{throw oauthFailure();}finally{clearTimeout(timer);}
   const result=await startAuthorization(review.issuer,{metadata:review.metadata,clientInformation:{client_id:registration.clientId,token_endpoint_auth_method:'none'},redirectUrl:callbackUri,scope:review.scopes.join(' ')||undefined,state,resource:review.resource});
   const url=result.authorizationUrl,q=url.searchParams;if(Buffer.byteLength(url.href)>16384||url.origin!==target.origin||url.pathname!==target.pathname||q.get('redirect_uri')!==callbackUri||q.get('state')!==state||q.get('resource')!==review.resource||q.get('client_id')!==registration.clientId||q.get('scope')!==(review.scopes.join(' ')||null)||q.get('code_challenge_method')!=='S256')throw oauthFailure('unsupported-public-client');return result;
  },
  async exchange({review,registration,callbackUri,code,iss,codeVerifier,signal}){
   try{validateAuthorizationResponseIssuer({iss,expectedIssuer:review.issuer,issParameterSupported:review.metadata.authorization_response_iss_parameter_supported===true});}catch{throw oauthFailure('issuer-mismatch');}
   return tokenResult(await stage('token',[{url:destination(review.metadata.token_endpoint).href,method:'POST'}],signal,null,fetchFn=>exchangeAuthorization(review.issuer,{metadata:review.metadata,clientInformation:{client_id:registration.clientId,token_endpoint_auth_method:'none'},authorizationCode:code,iss,codeVerifier,redirectUri:callbackUri,resource:review.resource,fetchFn})),review);
  },
  async refresh({grant,signal}){
   const review={issuer:grant.binding.issuer,scopes:grant.binding.scopes,metadata:grant.metadata};publicMetadata(review.metadata,review.issuer);if(!grant.destinations.includes(grant.metadata.token_endpoint))throw oauthFailure();
   return tokenResult(await stage('token',[{url:destination(grant.metadata.token_endpoint).href,method:'POST'}],signal,null,fetchFn=>refreshAuthorization(review.issuer,{metadata:review.metadata,clientInformation:{client_id:grant.registration.clientId,token_endpoint_auth_method:'none'},refreshToken:grant.tokens.refreshToken,scope:review.scopes.join(' ')||undefined,resource:grant.binding.resource,fetchFn})),review,grant.tokens.refreshToken);
  },
 };
}
