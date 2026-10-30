// Remote-only v2 adapter. The local/native v1 transport remains independent.
import {Client,StreamableHTTPClientTransport,SSEClientTransport} from '@modelcontextprotocol/client';
import {createRemoteNetwork} from './discovery-remote-network.mjs';
const rawResult={'~standard':{version:1,vendor:'musebench-bounded-result',validate:value=>({value})}};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function createRemoteDiscoveryClient(source,{lookup,networkOptions={}}={}){
 let transport,client,closed=false,connecting=false,lastStatus=null,networkFailure=false,lastNetworkError,closing;
 const network=createRemoteNetwork(source,{...networkOptions,lookup,onFailure:error=>{networkFailure=true;lastNetworkError=error;if(!connecting)void close(false);}});
 const fetch=async(input,init)=>{lastStatus=null;const response=await network.fetch(input,init);lastStatus=response.status;if([401,403].includes(response.status)){await response.body?.cancel();throw Error('Remote authorization setup is required. Review configured headers; app-owned OAuth is not available yet.');}return response;};
 const makeClient=legacy=>new Client({name:'musebench-discovery',version:'1.0.0'},{capabilities:{},inputRequired:{autoFulfill:false},versionNegotiation:{mode:legacy?'legacy':'auto',probe:{maxRetries:0,timeoutMs:source.startupMs}},jsonSchemaValidator:{getValidator(){throw Error('Eager schema compilation is unsupported.');}}});
 function attach(value){transport=value;transport.onerror=()=>{if(!connecting){void close(false);if(value instanceof SSEClientTransport){
   // EventSource 3.x installs its reconnect timer AFTER firing onerror. Close
   // again at the microtask boundary to clear that newly installed timer too.
   queueMicrotask(()=>{void value.close();});
  }}};transport.onclose=()=>{closed=true;};}
 async function close(cleanup=true){
  if(closing)return closing;closed=true;
  closing=(async()=>{
   // Session cleanup has its own bounded budget, never the cancelled operation's.
   if(cleanup&&transport instanceof StreamableHTTPClientTransport&&transport.sessionId){network.end();network.begin(AbortSignal.timeout(500));try{await transport.terminateSession();}catch{}finally{network.end();}}
   network.close();await transport?.close();
  })();return closing;
 }
 async function operation(ms,signal,fn){
  if(closed)throw Error('Remote source closed; reconnect and review again.');const controller=new AbortController(),combined=AbortSignal.any([controller.signal,...[signal].filter(Boolean)]);const timer=setTimeout(()=>controller.abort(),ms);
  network.begin(combined);try{combined.throwIfAborted();return await fn(combined);}catch(error){await close(false);if(lastStatus===401||lastStatus===403)throw Error('Remote authorization setup is required. Review configured headers; app-owned OAuth is not available yet.');if(lastNetworkError)throw lastNetworkError;throw Error('Remote source failed or exceeded its bounds; reconnect and review again.');}finally{clearTimeout(timer);network.end();}
 }
 const result=value=>{if(!object(value)||value.resultType==='input_required'||Object.hasOwn(value,'inputRequests')||Object.hasOwn(value,'task'))throw Error('Remote interaction or task results are unsupported.');return value;};
 return{
  connect({signal}={}){return operation(source.startupMs,signal,async signal=>{
   connecting=true;try{
    attach(new StreamableHTTPClientTransport(new URL(source.url),{fetch,requestInit:{headers:source.headers},redirectPolicy:'same-origin',reconnectionOptions:{maxRetries:0,initialReconnectionDelay:0,maxReconnectionDelay:0,reconnectionDelayGrowFactor:1},onInsufficientScope:'throw',maxStepUpRetries:0}));client=makeClient(false);
    try{await client.connect(transport,{timeout:source.startupMs,signal});}
    catch(error){
     // Only a definitive pre-call POST transport incompatibility permits SSE.
     if(networkFailure||signal.aborted||![404,405].includes(lastStatus))throw error;
     await transport.close();closed=false;lastStatus=null;
     attach(new SSEClientTransport(new URL(source.url),{fetch,eventSourceInit:{fetch},requestInit:{headers:source.headers},redirectPolicy:'same-origin'}));client=makeClient(true);await client.connect(transport,{timeout:source.startupMs,signal});
    }
   }finally{connecting=false;}
  });},
  catalog({signal}={}){return operation(source.startupMs,signal,async signal=>result(await client.request({method:'tools/list'},rawResult,{timeout:source.startupMs,signal})));},
  call(args,{signal}={}){return operation(source.callMs,signal,async signal=>{const value=result(await client.request({method:'tools/call',params:args},rawResult,{timeout:source.callMs,signal}));if(!Array.isArray(value.content))throw Error('Invalid remote final receipt.');return value;});},
  close,
  get closed(){return closed;},
  get activeRequests(){return network.activeRequests;},
 };
}
