// Isolated process: an unhandled rejection must fail this regression naturally.
import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {DiscoveryTransport} from '../../src/runtime/discovery-transport.mjs';
const [mode,root]=process.argv.slice(2);
// A detached grandchild exercises the real Job boundary, including teardown
// after deliberately losing the inner supervisor's cleanup receipt.
const script=String.raw`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true,detached:true});process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'fixture/ready',params:{pids:[process.pid,child.pid]}})+'\n');setInterval(()=>{},1000);`;
const transport=new DiscoveryTransport({command:process.execPath,args:['-e',script],cwd:root,env:process.env},{helperPath:path.resolve('native/bin/MuseBenchJob.exe'),sessionId:'fixture'});
let errors=0,failedResolve,readyResolve,readyReject;
const failed=new Promise(resolve=>{failedResolve=resolve;}),ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
transport.onerror=()=>{errors++;failedResolve();};transport.onmessage=readyResolve;
await transport.start();
const startup=setTimeout(()=>readyReject(Error('Owned fixture exceeded the reviewed-source 30s startup budget.')),30000);
let message;try{message=await ready;}finally{clearTimeout(startup);}
assert.equal(message.method,'fixture/ready');assert.equal(message.params.pids[0],transport.child.nativePid);
assert.equal(message.params.pids.length,2);for(const pid of message.params.pids)assert.ok(Number.isInteger(pid)&&pid>0);
await writeFile(path.join(root,'owned-pids.json'),JSON.stringify(message.params.pids));
if(mode==='supervisor')process.kill(transport.child.pid,'SIGKILL');
else{
 // Release the real job first, then simulate the missing cleanup receipt for
 // each event entry point without leaking an actual child process.
 assert.equal(await transport.child.stop(),true);
 transport.child.stop=async()=>false;
 if(mode==='stdin')transport.child.stdin.emit('error',Error('fixture'));
 else if(mode==='child')transport.child.emit('error',Error('fixture'));
 else if(mode==='stderr')transport.child.stderr.emit('data',Buffer.alloc(65537));
 else if(mode==='stdout'){transport.closed=false;transport.child.stdout.emit('data',Buffer.from('not-json\n'));}
 else throw Error('Unknown mode');
}
await failed;
assert.ok(errors>0);assert.equal(transport.closed,true);
await assert.rejects(transport.close(),/cleanup is unconfirmed/);
await assert.rejects(transport.close(),/cleanup is unconfirmed/);
await assert.rejects(transport.start(),/closed/);
await assert.rejects(transport.send({jsonrpc:'2.0',id:1,method:'tools/list'}),/closed/);
// The outer test owner independently proves these recorded fixture PIDs gone.
// That physical teardown must not turn the inner refusal into a valid receipt.
assert.equal(transport.child.cleanupConfirmed,mode!=='supervisor');
console.log('survived; cleanup unconfirmed; restart and send blocked');
