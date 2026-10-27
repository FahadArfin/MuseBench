import {createController} from '../src/controller/index.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {performance} from 'node:perf_hooks';
const dir=await mkdtemp(join(tmpdir(),'muse-events-')),runtimes=[];
const make=()=>{let state={status:'unavailable',transport:'exec',messages:[],cleanup:'confirmed'},listeners=[];const r={snapshot:()=>structuredClone(state),subscribe(fn){listeners.push(fn);return()=>{};},emit(p){state={...state,...p};listeners.forEach(fn=>fn(state));},async connect(){r.emit({status:'idle',permissionVerified:true});},async send(){r.emit({status:'running',runId:null,cleanup:undefined});r.emit({runId:crypto.randomUUID()});},async disconnect(){r.emit({status:'unavailable',cleanup:'confirmed'});}};runtimes.push(r);return r;};
const c=await createController({dataDir:join(dir,'data'),runtime:make(),runtimeFactory:make});
try{
 for(let i=0;i<4;i++){const root=join(dir,'project-'+i);await mkdir(root);await writeFile(join(root,'notes.md'),'Benchmark');await c.dispatch({type:'openProject',path:root});await c.dispatch({type:'newTask',mode:'muse',request:'Benchmark task'});const result=await c.dispatch({type:'sendMessage',text:'Observe this synthetic stream'});if(result.error)throw Error(result.error);}
 const active=runtimes.filter(r=>r.snapshot().status==='running');let snapshots=0,serializedBytes=0;c.subscribe(s=>{snapshots++;serializedBytes+=Buffer.byteLength(JSON.stringify(s));});
 const start=performance.now();for(let i=0;i<200;i++){const r=active[i%4];r.emit({messages:Array.from({length:60},(_,j)=>({id:`m${j}`,kind:'agentMessage',text:'Historical context '.repeat(60)+(j===59?` delta ${i}`:'')}))});}
 const burstMs=performance.now()-start;for(const r of active)r.emit({status:'completed',cleanup:'confirmed'});await new Promise(r=>setTimeout(r,60));
 console.log(JSON.stringify({activeTasks:active.length,events:200,messagesPerTask:60,burstMs:Math.round(burstMs),snapshots,serializedBytes,lastTaskMessages:c.getState().task.messages.length},null,2));
}finally{await c.close();await rm(dir,{recursive:true,force:true});}
