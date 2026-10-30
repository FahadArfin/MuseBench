import {createServer} from 'node:http';
export async function peer({current=false,mode='json',call='ok',result:callResult,catalog,catalogStatus,session=false,contentEncoding,oauthAuthority,beforeCall}={}){
 const requests=[],sockets=new Set();let effects=0;
 const server=createServer(async(req,res)=>{
  const raw=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>262144){req.destroy();return;}raw.push(chunk);}const body=Buffer.concat(raw).toString();let message;try{message=body?JSON.parse(body):null;}catch{}
  if(requests.length>1000){req.socket.destroy();return;}
  requests.push({method:req.method,url:req.url,headers:req.headers,message});
  if(oauthAuthority){
   const resource=`http://127.0.0.1:${server.address().port}/mcp`;
   if(req.url.startsWith('/.well-known/oauth-protected-resource')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({resource,authorization_servers:[oauthAuthority.origin],scopes_supported:['read']}));return;}
   if(!oauthAuthority.accepts((req.headers.authorization??'').replace(/^Bearer /,''))){res.writeHead(401,{'WWW-Authenticate':`Bearer resource_metadata="http://127.0.0.1:${server.address().port}/.well-known/oauth-protected-resource", scope="read"`});res.end();return;}
  }
  if(contentEncoding)res.setHeader('Content-Encoding',contentEncoding);
  if(req.method==='DELETE'){res.writeHead(405);res.end();return;}
  if(req.method==='GET'){res.writeHead(405);res.end();return;}
  if(current&&message?.method==='initialize'){res.writeHead(400);res.end('initialize forbidden');return;}
  if(message?.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  if(message?.method==='tools/list'&&catalogStatus){res.writeHead(catalogStatus);res.end('private secret catalog error');return;}
  let result;
  if(message?.method==='server/discover'){
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(current?{jsonrpc:'2.0',id:message.id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'fixture',version:'1'}}}}:{jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'unknown method'}}));return;
  }
  if(message?.method==='initialize'){if(session)res.setHeader('Mcp-Session-Id','private-fixture-session');result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};}
  else if(message?.method==='tools/list')result={tools:catalog??[{name:'allowed',description:'fixture remote',inputSchema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false}}]};
  else if(message?.method==='tools/call'){
   effects++;await beforeCall?.();
   if(call==='disconnect'){req.socket.destroy();return;}
   if(call==='hang')return;
   if(call==='auth'){res.writeHead(401);res.end();return;}
   if(/^status-/.test(call)){res.writeHead(Number(call.slice(7)));res.end('secret remote error');return;}
   if(call==='protocol'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32022,message:'Unsupported protocol version',data:{supportedVersions:['2026-07-28']}}}));return;}
   if(call==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});res.end('malformed secret');return;}
   if(call==='input'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{resultType:'input_required',requestState:'opaque-secret-state',inputRequests:{}}}));return;}
   if(call==='task')result={task:{taskId:'unsupported',status:'working',createdAt:new Date().toISOString(),lastUpdatedAt:new Date().toISOString(),ttl:null}};
   else result=callResult??{content:[{type:'text',text:call==='large'?'x'.repeat(200000):call==='oversized'?'x'.repeat(2200000):'remote fixture receipt'}]};
  }else{res.writeHead(202);res.end();return;}
  if(current)res.setHeader('MCP-Protocol-Version','2026-07-28');
  const output=JSON.stringify({jsonrpc:'2.0',id:message.id,result:current?{resultType:'complete',ttlMs:0,cacheScope:'private',...result}:result});
  res.setHeader('Content-Type',mode==='sse'?'text/event-stream':'application/json');res.end(mode==='sse'?`event: message\ndata: ${output}\n\n`:output);
 });server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=8;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{url:`http://127.0.0.1:${server.address().port}/mcp`,requests,get effects(){return effects;},get sockets(){return sockets.size;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
export const source=url=>({id:'global:fixture',name:'fixture',revision:'a'.repeat(64),transport:'streamable-http',url,headers:{Authorization:'fixture-private-token'},enabledTools:null,disabledTools:[],startupMs:1500,callMs:500});
