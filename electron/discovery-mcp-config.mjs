import path from 'node:path';
import {curateEnvironment} from '../src/runtime/index.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {DiscoveryTransport} from '../src/runtime/discovery-transport.mjs';
import {realpath,lstat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {inspectDiscoverySources} from '../src/runtime/discovery-sources.mjs';
import {discoverySelection,discoveryIdentity} from '../src/shared/tool-discovery.mjs';
import {readDiscoverySetupKind} from '../src/runtime/discovery-errors.mjs';
async function checked(value){if(typeof value!=='string'||!path.isAbsolute(value))throw Error('A trusted absolute app path is required.');const result=await realpath(value);if((await lstat(value)).isSymbolicLink()||path.resolve(value).toLowerCase()!==result.toLowerCase())throw Error('A canonical app path is required.');return result;}
// Ephemeral per-connection broker. Source env/args never enter the renderer,
// provider-facing schema, command line, persisted session or diagnostic output.
export function createDiscoveryMcpConfig({appRoot,executable=process.execPath,helperPath,environment=process.env,extensionReview,platform=process.platform,oauth=()=>null}={}){
 const snapshots=new Map(),sourceRoots=new Map(),connections=new Set(),key=ref=>ref.id+'\0'+ref.revision;
 let inspectionTail=Promise.resolve(),observedAuthority;
 const inspect=workspaceRoot=>{
  const inspectionEnvironment={...environment};
  const operation=inspectionTail.then(async()=>{
  let result;try{result=await inspectDiscoverySources({workspaceRoot,environment:inspectionEnvironment,extensionReview,platform});}catch(error){snapshots.clear();observedAuthority=undefined;throw error;}
  if(result.authorityRevision!==observedAuthority){snapshots.clear();observedAuthority=result.authorityRevision;}
  for(const [id,value] of snapshots)if(value.root===result.root)snapshots.delete(id);
  for(const definition of result.definitions.values())if(definition.authSourceIdentity){snapshots.set(key(definition),{root:result.root,source:definition});sourceRoots.set(key(definition),result.root);}while(sourceRoots.size>4096)sourceRoots.delete(sourceRoots.keys().next().value);return result;
  });inspectionTail=operation.catch(()=>{});return operation;
 };
 const resolveAuthSource=async ref=>{const root=sourceRoots.get(key(ref));if(!root)throw Error('Source review changed.');let current;try{current=await inspect(root);}catch(error){for(const [id,value] of snapshots)if(value.root===root)snapshots.delete(id);throw error;}const source=current.definitions.get(ref.id);if(!source||source.revision!==ref.revision||!source.authSourceIdentity)throw Error('Source review changed.');return source;};
 const current=entry=>!entry.closed&&entry.isCurrent()===true;
 const factory=async(workspaceRoot,selection,authority={})=>{
  const reviewed=discoverySelection(selection),root=await checked(workspaceRoot),app=await checked(appRoot),command=await checked(executable),script=await checked(path.join(app,'src','runtime','discovery-mcp.mjs'));
  if(platform==='win32')await checked(helperPath);
  const authRows=reviewed.sources.filter(row=>row.authBindingRevision),auth=authRows.length?oauth():null;
  if(authRows.length&&(!auth||typeof authority.isCurrent!=='function'||authority.owner?.root!==root))throw Error('A trusted live OAuth owner is required.');
  const entry={owner:authority.owner,isCurrent:authority.isCurrent??(()=>true),sources:reviewed.sources,closed:false,idle:false,dispatches:0,authLease:null,close:null};
  const assertLive=()=>{if(!current(entry))throw Error('Discovery gateway owner closed. Reconnect and review again.');};
  const resolve=async()=>{assertLive();const snapshot=await inspect(root),definitions=reviewed.sources.map(row=>{const definition=snapshot.definitions.get(row.id);if(!definition||definition.revision!==row.revision)throw Error('On-demand source changed or review was revoked. Refresh and explicitly review it again.');return{...definition,...(row.authBindingRevision?{authBindingRevision:row.authBindingRevision}:{})};});assertLive();await (entry.authLease?auth.verifyLease(entry.authLease.leaseId):undefined);assertLive();return definitions;};
  connections.add(entry);
  try{await inspect(root);await resolve();if(auth)entry.authLease=await auth.prepareConnection({owner:entry.owner,selection:{sources:authRows,...(authority.sessionId?{sessionId:authority.sessionId}:{})}});assertLive();}catch(error){entry.closed=true;connections.delete(entry);if(entry.authLease)await auth.closeLease(entry.authLease.leaseId);throw error;}
  const token=randomBytes(32).toString('hex'),authorization=Buffer.from('Bearer '+token);let closed=false,bootstrapped=false,sessionId=null,requests=0,active=0,worker=null,workerTransport=null,workerOpening=null,gatewayClosed=false,lifetimeOpened=false;
  const workerToken=randomBytes(32).toString('hex'),workerAuthorization=Buffer.from('Bearer '+workerToken);
  const workerClient=async()=>{if(gatewayClosed||closed)throw Error('Gateway owner closed.');if(workerOpening)return workerOpening;workerOpening=(async()=>{const transport=new DiscoveryTransport({command,args:[script,'--worker'],cwd:root,env:{...curateEnvironment(environment),ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:'',MUSEBENCH_DISCOVERY_ENDPOINT:endpoint,MUSEBENCH_DISCOVERY_TOKEN:workerToken}},{helperPath,sessionId});workerTransport=transport;worker=new Client({name:'musebench-owned-discovery',version:'1'},{capabilities:{}});await worker.connect(transport,{timeout:30000});return worker;})();return workerOpening;};
  const server=createServer(async(req,res)=>{
   let counted=false,dispatched=false,submitted=false,callArguments;const cancellation=new AbortController();res.once('close',()=>{if(!res.writableEnded)cancellation.abort();});try{
    const presented=Buffer.from(req.headers.authorization??'');const workerRequest=presented.length===workerAuthorization.length&&timingSafeEqual(presented,workerAuthorization),nativeRequest=presented.length===authorization.length&&timingSafeEqual(presented,authorization);if(closed||req.socket.remoteAddress!=='127.0.0.1'||req.method!=='POST'||!workerRequest&&!nativeRequest||active>=4||++requests>10000){res.writeHead(403);res.end();return;}active++;counted=true;
    let bytes=0,data='';for await(const chunk of req){bytes+=chunk.length;if(bytes>131072)throw Error();data+=chunk;}const value=JSON.parse(data);
    if(!value||typeof value.sessionId!=='string'||!value.sessionId||value.sessionId.length>200||Object.keys(value).some(key=>!(req.url==='/worker-auth-token'?['sessionId','sourceId','sourceRevision','authBindingRevision']:['sessionId','arguments']).includes(key)))throw Error();assertLive();
    let response;
    if(workerRequest){
     if(!worker||value.sessionId!==sessionId)throw Error();
     if(req.url==='/worker-bootstrap')response={sources:await resolve(),root,helperPath};
     else if(req.url==='/worker-validate'){await resolve();response={valid:true};}
     else if(req.url==='/worker-auth-token'){
      if(!entry.authLease||!reviewed.sources.some(row=>row.id===value.sourceId&&row.revision===value.sourceRevision&&row.authBindingRevision===value.authBindingRevision))throw Error();
      response=await auth.readAccessToken({leaseId:entry.authLease.leaseId,...value});assertLive();
     }
     else throw Error();
    }else if(req.url==='/bootstrap'){
     if(bootstrapped||sessionId!==null&&sessionId!==value.sessionId)throw Error();bootstrapped=true;sessionId=value.sessionId;await resolve();if(entry.authLease)await auth.bindSession({leaseId:entry.authLease.leaseId,sessionId});assertLive();response={};
    }else if(!bootstrapped||gatewayClosed||value.sessionId!==sessionId)throw Error();
    else if(req.url==='/lifetime'){
     if(lifetimeOpened)throw Error();lifetimeOpened=true;res.setTimeout(0);res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store'});res.flushHeaders();res.once('close',()=>{gatewayClosed=true;entry.closed=true;connections.delete(entry);if(entry.authLease)void auth.closeLease(entry.authLease.leaseId);void workerTransport?.close().catch(()=>{});});return;
    }
    else if(['/search','/call'].includes(req.url)){
     if(entry.idle)throw Error();entry.dispatches++;dispatched=true;
     await resolve();const client=await workerClient();if(closed||cancellation.signal.aborted)throw Error();assertLive();
     callArguments=value.arguments;submitted=true;
     const result=await client.callTool({name:req.url==='/search'?'discovery_search':'discovery_call',arguments:value.arguments},undefined,{timeout:330000,signal:cancellation.signal});
     if(!Array.isArray(result.content)||result.content.length!==1||result.content[0].type!=='text')throw Error();
     if(result.isError&&req.url==='/call'){
      submitted=false;response={sourceId:typeof callArguments?.sourceId==='string'?callArguments.sourceId.slice(0,110):'unknown',tool:typeof callArguments?.tool==='string'?callArguments.tool.slice(0,200):'unknown',outcome:'failed',submitted:false,error:'Rejected before downstream submission: '+result.content[0].text.slice(0,500)};
     }else{
      if(result.isError){const kind=readDiscoverySetupKind(result.structuredContent);if(req.url==='/search'&&kind){res.writeHead(409,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({musebenchDiscoverySetup:kind}));return;}throw Error();}
      response=JSON.parse(result.content[0].text);
     }
    }else throw Error();
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(response));
   }catch{
    if(submitted&&req.url==='/call'){
     await workerTransport?.close().catch(()=>{});
     res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({sourceId:typeof callArguments?.sourceId==='string'?callArguments.sourceId.slice(0,110):'unknown',tool:typeof callArguments?.tool==='string'?callArguments.tool.slice(0,200):'unknown',outcome:'unknown',error:'The owned worker ended without a final receipt. The operation may have executed. It was not retried. Reconnect and review again.'}));
    }else{res.writeHead(409);res.end('{"error":"Source selection changed or connection unavailable. Reconnect and review again."}');}
   }finally{if(counted)active--;if(dispatched)entry.dispatches--;}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=8;server.timeout=335000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const endpoint='http://127.0.0.1:'+server.address().port;
  const close=async()=>{if(closed)return;closed=true;entry.closed=true;connections.delete(entry);if(entry.authLease)await auth.closeLease(entry.authLease.leaseId);server.closeAllConnections();let failure;try{await workerTransport?.close();}catch(error){failure=error;}await new Promise(resolve=>server.close(resolve));if(failure)throw Error('Discovery worker process cleanup is unconfirmed.');};entry.close=close;
  return{identity:discoveryIdentity({sources:reviewed.sources}),config:Object.freeze({transport:'stdio',command,args:[script],env:{ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:'',MUSEBENCH_DISCOVERY_ENDPOINT:endpoint,MUSEBENCH_DISCOVERY_TOKEN:token},framing:'lineDelimitedJson',mode:'required'}),bindSession:async actualId=>{assertLive();if(typeof actualId!=='string'||!actualId||actualId.length>200||sessionId!==null&&sessionId!==actualId)throw Error('Native session identity changed.');if(entry.authLease)await auth.bindSession({leaseId:entry.authLease.leaseId,sessionId:actualId});assertLive();if(sessionId!==null&&sessionId!==actualId)throw Error('Native session identity changed.');sessionId=actualId;},prepareTurn:async()=>{assertLive();if(entry.authLease)await auth.prepareTurn({owner:entry.owner,leaseId:entry.authLease.leaseId});assertLive();},verify:async()=>{if(closed||gatewayClosed)throw Error('Discovery gateway owner closed. Reconnect and review again.');if(workerTransport?.closed)throw Error('On-demand worker stopped. Its last operation may have an unknown outcome. Reconnect and review again; no operation was retried.');await resolve();},close};
 };
 factory.inspect=async workspaceRoot=>{const {root,rows}=await inspect(workspaceRoot);for(const row of rows)if(row.authEligible&&oauth()){row.auth=await oauth().inspectSource({id:row.id,revision:row.revision});if(row.auth.credentialAvailable)row.authBindingRevision=row.auth.bindingRevision;}return{root,rows};};
 factory.resolveAuthSource=resolveAuthSource;factory.getAuthSourceSnapshot=ref=>snapshots.get(key(ref))?.source;
 factory.runtimeOwnerSnapshot=ref=>{const entry=[...connections].find(entry=>entry.owner?.taskId===ref.taskId&&entry.owner?.root===ref.root&&entry.owner?.epoch===ref.epoch);return entry&&current(entry)?{...entry.owner}:null;};
 factory.withIdleLease=async({leaseId,owner},operation)=>{const entry=[...connections].find(entry=>entry.authLease?.leaseId===leaseId&&entry.owner?.taskId===owner.taskId&&entry.owner?.root===owner.root&&entry.owner?.epoch===owner.epoch);if(!entry||!current(entry)||entry.idle)throw Error('On-demand source is busy.');entry.idle=true;try{if(entry.dispatches!==0)throw Error('On-demand source is busy.');return await operation();}finally{entry.idle=false;}};
 factory.stopSourceLeases=async sourceId=>{const entries=[...connections].filter(entry=>entry.sources.some(row=>row.id===sourceId));if(entries.some(entry=>entry.dispatches||entry.idle))return false;await Promise.all(entries.map(entry=>entry.close?.()));return true;};
 return factory;
}
