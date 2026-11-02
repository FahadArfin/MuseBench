import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';

test('desktop MCP lease binds runtime task/root, authenticates loopback calls and revokes on close',async()=>{
 const {createDesktopMcpConfig}=await import('../electron/desktop-mcp-config.mjs');let live=true;const calls=[];
 const factory=createDesktopMcpConfig({getDesktop:()=>({agentCommand:async(binding,input)=>{calls.push({binding,input});return {windowId:'doc'};}})});
 const lease=await factory(process.cwd(),{taskId:'chat',isCurrent:()=>live});
 const {MUSEBENCH_DESKTOP_ENDPOINT:endpoint,MUSEBENCH_DESKTOP_TOKEN:token}=lease.config.env;
 const request=(authorization='Bearer '+token,body={type:'status'})=>fetch(endpoint,{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request('Bearer foreign')).status,403);assert.equal(calls.length,0);
 assert.equal((await request()).status,200);assert.equal(calls[0].binding.taskId,'chat');assert.equal(calls[0].binding.root,process.cwd());
 live=false;assert.equal((await request()).status,409);assert.equal(calls.length,1);await lease.close();
 await assert.rejects(request());
});
test('stdio desktop tools expose bounded fixed actions and image content without arbitrary JS or owner override',async()=>{
 const {createDesktopMcpServer}=await import('../src/runtime/desktop-mcp.mjs');const input=new PassThrough(),output=new PassThrough();let text='',calls=[];output.on('data',b=>text+=b);
 const server=createDesktopMcpServer({input,output,call:async args=>{calls.push(args);return args.type==='capture'?{imageDataUrl:'data:image/png;base64,aGVsbG8=',windowId:'doc',width:10,height:10}:{windowId:'doc'};}});
 const send=(id,method,params)=>input.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 send(1,'initialize',{protocolVersion:'2025-11-25'});send(2,'tools/list',{});send(3,'tools/call',{name:'desktop_capture',arguments:{windowId:'window'}});send(4,'tools/call',{name:'desktop_click',arguments:{ref:'x',windowId:'doc',taskId:'foreign'}});send(5,'tools/call',{name:'desktop_evaluate',arguments:{script:'alert(1)'}});
 await new Promise(r=>setTimeout(r,25));await server.close();const replies=text.trim().split('\n').map(s=>JSON.parse(s));
 assert.equal(replies[1].result.tools.length,12);assert.equal(replies[2].result.content[1].type,'image');assert.equal(replies[3].error.code,-32602);assert.equal(replies[4].error.code,-32602);assert.deepEqual(calls,[{type:'capture',windowId:'window'}]);
});

test('cancelling a queued desktop action prevents dispatch while preserving the connection',async t=>{
 const {createDesktopMcpServer}=await import('../src/runtime/desktop-mcp.mjs');
 const input=new PassThrough(),output=new PassThrough(),calls=[];let text='',finishCapture;
 output.on('data',chunk=>text+=chunk);
 const server=createDesktopMcpServer({input,output,call:async args=>{calls.push(args.type);if(args.type==='capture')await new Promise(resolve=>finishCapture=resolve);return{windowId:'doc'};}});
 t.after(()=>server.close());
 const send=message=>input.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n'),tick=()=>new Promise(resolve=>setImmediate(resolve));
 send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});await tick();
 send({id:2,method:'tools/call',params:{name:'desktop_capture',arguments:{windowId:'window'}}});await tick();
 send({id:3,method:'tools/call',params:{name:'desktop_click',arguments:{windowId:'doc',observationId:'obs',ref:'button'}}});
 send({method:'notifications/cancelled',params:{requestId:3,reason:'No longer requested'}});
 finishCapture();await tick();
 send({id:4,method:'tools/call',params:{name:'desktop_status',arguments:{}}});await tick();
 assert.deepEqual(calls,['capture','status']);
 const replies=text.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(replies.some(reply=>reply.id===3),false);assert.equal(replies.at(-1).id,4);assert.equal(replies.at(-1).result.isError,undefined);
});

test('cancelling an active desktop call aborts its transport without replay or connection loss',async t=>{
 const {createDesktopMcpServer}=await import('../src/runtime/desktop-mcp.mjs');
 const input=new PassThrough(),output=new PassThrough(),calls=[];let text='',signal;
 output.on('data',chunk=>text+=chunk);
 const server=createDesktopMcpServer({input,output,call:async(args,options)=>{calls.push(args.type);if(args.type==='capture'){signal=options.signal;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}return{windowId:'doc'};}});
 t.after(()=>server.close());
 const send=message=>input.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n'),tick=()=>new Promise(resolve=>setImmediate(resolve));
 send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});await tick();
 send({id:2,method:'tools/call',params:{name:'desktop_capture',arguments:{windowId:'window'}}});await tick();
 send({method:'notifications/cancelled',params:{requestId:2}});await tick();
 assert.equal(signal.aborted,true);
 send({id:3,method:'tools/call',params:{name:'desktop_status',arguments:{}}});await tick();
 assert.deepEqual(calls,['capture','status']);
 const replies=text.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(replies.some(reply=>reply.id===2),false);assert.equal(replies.at(-1).id,3);assert.equal(replies.at(-1).result.isError,undefined);
});

test('active MCP cancellation revokes the HTTP request guard without revoking its desktop lease',{timeout:3000},async t=>{
 const {createDesktopMcpConfig}=await import('../electron/desktop-mcp-config.mjs');
 const {createDesktopMcpServer,createDesktopMcpCaller}=await import('../src/runtime/desktop-mcp.mjs');
 let startGuard,finishGuard,finishAction,effects=0;const started=new Promise(resolve=>startGuard=resolve),guard=new Promise(resolve=>finishGuard=resolve),actionDone=new Promise(resolve=>finishAction=resolve);
 t.after(()=>finishGuard());
 const lease=await createDesktopMcpConfig({getDesktop:()=>({async agentCommand(binding,input){
  if(input.type==='click'){startGuard(binding);try{await guard;if(!binding.isCurrent())throw Error('Desktop request ended.');effects++;}finally{finishAction();}}
  return{windowId:'doc'};
 }})})(process.cwd(),{taskId:'chat'});
 t.after(()=>lease.close());
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',chunk=>text+=chunk);
 const server=createDesktopMcpServer({input,output,call:createDesktopMcpCaller({endpoint:lease.config.env.MUSEBENCH_DESKTOP_ENDPOINT,token:lease.config.env.MUSEBENCH_DESKTOP_TOKEN})});
 t.after(()=>server.close());
 const send=message=>input.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
 const until=async condition=>{const deadline=Date.now()+2000;while(!condition()){assert.ok(Date.now()<deadline,'Timed out waiting for cancellation or response.');await new Promise(resolve=>setTimeout(resolve,5));}};
 send({id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});await until(()=>text.includes('"id":1'));
 send({id:2,method:'tools/call',params:{name:'desktop_click',arguments:{windowId:'doc',observationId:'obs',ref:'button'}}});
 const binding=await started;assert.equal(binding.isCurrent(),true);
 send({method:'notifications/cancelled',params:{requestId:2}});
 await until(()=>!binding.isCurrent());finishGuard();await actionDone;
 send({id:3,method:'tools/call',params:{name:'desktop_status',arguments:{}}});await until(()=>text.includes('"id":3'));
 const replies=text.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(effects,0);assert.equal(replies.some(reply=>reply.id===2),false);assert.equal(replies.at(-1).result.isError,undefined);
});
