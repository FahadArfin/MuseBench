// Generates deliberately artificial outputs to demonstrate scoring, not model quality.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runEvaluation} from './harness-eval.mjs';

const out=path.resolve(process.argv[2]??'artifacts/harness-eval/fixture');
await mkdir(out,{recursive:true});
const manifest={version:1,seed:20261026,repetitions:3,description:'Synthetic runner fixture. No model executions, quality experiment, or token/cost measurement.',tasks:[{id:'arithmetic',input:'Return only the sum of 2 and 2.',expected:{exact:'4'}},{id:'constraint',input:'Mention keyboard access and focus, and do not mention a mouse.',expected:{contains:['keyboard','focus'],excludes:['mouse']}}],arms:[{id:'baseline',artifacts:{}},{id:'candidate',artifacts:{}}]};
for(const arm of manifest.arms)for(const task of manifest.tasks){
 arm.artifacts[task.id]=[];
 for(let repeat=0;repeat<manifest.repetitions;repeat++){
  const file=`${arm.id}-${task.id}-${repeat}.json`;arm.artifacts[task.id].push(file);
  const output=task.id==='arithmetic'?'4':arm.id==='baseline'?'keyboard and mouse':'keyboard and focus';
  await writeFile(path.join(out,file),JSON.stringify({output,provenance:{kind:'synthetic fixture',repeat,modelRequests:0}},null,2));
 }
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
const report=await runEvaluation(manifest,{baseDir:out});
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({notice:manifest.description,report:path.join(out,'report.json'),summary:report.summary},null,2));
