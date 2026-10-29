import {realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const descriptions={definition:'Find the declaration of the symbol at a source position.',references:'Find references to the same symbol, excluding unrelated names.',implementation:'Find workspace implementations of an interface or symbol.',hover:'Read the type signature and documentation at a source position.'};
const positionProperties={path:{type:'string',minLength:1,maxLength:1000,description:'Workspace-relative TypeScript or JavaScript source path.'},line:{type:'integer',minimum:1,maximum:1000000,description:'One-based line.'},column:{type:'integer',minimum:1,maximum:1000000,description:'One-based UTF-16 column.'}};
const schema=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const operations=Object.entries(descriptions).map(([name,description])=>({name,description,inputSchema:schema(positionProperties,['path','line','column'])}));
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const tools=[
 {name:'workspace_tool_search',description:'Search the four bounded TypeScript/JavaScript semantic navigation operations. Returns descriptions and argument schemas for workspace_tool_call; this does not register native deferred model tools.',inputSchema:schema({query:{type:'string',maxLength:200}},['query']),annotations},
 {name:'workspace_tool_call',description:'Call a reviewed semantic navigation operation in this server’s fixed workspace. No command execution, network, arbitrary file access, or root changes.',inputSchema:schema({operation:{type:'string',enum:Object.keys(descriptions)},...positionProperties},['operation','path','line','column']),annotations},
];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
// MCP request metadata (including Muse's callId) is opaque transport context.
// It never changes tool arguments, workspace scope or authorization.
const requestParams=(value,keys)=>exact(value,[...keys,'_meta'])&&(!Object.hasOwn(value,'_meta')||object(value._meta));
const validId=id=>typeof id==='string'&&id.length<=128||typeof id==='number'&&Number.isSafeInteger(id);
const rpcError=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const toolError=message=>({content:[{type:'text',text:message}],isError:true});
function position(args){
 return exact(args,['operation','path','line','column'])&&Object.hasOwn(descriptions,args.operation)&&typeof args.path==='string'&&args.path.length>0&&args.path.length<=1000&&!/[\x00-\x1f\x7f:\\]/.test(args.path)&&!path.posix.isAbsolute(args.path)&&!args.path.split('/').some(part=>!part||part==='..'||part==='.')&&['line','column'].every(key=>Number.isInteger(args[key])&&args[key]>=1&&args[key]<=1000000);
}
function bounded(value,fallback,min,max){return Number.isInteger(value)&&value>=min&&value<=max?value:fallback;}

/** The injected service is owned by the server. Only the CLI creates a real semantic worker.
 * JSONL is the explicitly supported MCP stdio framing; no HTTP listener or shell is started. */
export async function createWorkspaceMcpServer({root,input=process.stdin,output=process.stdout,service,ownsTransport=false,maxFrameBytes=65536,maxResultBytes=131072,maxPending=8}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||root.includes('\0'))throw Error('A valid absolute workspace directory is required.');
 const canonical=await realpath(root);if(!(await stat(canonical)).isDirectory())throw Error('A valid workspace directory is required.');
 if(!service||typeof service.query!=='function'||typeof service.dispose!=='function')throw Error('A semantic service is required.');
 maxFrameBytes=bounded(maxFrameBytes,65536,1024,65536);maxResultBytes=bounded(maxResultBytes,131072,1024,131072);maxPending=bounded(maxPending,8,1,8);
 let initialized=false,closed=false,ended=false,running=false,pending=Buffer.alloc(0),queue=[],closePromise,resolveDone;
 const done=new Promise(resolve=>{resolveDone=resolve;});
 const close=({graceful=false}={})=>{
  if(closePromise)return closePromise;closed=true;queue=[];pending=Buffer.alloc(0);input.removeListener('data',onData);input.removeListener('end',onEnd);input.removeListener('error',onInputError);input.pause?.();
  // A paused Windows stdin pipe still keeps the CLI process alive. Only its
  // explicit owner may close transport handles; injected streams stay intact.
  if(ownsTransport===true){input.destroy();if(graceful)output.end();else output.destroy();}
  closePromise=Promise.resolve().then(()=>service.dispose()).catch(()=>{}).finally(()=>resolveDone());return closePromise;
 };
 const send=async value=>{
  if(closed)return;
  // Bound queued output even when the reader stops draining stdout.
  const line=JSON.stringify(value)+'\n';if(Buffer.byteLength(line)>maxResultBytes+4096){await close();return;}
  if(!output.write(line))await new Promise(resolve=>{const finish=()=>{output.removeListener('drain',finish);output.removeListener('error',finish);output.removeListener('close',finish);resolve();};output.once('drain',finish);output.once('error',finish);output.once('close',finish);void done.then(finish);});
 };
 async function dispatch(message){
  if(!object(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||!exact(message,['jsonrpc','id','method','params'])||Object.hasOwn(message,'id')&&!validId(message.id))return rpcError(null,-32600,'Invalid request.');
  if(!Object.hasOwn(message,'id'))return null; // Notifications never invoke navigation or mutate configuration.
  const {id,method,params}=message,result=value=>({jsonrpc:'2.0',id,result:value});
  if(method==='initialize'){
   if(initialized||!object(params)||typeof params.protocolVersion!=='string')return rpcError(id,-32602,'Invalid initialization.');
   initialized=true;const versions=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
   return result({protocolVersion:versions.includes(params.protocolVersion)?params.protocolVersion:versions.at(-1),capabilities:{tools:{listChanged:false}},serverInfo:{name:'musebench-workspace',version:'1.0.0'},instructions:'Read-only semantic navigation in the server-owned workspace. Search returns operation schemas for the fixed gateway; it does not register new native model tools.'});
  }
  if(method==='ping')return result({});
  if(!initialized)return rpcError(id,-32002,'Initialize the server first.');
  if(method==='tools/list'){
   if(params!==undefined&&!requestParams(params,[]))return rpcError(id,-32602,'This tool list accepts only request metadata, not pagination.');
   return result({tools});
  }
  if(method!=='tools/call')return rpcError(id,-32601,'Method not found.');
  if(!requestParams(params,['name','arguments'])||typeof params.name!=='string')return rpcError(id,-32602,'Invalid tool request.');
  const args=params.arguments;
  if(params.name==='workspace_tool_search'){
   if(!exact(args,['query'])||typeof args.query!=='string'||args.query.length>200)return rpcError(id,-32602,'Invalid search arguments.');
   const terms=args.query.toLowerCase().trim().split(/\s+/).filter(Boolean);const matches=operations.filter(item=>terms.every(term=>(item.name+' '+item.description).toLowerCase().includes(term)));
   return result({content:[{type:'text',text:JSON.stringify({gateway:'workspace_tool_call',operations:matches})}]});
  }
  if(params.name!=='workspace_tool_call'||!position(args))return rpcError(id,-32602,'Invalid navigation arguments.');
  try{
   const answer=await service.query({operation:args.operation,path:args.path,line:args.line,column:args.column}),text=JSON.stringify(answer);
   if(typeof text!=='string'||Buffer.byteLength(text)>maxResultBytes)return result(toolError('Navigation result exceeded the output limit. Narrow the query.'));
   return result({content:[{type:'text',text}]});
  }catch(error){
   const code=typeof error?.code==='string'&&/^SEMANTIC_(INPUT|PATH|POSITION|BUSY|LIMIT|STALE|TIMEOUT|DISPOSED|WORKER|UNAVAILABLE)$/.test(error.code)?error.code:'SEMANTIC_UNAVAILABLE';
   return result(toolError('Navigation could not complete ('+code+'). Review the source position and workspace limits.'));
  }
 }
 async function pump(){
  if(running||closed)return;running=true;
  try{while(queue.length&&!closed){const frame=queue.shift();let message;try{message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frame));}catch{await send(rpcError(null,-32700,'Parse error.'));continue;}const answer=await dispatch(message);if(answer)await send(answer);}}
  catch{await close();}finally{running=false;if(ended&&!closed)await close({graceful:true});}
 }
 function onData(chunk){
  if(closed)return;const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);let start=0;
  while(start<bytes.length&&!closed){const end=bytes.indexOf(10,start),stop=end===-1?bytes.length:end,piece=bytes.subarray(start,stop);
   if(pending.length+piece.length>maxFrameBytes){void close();return;}pending=Buffer.concat([pending,piece]);
   if(end===-1)break;
   if(pending.length){if(queue.length+(running?1:0)>=maxPending){void close();return;}queue.push(pending);}
   pending=Buffer.alloc(0);start=end+1;void pump();
  }
 }
 function onEnd(){ended=true;if(pending.length){void close();return;}if(!running&&!queue.length)void close({graceful:true});}
 function onInputError(){void close();}
 input.on('data',onData);input.on('end',onEnd);input.on('error',onInputError);output.on('error',onInputError);output.on('close',onInputError);
 void done.then(()=>{output.removeListener('error',onInputError);output.removeListener('close',onInputError);});
 return{root:canonical,close,done,get closed(){return closed;}};
}

async function main(){
 if(process.argv.length!==4||process.argv[2]!=='--root'||!path.isAbsolute(process.argv[3]))throw Error('Invalid server arguments.');
 const root=await realpath(process.argv[3]);if(!(await stat(root)).isDirectory())throw Error('Invalid workspace.');
 const {createSemanticNavigation}=await import('../controller/semantic-navigation.mjs');
 const service=createSemanticNavigation(root),server=await createWorkspaceMcpServer({root,service,ownsTransport:true});
 const stop=()=>{void server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);await server.done;
 process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('Workspace navigation server could not start.\n');process.exitCode=1;});
