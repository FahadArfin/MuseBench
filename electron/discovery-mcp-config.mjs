import path from 'node:path';
import {curateEnvironment} from '../src/runtime/index.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {DiscoveryTransport} from '../src/runtime/discovery-transport.mjs';
import {realpath,lstat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {inspectDiscoverySources,resolveDiscoverySelection} from '../src/runtime/discovery-sources.mjs';
import {discoverySelection,discoveryIdentity} from '../src/shared/tool-discovery.mjs';
async function checked(value){if(typeof value!=='string'||!path.isAbsolute(value))throw Error('A trusted absolute app path is required.');const result=await realpath(value);if((await lstat(value)).isSymbolicLink()||path.resolve(value).toLowerCase()!==result.toLowerCase())throw Error('A canonical app path is required.');return result;}
// Ephemeral per-connection broker. Source env/args never enter the renderer,
// provider-facing schema, command line, persisted session or diagnostic output.
export function createDiscoveryMcpConfig({appRoot,executable=process.execPath,helperPath,environment=process.env,extensionReview,platform=process.platform}={}){
 const inspect=workspaceRoot=>inspectDiscoverySources({workspaceRoot,environment,extensionReview,platform});
 const factory=async(workspaceRoot,selection)=>{
  const reviewed=discoverySelection(selection),root=await checked(workspaceRoot),app=await checked(appRoot),command=await checked(executable),script=await checked(path.join(app,'src','runtime','discovery-mcp.mjs'));
  if(platform==='win32')await checked(helperPath);
  const resolve=()=>resolveDiscoverySelection({workspaceRoot:root,selection:reviewed,environment,extensionReview,platform});await resolve();
  const token=randomBytes(32).toString('hex'),authorization=Buffer.from('Bearer '+token);let closed=false,bootstrapped=false,sessionId=null,requests=0,active=0,worker=null,workerTransport=null,workerOpening=null,gatewayClosed=false,lifetimeOpened=false;
  const workerToken=randomBytes(32).toString('hex'),workerAuthorization=Buffer.from('Bearer '+workerToken);
  const workerClient=async()=>{if(gatewayClosed||closed)throw Error('Gateway owner closed.');if(workerOpening)return workerOpening;workerOpening=(async()=>{const transport=new DiscoveryTransport({command,args:[script,'--worker'],cwd:root,env:{...curateEnvironment(environment),ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:'',MUSEBENCH_DISCOVERY_ENDPOINT:endpoint,MUSEBENCH_DISCOVERY_TOKEN:workerToken}},{helperPath,sessionId});workerTransport=transport;worker=new Client({name:'musebench-owned-discovery',version:'1'},{capabilities:{}});await worker.connect(transport,{timeout:30000});return worker;})();return workerOpening;};
  const server=createServer(async(req,res)=>{
   let counted=false,submitted=false,callArguments;const cancellation=new AbortController();res.once('close',()=>{if(!res.writableEnded)cancellation.abort();});try{
    const auth=Buffer.from(req.headers.authorization??'');const workerRequest=auth.length===workerAuthorization.length&&timingSafeEqual(auth,workerAuthorization),nativeRequest=auth.length===authorization.length&&timingSafeEqual(auth,authorization);if(closed||req.socket.remoteAddress!=='127.0.0.1'||req.method!=='POST'||!workerRequest&&!nativeRequest||active>=4||++requests>10000){res.writeHead(403);res.end();return;}active++;counted=true;
    let bytes=0,data='';for await(const chunk of req){bytes+=chunk.length;if(bytes>131072)throw Error();data+=chunk;}const value=JSON.parse(data);
    if(!value||typeof value.sessionId!=='string'||!value.sessionId||value.sessionId.length>200||Object.keys(value).some(key=>!['sessionId','arguments'].includes(key)))throw Error();
    let response;
    if(workerRequest){
     if(!worker||value.sessionId!==sessionId)throw Error();
     if(req.url==='/worker-bootstrap')response={sources:await resolve(),root,helperPath};
     else if(req.url==='/worker-validate'){await resolve();response={valid:true};}
     else throw Error();
    }else if(req.url==='/bootstrap'){
     if(bootstrapped)throw Error();bootstrapped=true;sessionId=value.sessionId;await resolve();response={};
    }else if(!bootstrapped||gatewayClosed||value.sessionId!==sessionId)throw Error();
    else if(req.url==='/lifetime'){
     if(lifetimeOpened)throw Error();lifetimeOpened=true;res.setTimeout(0);res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store'});res.flushHeaders();res.once('close',()=>{gatewayClosed=true;void workerTransport?.close().catch(()=>{});});return;
    }
    else if(['/search','/call'].includes(req.url)){
     await resolve();const client=await workerClient();if(closed||cancellation.signal.aborted)throw Error();
     callArguments=value.arguments;submitted=true;
     const result=await client.callTool({name:req.url==='/search'?'discovery_search':'discovery_call',arguments:value.arguments},undefined,{timeout:330000,signal:cancellation.signal});
     if(!Array.isArray(result.content)||result.content.length!==1||result.content[0].type!=='text')throw Error();
     if(result.isError&&req.url==='/call'){
      submitted=false;response={sourceId:typeof callArguments?.sourceId==='string'?callArguments.sourceId.slice(0,110):'unknown',tool:typeof callArguments?.tool==='string'?callArguments.tool.slice(0,200):'unknown',outcome:'failed',submitted:false,error:'Rejected before downstream submission: '+result.content[0].text.slice(0,500)};
     }else{if(result.isError)throw Error();response=JSON.parse(result.content[0].text);}
    }else throw Error();
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(response));
   }catch{
    if(submitted&&req.url==='/call'){
     await workerTransport?.close().catch(()=>{});
     res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({sourceId:typeof callArguments?.sourceId==='string'?callArguments.sourceId.slice(0,110):'unknown',tool:typeof callArguments?.tool==='string'?callArguments.tool.slice(0,200):'unknown',outcome:'unknown',error:'The owned worker ended without a final receipt. The operation may have executed. It was not retried. Reconnect and review again.'}));
    }else{res.writeHead(409);res.end('{"error":"Source selection changed or connection unavailable. Reconnect and review again."}');}
   }finally{if(counted)active--;}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=8;server.timeout=335000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const endpoint='http://127.0.0.1:'+server.address().port;
  return{identity:discoveryIdentity({sources:reviewed.sources}),config:Object.freeze({transport:'stdio',command,args:[script],env:{ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:'',MUSEBENCH_DISCOVERY_ENDPOINT:endpoint,MUSEBENCH_DISCOVERY_TOKEN:token},framing:'lineDelimitedJson',mode:'required'}),verify:async()=>{if(closed||gatewayClosed)throw Error('Discovery gateway owner closed. Reconnect and review again.');if(workerTransport?.closed)throw Error('On-demand worker stopped. Its last operation may have an unknown outcome. Reconnect and review again; no operation was retried.');await resolve();},async close(){if(closed)return;closed=true;server.closeAllConnections();let failure;try{await workerTransport?.close();}catch(error){failure=error;}await new Promise(resolve=>server.close(resolve));if(failure)throw Error('Discovery worker process cleanup is unconfirmed.');}};
 };
 factory.inspect=async workspaceRoot=>{const {root,rows}=await inspect(workspaceRoot);return{root,rows};};return factory;
}
