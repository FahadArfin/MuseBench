import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJobSpawner} from '../src/runtime/windows-job.mjs';
import {spawn} from 'node:child_process';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
test('Windows Job duplex transport pipes stdin and confirms descendant shutdown', {skip:process.platform!=='win32'},async()=>{
 const child=createJobSpawner({helperPath:path.resolve('native/bin/MuseBenchJob.exe'),duplex:true})(process.execPath,['-e',`process.stdin.on('data',b=>process.stdout.write(b));setInterval(()=>{},1000)`],{cwd:process.cwd(),env:process.env});
 child.on('error',()=>{});assert.ok(child.stdin,'duplex exposes child stdin');
 const read=new Promise(resolve=>child.stdout.once('data',resolve));child.stdin.write('fixture-input\n');assert.equal(String(await read),'fixture-input\n');assert.equal(await child.stop(),true);assert.equal(child.cleanupConfirmed,true);
});
test('duplex owner EOF kills the real child and grandchild before any replacement owner', {skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'discovery-parent-death-')),log=path.join(root,'pids');const module=pathToFileURL(path.resolve('src/runtime/windows-job.mjs')).href;
 const script=`import{createJobSpawner}from ${JSON.stringify(module)};const p=createJobSpawner({helperPath:${JSON.stringify(path.resolve('native/bin/MuseBenchJob.exe'))},duplex:true})(process.execPath,[${JSON.stringify(path.resolve('test/fixtures/discovery-server.mjs'))},${JSON.stringify(log)}],{cwd:${JSON.stringify(root)},env:{...process.env,FIXTURE_GRANDCHILD:'1'}});p.on('error',()=>{});setInterval(()=>{},1000);`;
 const owner=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'ignore',windowsHide:true});let records=[];
 try{for(let i=0;i<100;i++){try{records=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);}catch{}if(records.some(r=>r.kind==='grandchild'))break;await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(records.filter(r=>r.kind==='grandchild').length,1);owner.kill('SIGKILL');
 for(let i=0;i<150;i++){if(records.every(row=>{try{process.kill(row.pid,0);return false;}catch{return true;}}))break;await new Promise(resolve=>setTimeout(resolve,20));}for(const row of records)assert.throws(()=>process.kill(row.pid,0));
 }finally{owner.kill();for(const row of records){try{process.kill(row.pid,'SIGKILL');}catch{}}await rm(root,{recursive:true,force:true});}
});
