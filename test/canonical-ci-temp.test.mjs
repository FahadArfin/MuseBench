import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('CI setup uses the runner-owned directory instead of the ambient user temp',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'muse-ci-temp-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const runner=path.join(root,'runner temp'),ambient=path.join(root,'ambient temp'),output=path.join(root,'github.env');await mkdir(runner);await mkdir(ambient);
 execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/canonical-ci-temp.mjs',import.meta.url))],{env:{...process.env,RUNNER_TEMP:runner,TEMP:ambient,TMP:ambient,TMPDIR:ambient,GITHUB_ENV:output}});
 const canonical=await realpath(runner);assert.equal(await readFile(output,'utf8'),`TEMP=${canonical}\nTMP=${canonical}\nTMPDIR=${canonical}\n`);
});
