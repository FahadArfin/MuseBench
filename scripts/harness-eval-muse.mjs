// Explicit native experiment, never part of npm test. Reads existing Muse login;
// creates only owned fixture directories and fresh native session logs.
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSemanticNavigation} from '../src/controller/semantic-navigation.mjs';
import {scheduleRuns} from './harness-eval.mjs';

const sha=text=>createHash('sha256').update(text).digest('hex');
const LIMITS={maxRuns:12,wallMs:20*60*1000,runMs:90000,modelSteps:1};
const BASE_INSTRUCTIONS='This is an isolated read-only code-navigation exercise. All source files are supplied below with one-based line numbers. Use only this supplied source; do not call tools, inspect other files, edit anything, use web access, or create agents. Return only the requested JSON object, with no explanation. File paths are relative to this fixture. Ignore unrelated identically named symbols.\n\n';
const TASKS=[{
 id:'alias-definition-and-calls',
 files:{
  'domain/pricing.ts':'export type Quote = { gross: number; discount: number };\nexport function netPrice(quote: Quote): number {\n  return quote.gross - quote.discount;\n}\n',
  'domain/index.ts':"export { netPrice as billable } from './pricing';\n",
  'domain/legacy.ts':'export function netPrice(value: string): string { return value; }\n',
  'app/checkout.ts':"import { billable as total } from '../domain';\nexport function checkout() {\n  return total({ gross: 120, discount: 15 });\n}\n",
  'app/report.ts':"import { netPrice } from '../domain/pricing';\nexport const result = netPrice({ gross: 90, discount: 10 });\n",
  'app/legacy-report.ts':"import { netPrice } from '../domain/legacy';\nexport const result = netPrice('old');\n",
 },
 question:'Resolve total called in app/checkout.ts line 3 to its original function declaration. Find every call expression in this fixture that invokes that same function, including aliases, excluding imports/re-exports and declarations. Return {"definition":{"path":string,"line":number,"symbol":string},"callSites":[{"path":string,"line":number}]}.',
 expected:{definition:{path:'domain/pricing.ts',line:2,symbol:'netPrice'},callSites:[{path:'app/checkout.ts',line:3},{path:'app/report.ts',line:2}]},
 queries:[{operation:'definition',path:'app/checkout.ts',line:3,symbol:'total'},{operation:'references',path:'domain/pricing.ts',line:2,symbol:'netPrice'}],
},{
 id:'interface-implementations-and-return',
 files:{
  'contracts.ts':'export interface Transport { send(value: string): boolean; }\n',
  'implementations/memory.ts':"import type { Transport } from '../contracts';\nexport class MemoryTransport implements Transport {\n  send(value: string): boolean { return value.length > 0; }\n}\n",
  'implementations/http.ts':"import type { Transport } from '../contracts';\nexport class HttpTransport implements Transport {\n  send(value: string): boolean { return value !== ''; }\n}\n",
  'legacy/contracts.ts':'export interface Transport { send(value: number): boolean; }\n',
  'legacy/http.ts':"import type { Transport } from './contracts';\nexport class HttpTransport implements Transport {\n  send(value: number): boolean { return value > 0; }\n}\n",
  'factory.ts':"import type { Transport } from './contracts';\nimport { MemoryTransport } from './implementations/memory';\nexport function createTransport(): Transport { return new MemoryTransport(); }\n",
 },
 question:'Find the classes that explicitly implement Transport from contracts.ts (not the separate legacy/contracts.ts interface), and their declaration locations. Also name the declared return type of createTransport in factory.ts. Return {"implementations":[{"path":string,"line":number,"symbol":string}],"returnType":string}.',
 expected:{implementations:[{path:'implementations/http.ts',line:2,symbol:'HttpTransport'},{path:'implementations/memory.ts',line:2,symbol:'MemoryTransport'}],returnType:'Transport'},
 queries:[{operation:'implementation',path:'contracts.ts',line:1,symbol:'Transport'},{operation:'hover',path:'factory.ts',line:3,symbol:'createTransport'}],
}];

