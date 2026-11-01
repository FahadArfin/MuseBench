import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {validateNativeCall} from '../src/shared/native-control.mjs';
import {createNativeMcpServer} from './native-mcp-tools.mjs';

export async function callNativeApp(dataDir,name,args,{signal}={}){
 validateNativeCall(name,args);
 if(signal?.aborted)throw Error('Native request cancelled.');
 let descriptor;try{descriptor=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));}catch{throw Error('Open MuseBench and enable Settings → App control.');}
 if(descriptor.version!==1||!Number.isInteger(descriptor.port)||descriptor.port<1||descriptor.port>65535||!/^[a-f0-9]{64}$/.test(descriptor.token))throw Error('Invalid local app connection. Turn App control off and on in MuseBench.');
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:descriptor.port,path:'/call',method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${descriptor.token}`},timeout:13000,signal},res=>{
   let bytes=0,chunks=[];res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){req.destroy(Error('Native response exceeded its limit.'));return;}chunks.push(chunk);});
   res.on('error',()=>reject(Error('MuseBench disconnected. Inspect its state before continuing.')));
   res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200)throw Error(value.error||'MuseBench request failed.');resolve(value);}catch(error){reject(error);}});
  });
  req.on('timeout',()=>req.destroy(Error('MuseBench timed out. Inspect its state before continuing.')));req.on('error',()=>reject(Error('MuseBench is unavailable. Reopen it and check Settings → App control. No action was retried.')));
  req.end(JSON.stringify({name,arguments:args}));
 });
}
export async function startNativeMcp(dataDir){
 const lifetime=new AbortController(),parentPid=process.ppid;
 const server=createNativeMcpServer((name,args,{signal})=>callNativeApp(dataDir,name,args,{signal:AbortSignal.any([signal,lifetime.signal])}));
 const originalClose=server.close.bind(server);let closing=null,parentWatch=null;
 const shutdown=()=>{void server.close().catch(()=>{process.exitCode=1;});};
 server.close=()=>{
  if(!closing)closing=Promise.resolve().then(async()=>{
   clearInterval(parentWatch);lifetime.abort();
   process.stdin.off('end',shutdown);process.stdin.off('close',shutdown);process.off('SIGTERM',shutdown);process.off('SIGINT',shutdown);
   await originalClose();
  });return closing;
 };
 server.onclose=shutdown;
 process.stdin.once('end',shutdown);process.stdin.once('close',shutdown);process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
 // EOF is the normal ownership signal. This only covers orphaned pipes whose
 // owner vanished; a legitimate idle client never expires on a timer.
 if(parentPid>1){parentWatch=setInterval(()=>{
  if(process.platform!=='win32'&&process.ppid!==parentPid){shutdown();return;}
  try{process.kill(parentPid,0);}catch(error){if(error.code==='ESRCH')shutdown();}
 },5000);parentWatch.unref();}
 try{await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:8192}));}
 catch(error){await server.close();throw error;}
 if(process.stdin.readableEnded||process.stdin.destroyed)shutdown();
 return server;
}
// Electron supplies Node. Windows clients use the verified cached runtime so
// the desktop installation can be replaced without terminating idle clients.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=='--data-dir'||!path.isAbsolute(process.argv[3])){process.stderr.write('Expected --data-dir with an absolute MuseBench profile path.\n');process.exitCode=1;}
 else startNativeMcp(process.argv[3]).catch(()=>{process.stderr.write('MuseBench MCP could not start.\n');process.exitCode=1;});
}
