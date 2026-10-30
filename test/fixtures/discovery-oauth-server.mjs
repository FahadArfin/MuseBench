import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRemoteNetwork} from '../../src/runtime/discovery-remote-network.mjs';
import {createDiscoveryOAuthStore} from '../../electron/discovery-oauth-store.mjs';
import {authSourceIdentity} from '../../src/runtime/discovery-auth-identity.mjs';
import {createOAuthAuthority} from './discovery-oauth-authority.mjs';
export async function createOAuthFixture(options={}){
 const authority=await createOAuthAuthority(options);let origin;const requests=[];
 const server=http.createServer((req,res)=>{
  requests.push({path:req.url,headers:req.headers});if(req.url.startsWith('/.well-known/oauth-protected-resource')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({resource:`${origin}/mcp`,authorization_servers:[authority.origin],scopes_supported:['read'],...(options.resourceMetadata??{})}));return;}
  if(req.headers.authorization&&authority.accepts(req.headers.authorization.slice(7))){res.end('minted');return;}
  res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${options.prmOrigin??origin}/.well-known/oauth-protected-resource", scope="read"`});res.end();
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 const dir=await mkdtemp(path.join(os.tmpdir(),'muse-oauth-unit-'));
 const protection={available:async()=>true,encrypt:async text=>Buffer.from(text),decrypt:async bytes=>({result:bytes.toString(),shouldReEncrypt:false})};
 const store=await createDiscoveryOAuthStore({dataDir:dir,protection});
 const owner={taskId:'task-fixture',root:'C:/fixture/project-one',epoch:1};
 const source={id:'global:fixture',revision:'a'.repeat(64),transport:'streamable-http',url:`${origin}/mcp`,headers:{'X-fixture-private':'FIXTURE_HEADER_SECRET'},urlTemplate:'https://example.test/${PRIVATE_PATH}',environmentNames:['PRIVATE_PATH'],reviewed:true,disabled:true,global:true,nativeProfilePath:'C:/fixture/profile',globalSettingsPath:'C:/fixture/settings.json',authPolicy:{version:1,mode:'public-native-bearer'}};
 function resolveSource(){return{...source,authSourceIdentity:authSourceIdentity({sourceId:source.id,transport:source.transport,globalSettingsPath:source.globalSettingsPath,nativeProfilePath:source.nativeProfilePath,urlTemplate:source.urlTemplate,resolvedUrl:source.url,headerTemplates:source.headers,resolvedHeaders:source.headers,authPolicy:source.authPolicy})};}
 const allowed=new Set([origin,authority.origin,...(options.prmOrigin?[options.prmOrigin]:[])]);
 const networkFactory=({url,limits})=>{if(!allowed.has(new URL(url).origin))throw Error('Fixture external network forbidden');return createRemoteNetwork({url},{limits});};networkFactory.allowInsecureLoopback=true;
 return{authority,origin,requests,source,owner,store,resolveSource,networkFactory,allowFixtureOrigin:value=>allowed.add(value),close:async()=>{await store.close();await Promise.all([authority.close(),new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})]);await rm(dir,{recursive:true,force:true});}};
}
