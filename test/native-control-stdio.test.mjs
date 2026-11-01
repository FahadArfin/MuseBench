import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import {createNativeControlHost} from '../electron/native-control-host.mjs';

async function until(predicate,message){for(let i=0;i<100;i++){if(predicate())return;await delay(10);}assert.fail(message);}
async function relayFixture(t,{missingParent=false}={}){
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'muse-control-stdio-')),signals=[];
 const host=await createNativeControlHost({dataDir,service:{call:async(name,args,{signal})=>{signals.push(signal);await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return{content:[{type:'text',text:'cancelled'}]};}}});
 await host.command({type:'enable'});
 const modulePath=path.resolve('electron/native-mcp-server.mjs');
 // A child-local liveness error models orphaned pipes without killing any
 // actual MCP client or depending on platform-specific inherited pipe rules.
 const args=missingParent?['--input-type=module','-e',`import {startNativeMcp} from ${JSON.stringify(new URL('../electron/native-mcp-server.mjs',import.meta.url).href)}; const originalKill=process.kill; process.kill=(pid,signal)=>{if(signal===0&&pid===process.ppid)throw Object.assign(Error('fixture missing parent'),{code:'ESRCH'});return originalKill(pid,signal);}; await startNativeMcp(${JSON.stringify(dataDir)});`]:[modulePath,'--data-dir',dataDir];
 const child=spawn(process.execPath,args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
 let exited=false,diagnostic='',initialized;const ready=new Promise(resolve=>{initialized=resolve;});
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>{exited=true;resolve({code,signal});}));
 child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-2000);});
 const lines=createInterface({input:child.stdout});lines.on('line',line=>{try{const message=JSON.parse(line);if(message.id===1)initialized(message);}catch{}});
 t.after(async()=>{if(!exited)child.kill();await exit;lines.close();await host.close();await rm(dataDir,{recursive:true,force:true});});
 const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
 send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'stdio-lifetime-fixture',version:'1.0.0'}}});
 let startupTimer;
 try{await Promise.race([ready,exit.then(()=>{throw Error('The stdio relay exited before MCP initialization. '+diagnostic);}),new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(Error('The stdio relay did not initialize within its bounded startup deadline. '+diagnostic)),5000);})]);}
 finally{clearTimeout(startupTimer);}
 send({jsonrpc:'2.0',method:'notifications/initialized'});
 return{child,signals,send,exit,isExited:()=>exited};
}

test('stdio stdin EOF cancels in-flight app work and exits promptly',async t=>{
 const {child,signals,send,exit}=await relayFixture(t);
 send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'app_status',arguments:{}}});
 await until(()=>signals.length===1,'A relay request should reach the native service.');
 child.stdin.end();
 const outcome=await Promise.race([exit,delay(2000).then(()=>null)]);
 assert.ok(outcome,'A disconnected stdio client must not keep the relay alive until its native timeout.');
 await until(()=>signals[0].aborted,'Stdin EOF must cancel the outstanding native request.');
});

test('stdio SIGTERM revokes only its request and does not leave native work active',async t=>{
 const {child,signals,send,exit}=await relayFixture(t);
 send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'app_status',arguments:{}}});
 await until(()=>signals.length===1,'A relay request should reach the native service.');
 child.kill('SIGTERM');
 assert.ok(await Promise.race([exit,delay(2000).then(()=>null)]));
 await until(()=>signals[0].aborted,'Terminating the owned relay should cancel its native request.');
});

test('an idle stdio client remains connected through the parent-liveness check until its owner closes stdin',async t=>{
 const {child,send,exit,isExited}=await relayFixture(t);
 await delay(5300);
 assert.equal(isExited(),false);
 send({jsonrpc:'2.0',id:2,method:'tools/list'});
 await delay(50);assert.equal(isExited(),false);
 child.stdin.end();assert.ok(await Promise.race([exit,delay(2000).then(()=>null)]));
});

test('a relay closes its retained stdin after the OS reports that its parent disappeared',{timeout:10000},async t=>{
 const {child,exit}=await relayFixture(t,{missingParent:true});
 assert.equal(child.stdin.writableEnded,false);
 assert.ok(await Promise.race([exit,delay(6500).then(()=>null)]),'A missing parent should release an otherwise-open relay.');
});
