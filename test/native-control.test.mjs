import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createNativeControlHost} from '../electron/native-control-host.mjs';
import {validateNativeCall} from '../src/shared/native-control.mjs';

test('native control rejects arbitrary commands, extra parameters and mismatched navigation sections',()=>{
 for(const [name,args] of [['eval',{script:'process.exit()'}],['app_status',{token:'bad'}],['navigate',{target:'settings',section:'../secrets'}],['navigate',{target:'code',section:'billing'}],['read_chat',{taskId:'x',limit:200}],['navigate',{target:'code',script:'bad'}]])assert.throws(()=>validateNativeCall(name,args));
 assert.doesNotThrow(()=>validateNativeCall('navigate',{target:'settings',section:'billing'}));
});

test('opt-in authenticated host, revocation, relay restart recovery and real MCP negotiation',async t=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-native-'));let calls=0;
 const service={call:async(name,args)=>{calls++;return{content:[{type:'text',text:JSON.stringify({name,args,version:'fixture'})}]};}};
 const host=await createNativeControlHost({dataDir,service});t.after(async()=>{await host.close();await rm(dataDir,{recursive:true,force:true});});
 assert.equal((await host.command({type:'status'})).running,false);
 await assert.rejects(readFile(path.join(dataDir,'native-control','connection.json')));
 await host.command({type:'enable'});
 const first=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));
 const request=(headers={},body={name:'app_status',arguments:{}})=>fetch(`http://127.0.0.1:${first.port}/call`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await request()).status,401);
 assert.equal((await request({authorization:`Bearer ${first.token}`,origin:'http://evil.test'})).status,403);
 const badHost=await new Promise(resolve=>{const req=http.request({hostname:'127.0.0.1',port:first.port,path:'/call',method:'POST',headers:{host:'evil.test',authorization:`Bearer ${first.token}`,'content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.end('{}');});assert.equal(badHost,403);
 assert.equal((await request({authorization:`Bearer ${first.token}`},{name:'app_status',arguments:{extra:true}})).status,400);
 assert.equal(calls,0);
 const client=new Client({name:'native-control-test',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('electron/native-mcp-server.mjs'),'--data-dir',dataDir],stderr:'pipe',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
 await client.connect(transport);t.after(()=>client.close());
 const listed=await client.listTools();assert.ok(listed.tools.some(tool=>tool.name==='navigate'));assert.ok(listed.tools.find(tool=>tool.name==='app_status').annotations.readOnlyHint);
 const result=await client.callTool({name:'app_status',arguments:{}});assert.equal(JSON.parse(result.content[0].text).version,'fixture');
 await host.command({type:'disable'});
 assert.equal((await client.callTool({name:'app_status',arguments:{}})).isError,true);
 await assert.rejects(readFile(path.join(dataDir,'native-control','connection.json')));
 await host.command({type:'enable'});
 const second=JSON.parse(await readFile(path.join(dataDir,'native-control','connection.json'),'utf8'));assert.notEqual(first.token,second.token);
 assert.equal((await client.callTool({name:'navigate',arguments:{target:'code'}})).isError,undefined);
 assert.equal(calls,2);
 await client.close();await host.close();
 const restarted=await createNativeControlHost({dataDir,service});assert.equal((await restarted.command({type:'status'})).running,true);await restarted.close();
});

test('Windows revokes pre-existing explicit Everyone grants before publishing a token',{skip:process.platform!=='win32'},async()=>{
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-native-acl-')),directory=path.join(dataDir,'native-control'),exec=promisify(execFile);let host;
 try{await mkdir(directory);await exec('icacls.exe',[directory,'/grant','*S-1-1-0:(OI)(CI)RX'],{windowsHide:true});
  host=await createNativeControlHost({dataDir,service:{call:()=>({})}});await host.command({type:'enable'});
  const output=await exec('icacls.exe',[path.join(directory,'connection.json')],{windowsHide:true});assert.ok(!output.stdout.includes('Everyone'),output.stdout);
 }finally{await host?.close();await rm(dataDir,{recursive:true,force:true});}
});
