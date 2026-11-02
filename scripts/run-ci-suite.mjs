import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fingerprintInputs,checkEvidence} from './check-evidence.mjs';

const npm=(...names)=>names.map(name=>['npm','run',`test:${name}`]);
// Keep each runner sequential: several UI fixtures intentionally own fixed
// localhost ports. Parallelism comes from isolated GitHub Windows runners.
export const CI_SUITES={
 unit:[['npm','test']],
 appearance:npm('startup-animation','motion','typography','terminal-welcome'),
 navigation:[...npm('preview-parity','browser-preview','onboarding-preview','navigation-cache','preview-annotations'),['node','scripts/meta-settings-smoke.mjs'],['node','scripts/meta-settings-smoke.mjs','--desktop'],['node','scripts/settings-connections-smoke.mjs'],['node','scripts/settings-connections-smoke.mjs','--desktop']],
 extensions:npm('catalog-preview','catalog-desktop','plugin-tools','integration-panels','billing-preview','billing-desktop','conversation-import','code-schedules'),
 // Balanced against run 41352072866: 225.6s and 220.5s of tests, formerly
 // 446.1s on one runner. Each shard retains its own sequential fixture lifetime.
 'chats-a':npm('code-responsiveness','prompt-shelf','code-chat-relations','update-details','renderer-state','workspace-focus','app-instructions','context-history','chat-menu-tools','image-annotations'),
 'chats-b':npm('composer-predictions','transcript-position','profile-identity','chat-organization','session-recovery','chat-history-find','chat-navigation','recent-context','transcript-render'),
 native:[
  ...npm('source-diff','file-review','desktop-assist','file-viewer','file-renderers'),['node','scripts/browser-control-smoke.mjs'],
  ['node','scripts/discovery-oauth-smoke.mjs'],['node','scripts/discovery-oauth-smoke.mjs','--desktop'],['node','scripts/discovery-oauth-recovery-smoke.mjs'],['node','scripts/discovery-oauth-recovery-smoke.mjs','--desktop'],['node','scripts/discovery-oauth-protection.mjs','--local-fixture'],
  ['node','scripts/mobile-settings-smoke.mjs'],['node','scripts/native-control-smoke.mjs'],['node','test/native-control-http-ui-smoke.mjs'],['node','scripts/native-navigation-smoke.mjs'],
  ['node','scripts/session-mcp-smoke.mjs'],['node','scripts/session-mcp-smoke.mjs','--desktop'],
  ...npm('activity','visual-tools','subagent-messaging','child-inspection','child-restart','native-failure','native-retry','native-question','reply-copy','model-settings','meta-chat-history','work-activity','project-actions','run-changes','connection-diagnostics','workspace-analysis','tool-discovery','discovery-approvals','background-engine'),
 ],
};

export async function runChecks(checks,{suite,outputDirectory='artifacts/ci-timings',summaryPath=process.env.GITHUB_STEP_SUMMARY,reuse=false,force=false,inputRoot=process.cwd(),evidenceMaxAgeMs}={}){
 if(!/^[a-z][a-z0-9-]*$/.test(suite??''))throw Error('Invalid CI suite name');
 const inCI=['CI','GITHUB_ACTIONS'].some(key=>process.env[key]&&!/^(?:false|0)$/i.test(process.env[key]));
 // An installed app, live source or custom browser/helper can change outside
 // this checkout. Never reuse source-only evidence for those override targets.
 const externalTarget=Object.keys(process.env).some(key=>/^(?:MUSEBENCH_|PLAYWRIGHT_|ELECTRON_OVERRIDE_DIST_PATH$)/.test(key)&&process.env[key]);
 const reuseEnabled=reuse&&!inCI&&!externalTarget;
 const started=performance.now(),report={suite,success:true,reuseEnabled,checks:[]};
 if(reuse&&!reuseEnabled)report.reuseDisabledReason=inCI?'CI always runs fresh checks':'External app or fixture override requires fresh checks';
 const fingerprint=reuseEnabled?await fingerprintInputs(inputRoot):null;
 const evidence=reuseEnabled?await checkEvidence(inputRoot,fingerprint,{maxAgeMs:evidenceMaxAgeMs}):null;
 if(evidence){report.fingerprint=fingerprint;report.evidenceFile=evidence.file;}
 const passed=[];
 for(const [command,...args] of checks){
  const label=[command,...args].join(' '),begin=performance.now();
  const prior=force?null:evidence?.lookup([command,...args]);
  if(prior){
   report.checks.push({command:label,exitCode:0,durationMs:0,reused:true,evidenceCompletedAt:new Date(prior.completedAt).toISOString()});
   console.log(`${label}: reused unchanged passing evidence from ${new Date(prior.completedAt).toISOString()}`);continue;
  }
  evidence?.invalidate([command,...args]);
  console.log(`::group::${label}`);
  let result;
  if(command==='node')result=spawnSync(process.execPath,args,{stdio:'inherit'});
  else if(command==='npm'&&((args.length===1&&args[0]==='test')||(args.length===2&&args[0]==='run'&&/^test:[a-z0-9-]+$/.test(args[1])))){
   // Windows npm.cmd requires cmd.exe. Only the fixed test-script allowlist
   // reaches this shell; no paths, user input or workflow expressions enter it.
   result=process.platform==='win32'
    ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`npm ${args.join(' ')}`],{stdio:'inherit'})
    :spawnSync('npm',args,{stdio:'inherit'});
  }else throw Error('Unsupported CI check command');
  const exitCode=result.status??1,durationMs=Math.round(performance.now()-begin);
  report.checks.push({command:label,exitCode,durationMs,reused:false,...(result.signal?{signal:result.signal}:{}),...(result.error?{error:result.error.message}:{})});
  console.log(`::endgroup::\n${label}: ${exitCode===0?'passed':'failed'} in ${(durationMs/1000).toFixed(1)}s`);
  if(exitCode!==0){report.success=false;break;}
  passed.push([command,...args]);
 }
 if(evidence){
  report.evidenceStable=fingerprint===await fingerprintInputs(inputRoot);
  if(report.evidenceStable)for(const command of passed)evidence.record(command);
  else {report.success=false;console.log('Check inputs changed during execution; results do not validate the current source.');}
  await evidence.save();
 }
 report.durationMs=Math.round(performance.now()-started);
 await mkdir(outputDirectory,{recursive:true});
 await writeFile(path.join(outputDirectory,`${suite}.json`),JSON.stringify(report,null,2)+'\n');
 if(summaryPath)await appendFile(summaryPath,`\n### Windows checks: ${suite}\n\n| Check | Result | Seconds |\n| --- | --- | ---: |\n${report.checks.map(c=>`| ${c.command} | ${c.reused?'reused':c.exitCode===0?'passed':'failed'} | ${(c.durationMs/1000).toFixed(1)} |`).join('\n')}\n`);
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const suite=process.argv[2];
 const flag=process.argv[3];
 if(process.argv.length>4||(flag&&!['--reuse','--force'].includes(flag))||!Object.hasOwn(CI_SUITES,suite??''))throw Error(`Unknown CI suite or option: ${suite??'(missing)'}`);
 const result=await runChecks(CI_SUITES[suite],{suite,reuse:Boolean(flag),force:flag==='--force'});
 if(!result.success)process.exitCode=1;
}
