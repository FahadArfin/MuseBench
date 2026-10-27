// Real shared preview renderer; synthetic bridge snapshots, never native inference.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export function summarizeSamples(values){
 if(values.some(v=>v!==null&&(!Number.isFinite(v)||v<0)))throw Error('Samples must be nonnegative finite numbers or null.');
 const sorted=values.filter(v=>v!==null).sort((a,b)=>a-b),at=p=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
 return {count:sorted.length,missing:values.length-sorted.length,min:sorted[0]??null,p50:at(.5),p95:at(.95),max:sorted.at(-1)??null,mean:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:null};
}
export function correlatePaints(events,ids){
 return ids.map(id=>{
  const start=events.find(e=>e.name===id+':start'),dom=events.find(e=>e.name===id+':dom'),end=events.find(e=>e.name===id+':end');
  const paint=start&&dom&&end?events.filter(e=>e.name==='Paint'&&e.pid===dom.pid&&e.tid===dom.tid&&e.ts>=dom.ts&&e.ts<=end.ts).sort((a,b)=>a.ts-b.ts)[0]:null;
  return {id,eventToPaintMs:paint?(paint.ts-start.ts)/1000:null,domToPaintMs:paint?(paint.ts-dom.ts)/1000:null};
 });
}
export function parseOptions(args){
 const result={samples:12,turns:[20,100,300],tasks:4,out:path.resolve('artifacts/renderer-performance',String(Date.now()))};
 for(let i=0;i<args.length;i++){
  const key=args[i],value=args[++i];if(value===undefined)throw Error('Missing option value.');
  if(key==='--samples')result.samples=Number(value);
  else if(key==='--turns')result.turns=value.split(',').map(Number);
  else if(key==='--out')result.out=path.resolve(value);
  else throw Error(`Unknown option ${key}. This probe always owns an isolated local preview server.`);
 }
 if(!Number.isInteger(result.samples)||result.samples<1||result.samples>100)throw Error('Use 1–100 samples.');
 if(!result.turns.length||result.turns.length>6||result.turns.some(n=>!Number.isInteger(n)||n<1||n>1000))throw Error('Use 1–6 scenarios, each 1–1000 turns.');
 return result;
}

