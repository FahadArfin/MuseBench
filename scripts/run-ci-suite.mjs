import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const npm=(...names)=>names.map(name=>['npm','run',`test:${name}`]);
// Keep each runner sequential: several UI fixtures intentionally own fixed
// localhost ports. Parallelism comes from isolated GitHub Windows runners.
export const CI_SUITES={
 unit:[['npm','test']],
 appearance:npm('startup-animation','motion','typography'),
 navigation:npm('preview-parity','browser-preview','onboarding-preview','navigation-cache','preview-annotations'),
 extensions:npm('catalog-preview','catalog-desktop','plugin-tools','integration-panels','billing-preview','billing-desktop','conversation-import','code-schedules'),
 chats:npm('code-chat-relations','app-instructions','context-history','recent-context','chat-organization','code-responsiveness','chat-navigation','profile-identity','session-recovery','update-details'),
 native:[
  ['node','scripts/discovery-oauth-smoke.mjs'],['node','scripts/discovery-oauth-smoke.mjs','--desktop'],['node','scripts/discovery-oauth-recovery-smoke.mjs'],['node','scripts/discovery-oauth-recovery-smoke.mjs','--desktop'],['node','scripts/discovery-oauth-protection.mjs','--local-fixture'],
  ['node','scripts/mobile-settings-smoke.mjs'],['node','scripts/native-control-smoke.mjs'],
  ['node','scripts/session-mcp-smoke.mjs'],['node','scripts/session-mcp-smoke.mjs','--desktop'],
  ...npm('activity','child-inspection','child-restart','native-failure','native-question','reply-copy','model-settings','work-activity','project-actions','run-changes','connection-diagnostics','workspace-analysis','tool-discovery','background-engine'),
 ],
};

export async function runChecks(checks,{suite,outputDirectory='artifacts/ci-timings',summaryPath=process.env.GITHUB_STEP_SUMMARY}={}){
 if(!/^[a-z][a-z0-9-]*$/.test(suite??''))throw Error('Invalid CI suite name');
 const started=performance.now(),report={suite,success:true,checks:[]};
 for(const [command,...args] of checks){
  const label=[command,...args].join(' '),begin=performance.now();
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
  report.checks.push({command:label,exitCode,durationMs,...(result.signal?{signal:result.signal}:{}),...(result.error?{error:result.error.message}:{})});
  console.log(`::endgroup::\n${label}: ${exitCode===0?'passed':'failed'} in ${(durationMs/1000).toFixed(1)}s`);
  if(exitCode!==0){report.success=false;break;}
 }
 report.durationMs=Math.round(performance.now()-started);
 await mkdir(outputDirectory,{recursive:true});
 await writeFile(path.join(outputDirectory,`${suite}.json`),JSON.stringify(report,null,2)+'\n');
 if(summaryPath)await appendFile(summaryPath,`\n### Windows checks: ${suite}\n\n| Check | Result | Seconds |\n| --- | --- | ---: |\n${report.checks.map(c=>`| ${c.command} | ${c.exitCode===0?'passed':'failed'} | ${(c.durationMs/1000).toFixed(1)} |`).join('\n')}\n`);
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const suite=process.argv[2];
 if(process.argv.length!==3||!Object.hasOwn(CI_SUITES,suite??''))throw Error(`Unknown CI suite: ${suite??'(missing)'}`);
 const result=await runChecks(CI_SUITES[suite],{suite});
 if(!result.success)process.exitCode=1;
}
