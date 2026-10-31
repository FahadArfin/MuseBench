import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';
import {CI_SUITES,runChecks} from '../scripts/run-ci-suite.mjs';

const workflow=async name=>yaml.load(await readFile(new URL(`../.github/workflows/${name}.yml`,import.meta.url),'utf8'));
const packageJson=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
// Union of release + validation at ccf56e2. This baseline prevents a speedup
// accidentally omitting an expensive check. New coverage is added deliberately.
const required=[
 'node scripts/discovery-oauth-smoke.mjs','node scripts/discovery-oauth-smoke.mjs --desktop','node scripts/discovery-oauth-recovery-smoke.mjs','node scripts/discovery-oauth-recovery-smoke.mjs --desktop','node scripts/discovery-oauth-protection.mjs --local-fixture',
 'npm run test:app-instructions','npm run test:background-engine','npm run test:recent-context','npm run test:context-history','npm run test:integration-panels',
 'npm test','npm run test:startup-animation','npm run test:session-recovery','npm run test:profile-identity',
 'npm run test:typography','npm run test:motion','npm run test:activity','npm run test:child-inspection','npm run test:child-restart',
 'npm run test:native-failure','npm run test:native-question','npm run test:reply-copy','npm run test:model-settings',
 'npm run test:work-activity','npm run test:project-actions','npm run test:run-changes',
 'npm run test:connection-diagnostics','npm run test:update-details','npm run test:plugin-tools',
 'npm run test:renderer-state','npm run test:code-chat-relations','npm run test:chat-organization','npm run test:code-responsiveness','npm run test:chat-navigation',
 'npm run test:navigation-cache','npm run test:browser-preview','npm run test:onboarding-preview',
 'npm run test:catalog-preview','npm run test:catalog-desktop','npm run test:billing-preview',
 'npm run test:billing-desktop','npm run test:preview-parity','node scripts/mobile-settings-smoke.mjs',
 'node scripts/native-control-smoke.mjs','node scripts/native-navigation-smoke.mjs','node scripts/session-mcp-smoke.mjs','node scripts/session-mcp-smoke.mjs --desktop',
 'npm run test:conversation-import','npm run test:code-schedules','npm run test:preview-annotations','npm run test:workspace-analysis','npm run test:tool-discovery','npm run test:discovery-approvals',
];

test('parallel groups retain every previous check exactly once with real commands',async()=>{
 const checks=Object.values(CI_SUITES).flat();
 assert.deepEqual(checks.map(c=>c.join(' ')).sort(),required.sort());
 for(const [command,...args] of checks){
  if(command==='npm')assert.ok(packageJson.scripts[args[0]==='run'?args[1]:args[0]]);
  else {assert.equal(command,'node');await readFile(new URL(`../${args[0]}`,import.meta.url));}
 }
 const shared=await workflow('windows-checks');
 assert.deepEqual([...shared.jobs.check.strategy.matrix.suite].sort(),Object.keys(CI_SUITES).sort());
 assert.equal(shared.jobs.check.strategy['fail-fast'],false);
 assert.equal(shared.jobs.check['runs-on'],'windows-latest');
 assert.equal(shared.jobs.check['continue-on-error'],undefined);
 assert.ok(shared.jobs.check.steps.some(s=>s.run==='node scripts/run-ci-suite.mjs ${{ matrix.suite }}'));
});

