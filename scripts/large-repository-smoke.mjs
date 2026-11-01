// Opt-in synthetic scale evidence. No account, network or model requests.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {createSourceSnapshots} from '../src/controller/source-snapshots.mjs';

const output=path.resolve('artifacts/large-repository');await mkdir(output,{recursive:true});
const fixture=await mkdtemp(path.join(tmpdir(),'musebench-scale-')),root=path.join(fixture,'project');await mkdir(root);
const store=createSourceSnapshots({directory:path.join(fixture,'objects')}),delay=monitorEventLoopDelay({resolution:20});let peakRSS=process.memoryUsage().rss;
const sampler=setInterval(()=>{peakRSS=Math.max(peakRSS,process.memoryUsage().rss);},20);delay.enable();
const report={fixture:'synthetic: 22,100 small files, 32 sparse 200 MiB binary assets, 37 MiB text',modelRequests:0};
try{
 const setup=performance.now();
 for(let batch=0;batch<22100;batch+=50)await Promise.all(Array.from({length:Math.min(50,22100-batch)},(_,index)=>writeFile(path.join(root,`source-${String(batch+index).padStart(5,'0')}.txt`),'// synthetic source\n')));
 for(let i=0;i<32;i++){const handle=await open(path.join(root,`asset-${i}.bin`),'w');await handle.truncate(200*1024*1024);await handle.close();}
 // Write large JSON-like text in blocks, without holding its body in the harness.
 const large=await open(path.join(root,'inventory.json'),'w');try{const chunk=Buffer.alloc(1024*1024,65);for(let i=0;i<37;i++)await large.writeFile(chunk);}finally{await large.close();}
 report.setupMs=Math.round(performance.now()-setup);console.log('Fixture ready; capturing cold snapshot.');
 let started=performance.now();const cold=await store.snapshot(root);report.coldMs=Math.round(performance.now()-started);report.cold={...store.stats};report.files=Object.keys(cold.files).length;report.manifestBytes=Buffer.byteLength(JSON.stringify(cold));report.totalBytes=Object.values(cold.files).reduce((sum,file)=>sum+file.size,0);
 assert.equal(report.files,22133);assert.ok(report.totalBytes>6*1024**3);assert.ok(report.manifestBytes<8*1024*1024);assert.equal(cold.files['inventory.json'].text,undefined);assert.equal(cold.files['asset-0.bin'].object,undefined);console.log('Cold capture passed; checking incremental refresh.');
 started=performance.now();const warm=await store.snapshot(root);report.warmMs=Math.round(performance.now()-started);report.warm={...store.stats};assert.equal(warm.revision,cold.revision);assert.equal(report.warm.hashedFiles,0);assert.equal(report.warm.reusedFiles,report.files);
 await writeFile(path.join(root,'source-00000.txt'),'// changed source\n');const edited=await store.snapshot(root);assert.notEqual(edited.revision,cold.revision);assert.equal(store.stats.hashedFiles,1);
 report.peakRSSMiB=peakRSS/1048576;report.eventLoopDelayP99Ms=delay.percentile(99)/1e6;report.eventLoopDelayMaxMs=delay.max/1e6;
 assert.ok(report.peakRSSMiB<512,`Peak RSS ${report.peakRSSMiB} MiB`);assert.ok(report.eventLoopDelayP99Ms<250,`p99 event-loop delay ${report.eventLoopDelayP99Ms} ms`);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}finally{clearInterval(sampler);delay.disable();store.close();await writeFile(path.join(output,'scale-report.json'),JSON.stringify(report,null,2));await rm(fixture,{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log(JSON.stringify(report));}
