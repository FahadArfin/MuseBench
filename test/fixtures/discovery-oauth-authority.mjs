import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
export async function createOAuthAuthority(options={}){
 const codes=new Map(),refreshes=new Map(),access=new Set();
 const counters={registrations:0,codeExchanges:0,refreshes:0,requests:[],pkceValid:false};let origin;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);counters.requests.push({path:url.pathname,headers:req.headers});
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/.well-known/oauth-authorization-server')return json({issuer:options.wrongIssuer??origin,authorization_endpoint:`${origin}/authorize`,token_endpoint:`${origin}/token`,...(options.noDcr?{}:{registration_endpoint:`${origin}/register`}),response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:options.confidential?['client_secret_basic']:['none'],authorization_response_iss_parameter_supported:true,...(options.cimd?{client_id_metadata_document_supported:true}:{}),...(options.metadata??{})});
  if(url.pathname==='/register'){
   counters.registrations++;let body='';for await(const part of req)body+=part;
   counters.registration=JSON.parse(body);if(options.registrationError)return json({error:'invalid_client_metadata',error_description:'FIXTURE_PRIVATE_PROVIDER_ERROR'},400);
   return json({...counters.registration,client_id:'fixture-public-client',...(options.secret?{client_secret:'FIXTURE_UNWANTED_SECRET'}:{})},201);
  }
  if(url.pathname==='/authorize'){
   const q=url.searchParams;if(q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!q.get('state')||!q.get('resource'))return json({error:'invalid_request'},400);
   const code=randomBytes(24).toString('base64url');codes.set(code,Object.fromEntries(q));const callback=new URL(q.get('redirect_uri'));callback.searchParams.set('code',code);callback.searchParams.set('state',q.get('state'));callback.searchParams.set('iss',origin);counters.lastCallback=callback.href;res.writeHead(302,{location:callback.href});return res.end();
  }
  if(url.pathname==='/token'){
   let body='';for await(const part of req)body+=part;const q=new URLSearchParams(body);counters.lastExchange=Object.fromEntries(q);
   if(q.get('grant_type')==='authorization_code'){
    counters.codeExchanges++;const record=codes.get(q.get('code'));codes.delete(q.get('code'));
    counters.pkceValid=!!record&&createHash('sha256').update(q.get('code_verifier')??'').digest('base64url')===record.code_challenge;
    if(!counters.pkceValid||q.get('resource')!==record.resource||q.get('redirect_uri')!==record.redirect_uri||q.get('client_id')!==record.client_id)return json({error:'invalid_grant'},400);
   }else if(q.get('grant_type')==='refresh_token'){
    counters.refreshes++;if(!refreshes.has(q.get('refresh_token')))return json({error:'invalid_grant',error_description:'FIXTURE_PRIVATE_PROVIDER_ERROR'},400);refreshes.delete(q.get('refresh_token'));
   }else return json({error:'invalid_request'},400);
   if(options.tokenError)return json({error:'invalid_grant',error_description:'FIXTURE_PRIVATE_PROVIDER_ERROR'},400);
   await options.beforeTokenResponse?.();const token='FIXTURE_ACCESS_'+randomBytes(20).toString('hex'),refresh='FIXTURE_REFRESH_'+randomBytes(20).toString('hex');access.add(token);refreshes.set(refresh,true);
   return json({access_token:token,token_type:options.dpop?'DPoP':'Bearer',refresh_token:refresh,expires_in:options.expiresIn??60,...(options.tokenScopes?{scope:options.tokenScopes}:{})});
  }
  json({error:'missing'},404);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 return{origin,counters,accepts:token=>access.has(token),close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