test('main checks run once while packaging overlaps and other refs keep validation',async()=>{
 const release=await workflow('release'),validate=await workflow('validate'),shared=await workflow('windows-checks');
 assert.equal(release.jobs.validation.uses,'./.github/workflows/windows-checks.yml');
 assert.equal(release.jobs.validation.with.release,true);
 assert.equal(validate.jobs.windows.uses,release.jobs.validation.uses);
 assert.deepEqual(validate.on.push['branches-ignore'],['main']);
 assert.ok(Object.hasOwn(validate.on,'pull_request'));
 assert.ok(Object.hasOwn(shared.on,'workflow_call'));
 assert.equal(release.jobs.build.needs,undefined);
 const packaging=release.jobs.build.steps.map(s=>s.run).filter(Boolean);
 for(const command of required)assert.ok(!packaging.includes(command),`${command} duplicated in packaging`);
 for(const command of ['npm run build','node scripts/package-desktop.mjs','node scripts/verify-personal-package.mjs','node scripts/portable-desktop-smoke.mjs','node scripts/release-assets.mjs stage'])assert.ok(packaging.includes(command));
 assert.ok(release.jobs.publish.needs.includes('validation'));
 assert.ok(shared.jobs.check.steps.some(s=>s.run==='node scripts/stamp-release.mjs'&&s.if==='inputs.release'));
 assert.equal(shared.permissions.contents,'read');
 assert.equal(release.jobs.validation.secrets,undefined);
});

test('runner executes real children sequentially, reports timings and stops at a failed check',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'muse-ci-runner-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const child=path.join(directory,'child.mjs'),log=path.join(directory,'calls.txt'),summary=path.join(directory,'summary.md');
 await writeFile(child,"import {appendFileSync} from 'node:fs';appendFileSync(process.argv[2],process.argv[3]+'\\n');process.exit(Number(process.argv[4]));");
 const result=await runChecks([['node',child,log,'first','0'],['node',child,log,'second','7'],['node',child,log,'never','0']],{suite:'fixture',outputDirectory:directory,summaryPath:summary});
 assert.equal(result.success,false);assert.deepEqual(result.checks.map(c=>c.exitCode),[0,7]);
 assert.equal(await readFile(log,'utf8'),'first\nsecond\n');
 const receipt=JSON.parse(await readFile(path.join(directory,'fixture.json'),'utf8'));
 assert.equal(receipt.success,false);assert.ok(receipt.checks.every(c=>Number.isFinite(c.durationMs)&&c.durationMs>=0));
 assert.match(await readFile(summary,'utf8'),/failed/);
 const success=await runChecks([['node',child,log,'last','0']],{suite:'passing',outputDirectory:directory});
 assert.equal(success.success,true);assert.equal(success.checks[0].exitCode,0);
});

test('unknown CLI group fails before running commands',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/run-ci-suite.mjs',import.meta.url)),'not-a-suite'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Unknown CI suite/);
});

test('renderer delivery checks run preview and desktop in chats and upload only clean fixture reports',async()=>{
 assert.equal(packageJson.scripts['test:renderer-state'],'node scripts/renderer-state-smoke.mjs && node scripts/renderer-state-smoke.mjs --desktop');
 assert.ok(CI_SUITES.chats.some(check=>check.join(' ')==='npm run test:renderer-state'));
 const shared=await workflow('windows-checks');
 const paths=shared.jobs.check.steps.filter(step=>step.uses==='actions/upload-artifact@v4').flatMap(step=>String(step.with.path).split('\n'));
 assert.ok(paths.includes('artifacts/renderer-state/**/report.json'));
 assert.ok(!paths.includes('artifacts/renderer-state/**'));
});

test('discovery approval checks run shared preview and desktop in native with only clean reports',async()=>{
 assert.equal(packageJson.scripts['test:discovery-approvals'],'node scripts/discovery-approval-smoke.mjs && node scripts/discovery-approval-smoke.mjs --desktop');
 assert.ok(CI_SUITES.native.some(check=>check.join(' ')==='npm run test:discovery-approvals'));
 const shared=await workflow('windows-checks');
 const paths=shared.jobs.check.steps.filter(step=>step.uses==='actions/upload-artifact@v4').flatMap(step=>String(step.with.path).split('\n'));
 assert.ok(paths.includes('artifacts/discovery-approvals/**/report.json'));
 assert.ok(!paths.includes('artifacts/discovery-approvals/**'));
});
