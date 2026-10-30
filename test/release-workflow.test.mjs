import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import yaml from 'js-yaml';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=yaml.load(readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8'));
// These workflow expressions use only booleans, equality, property lookup and
// cancelled(). Evaluate the checked-in conditions with representative Actions inputs.
const evaluate=(expression,context)=>runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g,''),context,{timeout:100});
const context=(include=false,event='push',results={})=>({github:{ref:'refs/heads/main',event_name:event},inputs:event==='workflow_dispatch'?{include_other_platforms:include}:{},needs:Object.fromEntries(['validation','build','native','android'].map(name=>[name,{result:results[name]??(['validation','build'].includes(name)||include?'success':'skipped')}])),cancelled:()=>false});
const collection=workflow.jobs.publish.steps.find(step=>step.run==='node scripts/release-assets.mjs collect');

test('main pushes and ordinary manual releases run Windows alone and can publish after optional jobs skip',()=>{
 assert.equal(workflow.on.workflow_dispatch.inputs.include_other_platforms.default,false);
 for(const event of ['push','workflow_dispatch']){
  const state=context(false,event);assert.equal(evaluate(workflow.jobs.build.if,state),true);
  for(const name of ['native','android'])assert.equal(evaluate(workflow.jobs[name].if,state),false);
  assert.equal(evaluate(workflow.jobs.publish.if,state),true);assert.equal(evaluate(collection.env.RELEASE_PROFILE,state),'windows-x64');
 }
});
test('explicit full-platform dispatch builds artifacts only while normal failed or cancelled releases cannot publish',()=>{
 const state=context(true,'workflow_dispatch');for(const name of ['build','native','android'])assert.equal(evaluate(workflow.jobs[name].if,state),true);
 assert.equal(evaluate(workflow.jobs.publish.if,state),false);
 assert.equal(evaluate(collection.env.RELEASE_PROFILE,state),'all');
 for(const name of ['build','native','android'])assert.equal(evaluate(workflow.jobs.publish.if,context(true,'workflow_dispatch',{[name]:'failure'})),false);
 assert.equal(evaluate(workflow.jobs.publish.if,context(false,'push',{build:'failure'})),false);
 assert.equal(evaluate(workflow.jobs.publish.if,{...state,cancelled:()=>true}),false);
 state.github.ref='refs/heads/feature';for(const name of ['build','native','android'])assert.equal(evaluate(workflow.jobs[name].if,state),false);
});

test('a prior draft is left untouched rather than publishing extra assets and old notes',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-draft-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const calls=path.join(root,'calls.txt'),sha='a'.repeat(40);
 const script=workflow.jobs.publish.steps.find(step=>step.name==='Publish validated platform downloads').run;
 // Execute the actual publication shell against a local CLI substitute. It
 // models an existing all-platform draft; no real GitHub operation is performed.
 const stub=`gh() {\n printf '%s\\n' "$*" >> "$CALLS"\n if [ "$1" = "api" ]; then printf '%s\\n' "$SOURCE_SHA"; return 0; fi\n if [ "$2" = "view" ]; then\n   case "$*" in *isDraft*) echo true;; *targetCommitish*) echo "$SOURCE_SHA";; esac\n   return 0\n fi\n return 0\n}\n`;
 const bash=process.platform==='win32'?path.join(process.env.ProgramFiles||'C:/Program Files','Git','bin','bash.exe'):'bash';
 const result=spawnSync(bash,['-c',stub+script],{cwd:root,encoding:'utf8',env:{...process.env,CALLS:calls,GH_REPO:'fixture/repository',VERSION:'0.2.999',SOURCE_SHA:sha,RELEASE_PROFILE:'windows-x64'}});
 assert.ifError(result.error);assert.notEqual(result.status,0,'an unvalidated existing draft must block publication');
 assert.doesNotMatch(await readFile(calls,'utf8'),/release (?:upload|edit|create)/);
});

test('publishing requires all parallel validation and packaging results, including on manual runs',()=>{
 for(const event of ['push','workflow_dispatch']){
  assert.equal(evaluate(workflow.jobs.publish.if,context(false,event)),true);
  for(const job of ['validation','build'])for(const result of ['failure','cancelled','skipped']){
   assert.equal(evaluate(workflow.jobs.publish.if,context(false,event,{[job]:result})),false,`${job}: ${result}`);
  }
  assert.equal(evaluate(workflow.jobs.publish.if,{...context(false,event),cancelled:()=>true}),false);
 }
});
