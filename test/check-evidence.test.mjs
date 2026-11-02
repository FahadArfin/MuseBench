import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fingerprintInputs} from '../scripts/check-evidence.mjs';
import {runChecks} from '../scripts/run-ci-suite.mjs';

// This file tests local receipt behavior even when the parent runner is CI.
// Restore the flags afterward; the explicit CI test below verifies bypass.
const ciFlags=Object.fromEntries(Object.keys(process.env).filter(key=>['CI','GITHUB_ACTIONS'].includes(key)||/^(?:MUSEBENCH_|PLAYWRIGHT_|ELECTRON_OVERRIDE_DIST_PATH$)/.test(key)).map(key=>[key,process.env[key]]));
test.before(()=>{for(const key of Object.keys(ciFlags))delete process.env[key];});
test.after(()=>{for(const [key,value] of Object.entries(ciFlags)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'muse-check-evidence-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init','--quiet');
 await mkdir(path.join(root,'src'));await mkdir(path.join(root,'docs'));
 await writeFile(path.join(root,'.gitignore'),'artifacts/\ndist/\nnode_modules/\n');
 await writeFile(path.join(root,'src/app.mjs'),'export const value=1;');
 await writeFile(path.join(root,'docs/guide.md'),'Documentation');
 await writeFile(path.join(root,'package-lock.json'),'{"version":1}');
 const child=path.join(root,'child.mjs');
 await writeFile(child,"import {appendFileSync,readFileSync} from 'node:fs';appendFileSync(process.argv[2],'called\\n');if(process.argv[3]==='mutate')appendFileSync(process.argv[4],' changed');process.exit(process.argv[3]==='status-file'?Number(readFileSync(process.argv[4],'utf8')):Number(process.argv[3])||0);");
 git('add','.');
 const outputDirectory=path.join(root,'artifacts');await mkdir(outputDirectory);
 return {root,git,child,log:path.join(outputDirectory,'calls.txt'),options:{suite:'fixture',outputDirectory,reuse:true,inputRoot:root}};
}

test('fingerprint follows contents, names, deletion, new files, dependencies, generated output and runtime',async t=>{
 const {root}=await fixture(t),get=()=>fingerprintInputs(root,{runtime:{node:'fixture'}});
 const original=await get();
 await writeFile(path.join(root,'docs/guide.md'),'New documentation');
 await writeFile(path.join(root,'README.md'),'Read me');
 assert.equal(await get(),original,'documentation alone must not invalidate checks');
 await writeFile(path.join(root,'src/app.mjs'),'export const value=2;');assert.notEqual(await get(),original);
 await writeFile(path.join(root,'src/app.mjs'),'export const value=1;');assert.equal(await get(),original);
 await rename(path.join(root,'src/app.mjs'),path.join(root,'src/renamed.mjs'));assert.notEqual(await get(),original);
 await rename(path.join(root,'src/renamed.mjs'),path.join(root,'src/app.mjs'));
 await rm(path.join(root,'src/app.mjs'));assert.notEqual(await get(),original);
 await writeFile(path.join(root,'src/app.mjs'),'export const value=1;');
 await writeFile(path.join(root,'src/new.mjs'),'new');assert.notEqual(await get(),original);await rm(path.join(root,'src/new.mjs'));
 await writeFile(path.join(root,'package-lock.json'),'{"version":2}');assert.notEqual(await get(),original);
 await writeFile(path.join(root,'package-lock.json'),'{"version":1}');
 await mkdir(path.join(root,'dist'));await writeFile(path.join(root,'dist/app.js'),'built');assert.notEqual(await get(),original);
 await rm(path.join(root,'dist'),{recursive:true});
 await mkdir(path.join(root,'node_modules'));await writeFile(path.join(root,'node_modules/.package-lock.json'),'installed');assert.notEqual(await get(),original);
 await rm(path.join(root,'node_modules'),{recursive:true});
 assert.notEqual(await fingerprintInputs(root,{runtime:{node:'different'}}),original);
});

test('unchanged successful checks are reused, while changed input or command runs a real child',async t=>{
 const f=await fixture(t),checks=[['node',f.child,f.log,'0']];
 assert.equal((await runChecks(checks,f.options)).checks[0].reused,false);
 assert.equal((await runChecks(checks,f.options)).checks[0].reused,true);
 await writeFile(path.join(f.root,'docs/guide.md'),'Only docs changed');
 assert.equal((await runChecks(checks,f.options)).checks[0].reused,true);
 await writeFile(path.join(f.root,'src/app.mjs'),'new source');
 assert.equal((await runChecks(checks,f.options)).checks[0].reused,false);
 assert.equal((await runChecks([['node',f.child,f.log,'0','different argument']],f.options)).checks[0].reused,false);
 assert.equal((await readFile(f.log,'utf8')).trim().split('\n').length,3);
});

test('failed checks are never reused or retried, and stop subsequent checks',async t=>{
 const f=await fixture(t),checks=[['node',f.child,f.log,'7'],['node',f.child,f.log,'0']];
 for(let i=0;i<2;i++){const r=await runChecks(checks,f.options);assert.equal(r.success,false);assert.equal(r.checks.length,1);assert.equal(r.checks[0].reused,false);}
 assert.equal((await readFile(f.log,'utf8')).trim().split('\n').length,2);
});

test('force bypass, expired or corrupt evidence and changes during execution cause real reruns',async t=>{
 const f=await fixture(t),checks=[['node',f.child,f.log,'0']];
 await runChecks(checks,f.options);
 assert.equal((await runChecks(checks,{...f.options,force:true})).checks[0].reused,false);
 assert.equal((await runChecks(checks,{...f.options,evidenceMaxAgeMs:0})).checks[0].reused,false);
 const first=await runChecks(checks,f.options);
 await writeFile(first.evidenceFile,'not json');
 assert.equal((await runChecks(checks,f.options)).checks[0].reused,false);
 const mutation=[['node',f.child,f.log,'mutate',path.join(f.root,'src/app.mjs')]];
 const changed=await runChecks(mutation,f.options);assert.equal(changed.evidenceStable,false);
 assert.equal(changed.success,false);
 assert.equal((await runChecks(mutation,f.options)).checks[0].reused,false);
});

test('a forced failing rerun invalidates the prior pass for the same command',async t=>{
 const f=await fixture(t),status=path.join(f.options.outputDirectory,'status.txt');
 await writeFile(status,'0');const checks=[['node',f.child,f.log,'status-file',status]];
 await runChecks(checks,f.options);assert.equal((await runChecks(checks,f.options)).checks[0].reused,true);
 await writeFile(status,'7');assert.equal((await runChecks(checks,{...f.options,force:true})).success,false);
 const retry=await runChecks(checks,f.options);assert.equal(retry.success,false);assert.equal(retry.checks[0].reused,false);
});

test('CI ignores local passing receipts even when reuse is requested',async t=>{
 const f=await fixture(t),checks=[['node',f.child,f.log,'0']];await runChecks(checks,f.options);
 const previous=process.env.GITHUB_ACTIONS;t.after(()=>{if(previous===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=previous;});
 process.env.GITHUB_ACTIONS='true';
 const result=await runChecks(checks,f.options);assert.equal(result.checks[0].reused,false);
 assert.equal(result.reuseEnabled,false);
});

test('external installed app and fixture overrides bypass source-only evidence',async t=>{
 const f=await fixture(t),checks=[['node',f.child,f.log,'0']];await runChecks(checks,f.options);
 for(const key of ['MUSEBENCH_EXECUTABLE','PLAYWRIGHT_BROWSERS_PATH','ELECTRON_OVERRIDE_DIST_PATH']){
  const previous=process.env[key];process.env[key]='outside-source-target';
  try{const result=await runChecks(checks,f.options);assert.equal(result.checks[0].reused,false);assert.match(result.reuseDisabledReason,/External/);}
  finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
 }
});
