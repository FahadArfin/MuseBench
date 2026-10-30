import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {ResultSchema,ToolSchema,CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {createHash} from 'node:crypto';
import {DiscoveryTransport} from './discovery-transport.mjs';
import {supportedSchema,validateDiscoveryArguments} from './discovery-schema.mjs';
import {createRemoteDiscoveryClient} from './discovery-remote.mjs';
import {boundDiscoveryResult,discoveryResultWireBytes as wireBytes} from './discovery-output.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createDiscoveryGateway({sources,helperPath,sessionId,verify,readAccessToken}={}){
 if(!Array.isArray(sources)||!sources.length||sources.length>4||typeof verify!=='function')throw Error('A trusted reviewed selection is required.');
 const states=new Map(sources.map(source=>[source.id,{source,client:null,transport:null,closed:false,catalog:null}]));let closed=false,busy=false;
 async function operation(fn){if(closed)throw Error('Gateway closed; reconnect and review again.');if(busy)throw Error('Gateway is busy. Arbitrary-effect batching is unsupported.');busy=true;try{await verify();return await fn();}finally{busy=false;}}
 async function ready(state,signal){
  if(state.closed)throw Error('Source closed; reconnect and review again.');
  if(state.source.transport==='streamable-http'){
   if(state.client?.closed){state.closed=true;throw Error('Remote source closed; reconnect and review again.');}
   if(!state.client){state.client=createRemoteDiscoveryClient(state.source,{...(state.source.authBindingRevision?{readAccessToken:()=>{if(typeof readAccessToken!=='function')throw Error('Signed-in source is unavailable.');return readAccessToken(state.source);}}:{})});state.transport=state.client;try{await state.client.connect({signal});}catch(error){state.closed=true;await state.client.close();throw error;}}return;
  }
  if(!state.client){const transport=new DiscoveryTransport(state.source,{helperPath,sessionId}),client=new Client({name:'musebench-discovery',version:'1.0.0'},{capabilities:{},jsonSchemaValidator:{getValidator(){throw Error('SDK schema compilation is not permitted for discovery sources.');}}});state.client=client;state.transport=transport;
   transport.onclose=()=>{state.closed=true;};
   try{await client.connect(transport,{timeout:state.source.startupMs,signal});}catch{state.closed=true;await transport.close();throw Error('Source startup failed; reconnect and review again.');}
  }
 }
 async function catalog(state,signal){
  // listTools() eagerly compiles every outputSchema before returning. Read the
  // raw result instead: encoded bounds and source filters precede schema work.
  await ready(state,signal);let result;try{result=state.source.transport==='streamable-http'?await state.client.catalog({signal}):await state.client.request({method:'tools/list'},ResultSchema,{timeout:state.source.startupMs,signal});}catch(error){state.closed=true;await state.transport.close();if(state.source.transport==='streamable-http')throw error;throw Error('Source catalog unavailable; reconnect and review again.');}
  if(result.nextCursor||!Array.isArray(result.tools)||result.tools.length>200||bytes(result)>524288){state.closed=true;await state.transport.close();throw Error('Catalog exceeds 200 tools or 512 KiB; pagination is unsupported.');}
  let unsupported=0;const names=new Set(),tools=[];for(const tool of result.tools){
   if(!object(tool)||typeof tool.name!=='string'||!tool.name||tool.name.length>200||names.has(tool.name)){state.closed=true;await state.transport.close();throw Error('Invalid source tool identity.');}names.add(tool.name);
   if(state.source.enabledTools&&!state.source.enabledTools.includes(tool.name)||state.source.disabledTools.includes(tool.name))continue;
   try{supportedSchema(tool.inputSchema);if(tool.outputSchema!==undefined)supportedSchema(tool.outputSchema);ToolSchema.parse(tool);if(tool.execution?.taskSupport==='required'||tool.description!==undefined&&(typeof tool.description!=='string'||tool.description.length>8192))throw Error();tools.push({name:tool.name,...(tool.description?{description:tool.description}:{}),inputSchema:tool.inputSchema,...(tool.outputSchema!==undefined?{outputSchema:tool.outputSchema}:{})});}catch{unsupported++;}
  }
  const value={sourceId:state.source.id,sourceName:state.source.name,catalogRevision:digest({source:state.source.revision,tools:result.tools}),tools,unsupported};state.catalog=value;return value;
 }
 return{
  search(args,{signal}={}){return operation(async()=>{
   if(!exact(args,['query'])||typeof args.query!=='string'||args.query.length>200)throw Error('Invalid discovery search.');
   const result={sources:[],omitted:0};let matches=0;for(const state of states.values()){
    const current=await catalog(state,signal),row={...current,tools:[]};result.sources.push(row);
    for(const tool of current.tools){if(args.query&&!`${current.sourceName} ${tool.name} ${tool.description??''}`.toLowerCase().includes(args.query.toLowerCase()))continue;
     if(matches>=8){result.omitted++;continue;}row.tools.push(tool);if(wireBytes(result)>65536){row.tools.pop();result.omitted++;}else matches++;
    }
   }return result;
  });},
  call(args,{signal}={}){return operation(async()=>{
   if(!exact(args,['sourceId','catalogRevision','tool','arguments'])||typeof args.sourceId!=='string'||typeof args.catalogRevision!=='string'||typeof args.tool!=='string'||!object(args.arguments))throw Error('Invalid discovery call.');
   if(bytes(args.arguments)>65536)throw Error('Tool arguments exceed the encoded 64 KiB limit.');
   const state=states.get(args.sourceId);if(!state)throw Error('Source was not reviewed for this connection.');
   if(!state.catalog||state.catalog.catalogRevision!==args.catalogRevision)throw Error('Search this source before calling its tools.');
   const fresh=await catalog(state,signal);if(fresh.catalogRevision!==args.catalogRevision)throw Error('Source catalog changed. Search again before calling.');
   const tool=fresh.tools.find(tool=>tool.name===args.tool);if(!tool)throw Error('Tool is filtered, unsupported or absent.');validateDiscoveryArguments(tool.inputSchema,args.arguments);
   await verify();if(signal?.aborted)throw Error('Discovery call cancelled before submission.');
   const receipt={sourceId:state.source.id,sourceName:state.source.name,catalogRevision:fresh.catalogRevision,tool:tool.name};
   // From this point failure is unknown: a submitted effect is never replayed.
   try{const params={name:tool.name,arguments:args.arguments},result=state.source.transport==='streamable-http'?CallToolResultSchema.parse(await state.client.call(params,{signal})):await state.client.request({method:'tools/call',params},CallToolResultSchema,{timeout:state.source.callMs,signal});
    // Never enter SDK metadata caching/output validation, even on call dispatch.
    // A submitted call with an invalid final receipt remains unknown, unreplayed.
    if(tool.outputSchema!==undefined){if(result.structuredContent===undefined&&!result.isError)throw Error('Missing structured output.');if(result.structuredContent!==undefined)validateDiscoveryArguments(tool.outputSchema,result.structuredContent);}
    return boundDiscoveryResult(receipt,result);
   }catch{state.closed=true;await state.transport.close().catch(()=>{});return{...receipt,outcome:'unknown',error:'No final receipt was received. The submitted operation may have executed. It was not retried. Reconnect and review before further calls.'};}
  });},
  async dispose(){closed=true;const results=await Promise.allSettled([...states.values()].map(async state=>{state.closed=true;await state.transport?.close();}));if(results.some(r=>r.status==='rejected'))throw Error('Source process cleanup is unconfirmed.');},
 };
}