// Installed before the shared preview entrypoint; no source files or persistent profiles change.
function installProbe(){
 let bridge,state;
 const listeners=new Set();
 Object.defineProperty(window,'musebench',{configurable:true,get:()=>bridge,set:value=>{
  const read=value.getState,subscribe=value.onState;
  bridge={...value,getState:async()=>state?structuredClone(state):read(),onState:listener=>{listeners.add(listener);const off=subscribe(listener);return()=>{listeners.delete(listener);off();};}};
  window.__rendererPerformance={
   async seed(turns,taskCount){
    state=await read();const template=state.task;
    state.tasks=Array.from({length:taskCount},(_,taskIndex)=>{
     const task=structuredClone(template);task.id=`performance-task-${taskIndex}`;task.title=`Performance task ${taskIndex+1}`;task.runs=[];task.changes=[];task.executionReceipts=[];task.goal=undefined;
     task.messages=Array.from({length:turns*2},(_,index)=>({id:`perf-${taskIndex}-${index}`,role:index%2?'assistant':'user',at:new Date(1760000000000+index*1000).toISOString(),text:index%2?`### Result ${index}\n\n`+'The renderer preserves the conversation, task state, and source context while progress arrives. '.repeat(8)+`\n\n- Check ${index}\n- Keep keyboard access\n\n\`\`\`js\nconst result = { ready: true, step: ${index} };\n\`\`\``:`Request ${index}: review this implementation and explain the checks. `+'Preserve existing behavior. '.repeat(6)}));
     task.request=task.messages[0].text;task.runtimeComplete=false;return task;
    });
    state.task=state.tasks[0];state.runtime={...state.runtime,status:'running',foregroundActive:true};
    for(const listener of listeners)listener(structuredClone(state));
    return {messagesPerTask:turns*2,tasks:taskCount,serializedBytes:new TextEncoder().encode(JSON.stringify(state)).length};
   },
   async sample(id){
    const transcript=document.querySelector('.conversation-transcript');if(!transcript)throw Error('Missing shared transcript.');
    const marker=`RENDERER-PROBE-${id}`;
    return new Promise((resolve,reject)=>{
     const started=performance.now();performance.mark(id+':start');let committed=false;
     const timer=setTimeout(()=>{observer.disconnect();reject(Error('Renderer sample timed out.'));},15000);
     const observer=new MutationObserver(()=>{
      if(committed||!transcript.textContent.includes(marker))return;committed=true;observer.disconnect();
      const eventToDomMs=performance.now()-started;performance.mark(id+':dom');
      // rAF runs before paint. The second callback is a frame-opportunity proxy,
      // while the separate CDP Paint event establishes an observed paint timestamp.
      requestAnimationFrame(()=>{transcript.getBoundingClientRect();requestAnimationFrame(()=>{
       clearTimeout(timer);performance.mark(id+':end');resolve({id,eventToDomMs,eventToFrameOpportunityMs:performance.now()-started});
      });});
     });
     observer.observe(transcript,{subtree:true,childList:true,characterData:true});
     for(const task of state.tasks){task.messages.at(-1).text=`### Streaming update\n\n${marker}\n\n`+'A new progress snapshot is visible. '.repeat(20);task.updatedAt=new Date().toISOString();}
     for(const listener of listeners)listener(structuredClone(state));
    });
   }
  };
 }});
}
async function stopTrace(session){
 const complete=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Trace completion timeout.')),15000);session.once('Tracing.tracingComplete',event=>{clearTimeout(timer);resolve(event);});});
 await session.send('Tracing.end');const {stream}=await complete;
 if(!stream)throw Error('Trace stream unavailable.');
 const chunks=[];let bytes=0;
 try{for(;;){const part=await session.send('IO.read',{handle:stream,size:1024*1024});const chunk=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');bytes+=chunk.length;if(bytes>128*1024*1024)throw Error('Trace exceeds 128 MiB bound.');chunks.push(chunk);if(part.eof)break;}}
 finally{await session.send('IO.close',{handle:stream});}
 return Buffer.concat(chunks);
}
async function sourceIdentity(){
 const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','src/ui','src/shared','src/preview','vite.config.mjs','vite.preview.config.mjs','package.json','package-lock.json'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
 return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
}
export async function runRendererPerformance(options){
 const [{createServer},{chromium}]=await Promise.all([import('vite'),import('playwright')]);
 await mkdir(options.out,{recursive:true});
 let revision='unknown';try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();}catch{}
 const report={version:1,startedAt:new Date().toISOString(),revision,environment:{node:process.version,os:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,systemMemoryBytes:os.totalmem(),viewport:{width:1440,height:960},mode:'headless Chromium; Vite development shared React preview; fresh browser contexts',rendererSource:'src/preview/main.tsx -> src/ui/bootstrap',traceCategories:'devtools.timeline,blink.user_timing'},options,modelRequests:0,errors:[],scenarios:[],limits:['Synthetic full-state snapshots in the actual shared renderer; no Electron IPC/controller/native inference timings.','Paint correlation is the first main-thread Paint after observed transcript mutation; it is not GPU presentation or a node-specific raster completion.','Double requestAnimationFrame is a frame opportunity proxy, not proof of presentation.','Tracing and heap allocation sampling add overhead; no production SLA or before/after speedup is inferred.','Observed heap maximum is sampled V8 used heap, not true peak memory, renderer RSS, GPU memory, or a leak test.','Four tasks update together; only the selected task transcript is rendered.']};
 let server,browser;
 try{
  report.sourceSha256=await sourceIdentity();report.workingTreeDirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim());
  server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-renderer-performance',server:{host:'127.0.0.1',port:0,strictPort:true,open:false}});await server.listen();
  const address=server.httpServer.address(),origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true});report.environment.browser=browser.version();
  for(const turns of options.turns){
   const context=await browser.newContext({viewport:report.environment.viewport});
   try{
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.addInitScript(installProbe);await page.goto(origin+'/preview.html',{waitUntil:'networkidle',timeout:60000});
    await page.locator('.conversation-transcript').waitFor();
    const cdp=await context.newCDPSession(page);
    const initialHeap=await cdp.send('Runtime.getHeapUsage');
    const workload=await page.evaluate(({turns,tasks})=>window.__rendererPerformance.seed(turns,tasks),{turns,tasks:options.tasks});
    await page.waitForFunction(turns=>document.querySelectorAll('.assistant-message').length===turns,turns);
    await page.evaluate(()=>{const transcript=document.querySelector('.conversation-transcript');transcript.scrollTop=transcript.scrollHeight;});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    // Warm one React update before recording; GC is outside measured samples.
    await page.evaluate(()=>window.__rendererPerformance.sample('warmup'));
    await cdp.send('HeapProfiler.collectGarbage');const retainedBefore=await cdp.send('Runtime.getHeapUsage');
    await cdp.send('HeapProfiler.startSampling',{samplingInterval:32768});
    await cdp.send('Tracing.start',{categories:report.environment.traceCategories,transferMode:'ReturnAsStream'});
    const samples=[],heapSamples=[];
    for(let index=0;index<options.samples;index++){
     samples.push(await page.evaluate(id=>window.__rendererPerformance.sample(id),`probe-${turns}-${index}`));
     heapSamples.push(await cdp.send('Runtime.getHeapUsage'));
    }
    const rawTrace=await stopTrace(cdp),trace=JSON.parse(rawTrace),paints=correlatePaints(trace.traceEvents,samples.map(s=>s.id));
    const allocationProfile=await cdp.send('HeapProfiler.stopSampling');
    await cdp.send('HeapProfiler.collectGarbage');const retainedAfter=await cdp.send('Runtime.getHeapUsage');
    const dom=await page.evaluate(()=>({elements:document.querySelectorAll('*').length,messages:document.querySelectorAll('.message').length,assistantMessages:document.querySelectorAll('.assistant-message').length,transcriptHeight:document.querySelector('.conversation-transcript').scrollHeight,visibleText:document.querySelector('.conversation-transcript').textContent.includes('RENDERER-PROBE-')}));
    assert.equal(dom.assistantMessages,turns);assert.equal(dom.visibleText,true);
    for(const sample of samples)Object.assign(sample,paints.find(p=>p.id===sample.id));
    const scenario={turns,...workload,dom,samples,latency:{eventToDomMs:summarizeSamples(samples.map(s=>s.eventToDomMs)),eventToFrameOpportunityMs:summarizeSamples(samples.map(s=>s.eventToFrameOpportunityMs)),eventToPaintMs:summarizeSamples(samples.map(s=>s.eventToPaintMs))},heap:{initial:initialHeap,retainedBefore,retainedAfter,samples:heapSamples,observedMaxUsedBytes:Math.max(retainedBefore.usedSize,...heapSamples.map(h=>h.usedSize)),retainedDeltaBytes:retainedAfter.usedSize-retainedBefore.usedSize},artifacts:{trace:`${turns}-turns.trace.json`,allocations:`${turns}-turns.allocations.json`,screenshot:`${turns}-turns.png`}};
    await writeFile(path.join(options.out,scenario.artifacts.trace),rawTrace);await writeFile(path.join(options.out,scenario.artifacts.allocations),JSON.stringify(allocationProfile));
    await page.screenshot({path:path.join(options.out,scenario.artifacts.screenshot)});report.scenarios.push(scenario);
    console.log(JSON.stringify({turns,messages:workload.messagesPerTask,eventToPaintMs:scenario.latency.eventToPaintMs,observedMaxHeapMiB:scenario.heap.observedMaxUsedBytes/1048576}));
   }finally{await context.close();}
  }
  report.sourceChangedDuringRun=JSON.stringify(report.sourceSha256)!==JSON.stringify(await sourceIdentity());
  assert.equal(report.sourceChangedDuringRun,false,'Shared renderer sources changed during measurement; rerun with stable sources.');
  assert.deepEqual(report.errors,[]);report.status='measured';
 }catch(error){report.status='failed';report.failure=String(error.stack??error);throw error;}
 finally{if(browser)await browser.close();if(server)await server.close();report.finishedAt=new Date().toISOString();await writeFile(path.join(options.out,'report.json'),JSON.stringify(report,null,2));console.log(`Report: ${path.join(options.out,'report.json')}`);}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)runRendererPerformance(parseOptions(process.argv.slice(2))).catch(error=>{console.error(error.message);process.exitCode=1;});
