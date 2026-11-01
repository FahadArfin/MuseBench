import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {runChecks} from './run-ci-suite.mjs';

if(process.argv.length!==2)throw Error('Release preflight does not accept arguments.');
if(process.platform!=='win32')throw Error('Run the Windows release preflight on Windows.');
const git=(...args)=>{
 const result=spawnSync('git',args,{encoding:'utf8'});
 if(result.status!==0)throw Error('Could not inspect the release checkout.');
 return result.stdout.trim();
};
const source={commit:git('rev-parse','HEAD'),dirty:Boolean(git('status','--porcelain'))};
// Run once per candidate, sequentially: fixtures own localhost ports and
// disposable Electron windows. A failure stops the preflight without retrying.
const report=await runChecks([
 ['node','--test','--test-concurrency=1','test/source-object-gc.test.mjs','test/discovery-mcp-transport.test.mjs'],
 ['node','--test','--test-name-pattern=multiple HTTP MCP clients|Windows restores','test/native-control-http.test.mjs'],
 ['node','scripts/typography-smoke.mjs'],
 ['node','scripts/child-restart-smoke.mjs'],
 ['node','scripts/child-restart-smoke.mjs','--desktop'],
 ['node','scripts/meta-chat-history-smoke.mjs'],
],{suite:'release-preflight'});
await writeFile('artifacts/ci-timings/release-preflight.json',JSON.stringify({...report,source},null,2)+'\n');
if(!report.success)process.exitCode=1;
