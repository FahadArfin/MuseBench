import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const implementation=await import('../scripts/harness-eval-muse.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});

test('native study uses two frozen independent navigation tasks and a 12-run paired schedule',()=>{
 assert.equal(typeof implementation.studyDefinition,'function','native study definition must exist');
 const study=implementation.studyDefinition();
 assert.equal(study.tasks.length,2);assert.equal(study.schedule.length,12);
 assert.equal(study.schedule.filter((r,i)=>i%2===0&&r.armId==='baseline').length,3);
 for(const task of study.tasks)for(let repeat=0;repeat<3;repeat++)assert.deepEqual(study.schedule.filter(r=>r.taskId===task.id&&r.repeat===repeat).map(r=>r.armId).sort(),['baseline','semantic']);
 assert.equal(study.limits.maxRuns,12);assert.equal(study.limits.wallMs,1200000);assert.equal(study.limits.runMs,90000);
});
test('canonical scoring tolerates formatting and order but rejects incorrect locations and extra keys',()=>{
 assert.equal(typeof implementation.scoreNavigation,'function','native independent scorer must exist');
 const expected={definition:{path:'src/a.ts',line:2},calls:[{path:'b.ts',line:3},{path:'c.ts',line:4}]};
 const correct='```json\n{"calls":[{"line":4,"path":"c.ts"},{"line":3,"path":"b.ts"}],"definition":{"line":2,"path":"src/a.ts"}}\n```';
 assert.equal(implementation.scoreNavigation(correct,expected).score,1);
 assert.equal(implementation.scoreNavigation(JSON.stringify({...expected,definition:{path:'wrong.ts',line:2}}),expected).score,.5);
 assert.equal(implementation.scoreNavigation(JSON.stringify({...expected,score:1}),expected).score,0);
 assert.equal(implementation.scoreNavigation('The answer is '+JSON.stringify(expected),expected).score,0);
});
test('usage totals require all native runs to report counters and never invent cost',()=>{
 assert.equal(typeof implementation.studyUsage,'function','native usage coverage normalizer must exist');
 assert.deepEqual(implementation.studyUsage(null),{inputTokens:null,outputTokens:null,cachedTokens:null,reasoningTokens:null,costUsd:null,calls:null});
 assert.equal(implementation.studyUsage({inputTokens:100,outputTokens:10,cachedTokens:50,reasoningTokens:4,calls:1,reportedRuns:1,totalRuns:2}).inputTokens,null);
 assert.equal(implementation.studyUsage({inputTokens:100,outputTokens:10,cachedTokens:50,reasoningTokens:4,calls:1,reportedRuns:1,totalRuns:1}).inputTokens,100);
});
test('semantic aid is produced by the real worker and both arms retain the identical source corpus',async t=>{
 assert.equal(typeof implementation.prepareStudy,'function','study preparation must exist');
 const out=await mkdtemp(path.join(os.tmpdir(),'muse-native-study-test-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const study=await implementation.prepareStudy(out);
 assert.equal(study.tasks.length,2);
 for(const task of study.tasks){
  assert(task.prompts.semantic.startsWith(task.prompts.baseline));
  assert(task.navigation.length>=2);assert(task.navigation.every(n=>n.engine.startsWith('typescript-')&&n.snapshot.length===64&&!n.truncated));
 }
 const definition=study.tasks[0].navigation.find(n=>n.operation==='definition');
 assert.equal(definition.items[0].path,'domain/pricing.ts');assert.equal(definition.items[0].line,2);
 const impl=study.tasks[1].navigation.find(n=>n.operation==='implementation');
 assert.deepEqual(impl.items.map(i=>i.path).sort(),['implementations/http.ts','implementations/memory.ts']);
});
test('native execution cannot start without explicit opt-in',async()=>{
 assert.equal(typeof implementation.runNativeStudy,'function','native runner must exist');
 await assert.rejects(implementation.runNativeStudy({}),/execute-native/);
});
test('native adapter disables tools without duplicating flags or removing the native model cap',()=>{
 assert.equal(typeof implementation.nativeStudyArguments,'function','study argument builder must exist');
 const args=implementation.nativeStudyArguments(['exec','--provider','meta','--disable-shell','--disable-web-tools','--max-model-steps','1','--permission-profile',':ask-me','--','question']);
 for(const flag of ['--disable-shell','--disable-write','--disable-web-tools'])assert.equal(args.filter(a=>a===flag).length,1);
 assert.equal(args[args.indexOf('--max-model-steps')+1],'1');assert.equal(args[args.indexOf('--permission-profile')+1],':ask-me');assert.equal(args.includes('--disable-sandbox'),false);
 assert.equal(args[args.indexOf('--preset')+1],'empty');
 assert.deepEqual(implementation.nativeStudyArguments(['--version']),['--version']);
});
test('native admission rejects a thirteenth run and reserves the full run bound before deadline',()=>{
 assert.equal(typeof implementation.canStartNativeRun,'function','native run admission must exist');
 assert.equal(implementation.canStartNativeRun({attempts:12,deadline:null,now:0}),false);
 assert.equal(implementation.canStartNativeRun({attempts:11,deadline:100000,now:10001}),false);
 assert.equal(implementation.canStartNativeRun({attempts:11,deadline:100000,now:10000}),true);
});