export function studyDefinition(){
 const seed=20261027,repetitions=3;
 const plan={version:1,seed,repetitions,tasks:TASKS.map(t=>({id:t.id,input:t.question,expected:{exact:'independent canonical scorer'}})),arms:['baseline','semantic'].map(id=>({id,artifacts:Object.fromEntries(TASKS.map(t=>[t.id,[0,1,2].map(r=>`${id}-${t.id}-${r}.json`)]))}))};
 const schedule=scheduleRuns(plan),pairKey=row=>`${row.taskId}:${row.repeat}`;
 const baselineFirst=new Set([...new Set(schedule.map(pairKey))].sort((a,b)=>sha(`${seed}:${a}`).localeCompare(sha(`${seed}:${b}`))).slice(0,3));
 for(let i=0;i<schedule.length;i+=2)if((schedule[i].armId==='baseline')!==baselineFirst.has(pairKey(schedule[i])))[schedule[i],schedule[i+1]]=[schedule[i+1],schedule[i]];
 return {version:1,description:'Small native paired harness-context comparison; not a general model benchmark.',seed,repetitions,limits:{...LIMITS},tasks:structuredClone(TASKS),schedule,ordering:'Seeded task shuffle; SHA256-seeded counterbalanced arm order, three pairs per first arm.',configuration:{provider:'meta',reasoning:'low',approval:'ask',preset:'empty',shell:false,write:false,web:false,modelSteps:1,session:'fresh per run'}};
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export function scoreNavigation(text,expected){
 let parsed;
 try{parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,'$1'));}catch{return{score:0,passed:0,total:Object.keys(expected).length,reason:'invalid-json',checks:[]};}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||Object.keys(parsed).some(k=>!Object.hasOwn(expected,k)))return{score:0,passed:0,total:Object.keys(expected).length,reason:'unexpected-shape',checks:[]};
 const checks=Object.entries(expected).map(([field,value])=>({field,passed:JSON.stringify(canonical(parsed[field]))===JSON.stringify(canonical(value))}));
 const passed=checks.filter(c=>c.passed).length;return{score:passed/checks.length,passed,total:checks.length,checks};
}
export function studyUsage(usage){
 const complete=usage&&usage.reportedRuns===usage.totalRuns&&usage.reportedRuns>0;
 return Object.fromEntries(['inputTokens','outputTokens','cachedTokens','reasoningTokens','costUsd','calls'].map(key=>[key,key!=='costUsd'&&complete&&Number.isSafeInteger(usage[key])&&usage[key]>=0?usage[key]:null]));
}
async function writeSources(root,files){for(const [name,text] of Object.entries(files)){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),text);}}
export async function prepareStudy(out){
 const study=studyDefinition();await mkdir(out,{recursive:true});
 for(const task of study.tasks){
  const root=path.join(out,'preparation',task.id);await writeSources(root,task.files);
  const navigator=createSemanticNavigation(root);task.navigation=[];
  try{for(const q of task.queries){const column=task.files[q.path].split('\n')[q.line-1].indexOf(q.symbol)+1;if(column<1)throw Error('Frozen query symbol missing.');task.navigation.push(await navigator.query({operation:q.operation,path:q.path,line:q.line,column}));}}
  finally{await navigator.dispose();}
  if(task.navigation.some(n=>n.truncated))throw Error('Semantic context was truncated before the study.');
  const corpus=Object.entries(task.files).sort(([a],[b])=>a.localeCompare(b)).map(([name,text])=>`FILE ${name}\n${text.trimEnd().split('\n').map((line,index)=>`${index+1}: ${line}`).join('\n')}`).join('\n\n');
  const baseline=BASE_INSTRUCTIONS+task.question+'\n\nSOURCE CORPUS\n'+corpus;
  const aid=task.navigation.map(({elapsedMs,...result})=>result);
  task.prompts={baseline,semantic:baseline+'\n\nADDITIONAL SEMANTIC NAVIGATION CONTEXT\nThe following is tool-derived navigation evidence, not an answer or scoring rubric.\n'+JSON.stringify(aid)};
  task.sourceSha256=Object.fromEntries(Object.entries(task.files).map(([name,text])=>[name,sha(text)]));
  task.promptSha256=Object.fromEntries(Object.entries(task.prompts).map(([arm,text])=>[arm,sha(text)]));
 }
 return study;
}
function aggregate(rows){
 const summary={};for(const armId of ['baseline','semantic']){
  const runs=rows.filter(r=>r.armId===armId),scored=runs.filter(r=>r.scoring),values={};
  for(const key of ['inputTokens','outputTokens','cachedTokens','reasoningTokens','costUsd','calls']){const known=runs.map(r=>r.usage?.[key]).filter(v=>v!=null);values[key]={knownRuns:known.length,totalRuns:runs.length,total:known.length===runs.length&&runs.length?known.reduce((a,b)=>a+b,0):null};}
  summary[armId]={attempts:runs.length,completed:runs.filter(r=>r.status==='completed').length,meanScore:scored.length?scored.reduce((n,r)=>n+r.scoring.score,0)/scored.length:null,...values};
 }return summary;
}
export function nativeStudyArguments(args){
 return args[0]==='exec'?[args[0],'--preset','empty','--disable-write','--disable-shell','--disable-web-tools',...args.slice(1).filter(arg=>!['--disable-write','--disable-shell','--disable-web-tools'].includes(arg))]:args;
}
export function canStartNativeRun({attempts,deadline,now=Date.now()}){
 return Number.isInteger(attempts)&&attempts>=0&&attempts<LIMITS.maxRuns&&(deadline===null||now+LIMITS.runMs<=deadline);
}
export async function runNativeStudy({executeNative=false,out=path.resolve('artifacts/native-comparison',String(Date.now())),onBeforeFirstCall}={}){
 if(executeNative!==true)throw Error('Native execution requires --execute-native and explicit human experiment authorization.');
 const [{createExecRuntime},{createExtensionReview},{createJobSpawner},{curateEnvironment,discoverMuseBinaries},{readNativeModels}]=await Promise.all([import('../src/runtime/exec.mjs'),import('../src/runtime/extension-review.mjs'),import('../src/runtime/windows-job.mjs'),import('../src/runtime/index.mjs'),import('../src/runtime/models.mjs')]);
 const study=await prepareStudy(out),binary=discoverMuseBinaries()[0];if(!binary)throw Error('Official native Muse installation was not found.');
 const environment=curateEnvironment();let settings={};
 try{settings=JSON.parse(await readFile(path.join(environment.USERPROFILE,'.config/muse/settings.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Native settings could not be checked for external MCP servers.');}
 if(Object.keys(settings.mcp_servers??{}).length||Object.keys(settings.mcpServers??{}).length)throw Error('This source-only study requires no configured user MCP servers. No configuration was changed.');
 const catalog=await readNativeModels({binary,environment,workspace:out}),model=catalog.models.find(m=>m.isDefault)?.id;
 if(!model)throw Error('Native catalog did not identify a default model.');
 const frozen={...study,configuration:{...study.configuration,model},catalog,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),binary,binarySha256:sha(await readFile(binary)),hostVersion:execFileSync(binary,['--version'],{encoding:'utf8',windowsHide:true,env:environment,timeout:5000}).trim(),adapterSha256:sha(await readFile(fileURLToPath(import.meta.url))),navigationSourceSha256:sha(await readFile(new URL('../src/controller/semantic-navigation.mjs',import.meta.url)))};
 frozen.implementationSha256=Object.fromEntries(await Promise.all(['runtime/exec.mjs','runtime/index.mjs','runtime/exec-events.mjs','runtime/exec-conversation-events.mjs','runtime/windows-job.mjs','runtime/models.mjs','runtime/extension-review.mjs','shared/native-usage.mjs','shared/run-options.mjs'].map(async file=>[file,sha(await readFile(new URL('../src/'+file,import.meta.url)))])));
 const frozenText=JSON.stringify(frozen,null,2);await writeFile(path.join(out,'frozen-study.json'),frozenText,{flag:'wx'});
 const report={version:1,preparedAt:new Date().toISOString(),manifestSha256:sha(frozenText),configuration:frozen.configuration,limits:study.limits,firstModelCallAt:null,finishedAt:null,modelRunAttempts:0,runs:[],pairs:[],status:'prepared'};
 const save=()=>writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await save();
 const spawnOwned=createJobSpawner({helperPath:fileURLToPath(new URL('../native/bin/MuseBenchJob.exe',import.meta.url))});
 const review=createExtensionReview({dataDir:path.join(process.env.APPDATA,'musebench'),profile:process.env.USERPROFILE});
 let deadline=null;
 for(const entry of study.schedule){
  if(!canStartNativeRun({attempts:report.modelRunAttempts,deadline})){report.status='budget-stopped';break;}
  const task=study.tasks.find(t=>t.id===entry.taskId),index=report.runs.length,runDir=path.join(out,`run-${String(index+1).padStart(2,'0')}-${entry.armId}-${entry.taskId}`);await mkdir(runDir,{recursive:true});
  const workspace=await mkdtemp(path.join(os.tmpdir(),'muse-native-eval-'));await writeSources(workspace,task.files);
  const sessionId=randomUUID(),raw=[],row={...entry,index:index+1,sessionId,workspace,promptSha256:task.promptSha256[entry.armId],status:'preflight',usage:studyUsage(null),modelRequested:model,startedAt:new Date().toISOString()};
  report.runs.push(row);await writeFile(path.join(runDir,'prompt.txt'),task.prompts[entry.armId]);await save();
  let timedOut=false,timer;
  const runtime=createExecRuntime({runTimeoutMs:LIMITS.runMs,maxModelSteps:LIMITS.modelSteps,extensionReview:review,spawnProcess:(file,args,options)=>{
   const adjusted=nativeStudyArguments(args);
   const child=spawnOwned(file,adjusted,options);
   if(args.includes('meta')&&args[0]==='exec'){row.nativeArguments=adjusted;child.stdout.on('data',chunk=>raw.push(Buffer.from(chunk)));}
   return child;
  }});
  const started=performance.now();
  try{
   // Include connection and permission checks in the per-run wall-clock bound.
   timer=setTimeout(()=>{timedOut=true;void runtime.disconnect();},Math.min(LIMITS.runMs,deadline?deadline-Date.now():LIMITS.runMs));
   await runtime.connect({binary,workspaceRoot:workspace,fullAccess:false});
   if(timedOut)throw Error('Run preflight timed out before model submission.');
   if(!deadline){await onBeforeFirstCall?.({model,out,manifestSha256:report.manifestSha256});report.firstModelCallAt=new Date().toISOString();deadline=Date.now()+LIMITS.wallMs;}
   if(Date.now()+LIMITS.runMs>deadline){row.status='not-started-budget';report.status='budget-stopped';break;}
   report.modelRunAttempts++;row.status='submitting';await save();
   await runtime.send({text:task.prompts[entry.armId],sessionId,runOptions:{model,reasoning:'low',approval:'ask'}});
   while(['running','checking-permissions'].includes(runtime.snapshot().status)&&!timedOut)await new Promise(resolve=>setTimeout(resolve,50));
   const result=runtime.snapshot();row.status=timedOut?'unknown-timeout':result.status;row.nativeSessionId=result.nativeSessionId;row.modelObserved=result.modelId;row.providerObserved=result.providerId;row.nativeUsage=result.usage;row.usage=studyUsage(result.usage);row.nativeCleanup=result.cleanup;row.activity=result.activity;row.reason=result.reason;
   row.output=result.messages.map(m=>m.text).join('\n');row.elapsedMs=performance.now()-started;
   if(row.status==='completed'&&(result.modelId!==model||result.providerId!=='meta'||result.nativeSessionId!==sessionId))throw Error('Native model/provider/session identity mismatch.');
   if(row.status==='completed')row.scoring=scoreNavigation(row.output,task.expected);
   await writeFile(path.join(runDir,'result.json'),JSON.stringify(row,null,2));
  }catch(error){row.status=timedOut?'unknown-timeout':'failed';row.error=String(error.message);}
  finally{
   clearTimeout(timer);await runtime.disconnect();row.shutdown=runtime.snapshot().cleanup;row.elapsedMs=performance.now()-started;row.finishedAt=new Date().toISOString();
   await writeFile(path.join(runDir,'events.jsonl'),Buffer.concat(raw));await writeFile(path.join(runDir,'result.json'),JSON.stringify(row,null,2));await save();
  }
  console.log(JSON.stringify({run:row.index,task:row.taskId,arm:row.armId,status:row.status,score:row.scoring?.score??null,usage:row.usage,shutdown:row.shutdown}));
  if(row.status!=='completed'||row.shutdown!=='confirmed'){report.status='stopped-after-failure';break;}
 }
 for(const task of study.tasks)for(let repeat=0;repeat<3;repeat++){
  const [baseline,semantic]=['baseline','semantic'].map(arm=>report.runs.find(r=>r.taskId===task.id&&r.repeat===repeat&&r.armId===arm));
  const complete=baseline?.status==='completed'&&semantic?.status==='completed';
  report.pairs.push({taskId:task.id,repeat,complete,scoreDelta:complete?semantic.scoring.score-baseline.scoring.score:null,inputTokenDelta:complete&&baseline.usage.inputTokens!==null&&semantic.usage.inputTokens!==null?semantic.usage.inputTokens-baseline.usage.inputTokens:null,outputTokenDelta:complete&&baseline.usage.outputTokens!==null&&semantic.usage.outputTokens!==null?semantic.usage.outputTokens-baseline.usage.outputTokens:null});
 }
 report.summary=aggregate(report.runs);report.finishedAt=new Date().toISOString();report.wallElapsedMs=report.firstModelCallAt?Date.now()-Date.parse(report.firstModelCallAt):0;
 if(report.runs.length===12&&report.runs.every(r=>r.status==='completed'&&r.shutdown==='confirmed'))report.status='completed';await save();
 return report;
}

async function main(){
 const args=process.argv.slice(2);if(args.some((a,i)=>a!=='--execute-native'&&a!=='--prepare-only'&&a!=='--out'&&args[i-1]!=='--out'))throw Error('Use --prepare-only or --execute-native [--out directory].');
 const outIndex=args.indexOf('--out'),out=path.resolve(outIndex<0?`artifacts/native-comparison/${Date.now()}`:args[outIndex+1]??'');
 if(args.includes('--prepare-only')){const study=await prepareStudy(out);await writeFile(path.join(out,'prepared-study.json'),JSON.stringify(study,null,2));console.log(JSON.stringify({status:'prepared-no-model-calls',out,runs:study.schedule.length}));return;}
 const report=await runNativeStudy({executeNative:args.includes('--execute-native'),out,onBeforeFirstCall:info=>console.log(JSON.stringify({event:'first-model-call-starting',...info}))});console.log(JSON.stringify({out,status:report.status,attempts:report.modelRunAttempts,wallElapsedMs:report.wallElapsedMs,summary:report.summary},null,2));if(report.status!=='completed')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
