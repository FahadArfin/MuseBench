// Offline by default. Command adapters are arbitrary programs, never a provider sandbox.
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import os from 'node:os';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw Error(message);};
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const nonempty=value=>typeof value==='string'&&value.length>0&&value.length<=100000;
const unique=items=>new Set(items).size===items.length;
export function validateManifest(m) {
 if(m?.version!==1||!integer(m.seed,0,0xffffffff)||!integer(m.repetitions,2,100))fail('Use version 1, an unsigned integer seed, and 2–100 repetitions.');
 if(!Array.isArray(m.tasks)||m.tasks.length<1||m.tasks.length>100||!unique(m.tasks.map(t=>t.id)))fail('Provide 1–100 tasks with unique IDs.');
 if(!Array.isArray(m.arms)||m.arms.length!==2||!unique(m.arms.map(a=>a.id)))fail('Provide exactly two distinct arms; first is baseline.');
 for(const task of m.tasks){
  if(!nonempty(task.id)||!nonempty(task.input))fail('Each task requires an ID and input.');
  const e=task.expected;
  if(!e||Object.keys(e).some(k=>!['exact','contains','excludes'].includes(k)))fail('Expected assertions must be exact, contains or excludes.');
  if(e.exact!==undefined&&typeof e.exact!=='string')fail('exact must be a string.');
  for(const k of ['contains','excludes'])if(e[k]!==undefined&&(!Array.isArray(e[k])||e[k].length>100||!e[k].every(nonempty)))fail(`${k} must be a bounded string array.`);
  if(e.exact===undefined&&!(e.contains?.length||e.excludes?.length))fail('Each task needs an independent expected assertion.');
 }
 for(const arm of m.arms){
  if(!nonempty(arm.id)||Boolean(arm.command)===Boolean(arm.artifacts))fail('Each arm needs an ID and exactly one command or artifact map.');
  if(arm.command){const c=arm.command;if(!nonempty(c.file)||!Array.isArray(c.args)||c.args.some(a=>typeof a!=='string')||!nonempty(c.cwd))fail('Commands require file, string args, and explicit cwd.');}
  else {
   const all=[];
   for(const task of m.tasks){const files=arm.artifacts[task.id];if(!Array.isArray(files)||files.length!==m.repetitions||!files.every(nonempty))fail('Provide one artifact per task and repetition.');all.push(...files);}
   if(!unique(all.map(p=>path.resolve(p))))fail('Each arm requires distinct artifact paths per task and repetition; replay is not a new model sample.');
  }
 }
 return m;
}
export function scheduleRuns(m) {
 validateManifest(m);let seed=m.seed;
 const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/0x100000000;};
 const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
 const schedule=[];
 for(let repeat=0;repeat<m.repetitions;repeat++)for(const task of shuffle([...m.tasks]))for(const arm of shuffle([...m.arms]))schedule.push({repeat,taskId:task.id,armId:arm.id});
 return schedule;
}
export function scoreOutput(output,expected) {
 const checks=[];
 if(expected.exact!==undefined)checks.push({kind:'exact',passed:output===expected.exact});
 for(const text of expected.contains??[])checks.push({kind:'contains',passed:output.includes(text)});
 for(const text of expected.excludes??[])checks.push({kind:'excludes',passed:!output.includes(text)});
 const passed=checks.filter(c=>c.passed).length;
 return {passed,total:checks.length,score:passed/checks.length,checks};
}
function normalizeArtifact(artifact){
 if(typeof artifact?.output!=='string')fail('Adapter result requires a string output.');
 const usage={};
 for(const key of ['inputTokens','outputTokens','costUsd']){
  const value=artifact.usage?.[key];
  if(value!=null&&(!Number.isFinite(value)||value<0||(key!=='costUsd'&&!Number.isSafeInteger(value))))fail(`Invalid usage.${key}.`);
  usage[key]=value??null;
 }
 if(artifact.latencyMs!=null&&(!Number.isFinite(artifact.latencyMs)||artifact.latencyMs<0))fail('Invalid latencyMs.');
 return {output:artifact.output,usage,reportedLatencyMs:artifact.latencyMs??null};
}
async function boundedRead(file,maxBytes){if((await stat(file)).size>maxBytes)fail('Artifact exceeds maxOutputBytes.');return readFile(file);}
async function runCommand(command,input,budget,baseDir){
 return new Promise((resolve,reject)=>{
  const child=spawn(command.file,command.args,{cwd:path.resolve(baseDir,command.cwd),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const chunks=[];let bytes=0,reason=null,finished=false;
  const stop=message=>{
   if(reason)return;reason=message;
   if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}
   else child.kill('SIGKILL');
  };
  const timer=setTimeout(()=>stop('Command timeout; outcome unknown, no retry.'),budget.timeoutMs);
  // Pipes are bounded, including stderr; logs can contain secrets and are not copied into reports.
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>budget.maxOutputBytes)stop('Command output limit exceeded; outcome unknown.');else chunks.push(chunk);});
  child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>budget.maxOutputBytes)stop('Command output limit exceeded; outcome unknown.');});
  child.stdin.on('error',()=>{});
  child.on('error',error=>{clearTimeout(timer);finished=true;reject(Error(`Command spawn failed: ${error.code??'unknown'}`));});
  child.on('close',code=>{clearTimeout(timer);if(finished)return;finished=true;if(reason||code!==0)reject(Error(reason??`Command exited ${code}.`));else resolve(Buffer.concat(chunks));});
  child.stdin.end(JSON.stringify(input));
 });
}
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export async function runEvaluation(manifest,{baseDir=process.cwd(),execute=false,budget}={}){
 const m=validateManifest(manifest),schedule=scheduleRuns(m),commands=schedule.filter(r=>m.arms.find(a=>a.id===r.armId).command).length;
 if(commands&&!execute)fail('Command arms require --execute. No commands were run.');
 if(commands){
  if(!budget||!integer(budget.maxRuns,1,20000)||budget.maxRuns<commands)fail('Explicit budget.maxRuns must cover all command runs.');
  if(!integer(budget.timeoutMs,50,600000)||!integer(budget.maxOutputBytes,128,10000000))fail('Set timeoutMs (50–600000) and maxOutputBytes (128–10000000).');
 }
 const maxOutputBytes=budget?.maxOutputBytes??10000000;
 // Preflight all artifact paths before any opted-in command can run.
 for(const arm of m.arms)if(arm.artifacts)for(const files of Object.values(arm.artifacts))for(const file of files)await stat(path.resolve(baseDir,file));
 const report={version:1,startedAt:new Date().toISOString(),mode:commands===0?'artifact':commands===schedule.length?'command':'mixed',manifestSha256:hash(JSON.stringify(m)),environment:{node:process.version,platform:process.platform,release:os.release()},seed:m.seed,repetitions:m.repetitions,budget:budget??null,scorer:'frozen case-sensitive literal assertions v1',runs:[],pairs:[],limitations:['Literal assertions are not a general code-quality judge.','Artifact repetitions require independently acquired outputs; provenance is supplied by the experiment owner.','Reported token/cost values are not independently verified billing.','Local command limits do not enforce provider token or monetary budgets.','Command adapters must enforce provider budgets, cancellation and workspace isolation.']};
 for(const entry of schedule){
  const task=m.tasks.find(t=>t.id===entry.taskId),arm=m.arms.find(a=>a.id===entry.armId),start=performance.now();
  const row={...entry,source:arm.command?'command':'artifact',status:'failed',usage:{inputTokens:null,outputTokens:null,costUsd:null}};
  try{
   const raw=arm.command?await runCommand(arm.command,{version:1,taskId:task.id,input:task.input,repeat:entry.repeat,seed:m.seed},budget,baseDir):await boundedRead(path.resolve(baseDir,arm.artifacts[task.id][entry.repeat]),maxOutputBytes);
   row.artifactSha256=hash(raw);const result=normalizeArtifact(JSON.parse(raw));
   Object.assign(row,{status:'scored',outputSha256:hash(result.output),usage:result.usage,reportedLatencyMs:result.reportedLatencyMs,scoring:scoreOutput(result.output,task.expected)});
  }catch(error){row.error=error instanceof SyntaxError?'Invalid adapter JSON.':String(error.message);}
  row.runnerElapsedMs=performance.now()-start;report.runs.push(row);
 }
 for(let repeat=0;repeat<m.repetitions;repeat++)for(const task of m.tasks){
  const [baseline,candidate]=m.arms.map(arm=>report.runs.find(r=>r.repeat===repeat&&r.taskId===task.id&&r.armId===arm.id));
  report.pairs.push({repeat,taskId:task.id,complete:baseline.status==='scored'&&candidate.status==='scored',scoreDelta:baseline.scoring&&candidate.scoring?candidate.scoring.score-baseline.scoring.score:null});
 }
 const complete=report.pairs.filter(p=>p.complete);
 report.summary={completePairs:complete.length,totalPairs:report.pairs.length,meanPairedScoreDelta:mean(complete.map(p=>p.scoreDelta)),arms:Object.fromEntries(m.arms.map(arm=>{
  const rows=report.runs.filter(r=>r.armId===arm.id),usage={};
  for(const key of ['inputTokens','outputTokens','costUsd']){const known=rows.map(r=>r.usage[key]).filter(v=>v!==null);usage[key]={knownRuns:known.length,totalRuns:rows.length,total:known.length===rows.length?known.reduce((a,b)=>a+b,0):null,knownSubtotal:known.length?known.reduce((a,b)=>a+b,0):null};}
  return[arm.id,{scoredRuns:rows.filter(r=>r.status==='scored').length,failedRuns:rows.filter(r=>r.status==='failed').length,meanScore:mean(rows.filter(r=>r.scoring).map(r=>r.scoring.score)),...usage}];
 }))};
 report.finishedAt=new Date().toISOString();return report;
}
async function main(){
 const args=process.argv.slice(2),file=args[0];
 if(!file||args.includes('--help')){console.log('node scripts/harness-eval.mjs manifest.json [--out report.json] [--execute --budget budget.json]');return;}
 const known=new Set(['--out','--budget','--execute']);for(let i=1;i<args.length;i++){if(!known.has(args[i]))fail(`Unknown option ${args[i]}`);if(args[i]!=='--execute'&&!args[++i])fail('Missing option value.');}
 const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
 const manifest=JSON.parse(await readFile(file,'utf8')),budgetFile=option('--budget');
 const report=await runEvaluation(manifest,{baseDir:path.dirname(path.resolve(file)),execute:args.includes('--execute'),budget:budgetFile?JSON.parse(await readFile(budgetFile,'utf8')):undefined});
 const out=path.resolve(option('--out')??`artifacts/harness-eval/${Date.now()}.json`);await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({report:out,summary:report.summary},null,2));
 if(report.runs.some(r=>r.status==='failed'))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
