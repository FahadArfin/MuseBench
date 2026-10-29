import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createController} from '../src/controller/index.mjs';

const directory=path.resolve(process.argv[2]??'artifacts/runtime-status/measurement');await mkdir(directory,{recursive:true});
const results=[];
for(const count of [20,100]){
 const root=await mkdtemp(path.join(directory,'case-')),project=path.join(root,'project');await mkdir(project);
 let full=0,compact=0;const runtimes=[];
 const factory=()=>{
  const state={status:'unavailable',cleanup:'confirmed',permissionVerified:false,messages:[]};
  const runtime={state,snapshot(){full++;return structuredClone(state);},statusSnapshot(){compact++;return{status:state.status,cleanup:state.cleanup,pending:!!state.pending,childrenBusy:!!state.childrenBusy,operationBusy:!!state.operationBusy};},subscribe:()=>()=>{},async disconnect(){}};
  runtimes.push(runtime);return runtime;
 };
 const controller=await createController({dataDir:path.join(root,'data'),runtimeFactory:factory});
 const act=async input=>{const state=await controller.dispatch(input);assert.equal(state.error,null);return state;};
 try{
  await act({type:'openProject',path:project});for(let i=0;i<count;i++)await act({type:'newTask',mode:'manual',request:'Synthetic retained chat '+i});
  for(const runtime of runtimes)runtime.state.messages=Array.from({length:10},(_,i)=>({id:'message-'+i,text:'Fictional retained text. '.repeat(200).slice(0,4000)}));
  const measure=async(name,samples,action)=>{
   for(let i=0;i<3;i++)await action();full=0;compact=0;const times=[];
   for(let i=0;i<samples;i++){const start=performance.now();const state=await action();times.push(performance.now()-start);assert.equal(state.tasks.length,count);assert.ok(state.tasks.every(t=>t.runtimeStatus==='unavailable'&&t.runtimeBusy===false));}
   times.sort((a,b)=>a-b);return{name,samples,medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.ceil(times.length*0.95)-1],fullSnapshots:full,compactReads:compact};
  };
  results.push({contexts:count,messagesPerRuntime:10,charactersPerMessage:4000,fixture:root,measurements:[await measure('getState',20,()=>controller.getState()),await measure('dispatch(clearError)',10,()=>act({type:'clearError'}))]});
 }finally{await controller.close();}
}
const report={at:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),kind:'isolated synthetic runtime status reads; no model requests',results};
await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
