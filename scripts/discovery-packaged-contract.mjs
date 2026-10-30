// Run only against a local isolated package or an explicitly selected installed
// executable. Native/model endpoint and settings are disposable loopback fixtures.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
assert.deepEqual(process.argv.slice(2),['--local-fixture']);
const root=fileURLToPath(new URL('..',import.meta.url)),executable=process.env.MUSEBENCH_EXECUTABLE||path.join(root,'artifacts','discovery-package','win-unpacked','MuseBench.exe');
const result=spawnSync(executable,[path.join(root,'scripts','native-discovery-contract.mjs'),'--local-fixture'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1',MUSEBENCH_DISCOVERY_APP_ROOT:path.join(path.dirname(executable),'resources','app.asar'),MUSEBENCH_DISCOVERY_EXECUTABLE:executable,MUSEBENCH_DISCOVERY_HELPER:path.join(path.dirname(executable),'resources','native','MuseBenchJob.exe'),MUSEBENCH_DISCOVERY_FIXTURE_NODE:process.execPath}});
assert.equal(result.error,undefined);assert.equal(result.status,0);const report=JSON.parse(await readFile(path.join(root,'artifacts','native-discovery-packaged-contract','report.json'),'utf8'));assert.equal(report.status,'passed');assert.equal(report.cleanup,'confirmed');assert.equal(report.processCleanupVerified,true);console.log('PASS exact ASAR gateway/worker search, invocation, denial and process cleanup');
