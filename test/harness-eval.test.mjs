import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateManifest, scheduleRuns, scoreOutput, runEvaluation} from '../scripts/harness-eval.mjs';

function manifest() {
 return {version:1,seed:42,repetitions:3,tasks:[{id:'sum',input:'2 + 2',expected:{exact:'4'}},{id:'color',input:'Name a blue object',expected:{contains:['blue'],excludes:['red']}}],arms:[{id:'baseline',artifacts:{sum:['b0.json','b1.json','b2.json'],color:['b3.json','b4.json','b5.json']}},{id:'candidate',artifacts:{sum:['c0.json','c1.json','c2.json'],color:['c3.json','c4.json','c5.json']}}]};
}
test('schedules every paired task/repetition once per arm with reproducible randomized order',()=>{
 const m=manifest(),runs=scheduleRuns(m);
 assert.equal(runs.length,12);
 assert.deepEqual(runs,scheduleRuns(m));
 assert.notDeepEqual(runs,scheduleRuns({...m,seed:56}));
 for(let repeat=0;repeat<3;repeat++)for(const taskId of ['sum','color'])assert.deepEqual(runs.filter(r=>r.repeat===repeat&&r.taskId===taskId).map(r=>r.armId).sort(),['baseline','candidate']);
});
test('rejects unbounded, ambiguous or unrepeated experiments before execution',()=>{
 for(const patch of [{repetitions:1},{repetitions:101},{seed:NaN},{arms:[manifest().arms[0]]},{tasks:[]},{tasks:[{id:'x',expected:{}}]}])assert.throws(()=>validateManifest({...manifest(),...patch}));
 const m=manifest();m.arms[0].artifacts.sum=['same.json','same.json','same.json'];assert.throws(()=>validateManifest(m),/distinct/);
});
test('scoring uses frozen task assertions and ignores self-reported scores',()=>{
 assert.deepEqual(scoreOutput('4',{exact:'4'}),{passed:1,total:1,score:1,checks:[{kind:'exact',passed:true}]});
 assert.equal(scoreOutput('red and blue',{contains:['blue'],excludes:['red']}).score,0.5);
 assert.equal(scoreOutput('14',{exact:'4'}).score,0);
});
async function fixture(t,m=manifest()){
 const dir=await mkdtemp(path.join(os.tmpdir(),'musebench-eval-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const arm of m.arms)for(const [task,files] of Object.entries(arm.artifacts??{}))for(const file of files)await writeFile(path.join(dir,file),JSON.stringify({output:task==='sum'?'4':arm.id==='baseline'?'red and blue':'blue sky',score:99,...(arm.id==='baseline'?{usage:{inputTokens:10,outputTokens:2,costUsd:0.001}}:{})}));
 return dir;
}
test('scores paired artifacts, preserves unknown usage and records input provenance',async t=>{
 const m=manifest(),dir=await fixture(t,m),report=await runEvaluation(m,{baseDir:dir});
 assert.equal(report.mode,'artifact');assert.equal(report.runs.length,12);assert.equal(report.pairs.length,6);
 assert.equal(report.summary.meanPairedScoreDelta,0.25);
 assert.equal(report.summary.arms.baseline.costUsd.total,0.006);
 assert.equal(report.summary.arms.candidate.costUsd.total,null);
 assert.equal(report.summary.arms.candidate.costUsd.knownRuns,0);
 assert.equal(report.runs[0].artifactSha256.length,64);
 assert.equal(report.manifestSha256.length,64);
 assert.equal(report.runs.find(r=>r.armId==='candidate').usage.inputTokens,null);
});
test('command arms cannot execute without explicit opt-in and bounded run allowance',async t=>{
 const m=manifest(),dir=await fixture(t,m),marker=path.join(dir,'ran');
 m.arms[1]={id:'candidate',command:{file:process.execPath,args:['-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`],cwd:dir}};
 await assert.rejects(runEvaluation(m,{baseDir:dir}),/execute/);
 await assert.rejects(runEvaluation(m,{baseDir:dir,execute:true,budget:{maxRuns:5,timeoutMs:1000,maxOutputBytes:1000}}),/maxRuns/);
 await assert.rejects(readFile(marker),{code:'ENOENT'});
});
test('live command receives only task input on stdin and cannot self-award quality',async t=>{
 const m=manifest(),dir=await fixture(t,m);
 m.arms[1]={id:'candidate',command:{file:process.execPath,args:['-e',`let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{const v=JSON.parse(text);console.log(JSON.stringify({output:v.taskId==='sum'?'5':'blue sky',score:1,usage:{inputTokens:4}}));});`],cwd:dir}};
 const report=await runEvaluation(m,{baseDir:dir,execute:true,budget:{maxRuns:6,timeoutMs:5000,maxOutputBytes:2000}});
 assert.equal(report.mode,'mixed');assert.equal(report.runs.filter(r=>r.armId==='candidate'&&r.taskId==='sum').every(r=>r.scoring.score===0),true);
 assert.equal(report.runs.find(r=>r.armId==='candidate').usage.costUsd,null);
});
test('malformed usage is rejected instead of inventing savings',async t=>{
 const m=manifest(),dir=await fixture(t,m);await writeFile(path.join(dir,'b0.json'),JSON.stringify({output:'4',usage:{costUsd:-1}}));
 const report=await runEvaluation(m,{baseDir:dir});
 assert.equal(report.runs.filter(r=>r.status==='failed').length,1);assert.equal(report.summary.arms.baseline.costUsd.total,null);
 assert.equal(report.summary.completePairs,5);
});
test('timeouts fail the run and do not silently retry',async t=>{
 const m=manifest(),dir=await fixture(t,m);m.repetitions=2;for(const a of m.arms)for(const k in a.artifacts)a.artifacts[k]=a.artifacts[k].slice(0,2);
 m.arms[1]={id:'candidate',command:{file:process.execPath,args:['-e','setTimeout(()=>{},10000)'],cwd:dir}};
 const report=await runEvaluation(m,{baseDir:dir,execute:true,budget:{maxRuns:4,timeoutMs:100,maxOutputBytes:1000}});
 assert.equal(report.runs.filter(r=>r.armId==='candidate').length,4);assert.equal(report.summary.completePairs,0);
 assert(report.runs.filter(r=>r.armId==='candidate').every(r=>r.error.includes('timeout')));
});
test('oversized command output is bounded and never accepted as a scored result',async t=>{
 const m=manifest(),dir=await fixture(t,m);m.repetitions=2;for(const a of m.arms)for(const k in a.artifacts)a.artifacts[k]=a.artifacts[k].slice(0,2);
 m.arms[1]={id:'candidate',command:{file:process.execPath,args:['-e',`process.stdout.write('x'.repeat(20000));setTimeout(()=>{},10000)`],cwd:dir}};
 const report=await runEvaluation(m,{baseDir:dir,execute:true,budget:{maxRuns:4,timeoutMs:5000,maxOutputBytes:1000}});
 assert.equal(report.summary.completePairs,0);assert(report.runs.filter(r=>r.armId==='candidate').every(r=>r.error.includes('output limit')));
});
test('missing artifact preflight prevents any command from starting',async t=>{
 const m=manifest(),dir=await fixture(t,m),marker=path.join(dir,'unexpected-command');
 m.arms[0]={id:'baseline',command:{file:process.execPath,args:['-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`],cwd:dir}};
 m.arms[1].artifacts.sum[2]='missing.json';
 await assert.rejects(runEvaluation(m,{baseDir:dir,execute:true,budget:{maxRuns:6,timeoutMs:1000,maxOutputBytes:1000}}),{code:'ENOENT'});
 await assert.rejects(readFile(marker),{code:'ENOENT'});
});
