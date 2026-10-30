// Isolated process: an unhandled rejection must fail this regression naturally.
import assert from 'node:assert/strict';
import path from 'node:path';
import {DiscoveryTransport} from '../../src/runtime/discovery-transport.mjs';
const [mode,root]=process.argv.slice(2);
const transport=new DiscoveryTransport({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:root,env:process.env},{helperPath:path.resolve('native/bin/MuseBenchJob.exe'),sessionId:'fixture'});
let errors=0;transport.onerror=()=>errors++;
await transport.start();
for(let i=0;i<200&&!transport.child.nativePid;i++)await new Promise(resolve=>setTimeout(resolve,10));
assert.ok(transport.child.nativePid);
const pid=transport.child.nativePid;
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
await new Promise(resolve=>setTimeout(resolve,150));
assert.ok(errors>0);assert.equal(transport.closed,true);
await assert.rejects(transport.close(),/cleanup is unconfirmed/);
await assert.rejects(transport.close(),/cleanup is unconfirmed/);
await assert.rejects(transport.start(),/closed/);
await assert.rejects(transport.send({jsonrpc:'2.0',id:1,method:'tools/list'}),/closed/);
assert.throws(()=>process.kill(pid,0));
console.log('survived; cleanup unconfirmed; restart and send blocked');
